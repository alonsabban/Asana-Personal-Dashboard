"use client";

import { useEffect, useState } from "react";
import { useAsana } from "@/app/components/AsanaProvider";
import TaskTable from "@/app/components/TaskTable";
import SubjectSettings from "@/app/components/SubjectSettings";
import AddTaskButton from "@/app/components/AddTaskButton";
import { taskMatches } from "@/app/lib/match";

type GroupBy = "none" | "subject" | "project";

export default function BySubjectModule() {
  const { data, refresh, query } = useAsana();
  const [showSettings, setShowSettings] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    if (typeof window === "undefined") return "project";
    return (localStorage.getItem("taskGroupBy") as GroupBy) ?? "project";
  });

  /* Invite subject setup once, right after connecting. */
  const [inviteSubjects, setInviteSubjects] = useState(false);
  const [inviteDismissed, setInviteDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => setInviteSubjects(!j.hasConfiguredSubjects))
      .catch(() => {});
  }, []);

  if (!data) return null;

  const showInvite = inviteSubjects && !inviteDismissed;

  const allOpen = [
    ...data.buckets.overdue,
    ...data.buckets.today,
    ...data.buckets.upcoming,
    ...data.buckets.noDue,
  ].filter((t) => (query.trim() ? taskMatches(t, query) : true));

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2>My tasks</h2>
            <div className="groupby-btns">
              {(["subject", "project"] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  className={`btn-group-by${groupBy === g ? " active" : ""}`}
                  onClick={() => setGroupBy((v) => {
                    const next = v === g ? "none" : g;
                    localStorage.setItem("taskGroupBy", next);
                    return next;
                  })}
                >
                  {g === "subject" ? "By subject" : "By project"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="sub">{data.counts.open} open · {data.workspace.name}</span>
            <AddTaskButton />
            <button
              className="icon-btn"
              title="Configure AI subjects"
              onClick={() => setShowSettings(true)}
              style={{ fontSize: 28, color: "var(--accent)" }}
            >⚙</button>
          </div>
        </div>
        <div className="card-body">
          {showInvite && (
            <div className="subject-invite">
              <div>
                <strong>Want your tasks sorted by context?</strong>{" "}
                Add a few subjects — “Customer work”, “Admin”, whatever fits how
                you actually think about your day — and the dashboard groups
                tasks by them instead of one long list. Entirely optional; skip
                it and everything just stays as “Other”.
              </div>
              <div className="subject-invite-actions">
                <button className="btn" onClick={() => setShowSettings(true)}>
                  Add subjects
                </button>
                <button
                  className="btn ghost"
                  onClick={() => setInviteDismissed(true)}
                >
                  Maybe later
                </button>
              </div>
            </div>
          )}

          {allOpen.length === 0 ? (
            <div className="empty">
              {query.trim() ? "No tasks match your search." : "No open tasks. Nice work!"}
            </div>
          ) : (
            <TaskTable
              tasks={allOpen}
              onChanged={refresh}
              availableSubjects={data.availableSubjects ?? []}
              groupBy={groupBy}
            />
          )}
        </div>
      </section>

      {showSettings && (
        <SubjectSettings
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            // Setup has been visited — stop inviting.
            setInviteSubjects(false);
            return refresh();
          }}
        />
      )}
    </>
  );
}
