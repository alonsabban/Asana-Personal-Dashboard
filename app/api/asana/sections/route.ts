import { NextResponse } from "next/server";
import { getSections } from "@/app/lib/asana";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectGid = searchParams.get("projectGid");
  if (!projectGid) {
    return NextResponse.json({ error: "projectGid is required" }, { status: 400 });
  }
  try {
    const sections = await getSections(projectGid);
    return NextResponse.json({ sections });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
