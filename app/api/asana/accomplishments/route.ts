import { NextResponse } from "next/server";
import { getSettings } from "@/app/lib/settings";
import { getAwsConfig, generateAccomplishmentsSummary, AccomplishmentTask, loadCache } from "@/app/lib/classify";

export const dynamic = "force-dynamic";

const ASANA_API = "https://app.asana.com/api/1.0";
const ASANA_PAGE_SIZE = 100;
const MAX_REPORT_TASKS = 500;

type RawReportTask = {
  gid: string;
  name: string;
  completed: boolean;
  completed_at?: string | null;
  due_on?: string | null;
  projects?: { gid: string; name: string }[];
  custom_fields?: {
    gid: string;
    name: string;
    type: string;
    enum_value?: { name: string } | null;
  }[];
};

async function fetchRecentTasks(
  workspaceGid: string,
  token: string,
  since: string,
): Promise<RawReportTask[]> {
  const fields =
    "name,completed,completed_at,due_on,projects.gid,projects.name," +
    "custom_fields.gid,custom_fields.name,custom_fields.type,custom_fields.enum_value.name";

  const basePath =
    `/tasks?assignee=me&workspace=${workspaceGid}&completed_since=${since}&opt_fields=${fields}`;

  const tasks: RawReportTask[] = [];
  let offset: string | null = null;

  while (tasks.length < MAX_REPORT_TASKS) {
    const limit = Math.min(ASANA_PAGE_SIZE, MAX_REPORT_TASKS - tasks.length);
    const path = `${basePath}&limit=${limit}${offset ? `&offset=${offset}` : ""}`;

    const res = await fetch(`${ASANA_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Asana ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      data: RawReportTask[];
      next_page?: { offset: string } | null;
    };

    tasks.push(...json.data);
    if (!json.next_page?.offset) break;
    offset = json.next_page.offset;
  }

  return tasks;
}

function extractStatus(task: RawReportTask): string | null {
  const statusField = task.custom_fields?.find(
    (f) => f.name.toLowerCase() === "status" && f.type === "enum",
  );
  return statusField?.enum_value?.name ?? null;
}

function primaryProject(task: RawReportTask): string {
  return task.projects?.[0]?.name ?? "(No project)";
}

// GET /api/asana/accomplishments?days=7|14|30
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "14", 10), 1), 90);

    const settings = await getSettings();
    const token =
      settings.asanaPat?.trim() ||
      process.env.ASANA_PAT?.trim();

    if (!token) {
      return NextResponse.json({ error: "No Asana token configured." }, { status: 428 });
    }

    // Resolve workspace
    const meRes = await fetch(`${ASANA_API}/users/me?opt_fields=workspaces.gid`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!meRes.ok) {
      return NextResponse.json({ error: "Failed to fetch Asana user." }, { status: 500 });
    }
    const me = (await meRes.json()) as { data: { workspaces: { gid: string }[] } };
    const workspaceGid = me.data.workspaces?.[0]?.gid;
    if (!workspaceGid) {
      return NextResponse.json({ error: "No Asana workspace found." }, { status: 500 });
    }

    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const [raw, classCache] = await Promise.all([
      fetchRecentTasks(workspaceGid, token, since),
      loadCache(),
    ]);

    // Build simplified tasks and collect all unique status values
    const statusOptions = new Set<string>();
    const tasks = raw.map((t) => {
      const status = extractStatus(t);
      if (status) statusOptions.add(status);
      const cachedSubject = classCache[t.gid];
      const subject = cachedSubject && cachedSubject !== "Other" ? cachedSubject : null;
      return {
        gid: t.gid,
        name: t.name,
        project: primaryProject(t),
        subject,
        completedAt: t.completed_at ?? null,
        completed: t.completed,
        status,
      };
    });

    return NextResponse.json({ tasks, statusOptions: [...statusOptions] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/asana/accomplishments — generate AI summary
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tasks: AccomplishmentTask[] };
    if (!body.tasks?.length) {
      return NextResponse.json({ error: "No tasks provided." }, { status: 400 });
    }

    const aws = await getAwsConfig();
    if (!aws) {
      return NextResponse.json({ error: "no_aws" }, { status: 428 });
    }

    const { summary, success } = await generateAccomplishmentsSummary(body.tasks, aws);
    if (!success) {
      return NextResponse.json({ error: "Bedrock call failed. Check AWS credentials." }, { status: 500 });
    }

    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
