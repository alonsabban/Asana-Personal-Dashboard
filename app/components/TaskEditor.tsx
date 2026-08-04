"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskDetail, Subtask } from "@/app/lib/asana";

type UserHit = { gid: string; name: string; email: string | null };

export default function TaskEditor({
  gid,
  permalink,
  onChanged,
}: {
  gid: string;
  permalink?: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [cfValues, setCfValues] = useState<Record<string, string>>({});

  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtasksLoaded, setSubtasksLoaded] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);

  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [showHits, setShowHits] = useState(false);
  const [comment, setComment] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDetail = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/asana/task/${gid}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load task");
      const d = json as TaskDetail;
      setDetail(d);
      setNotes(d.notes);
      setDue(d.due ?? "");
      const initial: Record<string, string> = {};
      for (const cf of d.customFields) {
        initial[cf.gid] = cf.enumValue?.gid ?? "";
      }
      setCfValues(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [gid]);

  const loadSubtasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/asana/task/${gid}/subtasks`, { cache: "no-store" });
      const json = await res.json();
      setSubtasks(json.subtasks ?? []);
    } catch {
      // silently ignore — subtasks are optional
    } finally {
      setSubtasksLoaded(true);
    }
  }, [gid]);

  useEffect(() => {
    loadDetail();
    loadSubtasks();
  }, [loadDetail, loadSubtasks]);

  const flash = (key: string) => {
    setSavedFlash(key);
    setTimeout(() => setSavedFlash((c) => (c === key ? null : c)), 1500);
  };

  async function patch(fields: Record<string, unknown>, key: string) {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch(`/api/asana/task/${gid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadDetail();
      await onChanged();
      flash(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  function onAssigneeInput(v: string) {
    setAssigneeQuery(v);
    setShowHits(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/asana/users?q=${encodeURIComponent(v)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        setHits(json.users ?? []);
      } catch {
        setHits([]);
      }
    }, 250);
  }

  async function setAssignee(value: string | null, label: string) {
    setShowHits(false);
    setAssigneeQuery("");
    await patch({ assignee: value }, "assignee");
    void label;
  }

  async function addComment() {
    const text = comment.trim();
    if (!text) return;
    setSaving("comment");
    setError(null);
    try {
      const res = await fetch(`/api/asana/task/${gid}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setComment("");
      await loadDetail();
      flash("comment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comment failed");
    } finally {
      setSaving(null);
    }
  }

  async function addSubtask() {
    const name = newSubtask.trim();
    if (!name) return;
    setAddingSubtask(true);
    setError(null);
    try {
      const res = await fetch(`/api/asana/task/${gid}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewSubtask("");
      await loadSubtasks();
      flash("subtask");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add subtask");
    } finally {
      setAddingSubtask(false);
    }
  }

  async function completeSubtask(subtaskGid: string, completed: boolean) {
    try {
      await fetch("/api/asana/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gid: subtaskGid, completed }),
      });
      await loadSubtasks();
    } catch {
      // ignore
    }
  }

  if (!detail && !error) return <div className="editor spin">Loading task…</div>;

  const asanaUrl = permalink ?? detail?.permalink ?? null;

  return (
    <div className="editor">
      {error && <div className="banner">{error}</div>}

      {asanaUrl && (
        <div className="editor-head">
          <a
            className="asana-link"
            href={asanaUrl}
            target="_blank"
            rel="noreferrer"
            title="Open this task in Asana"
          >
            Open in Asana ↗
          </a>
        </div>
      )}

      <div className="field-grid">
        <div className="field">
          <label className="field-label">Due date</label>
          <div className="field-row">
            <input
              type="date"
              className="input"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
            <button
              className="btn ghost"
              disabled={saving === "due" || due === (detail?.due ?? "")}
              onClick={() => patch({ due: due || null }, "due")}
            >
              {saving === "due" ? "…" : savedFlash === "due" ? "Saved" : "Save"}
            </button>
          </div>
          {detail?.due && (
            <button className="btn ghost" style={{ marginTop: "4px" }} onClick={() => { setDue(""); patch({ due: null }, "due"); }}>
              Clear sched.
            </button>
          )}
        </div>

        <div className="field">
          <label className="field-label">Assignee</label>
          <div className="assignee-current">
            <span>{detail?.assignee ? detail.assignee.name : "Unassigned"}</span>
            <button className="btn ghost" onClick={() => setAssignee("me", "me")} disabled={saving === "assignee"}>
              Assign to me
            </button>
            {detail?.assignee && (
              <button className="btn ghost" onClick={() => setAssignee(null, "none")} disabled={saving === "assignee"}>
                Unassign
              </button>
            )}
          </div>
          <div className="assignee-search">
            <input
              className="input"
              placeholder="Search people to assign…"
              value={assigneeQuery}
              onChange={(e) => onAssigneeInput(e.target.value)}
              onFocus={() => assigneeQuery && setShowHits(true)}
            />
            {showHits && hits.length > 0 && (
              <div className="hits">
                {hits.map((u) => (
                  <button
                    key={u.gid}
                    className="hit"
                    onClick={() => setAssignee(u.gid, u.name)}
                  >
                    <span>{u.name}</span>
                    {u.email && <span className="host">{u.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {detail && detail.customFields.filter(
        (cf) => !["priority", "stage"].includes(cf.name.toLowerCase())
      ).length > 0 && (
        <div className="field-grid">
          {detail.customFields
            .filter((cf) => !["priority", "stage"].includes(cf.name.toLowerCase()))
            .map((cf) => (
            <div className="field" key={cf.gid}>
              <label className="field-label">{cf.name}</label>
              <select
                className="input"
                value={cfValues[cf.gid] ?? ""}
                disabled={saving === `cf-${cf.gid}`}
                onChange={async (e) => {
                  const val = e.target.value;
                  setCfValues((prev) => ({ ...prev, [cf.gid]: val }));
                  await patch({ customFields: { [cf.gid]: val || null } }, `cf-${cf.gid}`);
                }}
              >
                <option value="">— unset —</option>
                {cf.enumOptions.map((opt) => (
                  <option key={opt.gid} value={opt.gid}>
                    {opt.name}
                  </option>
                ))}
              </select>
              {savedFlash === `cf-${cf.gid}` && (
                <span className="field-saved">Saved</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="field">
        <label className="field-label">
          Subtasks {subtasksLoaded && subtasks.length > 0 && `(${subtasks.length})`}
        </label>
        <div className="subtask-list">
          {!subtasksLoaded && <div className="empty" style={{ padding: "6px 0", fontSize: 12 }}>Loading…</div>}
          {subtasksLoaded && subtasks.length === 0 && (
            <div className="empty" style={{ padding: "4px 0", fontSize: 12 }}>No subtasks yet.</div>
          )}
          {subtasks.map((s) => (
            <div key={s.gid} className={`subtask-row ${s.completed ? "subtask-done" : ""}`}>
              <button
                className="task-check subtask-check"
                title={s.completed ? "Mark incomplete" : "Mark complete"}
                onClick={() => completeSubtask(s.gid, !s.completed)}
              >
                {s.completed ? "✓" : ""}
              </button>
              <span className="subtask-name">{s.name}</span>
              {s.due && <span className="pill subtask-due">{s.due}</span>}
              {s.assignee && <span className="subtask-assignee">{s.assignee}</span>}
            </div>
          ))}
        </div>
        <div className="addrow" style={{ marginTop: 6 }}>
          <input
            className="input"
            placeholder="Add a subtask…"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubtask()}
          />
          <button
            className="btn ghost"
            onClick={addSubtask}
            disabled={addingSubtask || !newSubtask.trim()}
          >
            {addingSubtask ? "…" : savedFlash === "subtask" ? "Added" : "Add"}
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Description</label>
        <textarea
          className="input textarea"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a description…"
        />
        <div className="field-row">
          <button
            className="btn"
            disabled={saving === "notes" || notes === (detail?.notes ?? "")}
            onClick={() => patch({ notes }, "notes")}
          >
            {saving === "notes" ? "Saving…" : savedFlash === "notes" ? "Saved" : "Save description"}
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field-label">
          Comments {detail && detail.comments.length > 0 && `(${detail.comments.length})`}
        </label>
        <div className="comments">
          {detail?.comments.length === 0 && (
            <div className="empty" style={{ padding: "8px 0" }}>No comments yet.</div>
          )}
          {detail?.comments.map((c) => (
            <div className="comment" key={c.gid}>
              <div className="comment-head">
                <strong>{c.author}</strong>
                <span className="host">
                  {new Date(c.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="comment-body">{c.text}</div>
            </div>
          ))}
        </div>
        <div className="addrow">
          <input
            className="input"
            placeholder="Write a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()}
          />
          <button className="btn" onClick={addComment} disabled={saving === "comment"}>
            {saving === "comment" ? "…" : savedFlash === "comment" ? "Added" : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
