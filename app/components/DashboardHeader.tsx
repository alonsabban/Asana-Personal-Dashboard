"use client";

import { useState } from "react";
import { useAsana } from "@/app/components/AsanaProvider";
import Clock from "@/app/components/Clock";
import Greeting from "@/app/components/Greeting";
import Tutorial from "@/app/components/Tutorial";
import Feedback from "@/app/components/Feedback";
import VoiceSetupModal from "@/app/components/VoiceSetupModal";
import { useDayPhase } from "@/app/hooks/useDayPhase";
import { APP_VERSION } from "@/app/version";

/**
 * Top section. Name and workspace provenance both come from Asana, so this must
 * live inside AsanaProvider.
 */
export default function DashboardHeader() {
  const { data } = useAsana();
  const [showVoiceSetup, setShowVoiceSetup] = useState(false);
  const phase = useDayPhase();

  const firstName = data?.user.name?.trim().split(/\s+/)[0] ?? null;
  const projectCount = data?.byProject.length ?? 0;

  return (
    <>
    <header className="topbar" id="tutorial-topbar" data-phase={phase}>
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
          <button className="topbar-text-btn" onClick={() => setShowVoiceSetup(true)} title="Voice task setup">🎤 Voice</button>
          <a href="/docs.html" target="_blank" rel="noopener noreferrer" className="topbar-text-btn" title="Architecture docs">Docs</a>
        </div>
        <Clock />
      </div>
      <span className="topbar-version">V{APP_VERSION}</span>
    </header>
    {showVoiceSetup && <VoiceSetupModal onClose={() => setShowVoiceSetup(false)} />}
    </>
  );
}
