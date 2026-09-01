import { NextResponse } from "next/server";
import { createTask, getAsanaData, NO_TOKEN_ERROR } from "@/app/lib/asana";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getAsanaData();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // 428 Precondition Required = "not connected yet", so the client shows the
    // setup gate rather than an error banner.
    if (message === NO_TOKEN_ERROR) {
      return NextResponse.json({ error: message, needsSetup: true }, { status: 428 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      due?: string | null;
      projectGid?: string | null;
      sectionGid?: string | null;
      assigneeGid?: string | null;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Task name is required." }, { status: 400 });
    }
    await createTask({
      name: body.name.trim(),
      due: body.due ?? null,
      projectGid: body.projectGid ?? null,
      sectionGid: body.sectionGid ?? null,
      assigneeGid: body.assigneeGid ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
