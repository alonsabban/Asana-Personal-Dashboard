"use client";

import { useAsana } from "@/app/components/AsanaProvider";
import DashboardHeader from "@/app/components/DashboardHeader";
import SetupGate from "@/app/components/SetupGate";
import SearchBar from "@/app/components/SearchBar";
import TodayFocus from "@/app/components/TodayFocus";
import BySubjectModule from "@/app/components/BySubjectModule";
import AsanaModule from "@/app/components/AsanaModule";

/**
 * Decides between the first-run setup gate and the real dashboard. Nothing is
 * rendered behind the gate, because without a token there is nothing to render.
 */
export default function DashboardShell() {
  const { needsSetup, loading, data } = useAsana();

  // Until the first response lands we don't yet know whether setup is needed.
  // Showing a bare shell avoids flashing the gate at a configured user.
  if (loading && !data && !needsSetup) {
    return (
      <div className="shell">
        <div className="spin" style={{ marginTop: 80 }}>Loading your dashboard…</div>
      </div>
    );
  }

  if (needsSetup) return <SetupGate />;

  return (
    <div className="shell">
      <DashboardHeader />

      <div className="page-toolbar" id="tutorial-search">
        <SearchBar />
      </div>

      <div style={{ marginBottom: 20 }} id="tutorial-focus">
        <TodayFocus />
      </div>

      <div className="content-full">
        <div id="tutorial-subjects"><BySubjectModule /></div>
        <div id="tutorial-asana"><AsanaModule /></div>
      </div>
    </div>
  );
}
