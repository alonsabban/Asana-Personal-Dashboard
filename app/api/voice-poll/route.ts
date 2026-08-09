import { NextResponse } from "next/server";
import { getSettings } from "@/app/lib/settings";
import { createTask } from "@/app/lib/asana";

export const dynamic = "force-dynamic";

type BrokerTask = {
  taskId: string;
  name: string;
  due?: string;
  createdAt: string;
};

export async function GET() {
  try {
    const settings = await getSettings();
    const { voiceBroker } = settings;

    if (!voiceBroker?.apiUrl || !voiceBroker?.userToken) {
      return NextResponse.json({ created: 0 });
    }

    const url = `${voiceBroker.apiUrl.replace(/\/$/, "")}/tasks?token=${encodeURIComponent(voiceBroker.userToken)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ created: 0 });

    const { tasks } = (await res.json()) as { tasks: BrokerTask[] };
    if (!tasks?.length) return NextResponse.json({ created: 0 });

    await Promise.all(
      tasks.map((t) =>
        createTask({ name: t.name, due: t.due ?? null }).catch(() => {}),
      ),
    );

    return NextResponse.json({ created: tasks.length });
  } catch {
    return NextResponse.json({ created: 0 });
  }
}
