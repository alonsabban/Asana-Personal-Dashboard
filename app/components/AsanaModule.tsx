"use client";

import { useState } from "react";
import { useAsana } from "@/app/components/AsanaProvider";
import TaskTable from "@/app/components/TaskTable";
import { taskMatches } from "@/app/lib/match";
import type { AsanaTask } from "@/app/lib/asana";

type View = "open" | "overdue" | "thisweek" | "nodate" | null;

export default function AsanaModule() {
  const { data, error, loading, refresh, query } = useAsana();
  const [activeView, setActiveView] = useState<View>(null);

  const searching = query.trim().length > 0;

  const allOpen: AsanaTask[] = data
    ? [
        ...data.buckets.overdue,
        ...data.buckets.today,
        ...data.buckets.upcoming,
        ...data.buckets.noDue,
      ]
    : [];

  function toggle(view: View) {
    setActiveView((v) => (v === view ? null : view));
  }

  function tasksForView(): AsanaTask[] {
    if (!data) return [];
    switch (activeView) {
      case "open":     return allOpen;
      case "overdue":  return data.buckets.overdue;
      case "thisweek": return [...data.buckets.today, ...data.buckets.upcoming];
      case "nodate":   return data.buckets.noDue;
      default:         return [];
    }
  }

  const list = searching
    ? allOpen.filter((t) => taskMatches(t, query))
    : tasksForView();

  const stats: { key: View; label: string; value: number; cls: string }[] = [
    { key: "open",     label: "Open",      value: data?.counts.open ?? 0,        cls: "accent" },
    { key: "overdue",  label: "Overdue",   value: data?.counts.overdue ?? 0,     cls: "danger" },
    { key: "thisweek", label: "This week", value: data?.counts.dueThisWeek ?? 0, cls: "info" },
    { key: "nodate",   label: "No date",   value: data?.counts.noDue ?? 0,       cls: "warning" },
  ];

  return (
    <div className="col">
      <section className="card">
        <div className="card-head">
          <h2>
            <span className="dot accent" /> All my tasks
            {data && <span className="sub">· {data.workspace.name}</span>}
          </h2>
          <button className="refresh" onClick={refresh} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
        <div className="card-body">
          {error && <div className="banner">{error}</div>}

          {data?.truncated && (
            <div className="banner banner-info">
              You have more than {data.taskLimit} open tasks — showing the first{" "}
              {data.taskLimit}. Narrow things down in Asana to see the rest here.
            </div>
          )}

          {data && (
            <div className="compact-stats">
              {stats.map((s) => (
                <button
                  key={s.key}
                  className={`compact-stat ${s.cls} ${activeView === s.key && !searching ? "active" : ""}`}
                  onClick={() => toggle(s.key)}
                  title={`Show ${s.label.toLowerCase()} tasks`}
                >
                  <span className="cs-value">{s.value}</span>
                  <span className="cs-label">{s.label}</span>
                </button>
              ))}
              <div
                className="compact-stat done-stat"
                title="Tasks you completed in the last 7 days"
              >
                <span className="cs-value success">{data.counts.completed}</span>
                <span className="cs-label">Done (7d)</span>
              </div>
            </div>
          )}

          {loading && !data && <div className="spin">Loading your tasks…</div>}

          {(searching || activeView) && (
            <div style={{ marginTop: 12 }}>
              {list.length === 0 ? (
                <div className="empty">
                  {searching ? "No tasks match your search." : "Nothing here."}
                </div>
              ) : (
                <TaskTable tasks={list} onChanged={refresh} />
              )}
            </div>
          )}
        </div>
      </section>

      {data && data.byProject.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Open tasks by project</h2>
          </div>
          <div className="card-body">
            {data.byProject.map((p) => {
              const overPct = p.open ? (p.overdue / p.open) * 100 : 0;
              return (
                <div className="proj-row" key={p.project}>
                  <div className="proj-top">
                    <span>{p.project}</span>
                    <span className="muted">
                      {p.open} open{p.overdue > 0 && ` · ${p.overdue} overdue`}
                    </span>
                  </div>
                  <div className="bar">
                    <div className="seg-over" style={{ width: `${overPct}%` }} />
                    <div className="seg-ok" style={{ width: `${100 - overPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
