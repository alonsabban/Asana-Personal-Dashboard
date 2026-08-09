"use client";

import { useAsana } from "@/app/components/AsanaProvider";
import Clock from "@/app/components/Clock";
import Greeting from "@/app/components/Greeting";
import Tutorial from "@/app/components/Tutorial";
import Feedback from "@/app/components/Feedback";

/**
 * Top section. Name and workspace provenance both come from Asana, so this must
 * live inside AsanaProvider.
 */
export default function DashboardHeader() {
  const { data } = useAsana();

  const firstName = data?.user.name?.trim().split(/\s+/)[0] ?? null;
  const projectCount = data?.byProject.length ?? 0;

  return (
    <header className="topbar" id="tutorial-topbar">
      <div className="greeting">
        <Greeting name={firstName} />
        {data ? (
          <p>
            {projectCount} {projectCount === 1 ? "project" : "projects"} collected
            from the <strong>{data.workspace.name}</strong> workspace
          </p>
        ) : (
          <p>Your personal dashboard</p>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
          <Feedback />
          <Tutorial />
          <a href="/docs.html" target="_blank" rel="noopener noreferrer" className="topbar-text-btn" title="Architecture docs">Docs</a>
        </div>
        <Clock />
      </div>
    </header>
  );
}
