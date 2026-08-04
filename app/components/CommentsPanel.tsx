"use client";

import { useCallback, useEffect, useState } from "react";
import MentionTextarea from "@/app/components/MentionTextarea";

type Comment  = { gid: string; text: string; author: string; createdAt: string };
type Subtask  = { gid: string; name: string; completed: boolean; due: string | null };

export default function CommentsPanel({ gid }: { gid: string }) {
  /* ── comments ── */
  const [comments, setComments]     = useState<Comment[]>([]);
  const [loadingC, setLoadingC]     = useState(true);
  const [text, setText]             = useState("");
  const [posting, setPosting]       = useState(false);
  const [commentErr, setCommentErr] = useState<string | null>(null);

  /* ── subtasks ── */
  const [subtasks, setSubtasks]     = useState<Subtask[]>([]);
  const [loadingS, setLoadingS]     = useState(true);
  const [newSub, setNewSub]         = useState("");
  const [addingSub, setAddingSub]   = useState(false);

  /* ── loaders ── */
  const loadComments = useCallback(async () => {
    setLoadingC(true);
    try {
      const r = await fetch(`/api/asana/task/${gid}`, { cache: "no-store" });
      const j = await r.json();
      setComments(j.comments ?? []);
    } catch {
      setCommentErr("Could not load comments");
    } finally {
      setLoadingC(false);
    }
  }, [gid]);

  const loadSubtasks = useCallback(async () => {
    setLoadingS(true);
    try {
      const r = await fetch(`/api/asana/task/${gid}/subtasks`, { cache: "no-store" });
      const j = await r.json();
      setSubtasks(j.subtasks ?? []);
    } catch { /* silently ignore */ }
    finally { setLoadingS(false); }
  }, [gid]);

  useEffect(() => { loadComments(); loadSubtasks(); }, [loadComments, loadSubtasks]);

  /* ── actions ── */
  async function postComment(plainText?: string, htmlText?: string | null) {
    const trimmed = (plainText ?? text).trim();
    if (!trimmed) return;
    setPosting(true);
    setCommentErr(null);
    try {
      const r = await fetch(`/api/asana/task/${gid}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, htmlText: htmlText ?? null }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setText("");
      await loadComments();
    } catch (e) {
      setCommentErr(e instanceof Error ? e.message : "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  async function addSubtask() {
    const name = newSub.trim();
    if (!name) return;
    setAddingSub(true);
    try {
      await fetch(`/api/asana/task/${gid}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setNewSub("");
      await loadSubtasks();
    } finally {
      setAddingSub(false);
    }
  }

  async function toggleSubtask(subGid: string, completed: boolean) {
    try {
      await fetch("/api/asana/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gid: subGid, completed }),
      });
      await loadSubtasks();
    } catch { /* ignore */ }
  }

  /* ── render ── */
  return (
    <div className="comments-panel">

      {/* ── Subtasks ── */}
      <div className="expand-section">
        <div className="expand-section-title">
          Subtasks {!loadingS && subtasks.length > 0 && `(${subtasks.length})`}
        </div>

        {loadingS ? (
          <div className="spin" style={{ fontSize: 12, padding: "6px 0" }}>Loading…</div>
        ) : (
          <div className="subtask-list">
            {subtasks.map((s) => (
              <div key={s.gid} className={`subtask-row${s.completed ? " subtask-done" : ""}`}>
                <button
                  className="task-check subtask-check"
                  title={s.completed ? "Mark incomplete" : "Mark complete"}
                  onClick={() => toggleSubtask(s.gid, !s.completed)}
                >
                  {s.completed ? "✓" : ""}
                </button>
                <span className="subtask-name">{s.name}</span>
                {s.due && <span className="pill subtask-due">{s.due}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="addrow" style={{ marginTop: 6 }}>
          <input
            className="input"
            placeholder="Add a subtask…"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubtask()}
          />
          <button
            className="btn ghost"
            onClick={addSubtask}
            disabled={addingSub || !newSub.trim()}
          >
            {addingSub ? "…" : "Add"}
          </button>
        </div>
      </div>

      {/* ── Comments ── */}
      <div className="expand-section">
        <div className="expand-section-title">
          Comments {!loadingC && comments.length > 0 && `(${comments.length})`}
        </div>

        {commentErr && (
          <div className="banner" style={{ marginBottom: 8 }}>{commentErr}</div>
        )}

        {loadingC ? (
          <div className="spin" style={{ fontSize: 12, padding: "6px 0" }}>Loading…</div>
        ) : comments.length === 0 ? (
          <div className="empty" style={{ fontSize: 12, padding: "4px 0 6px" }}>No comments yet.</div>
        ) : (
          <div className="comments">
            {comments.map((c) => (
              <div className="comment" key={c.gid}>
                <div className="comment-head">
                  <strong>{c.author}</strong>
                  <span className="host">
                    {new Date(c.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="comment-body">{c.text}</div>
              </div>
            ))}
          </div>
        )}

        <div className="addrow addrow-col" style={{ marginTop: 8 }}>
          <MentionTextarea
            value={text}
            onChange={setText}
            onSubmit={(plain, html) => { postComment(plain, html); setText(""); }}
            placeholder="Write a comment… (@name to mention)"
            rows={2}
            className="input"
            style={{ width: "100%", fontSize: 13, fontFamily: "inherit" }}
          />
          <button className="btn" onClick={() => postComment()} disabled={posting || !text.trim()}>
            {posting ? "…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
