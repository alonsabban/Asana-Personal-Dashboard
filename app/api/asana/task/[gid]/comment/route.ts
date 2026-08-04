import { NextResponse } from "next/server";
import { addComment } from "@/app/lib/asana";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gid: string }> },
) {
  try {
    const { gid } = await params;
    const body = (await request.json()) as { text?: string; htmlText?: string | null };
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "Comment text is required." }, { status: 400 });
    }
    await addComment(gid, body.text.trim(), body.htmlText ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
