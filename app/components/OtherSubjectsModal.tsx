"use client";

import { useState } from "react";
import type { AsanaTask } from "@/app/lib/asana";

export default function OtherSubjectsModal({
  tasks,
  availableSubjects,
  onSave,
  onClose,
}: {
  tasks: AsanaTask[];
  availableSubjects: string[];
  onSave: () => void;
  onClose: () => void;
}) {
  const [assignments, setAssignments] = useState<Record<string, string>>(
    () => Object.fromEntries(tasks.map((t) => [t.gid, "Other"]))
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const changed = tasks.filter((t) => assignments[t.gid] !== "Other");
    await Promise.all(
      changed.map((t) =>
        fetch("/api/asana/classify", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gid: t.gid, subject: assignments[t.gid] }),
        })
      )
    );
    setSaving(false);
    onSave();
    onClose();
  }

  const subjectOptions = availableSubjects.filter((s) => s !== "Other");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        style={{ width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>Tasks still in "Other"</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-faint)" }}>
            {tasks.length} task{tasks.length !== 1 ? "s" : ""} couldn't be auto-classified.
            Assign a subject below, or close to leave them as Other.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.map((t) => (
              <div
                key={t.gid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={t.name}
                  >
                    {t.name}
                  </div>
                  {t.project && t.project !== "(No project)" && (
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>
                      {t.project}
                    </div>
                  )}
                </div>
                <select
                  value={assignments[t.gid]}
                  onChange={(e) =>
                    setAssignments((prev) => ({ ...prev, [t.gid]: e.target.value }))
                  }
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: "1px solid var(--border-strong)",
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                    cursor: "pointer",
                    minWidth: 130,
                  }}
                >
                  <option value="Other">Other</option>
                  {subjectOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button className="btn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
