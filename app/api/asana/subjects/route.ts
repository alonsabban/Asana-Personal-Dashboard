import { NextResponse } from "next/server";
import { getSubjectDefs, saveSubjectDefs, type SubjectDef } from "@/app/lib/subjects";
import { applyRenames, hasAICredentials } from "@/app/lib/classify";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const subjects = await getSubjectDefs();
    return NextResponse.json({ subjects, hasAI: await hasAICredentials() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST { subjects, renames? }
 *
 * Saves the updated subject list, then applies any renames to the
 * classification cache so existing task labels stay in sync without
 * triggering a re-classification.
 *
 * renames: { "old name": "new name" }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      subjects: SubjectDef[];
      renames?: Record<string, string>;
    };

    if (!Array.isArray(body.subjects)) {
      return NextResponse.json({ error: "subjects must be an array" }, { status: 400 });
    }

    await saveSubjectDefs(body.subjects);

    if (body.renames && Object.keys(body.renames).length > 0) {
      await applyRenames(body.renames);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
