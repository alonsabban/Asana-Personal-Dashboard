import { readFile, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SubjectDef } from "@/app/lib/subjects";
import { getSettings } from "@/app/lib/settings";

/** Path of the persistent per-task classification cache. */
export const CACHE_PATH = join(homedir(), ".asana_classifications.json");

type ClassCache = Record<string, string>; // gid → subject name

export async function loadCache(): Promise<ClassCache> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8")) as ClassCache;
  } catch {
    return {};
  }
}

export async function saveCache(cache: ClassCache): Promise<void> {
  try {
    await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.error("[classify] Could not save cache:", err);
  }
}

/**
 * Serialises cache read-modify-write cycles within this process.
 *
 * Two concurrent refreshes would otherwise each load the cache, add their own
 * entries, and the second write would drop the first one's — observed in
 * testing, where two overlapping requests left the cache 3 entries short. Every
 * mutation goes through here so the load and the save cannot interleave.
 */
let cacheLock: Promise<void> = Promise.resolve();

function withCacheLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = cacheLock.then(fn, fn);
  // Keep the chain alive regardless of individual failures.
  cacheLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Load the cache, apply a mutation, and persist — atomically within this process. */
async function mutateCache(
  mutate: (cache: ClassCache) => void | Promise<void>,
): Promise<void> {
  return withCacheLock(async () => {
    const cache = await loadCache();
    await mutate(cache);
    await saveCache(cache);
  });
}

/** Manually store a subject for one task (user override from the table). */
export async function setClassification(gid: string, subject: string): Promise<void> {
  await mutateCache((cache) => {
    cache[gid] = subject;
  });
}

/**
 * When the user renames a subject (e.g. "ERs" → "Enhancement Requests"),
 * update every cache entry that still holds the old name.
 */
export async function applyRenames(renames: Record<string, string>): Promise<void> {
  if (Object.keys(renames).length === 0) return;
  await mutateCache((cache) => {
    for (const [gid, subject] of Object.entries(cache)) {
      if (renames[subject]) cache[gid] = renames[subject];
    }
  });
}

/** Wipe the entire cache — every task will be re-classified on next load. */
export async function clearClassificationCache(): Promise<void> {
  try {
    await unlink(CACHE_PATH);
  } catch {
    /* fine if missing */
  }
}

/** Remove only "Other" entries from the cache so those tasks are retried on the next classify run. */
export async function clearOtherClassifications(): Promise<void> {
  await mutateCache((cache) => {
    for (const gid of Object.keys(cache)) {
      if (cache[gid] === "Other") delete cache[gid];
    }
  });
}

export type TaskInput = {
  gid: string;
  name: string;
  notes: string;
  /** Asana project the task sits in, when it has one. Strong classification signal. */
  project?: string | null;
};

/** Lowercase and strip punctuation/spacing so "CSP-AHA" and "csp aha" compare equal. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Levenshtein distance — small inputs only (subject/project names). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Find the subject whose name effectively *is* the task's project name.
 *
 * When someone files a task under an Asana project called "SDLC" and also keeps
 * a subject called "SDLC", the intent is not ambiguous — but the model used to
 * guess from wording alone and could land on a different subject. This resolves
 * that case deterministically, before any AI call.
 *
 * Deliberately strict, because a wrong match here silently overrides the model.
 *  • compared with punctuation and case removed, so "CSP-AHA" == "csp aha"
 *  • exact normalized equality always wins
 *  • otherwise the allowed edit distance scales with the shorter name's length:
 *    under 4 characters exact-only, 4-7 tolerates 1 edit, 8+ tolerates 2.
 *
 * The scaling matters in both directions. Short names must be exact, or "AI" and
 * "UI" become the same subject. Long names need 2 edits to catch plurals like
 * "New ER Processes" vs "New ER Process" — while still correctly rejecting
 * genuinely different names ("Vendor Work" vs "Customer Work" is 6 edits,
 * "Old ER Process" vs "New ER Process" is 4).
 */
export function subjectFromProject(
  project: string | null | undefined,
  subjects: SubjectDef[],
): string | null {
  // asana.ts uses this placeholder for tasks with no project; it is not a name.
  if (!project || project === "(No project)") return null;

  const p = normalizeName(project);
  if (!p) return null;

  for (const s of subjects) {
    if (normalizeName(s.name) === p) return s.name;
  }

  for (const s of subjects) {
    const n = normalizeName(s.name);
    const tolerance = Math.min(editTolerance(n.length), editTolerance(p.length));
    if (tolerance === 0) continue;
    if (editDistance(n, p) <= tolerance) return s.name;
  }

  return null;
}

/** Edits to forgive for a name of the given length. See subjectFromProject. */
function editTolerance(len: number): number {
  if (len >= 8) return 2;
  if (len >= 4) return 1;
  return 0;
}

/**
 * Check a set of AWS credentials by making the cheapest possible real Bedrock
 * call. Mirrors how the Asana PAT is validated before saving: a typo should be
 * caught while the user is looking at the field, not silently degrade
 * classification to "Other" days later.
 *
 * Errors are mapped to plain language because the raw AWS SDK messages are not
 * something a colleague should have to interpret.
 */
export async function verifyAwsCredentials(cfg: {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  modelId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const region = cfg.region?.trim() || DEFAULT_REGION;
  const modelId = cfg.modelId?.trim() || DEFAULT_MODEL_ID;

  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId: cfg.accessKeyId.trim(),
        secretAccessKey: cfg.secretAccessKey.trim(),
      },
    });

    await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    return { ok: true };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const raw = e instanceof Error ? e.message : String(e);

    // AWS returns UnrecognizedClientException both for a genuinely bad key and
    // for a key that simply isn't valid in the requested region, so the message
    // has to name both causes rather than only blaming the paste.
    if (/UnrecognizedClient|InvalidSignature|security token/i.test(name + raw)) {
      return {
        ok: false,
        error: `AWS rejected those credentials in ${region}. Check the access key and secret were copied in full, and that the region is right.`,
      };
    }
    if (/AccessDenied|not authorized/i.test(name + raw)) {
      return {
        ok: false,
        error: `Those credentials are valid but lack Bedrock access to ${modelId} in ${region}. Ask your AWS admin to grant bedrock:InvokeModel.`,
      };
    }
    if (/ValidationException|ResourceNotFound/i.test(name + raw)) {
      return { ok: false, error: `Model "${modelId}" is not available in ${region}. Try a different region or model.` };
    }
    if (/ENOTFOUND|ETIMEDOUT|EAI_AGAIN|self.signed|certificate/i.test(raw)) {
      return { ok: false, error: "Could not reach AWS — likely the corporate network or a proxy. Check your connection." };
    }
    return { ok: false, error: `AWS error: ${raw.slice(0, 200)}` };
  }
}

/** Default Bedrock model, used when the user has not chosen one. */
export const DEFAULT_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
/** Default Bedrock region, used when the user has not chosen one. */
export const DEFAULT_REGION = "us-east-1";

type ResolvedAws = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  modelId: string;
};

/**
 * Resolve AWS Bedrock credentials, settings file first so the value the user
 * just typed in the UI always wins over a stale env file. Returns null when no
 * usable credentials exist, which is a normal state — classification simply
 * falls back to keyword rules.
 */
export async function getAwsConfig(): Promise<ResolvedAws | null> {
  const stored = (await getSettings()).aws ?? {};

  const accessKeyId =
    stored.accessKeyId?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey =
    stored.secretAccessKey?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim() ||
    "";

  if (!accessKeyId || !secretAccessKey) return null;

  return {
    accessKeyId,
    secretAccessKey,
    region: stored.region?.trim() || process.env.AWS_REGION?.trim() || DEFAULT_REGION,
    modelId:
      stored.modelId?.trim() || process.env.BEDROCK_MODEL_ID?.trim() || DEFAULT_MODEL_ID,
  };
}

/** Returns true when AWS Bedrock credentials are available. */
export async function hasAICredentials(): Promise<boolean> {
  return (await getAwsConfig()) !== null;
}

/**
 * Classify tasks into user-defined subjects via AWS Bedrock (Claude).
 *
 * Rules:
 *  • Tasks already in the cache → reuse cached value. No AI call.
 *  • Task's project name matches a subject name → use it directly. No AI call.
 *  • Remaining new tasks → call AI in one batch → persist.
 *  • AWS credentials absent or API error → return "Other" without caching
 *    so they are retried once credentials are added or the error clears.
 *  • Renaming / adding subjects never invalidates cached entries.
 *    Users fix wrong labels via the inline subject picker in the table.
 */
export async function classifyTasks(
  tasks: TaskInput[],
  subjects: SubjectDef[],
): Promise<Record<string, string>> {
  if (tasks.length === 0) return {};

  const cache = await loadCache();
  const uncached = tasks.filter((t) => cache[t.gid] === undefined);

  // A task filed under a project that matches one of the user's subjects is
  // already classified by the person who filed it. Resolve those first: it is
  // more reliable than asking the model to infer it from wording, and it saves
  // the tokens.
  const fromProject: Record<string, string> = {};
  const needsClassify: TaskInput[] = [];
  for (const t of uncached) {
    const match = subjectFromProject(t.project, subjects);
    if (match) fromProject[t.gid] = match;
    else needsClassify.push(t);
  }

  if (Object.keys(fromProject).length > 0) {
    console.log(
      `[classify] ${Object.keys(fromProject).length} task(s) matched by project name`,
    );
    await mutateCache((fresh) => {
      Object.assign(fresh, fromProject);
      Object.assign(cache, fresh);
    });
  }

  // Resolved once here rather than per call site, so a single settings read
  // covers the whole batch.
  const aws = needsClassify.length > 0 ? await getAwsConfig() : null;

  if (needsClassify.length > 0 && aws) {
    console.log(
      `[classify] AI batch: ${needsClassify.length} new task(s) ` +
        `(${tasks.length - needsClassify.length} from cache or project)`,
    );
    const { results, success } = await callBedrock(needsClassify, subjects, aws);
    if (success) {
      // Merge under the lock and re-read inside it, so entries written by a
      // concurrent refresh while Bedrock was in flight are not overwritten.
      await mutateCache((fresh) => {
        Object.assign(fresh, results);
        Object.assign(cache, fresh);
      });
    }
    // On failure: nothing cached → will retry on next refresh
  }

  const result: Record<string, string> = {};
  for (const t of tasks) {
    result[t.gid] = cache[t.gid] ?? "Other";
  }
  return result;
}

export type BulkParseProject = {
  gid: string;
  name: string;
  sections: { gid: string; name: string }[];
};

export type BulkParsedTask = {
  name: string;
  projectGid: string | null;
  projectName: string | null;
  sectionGid: string | null;
  sectionName: string | null;
  due: string | null;
  notes: string | null;
  assigneeName: string | null;
  unclear: string[];
};

/**
 * Parse free-form text into structured Asana tasks using Bedrock.
 * Projects (with sections) are passed so the model can resolve names to GIDs.
 */
export async function parseBulkTasks(
  text: string,
  projects: BulkParseProject[],
  aws: ResolvedAws,
): Promise<{ tasks: BulkParsedTask[]; success: boolean }> {
  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = new BedrockRuntimeClient({
      region: aws.region,
      credentials: { accessKeyId: aws.accessKeyId, secretAccessKey: aws.secretAccessKey },
    });

    const projectsJson = JSON.stringify(
      projects.map((p) => ({
        gid: p.gid,
        name: p.name,
        sections: p.sections.map((s) => ({ gid: s.gid, name: s.name })),
      })),
    );

    const systemPrompt =
      "You are a task parser. Extract individual tasks from the user's free text and return them as a JSON array. " +
      "For each task, provide: name (required), projectGid (match to the project list, null if unclear), " +
      "projectName (matched project name, null if unclear), sectionGid (match to the project's section list, null if unclear or not mentioned), " +
      "sectionName (matched section name, null if not mentioned), due (YYYY-MM-DD, null if not mentioned), " +
      "notes (any additional context or description — preserve the original text exactly, including bullet points and newlines, null if none), " +
      "assigneeName (the name of the person this task should be assigned to, extracted verbatim from the user's text, null if not mentioned), " +
      "unclear (array of field names you could not determine — use 'project' if project is missing or ambiguous, 'section' if a section was mentioned but not matched). " +
      "Return ONLY a valid JSON object: { \"tasks\": [...] }. No explanation, no markdown fences. " +
      "If today's date context is needed, assume today is " + new Date().toISOString().slice(0, 10) + ". " +
      "Resolve relative dates like 'tomorrow', 'next Friday', 'end of week' to absolute YYYY-MM-DD.";

    const userContent =
      `Available projects and sections:\n${projectsJson}\n\nUser input:\n${text}`;

    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    };

    const raw = await client.send(
      new InvokeModelCommand({
        modelId: aws.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload),
      }),
    );

    const body = JSON.parse(new TextDecoder().decode(raw.body)) as {
      content: { type: string; text: string }[];
    };
    const text2 = body.content.find((b) => b.type === "text")?.text ?? "{}";
    const cleaned = text2.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/m, "").trim();
    const parsed = JSON.parse(cleaned) as { tasks: BulkParsedTask[] };

    return { tasks: parsed.tasks ?? [], success: true };
  } catch (err) {
    console.error("[classify] parseBulkTasks failed:", err);
    return { tasks: [], success: false };
  }
}

export type AccomplishmentTask = {
  name: string;
  project: string;
  subject: string | null;
  notes: string | null;
  subtasks: { name: string; completed: boolean }[];
  completedAt: string | null;
  status: string | null;
};

/**
 * Generate an executive accomplishments summary for a list of recently completed tasks.
 * Uses the same Bedrock invocation pattern as callBedrock().
 */
export async function generateAccomplishmentsSummary(
  tasks: AccomplishmentTask[],
  subjects: string[],
  aws: ResolvedAws,
): Promise<{ summary: string; success: boolean }> {
  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = new BedrockRuntimeClient({
      region: aws.region,
      credentials: {
        accessKeyId: aws.accessKeyId,
        secretAccessKey: aws.secretAccessKey,
      },
    });

    const subjectList = subjects.length > 0 ? subjects : [...new Set(tasks.map((t) => t.subject ?? t.project))];

    const systemPrompt =
      "You are an executive assistant writing a structured weekly status report for a professional.\n\n" +
      "For each work area, write the area name on its own line, then 3–5 bullet points (each starting with '• '). " +
      "Separate areas with a blank line. Do not write any intro or closing sentence — output only the area blocks.\n\n" +
      "For each task in your input:\n" +
      "- Read the task name AND description together to understand what the work is about.\n" +
      "- Look at subtasks to understand what has been done vs. what remains open.\n" +
      "- Use the task state (completed / in progress / planned) to write in the correct tense.\n" +
      "- Synthesize: write what was ACHIEVED or PROGRESSED, not a restatement of the task name.\n" +
      "  Bad: '• Worked on the stakeholder alignment document.'\n" +
      "  Good: '• Drafted the stakeholder alignment doc and circulated it for review — waiting on two sign-offs.'\n\n" +
      "Within each area, order bullets: completed items first (past tense), then in-progress (present tense), then planned (future tense). " +
      "Write in first person. Be specific and professional. If a task has subtasks, use the done/open breakdown to describe partial progress. " +
      "If an area has no tasks, write a single bullet: '• No activity recorded this period.' " +
      "Do not skip any area.";

    const userContent =
      `Work areas to cover (write one paragraph each, in this order):\n` +
      subjectList.map((s, i) => `${i + 1}. ${s}`).join("\n") +
      `\n\nTasks for the period:\n` +
      JSON.stringify(
        tasks.map((t) => ({
          task: t.name,
          subject: t.subject ?? t.project,
          state: t.completedAt ? "completed" : t.status ?? "in progress",
          completedOn: t.completedAt ? t.completedAt.slice(0, 10) : null,
          ...(t.notes ? { description: t.notes } : {}),
          ...(t.subtasks.length > 0
            ? { subtasks: t.subtasks.map((s) => `${s.completed ? "[done]" : "[open]"} ${s.name}`) }
            : {}),
        })),
        null,
        2,
      );

    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    };

    const raw = await client.send(
      new InvokeModelCommand({
        modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload),
      }),
    );

    const body = JSON.parse(new TextDecoder().decode(raw.body)) as {
      content: { type: string; text: string }[];
    };
    const summary = body.content.find((b) => b.type === "text")?.text ?? "";
    return { summary, success: true };
  } catch (err) {
    console.error("[classify] generateAccomplishmentsSummary failed:", err);
    return { summary: "", success: false };
  }
}

/** Single batched call to Claude via AWS Bedrock. */
async function callBedrock(
  tasks: TaskInput[],
  subjects: SubjectDef[],
  aws: ResolvedAws,
): Promise<{ results: Record<string, string>; success: boolean }> {
  const allowed = [...subjects.map((s) => s.name), "Other"];
  const subjectBlock = subjects.map((s) => `- ${s.name}: ${s.hint}`).join("\n");

  const systemPrompt =
    `You classify work tasks for a product manager.\n` +
    `Classify each task into exactly one of these subjects:\n` +
    `${subjectBlock}\n` +
    `- Other: Doesn't clearly fit any of the above\n\n` +
    `Each task may include the Asana project it belongs to. The project is a ` +
    `strong signal: when a task's project name closely resembles one of the ` +
    `subject names above, choose that subject even if the task wording hints ` +
    `elsewhere — the person who filed it under that project already decided. ` +
    `Only override the project when the task clearly belongs somewhere else.\n\n` +
    `Return ONLY a valid JSON object, no explanation:\n` +
    `{ "<gid>": "<subject>", ... }\n` +
    `Use ONLY the exact subject names above. Never invent new subjects.`;

  const userContent = JSON.stringify(
    tasks.map((t) => ({
      gid: t.gid,
      name: t.name,
      // The project is why a task like "review checklist" in the "SDLC" project
      // should land in SDLC rather than wherever its wording points.
      project: t.project ?? undefined,
      description: (t.notes ?? "").slice(0, 400),
    })),
  );

  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = new BedrockRuntimeClient({
      region: aws.region,
      credentials: {
        accessKeyId: aws.accessKeyId,
        secretAccessKey: aws.secretAccessKey,
      },
    });

    const modelId = aws.modelId;

    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    };

    const cmd = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    const raw = await client.send(cmd);
    const body = JSON.parse(new TextDecoder().decode(raw.body)) as {
      content: { type: string; text: string }[];
    };

    const text = body.content.find((b) => b.type === "text")?.text ?? "{}";
    // Strip any markdown code fences the model might add
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/m, "").trim();
    const raw2 = JSON.parse(cleaned) as Record<string, string>;

    const results: Record<string, string> = {};
    for (const [gid, subj] of Object.entries(raw2)) {
      results[gid] = allowed.includes(subj) ? subj : "Other";
    }
    for (const t of tasks) {
      if (!results[t.gid]) results[t.gid] = "Other";
    }
    return { results, success: true };
  } catch (err) {
    console.error("[classify] Bedrock call failed:", err);
    return { results: {}, success: false };
  }
}
