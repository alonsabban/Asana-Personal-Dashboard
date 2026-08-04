import { NextResponse } from "next/server";
import { getTaskDetail, updateTaskFields, moveTaskToSection } from "@/app/lib/asana";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gid: string }> },
) {
  try {
    const { gid } = await params;
    const detail = await getTaskDetail(gid);
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ gid: string }> },
) {
  try {
    const { gid } = await params;
    const body = (await request.json()) as {
      name?: string;
      assignee?: string | null;
      due?: string | null;
      notes?: string;
      htmlNotes?: string | null;
      customFields?: Record<string, string | null>;
      sectionGid?: string;
    };
    const { sectionGid, ...fields } = body;
    if (sectionGid) await moveTaskToSection(gid, sectionGid);
    if (Object.keys(fields).length > 0) await updateTaskFields(gid, fields);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
