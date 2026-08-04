"use client";

import { useState } from "react";
import { useAsana } from "@/app/components/AsanaProvider";
import TaskRow from "@/app/components/TaskRow";

function brief(counts: {
  overdue: number;
  today: number;
  dueThisWeek: number;
}): string {
  const parts: string[] = [];
  if (counts.overdue > 0)
    parts.push(`${counts.overdue} overdue task${counts.overdue === 1 ? "" : "s"}`);
  if (counts.today > 0) parts.push(`${counts.today} due today`);
  const laterThisWeek = counts.dueThisWeek - counts.today;
  if (laterThisWeek > 0)
    parts.push(`${laterThisWeek} more due this week`);

  if (parts.length === 0) return "Nothing due this week. You're clear — enjoy it.";
  const list =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return `You have ${list}. Here's where to focus first.`;
}

export default function TodayFocus() {
  const { data, loading, error, lastUpdated, refresh } = useAsana();
  const [open, setOpen] = useState(false);

  const dotFor = (u: string) =>
    u === "overdue"
      ? "var(--danger)"
      : u === "today"
        ? "var(--warning)"
        : "var(--accent)";

  const focusCount = data?.focus.length ?? 0;

  return (
    <section className="card focus-card">
      <div className="card-head">
        <button
          className="focus-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className={`caret ${open ? "open" : ""}`} aria-hidden>▸</span>
          <h2 style={{ margin: 0, display: "inline" }}>
            <span className="dot accent" /> Today&apos;s focus
          </h2>
          {!open && data && (
            <span className="focus-summary-pill">
              {focusCount} task{focusCount === 1 ? "" : "s"}
              {data.counts.overdue > 0 && (
                <span style={{ color: "var(--danger)", marginLeft: 6 }}>
                  · {data.counts.overdue} overdue
                </span>
              )}
            </span>
          )}
        </button>
        <span className="sub">
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : loading
              ? "Loading…"
              : ""}
          <span
            className="refresh-note"
            title="Tasks refresh automatically once a day at 8:00 AM. Use Refresh any time to pull now."
          >
            · auto-refreshes daily at 8:00 AM
          </span>
          <button className="refresh" onClick={refresh} disabled={loading} style={{ marginLeft: 8 }}>
            {loading ? "…" : "Refresh"}
          </button>
        </span>
      </div>

      {open && (
        <div className="card-body">
          {error && <div className="banner">{error}</div>}

          {data && (
            <p className="brief">
              {data.user.name.split(" ")[0]}, {brief(data.counts).charAt(0).toLowerCase() + brief(data.counts).slice(1)}
            </p>
          )}

          {data && data.focus.length === 0 && !error && (
            <div className="empty">Nothing pressing in the next 7 days.</div>
          )}

          <div className="focus-list">
            {data?.focus.map((t, i) => (
              <TaskRow
                key={t.gid}
                task={t}
                onChanged={refresh}
                leading={<span className="focus-rank">{i + 1}</span>}
                meta={
                  <>
                    <span
                      className="pill"
                      style={{ color: dotFor(t.urgency), background: "transparent", paddingLeft: 0 }}
                    >
                      {t.reason}
                    </span>
                    <span className={`pill subj subj-${t.subject.toLowerCase().replace(/[^a-z]/g, "")}`}>
                      {t.subject}
                      {t.track && t.track !== "General" ? ` · ${t.track}` : ""}
                    </span>
                    <span className="pill">{t.project}</span>
                  </>
                }
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
