"use client";

import { useState } from "react";

type RawTask = {
  gid: string;
  name: string;
  project: string;
  subject: string | null;
  notes: string | null;
  subtasks: { name: string; completed: boolean }[];
  completedAt: string | null;
  completed: boolean;
  status: string | null;
};

type Step = "config" | "loading-tasks" | "filter" | "generating" | "result";

export default function AccomplishmentsReport() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("config");
  const [days, setDays] = useState(14);
  const [tasks, setTasks] = useState<RawTask[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [summary, setSummary] = useState("");
  const [reportDays, setReportDays] = useState(14);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function reset() {
    setStep("config");
    setTasks([]);
    setStatusOptions([]);
    setSubjects([]);
    setSelectedStatuses(new Set());
    setIncludeCompleted(true);
    setSummary("");
    setError("");
    setCopied(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function loadTasks() {
    setError("");
    setStep("loading-tasks");
    try {
      const res = await fetch(`/api/asana/accomplishments?days=${days}`);
      const json = (await res.json()) as {
        tasks?: RawTask[];
        statusOptions?: string[];
        subjects?: string[];
        error?: string;
      };
      if (!res.ok || json.error) {
        setError(json.error ?? "Failed to load tasks.");
        setStep("config");
        return;
      }
      const fetched = json.tasks ?? [];
      const opts = json.statusOptions ?? [];
      setTasks(fetched);
      setStatusOptions(opts);
      setSubjects(json.subjects ?? []);
      setSelectedStatuses(new Set(opts));
      setStep("filter");
    } catch {
      setError("Network error. Please try again.");
      setStep("config");
    }
  }

  function filteredTasks(): RawTask[] {
    return tasks.filter((t) => {
      if (t.completed && includeCompleted) return true;
      if (!t.completed && t.status && selectedStatuses.has(t.status)) return true;
      return false;
    });
  }

  async function generateReport() {
    const selected = filteredTasks();
    if (!selected.length) {
      setError("No tasks match the current filters.");
      return;
    }
    setError("");
    setStep("generating");
    try {
      const res = await fetch("/api/asana/accomplishments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjects,
          tasks: selected.map((t) => ({
            name: t.name,
            project: t.project,
            subject: t.subject,
            notes: t.notes,
            subtasks: t.subtasks,
            completedAt: t.completedAt,
            status: t.status,
          })),
        }),
      });
      const json = (await res.json()) as { summary?: string; error?: string };
      if (!res.ok || json.error) {
        const msg =
          json.error === "no_aws"
            ? "AWS credentials required. Add them in Subject Settings."
            : (json.error ?? "Failed to generate summary.");
        setError(msg);
        setStep("filter");
        return;
      }
      setSummary(json.summary ?? "");
      setReportDays(days);
      setStep("result");
    } catch {
      setError("Network error. Please try again.");
      setStep("filter");
    }
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(`Period: ${formatDateRange(reportDays)}\n\n${summary}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  async function copyAll() {
    const all = filteredTasks();
    const groupOrder = subjects.length > 0 ? subjects : [];
    const grouped: Record<string, RawTask[]> = {};
    for (const t of all) {
      const key = t.subject ?? t.project;
      (grouped[key] ??= []).push(t);
    }
    const orderedKeys = [
      ...groupOrder.filter((s) => grouped[s]),
      ...Object.keys(grouped).filter((k) => !groupOrder.includes(k)).sort(),
    ];
    const taskSection = orderedKeys.map((group) =>
      `${group}\n` +
      grouped[group].map((t) =>
        `  • ${t.name}${t.completedAt ? ` — completed ${t.completedAt.slice(0, 10)}` : t.status ? ` — ${t.status}` : ""}`
      ).join("\n")
    ).join("\n\n");
    const full = `Period: ${formatDateRange(reportDays)}\n\n${summary}\n\n---\nTask list:\n${taskSection}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  function toggleStatus(s: string) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function formatDateRange(numDays: number): string {
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const to = new Date();
    const from = new Date(to.getTime() - numDays * 86_400_000);
    return `${fmt(from)} – ${fmt(to)}`;
  }

  const matchCount = filteredTasks().length;
  const isLoading = step === "loading-tasks" || step === "generating";

  return (
    <>
      <button className="topbar-text-btn" onClick={() => setOpen(true)} title="Generate accomplishments report">
        Report
      </button>

      {open && (
        <div className="modal-overlay" onClick={close}>
          <div
            className="modal-dialog"
            style={{ width: 720, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Accomplishments Report</h3>
              <button className="modal-close" onClick={close}>×</button>
            </div>

            <div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>
              {error && <div className="banner">{error}</div>}

              {/* Config step */}
              {(step === "config" || step === "loading-tasks") && (
                <div className="settings-section">
                  <h4 className="settings-section-title">Time range</h4>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[
                      { label: "1 week", value: 7 },
                      { label: "2 weeks", value: 14 },
                      { label: "1 month", value: 30 },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        className={`btn${days === opt.value ? "" : " ghost"}`}
                        style={{ minWidth: 80 }}
                        onClick={() => setDays(opt.value)}
                        disabled={isLoading}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter step */}
              {(step === "filter" || step === "generating") && (
                <>
                  <div className="settings-section">
                    <h4 className="settings-section-title">Include tasks</h4>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={includeCompleted}
                        onChange={(e) => setIncludeCompleted(e.target.checked)}
                        disabled={step === "generating"}
                      />
                      Formally completed in Asana
                    </label>
                    {statusOptions.map((s) => (
                      <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedStatuses.has(s)}
                          onChange={() => toggleStatus(s)}
                          disabled={step === "generating"}
                        />
                        Status: {s}
                      </label>
                    ))}
                  </div>

                  <div style={{ marginBottom: 12, color: "var(--text-faint)", fontSize: 13 }}>
                    {matchCount} task{matchCount !== 1 ? "s" : ""} match your filters
                  </div>

                  {matchCount > 0 && (
                    <div
                      style={{
                        maxHeight: 180,
                        overflowY: "auto",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "6px 10px",
                        marginBottom: 4,
                        fontSize: 13,
                      }}
                    >
                      {filteredTasks().map((t) => (
                        <div
                          key={t.gid}
                          style={{
                            padding: "4px 0",
                            borderBottom: "1px solid var(--border)",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.name}
                          </span>
                          <span style={{ color: "var(--text-faint)", flexShrink: 0, fontSize: 12 }}>
                            {t.project}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Result step */}
              {step === "result" && (
                <>
                  <div className="settings-section">
                    <h4 className="settings-section-title">Executive Summary</h4>
                    <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>
                      Period: {formatDateRange(reportDays)}
                    </div>
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                        fontSize: 14,
                        padding: "10px 12px",
                        background: "var(--bg-elevated)",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        marginBottom: 8,
                      }}
                    >
                      {summary}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn ghost" style={{ fontSize: 12 }} onClick={copySummary}>
                        {copied ? "Copied!" : "Copy Summary"}
                      </button>
                      <button className="btn ghost" style={{ fontSize: 12 }} onClick={copyAll}>
                        Copy Summary + Task List
                      </button>
                    </div>
                  </div>

                  <div className="settings-section">
                    <h4 className="settings-section-title">Task list ({matchCount})</h4>
                    <div style={{ maxHeight: 260, overflowY: "auto", fontSize: 13 }}>
                      {(() => {
                        const all = filteredTasks();
                        // Build ordered groups: configured subjects first, then any leftover by project
                        const groupOrder = subjects.length > 0 ? subjects : [];
                        const grouped: Record<string, RawTask[]> = {};
                        for (const t of all) {
                          const key = t.subject ?? t.project;
                          (grouped[key] ??= []).push(t);
                        }
                        // Keys in subject order, then remainder alphabetically
                        const orderedKeys = [
                          ...groupOrder.filter((s) => grouped[s]),
                          ...Object.keys(grouped).filter((k) => !groupOrder.includes(k)).sort(),
                        ];
                        return orderedKeys.map((group) => (
                          <div key={group} style={{ marginBottom: 8 }}>
                            <div style={{
                              fontWeight: 600,
                              fontSize: 11,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              color: "var(--text-faint)",
                              padding: "6px 0 3px",
                              borderBottom: "1px solid var(--border)",
                              marginBottom: 2,
                            }}>
                              {group}
                            </div>
                            {grouped[group].map((t) => (
                              <div
                                key={t.gid}
                                style={{
                                  padding: "4px 0 4px 8px",
                                  borderBottom: "1px solid var(--border)",
                                  display: "grid",
                                  gridTemplateColumns: "1fr auto",
                                  gap: 8,
                                }}
                              >
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {t.name}
                                </span>
                                <span style={{ color: "var(--text-faint)", fontSize: 12, whiteSpace: "nowrap" }}>
                                  {t.completed && t.completedAt
                                    ? t.completedAt.slice(0, 10)
                                    : t.status ?? ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </>
              )}

              {/* Loading spinners */}
              {step === "loading-tasks" && (
                <div style={{ textAlign: "center", padding: "12px 0", color: "var(--text-faint)", fontSize: 13 }}>
                  Fetching tasks from Asana…
                </div>
              )}
              {step === "generating" && (
                <div style={{ textAlign: "center", padding: "12px 0", color: "var(--text-faint)", fontSize: 13 }}>
                  Generating report with AI…
                </div>
              )}
            </div>

            <div className="modal-foot">
              {step === "result" ? (
                <>
                  <button className="btn ghost" onClick={reset}>Start Over</button>
                  <button className="btn" onClick={close}>Close</button>
                </>
              ) : step === "filter" || step === "generating" ? (
                <>
                  <button className="btn ghost" onClick={reset} disabled={step === "generating"}>Back</button>
                  <button className="btn" onClick={generateReport} disabled={step === "generating" || matchCount === 0}>
                    {step === "generating" ? "Generating…" : "Generate Report"}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn ghost" onClick={close} disabled={isLoading}>Cancel</button>
                  <button className="btn" onClick={loadTasks} disabled={isLoading}>
                    {step === "loading-tasks" ? "Loading…" : "Load Tasks"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
