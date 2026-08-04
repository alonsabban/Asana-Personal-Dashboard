import { NextResponse } from "next/server";
import { setClassification, clearClassificationCache } from "@/app/lib/classify";

export const dynamic = "force-dynamic";

/** PATCH { gid, subject } — manually override one task's subject in the cache. */
export async function PATCH(req: Request) {
  try {
    const { gid, subject } = (await req.json()) as { gid: string; subject: string };
    if (!gid || !subject) {
      return NextResponse.json({ error: "gid and subject required" }, { status: 400 });
    }
    await setClassification(gid, subject);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** DELETE — wipe the entire cache so every task is re-classified on next load. */
export async function DELETE() {
  try {
    await clearClassificationCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
