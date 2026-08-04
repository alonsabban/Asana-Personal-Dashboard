"use client";

import { useRef, useState, type ReactNode } from "react";
import TaskEditor from "@/app/components/TaskEditor";

export type TaskRowData = {
  gid: string;
  name: string;
  permalink: string | null;
  createdBy?: string | null;
};

export default function TaskRow({
  task,
  meta,
  leading,
  onChanged,
}: {
  task: TaskRowData;
  meta?: ReactNode;
  leading?: ReactNode;
  onChanged: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(task.name);
  const [savingName, setSavingName] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleNameClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setNameValue(task.name);
      setEditingName(true);
    }, 220);
  }

  function handleNameDblClick() {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    setExpanded((v) => !v);
  }

  async function saveName() {
    setEditingName(false);
    if (nameValue.trim() === task.name) return;
    setSavingName(true);
    try {
      await fetch(`/api/asana/task/${task.gid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      await onChanged();
    } finally { setSavingName(false); }
  }

  async function complete() {
    setBusy(true);
    try {
      await fetch("/api/asana/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gid: task.gid, completed: true }),
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`task ${expanded ? "expanded" : ""}`}>
      {leading}
      <button className="task-check" title="Mark complete" disabled={busy} onClick={complete}>
        ✓
      </button>
      <div className="task-main">
        <div className="task-name-btn" aria-expanded={expanded}>
          <span
            className={`caret ${expanded ? "open" : ""}`}
            aria-hidden
            style={{ cursor: "pointer" }}
            onClick={() => setExpanded((v) => !v)}
          >
            ▸
          </span>
          {editingName ? (
            <input
              className="input task-name-input"
              value={nameValue}
              autoFocus
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1 }}
            />
          ) : (
            <span
              className={`task-name${savingName ? " saving" : ""}`}
              title="Click to edit name · Double-click to expand"
              onClick={handleNameClick}
              onDoubleClick={handleNameDblClick}
              style={{ cursor: "pointer" }}
            >
              {task.name}
            </span>
          )}
        </div>
        {meta && <div className="task-meta">{meta}</div>}
        {expanded && (
          <TaskEditor gid={task.gid} permalink={task.permalink} onChanged={onChanged} />
        )}
      </div>
    </div>
  );
}
