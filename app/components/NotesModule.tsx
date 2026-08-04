"use client";

import { useEffect, useState } from "react";

type Note = { id: string; text: string; done: boolean };

const KEY = "pd.notes";

export default function NotesModule() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setNotes(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(notes));
  }, [notes, ready]);

  function add() {
    const t = text.trim();
    if (!t) return;
    setNotes((n) => [{ id: crypto.randomUUID(), text: t, done: false }, ...n]);
    setText("");
  }

  function toggle(id: string) {
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }

  function remove(id: string) {
    setNotes((n) => n.filter((x) => x.id !== id));
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Quick notes</h2>
        <span className="sub">local to this browser</span>
      </div>
      <div className="card-body">
        {notes.length === 0 && <div className="empty">No notes yet.</div>}
        {notes.map((n) => (
          <div className="note-item" key={n.id}>
            <button
              className="task-check"
              onClick={() => toggle(n.id)}
              style={{ borderColor: n.done ? "var(--success)" : undefined, color: n.done ? "var(--success)" : "transparent" }}
              title="Toggle"
            >
              ✓
            </button>
            <span
              style={{
                flex: 1,
                textDecoration: n.done ? "line-through" : "none",
                color: n.done ? "var(--text-faint)" : "var(--text)",
              }}
            >
              {n.text}
            </span>
            <button className="icon-btn" onClick={() => remove(n.id)} title="Delete">
              ×
            </button>
          </div>
        ))}
        <div className="addrow">
          <input
            className="input"
            placeholder="Jot something down…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn ghost" onClick={add}>
            Add
          </button>
        </div>
      </div>
    </section>
  );
}
