import { NextResponse } from "next/server";
import { getProjects, getSections, getProjectMembers } from "@/app/lib/asana";
import { getAwsConfig, parseBulkTasks } from "@/app/lib/classify";

export const dynamic = "force-dynamic";

// POST /api/asana/bulk-parse
// Body: { text: string }
// Fetches projects + sections, calls Bedrock to parse the text, returns structured tasks.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "No text provided." }, { status: 400 });
    }

    const aws = await getAwsConfig();
    if (!aws) {
      return NextResponse.json({ error: "no_aws" }, { status: 428 });
    }

    // Fetch projects first, then sections + members per project in parallel
    const projects = await getProjects();
    const [sectionsPerProject, membersPerProject] = await Promise.all([
      Promise.all(projects.map((p) => getSections(p.gid).catch(() => [] as { gid: string; name: string }[]))),
      Promise.all(projects.map((p) => getProjectMembers(p.gid).catch(() => [] as { gid: string; name: string }[]))),
    ]);

    // Deduplicate members across all projects by GID
    const memberMap = new Map<string, { gid: string; name: string }>();
    for (const list of membersPerProject) {
      for (const m of list) memberMap.set(m.gid, m);
    }
    const members = Array.from(memberMap.values());

    const projectsWithSections = projects.map((p, i) => ({
      ...p,
      sections: sectionsPerProject[i],
    }));

    const { tasks, success } = await parseBulkTasks(body.text.trim(), projectsWithSections, aws);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to parse tasks. Check AWS credentials." },
        { status: 500 },
      );
    }

    return NextResponse.json({ tasks, projects: projectsWithSections, members });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
