import { NextResponse } from "next/server";
import { getProjects } from "@/app/lib/asana";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await getProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
