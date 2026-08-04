import { NextResponse } from "next/server";
import { getSubtasks, createSubtask } from "@/app/lib/asana";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gid: string }> },
) {
  try {
    const { gid } = await params;
    const subtasks = await getSubtasks(gid);
    return NextResponse.json({ subtasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gid: string }> },
) {
  try {
    const { gid } = await params;
    const body = (await request.json()) as { name?: string; due?: string | null };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Subtask name is required." }, { status: 400 });
    }
    await createSubtask(gid, body.name.trim(), body.due ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
