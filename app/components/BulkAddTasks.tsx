"use client";

import { useState, useCallback } from "react";

type Project = { gid: string; name: string; sections: Section[] };
type Section = { gid: string; name: string };
type Member = { gid: string; name: string };

type EditableTask = {
  id: string;
  name: string;
  projectGid: string | null;
  sectionGid: string | null;
  due: string | null;
  notes: string | null;
  assigneeGid: string | null;
  unclear: string[];
};

type CreateResult = { name: string; ok: boolean; error?: string };

type Step = "input" | "parsing" | "review" | "creating" | "done";

let idCounter = 0;
function nextId() {
  return String(++idCounter);
}

function matchMember(name: string | null, members: Member[]): string | null {
  if (!name || !members.length) return null;
  const lower = name.toLowerCase();
  const exact = members.find((m) => m.name.toLowerCase() === lower);
  if (exact) return exact.gid;
  const partial = members.find(
    (m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase()),
  );
  return partial?.gid ?? null;
}

export default function BulkAddTasks() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [inputText, setInputText] = useState("");
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [results, setResults] = useState<CreateResult[]>([]);

  function reset() {
    setStep("input");
    setInputText("");
    setTasks([]);
    setProjects([]);
    setMembers([]);
    setError("");
    setResults([]);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function parse() {
    if (!inputText.trim()) return;
    setError("");
    setStep("parsing");
    try {
      const res = await fetch("/api/asana/bulk-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      const json = (await res.json()) as {
        tasks?: {
          name: string;
          projectGid: string | null;
          projectName: string | null;
          sectionGid: string | null;
          sectionName: string | null;
          due: string | null;
          notes: string | null;
          assigneeName: string | null;
          unclear: string[];
        }[];
        projects?: Project[];
        members?: Member[];
        error?: string;
      };
      if (!res.ok || json.error) {
        setError(
          json.error === "no_aws"
            ? "AWS credentials required. Add them in Subject Settings."
            : (json.error ?? "Parse failed."),
        );
        setStep("input");
        return;
      }
      const fetchedMembers = json.members ?? [];
      setProjects(json.projects ?? []);
      setMembers(fetchedMembers);
      setTasks(
        (json.tasks ?? []).map((t) => ({
          id: nextId(),
          name: t.name,
          projectGid: t.projectGid,
          sectionGid: t.sectionGid,
          due: t.due,
          notes: t.notes,
          assigneeGid: matchMember(t.assigneeName, fetchedMembers),
          unclear: t.unclear ?? [],
        })),
      );
      setStep("review");
    } catch {
      setError("Network error. Please try again.");
      setStep("input");
    }
  }

  function updateTask(id: string, patch: Partial<EditableTask>) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...patch };
        // Clear unclear flags that are now resolved
        updated.unclear = updated.unclear.filter((field) => {
          if (field === "project" && updated.projectGid) return false;
          if (field === "section" && updated.sectionGid) return false;
          return true;
        });
        return updated;
      }),
    );
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function sectionsFor(projectGid: string | null): Section[] {
    if (!projectGid) return [];
    return projects.find((p) => p.gid === projectGid)?.sections ?? [];
  }

  const allResolved = tasks.length > 0 && tasks.every((t) => t.projectGid && t.name.trim());

  async function createAll() {
    setError("");
    setStep("creating");
    const out: CreateResult[] = [];
    for (const t of tasks) {
      try {
        const res = await fetch("/api/asana/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: t.name.trim(),
            due: t.due ?? null,
            projectGid: t.projectGid ?? null,
            sectionGid: t.sectionGid ?? null,
            assigneeGid: t.assigneeGid ?? null,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          out.push({ name: t.name, ok: false, error: j.error ?? `HTTP ${res.status}` });
        } else {
          out.push({ name: t.name, ok: true });
        }
      } catch {
        out.push({ name: t.name, ok: false, error: "Network error" });
      }
    }
    setResults(out);
    setStep("done");
  }

  const unclear = useCallback(
    (task: EditableTask, field: string) => task.unclear.includes(field),
    [],
  );

  const fieldStyle = (isUnclear: boolean): React.CSSProperties => ({
    border: `1.5px solid ${isUnclear ? "var(--accent, #e07b00)" : "var(--border)"}`,
    borderRadius: 4,
    padding: "3px 6px",
    fontSize: 12,
    background: "var(--bg-card)",
    color: "var(--text)",
    width: "100%",
    boxSizing: "border-box",
  });

  const succeededCount = results.filter((r) => r.ok).length;
  const failedCount = results.filter((r) => !r.ok).length;

  return (
    <>
      <button className="topbar-text-btn" onClick={() => setOpen(true)} title="Bulk add tasks">
        + Bulk Add
      </button>

      {open && (
        <div className="modal-overlay" onClick={close}>
          <div
            className="modal-dialog"
            style={{ width: 720, maxHeight: "88vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Bulk Add Tasks</h3>
              <button className="modal-close" onClick={close}>×</button>
            </div>

            <div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>
              {error && <div className="banner">{error}</div>}

              {/* ── Step: input ── */}
              {(step === "input" || step === "parsing") && (
                <div className="settings-section">
                  <h4 className="settings-section-title">Describe your tasks</h4>
                  <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>
                    Write naturally — include project names, sections, due dates, and any context.
                    The AI will extract individual tasks and ask you to clarify anything unclear.
                  </p>
                  <textarea
                    className="input"
                    rows={8}
                    style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
                    placeholder={`e.g. Add to the SDLC project:\n- Review the PRD with the team by Friday\n- Update the stakeholder doc (In Review section)\n\nAlso add "Prepare Q3 roadmap slides" to the Product Ops project, due next Monday`}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && close()}
                    disabled={step === "parsing"}
                  />
                  {step === "parsing" && (
                    <div style={{ marginTop: 10, color: "var(--text-faint)", fontSize: 13 }}>
                      Parsing tasks with AI…
                    </div>
                  )}
                </div>
              )}

              {/* ── Step: review ── */}
              {step === "review" && (
                <>
                  <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
                    Review the parsed tasks below.{" "}
                    <span style={{ color: "var(--accent, #e07b00)", fontWeight: 500 }}>
                      Highlighted fields
                    </span>{" "}
                    need your input before tasks can be created.
                  </div>

                  {tasks.map((task, idx) => {
                    const sections = sectionsFor(task.projectGid);
                    const projectUnclear = unclear(task, "project");
                    const sectionUnclear = unclear(task, "section");
                    return (
                      <div
                        key={task.id}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "10px 12px",
                          marginBottom: 8,
                          background: "var(--bg-elevated)",
                          position: "relative",
                        }}
                      >
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 8,
                        }}>
                          <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600 }}>
                            TASK {idx + 1}
                          </span>
                          <button
                            onClick={() => removeTask(task.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 16, padding: "0 2px", lineHeight: 1 }}
                            title="Remove task"
                          >
                            ×
                          </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, alignItems: "start" }}>
                          {/* Name */}
                          <div>
                            <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Task name *</label>
                            <input
                              style={fieldStyle(!task.name.trim())}
                              value={task.name}
                              onChange={(e) => updateTask(task.id, { name: e.target.value })}
                            />
                          </div>

                          {/* Project */}
                          <div>
                            <label style={{ fontSize: 11, color: projectUnclear ? "var(--accent, #e07b00)" : "var(--text-faint)", display: "block", marginBottom: 3 }}>
                              Project {projectUnclear ? "⚠ required" : "*"}
                            </label>
                            <select
                              style={fieldStyle(projectUnclear)}
                              value={task.projectGid ?? ""}
                              onChange={(e) => {
                                const gid = e.target.value || null;
                                updateTask(task.id, { projectGid: gid, sectionGid: null });
                              }}
                            >
                              <option value="">— select —</option>
                              {projects.map((p) => (
                                <option key={p.gid} value={p.gid}>{p.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Section */}
                          <div>
                            <label style={{ fontSize: 11, color: sectionUnclear ? "var(--accent, #e07b00)" : "var(--text-faint)", display: "block", marginBottom: 3 }}>
                              Section {sectionUnclear ? "⚠" : ""}
                            </label>
                            <select
                              style={fieldStyle(sectionUnclear)}
                              value={task.sectionGid ?? ""}
                              onChange={(e) => updateTask(task.id, { sectionGid: e.target.value || null })}
                              disabled={!task.projectGid}
                            >
                              <option value="">— none —</option>
                              {sections.map((s) => (
                                <option key={s.gid} value={s.gid}>{s.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Due date */}
                          <div>
                            <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Due date</label>
                            <input
                              type="date"
                              style={fieldStyle(false)}
                              value={task.due ?? ""}
                              onChange={(e) => updateTask(task.id, { due: e.target.value || null })}
                            />
                          </div>

                          {/* Assignee */}
                          <div>
                            <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Assignee</label>
                            <select
                              style={fieldStyle(false)}
                              value={task.assigneeGid ?? "me"}
                              onChange={(e) => updateTask(task.id, { assigneeGid: e.target.value === "me" ? null : e.target.value })}
                            >
                              <option value="me">Me</option>
                              {members.map((m) => (
                                <option key={m.gid} value={m.gid}>{m.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Notes */}
                        {task.notes !== null && (
                          <div style={{ marginTop: 8 }}>
                            <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Notes</label>
                            <textarea
                              style={{ ...fieldStyle(false), resize: "vertical", minHeight: 56 }}
                              value={task.notes ?? ""}
                              onChange={(e) => updateTask(task.id, { notes: e.target.value || null })}
                              rows={3}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {tasks.length === 0 && (
                    <div style={{ color: "var(--text-faint)", fontSize: 13 }}>
                      No tasks were parsed. Go back and try rephrasing your input.
                    </div>
                  )}

                  {!allResolved && tasks.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--accent, #e07b00)", marginTop: 4 }}>
                      Assign a project to all tasks before creating.
                    </div>
                  )}
                </>
              )}

              {/* ── Step: creating ── */}
              {step === "creating" && (
                <div style={{ padding: "8px 0", fontSize: 13, color: "var(--text-faint)" }}>
                  Creating tasks in Asana…
                </div>
              )}

              {/* ── Step: done ── */}
              {step === "done" && (
                <div className="settings-section">
                  {succeededCount > 0 && (
                    <div className="setup-ok" style={{ marginBottom: 8 }}>
                      {succeededCount} task{succeededCount !== 1 ? "s" : ""} created successfully.
                    </div>
                  )}
                  {failedCount > 0 && (
                    <>
                      <div className="banner" style={{ marginBottom: 8 }}>
                        {failedCount} task{failedCount !== 1 ? "s" : ""} failed to create.
                      </div>
                      {results.filter((r) => !r.ok).map((r, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>
                          • {r.name}: {r.error}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="modal-foot">
              {step === "done" ? (
                <>
                  <button className="btn ghost" onClick={reset}>Add More</button>
                  <button className="btn" onClick={close}>Close</button>
                </>
              ) : step === "review" ? (
                <>
                  <button className="btn ghost" onClick={reset}>Back</button>
                  <button
                    className="btn"
                    onClick={createAll}
                    disabled={!allResolved}
                    title={!allResolved ? "Assign a project to all tasks first" : undefined}
                  >
                    Create {tasks.length} Task{tasks.length !== 1 ? "s" : ""}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn ghost" onClick={close} disabled={step === "parsing"}>Cancel</button>
                  <button className="btn" onClick={parse} disabled={!inputText.trim() || step === "parsing"}>
                    {step === "parsing" ? "Parsing…" : "Parse Tasks"}
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
