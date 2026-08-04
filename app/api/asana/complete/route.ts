import { NextResponse } from "next/server";
import { setTaskCompleted } from "@/app/lib/asana";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { gid?: string; completed?: boolean };
    if (!body.gid) {
      return NextResponse.json({ error: "Task gid is required." }, { status: 400 });
    }
    await setTaskCompleted(body.gid, body.completed ?? true);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
