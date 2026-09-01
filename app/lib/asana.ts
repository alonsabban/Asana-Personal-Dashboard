import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSubjectDefs } from "@/app/lib/subjects";
import { classifyTasks, hasAICredentials, clearOtherClassifications } from "@/app/lib/classify";
import { getSettings } from "@/app/lib/settings";

const ASANA_API = "https://app.asana.com/api/1.0";

export type AsanaTask = {
  gid: string;
  name: string;
  project: string;
  projectGid: string | null;
  due: string | null;
  completed: boolean;
  permalink: string | null;
  subject: string;
  track: string | null;
  createdBy: string | null;
  assignee: string | null;
  notes: string;
  status: string | null;
  statusFieldGid: string | null;
  statusOptions: { gid: string; name: string }[];
  createdAt: string | null;
  section: string | null;
  sectionGid: string | null;
  subtaskInProgress: boolean;
};

export type AsanaBucket = "overdue" | "today" | "upcoming" | "noDue";

/**
 * Keyword fallback used when AI classification is unavailable. Subjects are
 * defined per-user in the gear settings, so this ships empty by design — a task
 * only gets a subject once the user configures their own, or once the AI
 * classifier labels it. Until then everything lands in "Other".
 */
type SubjectRule = {
  subject: string;
  track: string | null;
  patterns: RegExp[];
};

export const SUBJECT_RULES: SubjectRule[] = [];

/** Classify a task into a subject (+ optional track). Falls back to "Other". */
export function categorize(name: string, project: string): {
  subject: string;
  track: string | null;
} {
  const hay = `${name} ${project}`;
  for (const rule of SUBJECT_RULES) {
    if (rule.patterns.some((re) => re.test(hay))) {
      return { subject: rule.subject, track: rule.track };
    }
  }
  return { subject: "Other", track: null };
}

/** Fallback display order when the user has no configured subjects. */
export const SUBJECT_ORDER = ["Other"];

export type FocusTask = AsanaTask & {
  reason: string;
  urgency: "overdue" | "today" | "soon";
};

export type AsanaData = {
  user: { name: string; email: string };
  workspace: { gid: string; name: string };
  counts: {
    open: number;
    overdue: number;
    today: number;
    upcoming: number;
    noDue: number;
    completed: number;
    dueThisWeek: number;
  };
  buckets: Record<AsanaBucket, AsanaTask[]>;
  focus: FocusTask[];
  byProject: { gid: string | null; project: string; open: number; overdue: number }[];
  bySubject: {
    subject: string;
    count: number;
    overdue: number;
    tracks: { track: string; count: number; overdue: number }[];
    tasks: AsanaTask[];
  }[];
  /** All subject names from the user's config, plus "Other". Used to populate the inline picker. */
  availableSubjects: string[];
  /**
   * True when the user has more open tasks than we fetch in one refresh. The UI
   * surfaces this rather than showing a silently short list.
   */
  truncated: boolean;
  /** The fetch ceiling, so the UI can name the number it stopped at. */
  taskLimit: number;
  fetchedAt: string;
};

/**
 * Sentinel prefix on thrown messages that mean "the user has not connected yet".
 * The API layer maps this to a 428 so the client can show the setup gate instead
 * of a generic error banner.
 */
export const NO_TOKEN_ERROR = "NO_ASANA_TOKEN";

/**
 * Resolve the Asana Personal Access Token, in priority order:
 *   1. the in-app settings file (written by the setup / gear UI)
 *   2. the ASANA_PAT env var (handy for containers and CI)
 *   3. the legacy ~/.asana_pat file (kept for back-compat)
 *
 * Settings come first so the value the user just typed always wins over a stale
 * env file. The token never leaves the server.
 */
async function getToken(): Promise<string> {
  const fromSettings = (await getSettings()).asanaPat?.trim();
  if (fromSettings) return fromSettings;

  if (process.env.ASANA_PAT?.trim()) return process.env.ASANA_PAT.trim();

  try {
    const raw = await readFile(join(homedir(), ".asana_pat"), "utf8");
    const token = raw.trim();
    if (token && token !== "PASTE_YOUR_TOKEN_HERE") return token;
  } catch {
    // fall through to the error below
  }

  throw new Error(NO_TOKEN_ERROR);
}

/** True when a token is available from any source. Cheap — no network call. */
export async function hasAsanaToken(): Promise<boolean> {
  try {
    await getToken();
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a token against Asana and return the identity it belongs to.
 * Used to validate before persisting, so a bad paste never gets saved.
 */
export async function verifyToken(
  token: string,
): Promise<{ name: string; email: string; workspace: string | null }> {
  const res = await fetch(
    `${ASANA_API}/users/me?opt_fields=name,email,workspaces.name`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (res.status === 401) {
    throw new Error("Asana rejected that token. Check it was copied in full.");
  }
  if (!res.ok) {
    throw new Error(`Asana returned ${res.status}. Please try again.`);
  }

  const json = (await res.json()) as {
    data: { name: string; email: string; workspaces: { name: string }[] };
  };
  return {
    name: json.data.name,
    email: json.data.email,
    workspace: json.data.workspaces?.[0]?.name ?? null,
  };
}

async function asanaGet<T>(path: string, token: string): Promise<T> {
  const { data } = await asanaGetPage<T>(path, token);
  return data;
}

/**
 * Same as asanaGet, but also returns Asana's pagination cursor. Asana sets
 * `next_page` to null on the final page.
 */
async function asanaGetPage<T>(
  path: string,
  token: string,
): Promise<{ data: T; nextOffset: string | null }> {
  const res = await fetch(`${ASANA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    data: T;
    next_page?: { offset: string } | null;
  };
  return { data: json.data, nextOffset: json.next_page?.offset ?? null };
}

/**
 * Asana caps `limit` at 100 per page, so anything larger has to be assembled by
 * following `next_page.offset`.
 */
const ASANA_PAGE_SIZE = 100;

/**
 * Ceiling on how many tasks we will pull in one refresh.
 *
 * This is a guard rail, not a product decision: the dashboard is a "what do I
 * work on now" view, and every panel in it reads from the open-task list. 500 is
 * roughly 5 API calls and classifies in one Bedrock batch, which keeps a cold
 * refresh under a couple of seconds. Nobody triaging 500 open tasks is helped by
 * task 501 being on screen — but they are actively harmed by a silent cut, so
 * when we do hit this the UI says so (see AsanaData.truncated).
 */
const MAX_TASKS = 500;

/**
 * Fetch every page of a task query, stopping at MAX_TASKS.
 * Returns `truncated: true` when Asana still had more to give.
 */
async function fetchAllTasks(
  basePath: string,
  token: string,
): Promise<{ tasks: RawTask[]; truncated: boolean }> {
  const tasks: RawTask[] = [];
  let offset: string | null = null;

  while (tasks.length < MAX_TASKS) {
    const limit = Math.min(ASANA_PAGE_SIZE, MAX_TASKS - tasks.length);
    const path: string = `${basePath}&limit=${limit}${offset ? `&offset=${offset}` : ""}`;
    const page: { data: RawTask[]; nextOffset: string | null } =
      await asanaGetPage<RawTask[]>(path, token);
    tasks.push(...page.data);
    if (!page.nextOffset) return { tasks, truncated: false };
    offset = page.nextOffset;
  }

  // Left the loop on the ceiling rather than on a null cursor, so more remain.
  return { tasks, truncated: true };
}

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function bucketFor(task: { due: string | null }): AsanaBucket {
  if (!task.due) return "noDue";
  const due = new Date(task.due + "T00:00:00").getTime();
  const today = startOfToday();
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

/** Whole days from today until the due date (negative = overdue). */
function daysUntil(due: string): number {
  const d = new Date(due + "T00:00:00").getTime();
  return Math.round((d - startOfToday()) / 86_400_000);
}

type RawTask = {
  gid: string;
  name: string;
  notes?: string;
  completed: boolean;
  due_on: string | null;
  created_at?: string | null;
  permalink_url?: string | null;
  projects?: { gid: string; name: string }[];
  memberships?: { project: { gid: string }; section: { gid: string; name: string } | null }[];
  created_by?: { name: string } | null;
  assignee?: { name: string } | null;
  custom_fields?: { gid: string; name: string; type: string; enum_value?: { name: string } | null; enum_options?: { gid: string; name: string }[] }[];
  parent?: { gid: string } | null;
};

/**
 * Count tasks the user closed in the last 7 days.
 *
 * The main query asks for incomplete tasks only, so this fills in the "Done"
 * tile. It is deliberately a rolling window rather than all-time: "closed
 * recently" is the useful signal, and an all-time count would page through
 * years of history on every refresh.
 */
async function countRecentlyCompleted(
  workspaceGid: string,
  token: string,
): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  try {
    const { tasks } = await fetchAllTasks(
      `/tasks?assignee=me&workspace=${workspaceGid}&completed_since=${since}&opt_fields=completed`,
      token,
    );
    return tasks.filter((t) => t.completed).length;
  } catch {
    // A secondary stat is never worth failing the whole dashboard over.
    return 0;
  }
}

export async function getAsanaData(): Promise<AsanaData> {
  const token = await getToken();

  const me = await asanaGet<{
    name: string;
    email: string;
    workspaces: { gid: string; name: string }[];
  }>("/users/me", token);

  const workspace = me.workspaces[0];
  if (!workspace) throw new Error("No Asana workspace found for this user.");

  const fields =
    "name,notes,completed,due_on,created_at,permalink_url,parent.gid,projects.gid,projects.name,memberships.project.gid,memberships.section.gid,memberships.section.name,created_by.name,assignee.name,custom_fields.gid,custom_fields.name,custom_fields.type,custom_fields.enum_value.name,custom_fields.enum_options.gid,custom_fields.enum_options.name";

  // `completed_since=now` is Asana's idiom for "incomplete only" — it drops closed
  // tasks server-side instead of paying to download and then discard them. Every
  // panel on the dashboard reads from the open list, so this is the whole payload.
  const { tasks, truncated } = await fetchAllTasks(
    `/tasks?assignee=me&workspace=${workspace.gid}&completed_since=now&opt_fields=${fields}`,
    token,
  );

  // The "Done" tile needs a number the main pull no longer contains. Ask for a
  // 7-day window with a single field so the extra pages cost almost nothing.
  const completedCount = await countRecentlyCompleted(workspace.gid, token);

  // Build a set of parent gids that have an in-progress subtask assigned to this user.
  // Subtasks appear in the same fetch (they're assigned to me); we just check them before filtering.
  const subtaskInProgressParents = new Set<string>();
  for (const t of tasks) {
    if (!t.parent?.gid || t.completed) continue;
    const status = t.custom_fields?.find((f) => f.type === "enum" && f.name.toLowerCase() === "status")?.enum_value?.name ?? null;
    if (status?.toLowerCase().includes("in progress")) {
      subtaskInProgressParents.add(t.parent.gid);
    }
  }

  // Auto-promote: for any parent task that has no status but has an in-progress subtask,
  // silently write "In Progress" to Asana so it persists. Fire-and-forget in parallel.
  const autoPromotePromises: Promise<void>[] = [];
  for (const t of tasks) {
    if (t.parent?.gid || t.completed) continue;
    if (!subtaskInProgressParents.has(t.gid)) continue;
    const statusField = t.custom_fields?.find((f) => f.type === "enum" && f.name.toLowerCase() === "status");
    if (statusField?.enum_value?.name) continue; // already has a status — don't overwrite
    if (!statusField?.gid) continue; // no status field on this task — skip
    const inProgressOption = statusField.enum_options?.find((o) => o.name.toLowerCase().includes("in progress"));
    if (!inProgressOption) continue; // no matching option — skip
    autoPromotePromises.push(
      updateTaskFields(t.gid, { customFields: { [statusField.gid]: inProgressOption.gid } }).catch(() => {/* ignore individual failures */}),
    );
  }
  if (autoPromotePromises.length > 0) await Promise.all(autoPromotePromises);

  // Phase 1: normalize without classification — exclude subtasks (tasks with a parent)
  const rawTasks = tasks.filter((t) => !t.parent?.gid).map((t) => {
    const projectGid = t.projects?.[0]?.gid ?? null;
    const membership = projectGid
      ? t.memberships?.find((m) => m.project.gid === projectGid)
      : t.memberships?.[0];
    return {
      gid: t.gid,
      name: t.name.trim(),
      project: t.projects?.[0]?.name ?? "(No project)",
      projectGid,
      due: t.due_on,
      completed: t.completed,
      permalink: t.permalink_url ?? null,
      createdBy: t.created_by?.name ?? null,
      assignee: t.assignee?.name ?? null,
      notes: t.notes ?? "",
      status: (() => {
        const sf = t.custom_fields?.find((f) => f.type === "enum" && f.name.toLowerCase() === "status");
        if (sf?.enum_value?.name) return sf.enum_value.name;
        // If this task was just auto-promoted, reflect it immediately in the UI
        if (subtaskInProgressParents.has(t.gid) && sf) {
          const opt = sf.enum_options?.find((o) => o.name.toLowerCase().includes("in progress"));
          if (opt) return opt.name;
        }
        return null;
      })(),
      statusFieldGid: t.custom_fields?.find((f) => f.type === "enum" && f.name.toLowerCase() === "status")?.gid ?? null,
      statusOptions: t.custom_fields?.find((f) => f.type === "enum" && f.name.toLowerCase() === "status")?.enum_options ?? [],
      createdAt: t.created_at ?? null,
      section: membership?.section?.name ?? null,
      sectionGid: membership?.section?.gid ?? null,
      subtaskInProgress: subtaskInProgressParents.has(t.gid),
    };
  });

  // Phase 2: classify — AI when AWS Bedrock credentials are set, keyword rules otherwise
  const subjectDefs = await getSubjectDefs();
  const useAI = await hasAICredentials();
  // Give "Other" tasks another shot on every refresh — clear their cache entries
  // so they go back through project-match and AI classification.
  // Skip when no subjects are configured: every task would just land in "Other" again.
  if (useAI && subjectDefs.length > 0) await clearOtherClassifications();
  const aiClassifications = useAI
    ? await classifyTasks(
        rawTasks.map((t) => ({
          gid: t.gid,
          name: t.name,
          notes: t.notes,
          project: t.project,
        })),
        subjectDefs,
      )
    : {};

  // Phase 3: build final AsanaTask array
  const normalized: AsanaTask[] = rawTasks.map((t) => {
    if (useAI) {
      return { ...t, subject: aiClassifications[t.gid] ?? "Other", track: null };
    }
    const { subject, track } = categorize(t.name, t.project);
    return { ...t, subject, track };
  });

  // The query already excludes completed tasks; this guards against an Asana
  // edge case where a task closes between the fetch and now.
  const open = normalized.filter((t) => !t.completed);

  const buckets: Record<AsanaBucket, AsanaTask[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    noDue: [],
  };
  for (const t of open) buckets[bucketFor(t)].push(t);

  const sortByDue = (a: AsanaTask, b: AsanaTask) =>
    (a.due ?? "9999").localeCompare(b.due ?? "9999");
  buckets.overdue.sort(sortByDue);
  buckets.today.sort(sortByDue);
  buckets.upcoming.sort(sortByDue);
  buckets.noDue.sort((a, b) => a.name.localeCompare(b.name));

  const projectNames = Array.from(new Set(open.map((t) => t.project)));
  const byProject = projectNames
    .map((project) => {
      const pts = open.filter((t) => t.project === project);
      return {
        gid: pts[0]?.projectGid ?? null,
        project,
        open: pts.length,
        overdue: buckets.overdue.filter((t) => t.project === project).length,
      };
    })
    .sort((a, b) => b.open - a.open);

  // "Focus today": overdue first (most overdue wins), then due today, then the
  // next 7 days. A higher score bubbles a task up the recommended list.
  const dueThisWeek = open.filter(
    (t) => t.due && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 7,
  ).length;

  const scored = open
    .filter((t) => t.due && daysUntil(t.due) <= 7)
    .map((t) => {
      const d = daysUntil(t.due!);
      let score: number;
      let reason: string;
      let urgency: FocusTask["urgency"];
      if (d < 0) {
        score = 1000 + Math.min(-d, 90);
        reason = `Overdue by ${-d} day${-d === 1 ? "" : "s"}`;
        urgency = "overdue";
      } else if (d === 0) {
        score = 900;
        reason = "Due today";
        urgency = "today";
      } else {
        score = 800 - d * 10;
        reason = d === 1 ? "Due tomorrow" : `Due in ${d} days`;
        urgency = "soon";
      }
      return { ...t, reason, urgency, score };
    })
    .sort((a, b) => b.score - a.score);

  const focus: FocusTask[] = scored
    .slice(0, 6)
    .map(({ score: _score, ...rest }) => rest);

  // Group open tasks by subject (and ER sub-track), most overdue subjects first.
  const isOverdue = (t: AsanaTask) => t.due != null && daysUntil(t.due) < 0;
  const subjectNames = Array.from(new Set(open.map((t) => t.subject)));
  // When AI is active, order subjects by the user's configured list; else use the static order.
  const subjectOrder = useAI
    ? [...subjectDefs.map((s) => s.name), "Other"]
    : SUBJECT_ORDER;
  const bySubject = subjectNames
    .map((subject) => {
      const tasks = open
        .filter((t) => t.subject === subject)
        .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
      const trackNames = Array.from(
        new Set(tasks.map((t) => t.track).filter((x): x is string => !!x)),
      );
      const tracks = trackNames
        .map((track) => {
          const tt = tasks.filter((t) => t.track === track);
          return { track, count: tt.length, overdue: tt.filter(isOverdue).length };
        })
        .sort((a, b) => b.overdue - a.overdue || b.count - a.count);
      return {
        subject,
        count: tasks.length,
        overdue: tasks.filter(isOverdue).length,
        tracks,
        tasks,
      };
    })
    .sort((a, b) => {
      const ai = subjectOrder.indexOf(a.subject);
      const bi = subjectOrder.indexOf(b.subject);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  return {
    user: { name: me.name, email: me.email },
    workspace: { gid: workspace.gid, name: workspace.name },
    counts: {
      open: open.length,
      overdue: buckets.overdue.length,
      today: buckets.today.length,
      upcoming: buckets.upcoming.length,
      noDue: buckets.noDue.length,
      completed: completedCount,
      dueThisWeek,
    },
    buckets,
    focus,
    byProject,
    bySubject,
    availableSubjects: [...subjectDefs.map((s) => s.name), "Other"],
    truncated,
    taskLimit: MAX_TASKS,
    fetchedAt: new Date().toISOString(),
  };
}

export type AsanaComment = {
  gid: string;
  text: string;
  author: string;
  createdAt: string;
};

export type Subtask = {
  gid: string;
  name: string;
  completed: boolean;
  due: string | null;
  assignee: string | null;
  status: string | null;
  statusFieldGid: string | null;
  statusOptions: { gid: string; name: string }[];
};

export type CustomField = {
  gid: string;
  name: string;
  type: string;
  enumValue: { gid: string; name: string } | null;
  enumOptions: { gid: string; name: string }[];
};

export type TaskDetail = {
  gid: string;
  name: string;
  notes: string;
  due: string | null;
  assignee: { gid: string; name: string } | null;
  completed: boolean;
  permalink: string | null;
  comments: AsanaComment[];
  customFields: CustomField[];
};

/** Full detail for a single task, including the comment thread. */
export async function getTaskDetail(gid: string): Promise<TaskDetail> {
  const token = await getToken();
  const t = await asanaGet<{
    gid: string;
    name: string;
    notes: string;
    due_on: string | null;
    completed: boolean;
    permalink_url?: string | null;
    assignee?: { gid: string; name: string } | null;
    custom_fields?: {
      gid: string;
      name: string;
      type: string;
      enum_value?: { gid: string; name: string } | null;
      enum_options?: { gid: string; name: string }[];
    }[];
  }>(
    `/tasks/${gid}?opt_fields=name,notes,due_on,completed,permalink_url,assignee.name,custom_fields.gid,custom_fields.name,custom_fields.type,custom_fields.enum_value.gid,custom_fields.enum_value.name,custom_fields.enum_options.gid,custom_fields.enum_options.name`,
    token,
  );

  const stories = await asanaGet<
    {
      gid: string;
      type: string;
      text?: string;
      created_at: string;
      created_by?: { name: string } | null;
    }[]
  >(`/tasks/${gid}/stories?opt_fields=type,text,created_at,created_by.name`, token);

  const comments: AsanaComment[] = stories
    .filter((s) => s.type === "comment" && s.text)
    .map((s) => ({
      gid: s.gid,
      text: s.text ?? "",
      author: s.created_by?.name ?? "Unknown",
      createdAt: s.created_at,
    }));

  const customFields: CustomField[] = (t.custom_fields ?? [])
    .filter((f) => f.type === "enum" && (f.enum_options?.length ?? 0) > 0)
    .map((f) => ({
      gid: f.gid,
      name: f.name,
      type: f.type,
      enumValue: f.enum_value ?? null,
      enumOptions: f.enum_options ?? [],
    }));

  return {
    gid: t.gid,
    name: t.name,
    notes: t.notes ?? "",
    due: t.due_on,
    assignee: t.assignee ? { gid: t.assignee.gid, name: t.assignee.name } : null,
    completed: t.completed,
    permalink: t.permalink_url ?? null,
    comments,
    customFields,
  };
}

/**
 * Update editable fields on a task. Only provided keys are sent.
 * `assignee` accepts a user gid, the string "me", or null to unassign.
 * `due` accepts "YYYY-MM-DD" or null to clear.
 * `customFields` is a map of field_gid → option_gid (or null to clear).
 */
export async function updateTaskFields(
  gid: string,
  fields: {
    name?: string;
    assignee?: string | null;
    due?: string | null;
    notes?: string;
    htmlNotes?: string | null;
    customFields?: Record<string, string | null>;
  },
): Promise<void> {
  const token = await getToken();
  const data: Record<string, unknown> = {};
  if ("name" in fields) data.name = fields.name;
  if ("assignee" in fields) data.assignee = fields.assignee;
  if ("due" in fields) data.due_on = fields.due;
  if (fields.htmlNotes) data.html_notes = fields.htmlNotes;
  else if ("notes" in fields) data.notes = fields.notes;
  if (fields.customFields && Object.keys(fields.customFields).length > 0) {
    data.custom_fields = fields.customFields;
  }

  const res = await fetch(`${ASANA_API}/tasks/${gid}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} updating task: ${body.slice(0, 300)}`);
  }
}

/** Move a task to a different section within the same project. */
export async function moveTaskToSection(
  taskGid: string,
  sectionGid: string,
): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${ASANA_API}/sections/${sectionGid}/addTask`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { task: taskGid } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} moving task to section: ${body.slice(0, 300)}`);
  }
}

/** Add a comment (story) to a task. Pass htmlText to embed @mentions. */
export async function addComment(gid: string, text: string, htmlText?: string | null): Promise<void> {
  const token = await getToken();
  const data: Record<string, string> = htmlText ? { html_text: htmlText } : { text };
  const res = await fetch(`${ASANA_API}/tasks/${gid}/stories`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} adding comment: ${body.slice(0, 300)}`);
  }
}

/** Typeahead search for assignable users in the workspace. */
export async function searchUsers(
  query: string,
): Promise<{ gid: string; name: string; email: string | null }[]> {
  const token = await getToken();
  const me = await asanaGet<{ workspaces: { gid: string }[] }>(
    "/users/me",
    token,
  );
  const workspaceGid = me.workspaces[0]?.gid;
  if (!workspaceGid) return [];

  const q = query.trim();
  const users = await asanaGet<
    { gid: string; name: string; email?: string | null }[]
  >(
    `/workspaces/${workspaceGid}/typeahead?resource_type=user&query=${encodeURIComponent(
      q || " ",
    )}&count=15&opt_fields=name,email`,
    token,
  );
  return users
    .map((u) => ({ gid: u.gid, name: u.name, email: u.email ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Mark a task complete / incomplete. */
export async function setTaskCompleted(
  gid: string,
  completed: boolean,
): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${ASANA_API}/tasks/${gid}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: { completed } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} updating task: ${body.slice(0, 300)}`);
  }
}

/** Permanently delete a task. */
export async function deleteTask(gid: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${ASANA_API}/tasks/${gid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} deleting task: ${body.slice(0, 300)}`);
  }
}

/** Add a task to a project (and optionally a section). */
export async function addTaskToProject(
  taskGid: string,
  projectGid: string,
  sectionGid?: string | null,
): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${ASANA_API}/tasks/${taskGid}/addProject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        project: projectGid,
        ...(sectionGid ? { section: sectionGid } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} adding task to project: ${body.slice(0, 300)}`);
  }
}

/** Fetch projects the current user is a member of (not all workspace projects). */
/** Fetch subtasks for a given parent task. */
export async function getSubtasks(parentGid: string): Promise<Subtask[]> {
  const token = await getToken();
  const raw = await asanaGet<
    {
      gid: string;
      name: string;
      completed: boolean;
      due_on: string | null;
      assignee?: { name: string } | null;
      custom_fields?: { gid: string; name: string; type: string; enum_value?: { name: string } | null; enum_options?: { gid: string; name: string }[] }[];
    }[]
  >(
    `/tasks/${parentGid}/subtasks?opt_fields=name,completed,due_on,assignee.name,custom_fields.gid,custom_fields.name,custom_fields.type,custom_fields.enum_value.name,custom_fields.enum_options.gid,custom_fields.enum_options.name&limit=100`,
    token,
  );
  return raw.map((s) => {
    const statusField = s.custom_fields?.find((f) => f.type === "enum" && f.name.toLowerCase() === "status");
    return {
      gid: s.gid,
      name: s.name,
      completed: s.completed,
      due: s.due_on,
      assignee: s.assignee?.name ?? null,
      status: statusField?.enum_value?.name ?? null,
      statusFieldGid: statusField?.gid ?? null,
      statusOptions: statusField?.enum_options ?? [],
    };
  });
}

/** Create a subtask under a parent task. */
export async function createSubtask(
  parentGid: string,
  name: string,
  due?: string | null,
): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${ASANA_API}/tasks/${parentGid}/subtasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { name, assignee: "me", ...(due ? { due_on: due } : {}) } }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} creating subtask: ${body.slice(0, 300)}`);
  }
}

/**
 * Fetch the user's relevant projects using Asana's typeahead with an empty
 * query — this mirrors exactly what Asana's own sidebar shows (recently used /
 * member-of projects). Client-side filtering is applied after; we never pass
 * the typed text to the API, which avoids polluting results with org-wide matches.
 */
export async function getProjects(): Promise<{ gid: string; name: string }[]> {
  const token = await getToken();
  const me = await asanaGet<{ workspaces: { gid: string }[] }>("/users/me", token);
  const workspaceGid = me.workspaces[0]?.gid;
  if (!workspaceGid) return [];

  const projects = await asanaGet<{ gid: string; name: string }[]>(
    `/workspaces/${workspaceGid}/typeahead?resource_type=project&query=&count=100&opt_fields=name,gid`,
    token,
  );
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

/** Fetch sections (columns/groups) for a project. */
export async function getSections(
  projectGid: string,
): Promise<{ gid: string; name: string }[]> {
  const token = await getToken();
  const raw = await asanaGet<{ gid: string; name: string }[]>(
    `/projects/${projectGid}/sections?opt_fields=name,gid&limit=100`,
    token,
  );
  return raw;
}

export async function getProjectMembers(projectGid: string): Promise<{ gid: string; name: string }[]> {
  const token = await getToken();
  const members = await asanaGet<{ gid: string; name: string }[]>(
    `/projects/${projectGid}/members?opt_fields=gid,name`,
    token,
  );
  return members ?? [];
}

/** Create a new task. Assigns to the caller unless assigneeGid is provided. */
export async function createTask(input: {
  name: string;
  due?: string | null;
  projectGid?: string | null;
  sectionGid?: string | null;
  assigneeGid?: string | null;
}): Promise<void> {
  const token = await getToken();
  const me = await asanaGet<{ workspaces: { gid: string }[] }>(
    "/users/me",
    token,
  );
  const workspaceGid = me.workspaces[0]?.gid;
  if (!workspaceGid) throw new Error("No Asana workspace found.");

  const memberships =
    input.projectGid
      ? [
          {
            project: input.projectGid,
            ...(input.sectionGid ? { section: input.sectionGid } : {}),
          },
        ]
      : undefined;

  const res = await fetch(`${ASANA_API}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        name: input.name,
        assignee: input.assigneeGid ?? "me",
        workspace: workspaceGid,
        ...(input.due ? { due_on: input.due } : {}),
        ...(memberships ? { memberships } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana ${res.status} creating task: ${body.slice(0, 300)}`);
  }
}
