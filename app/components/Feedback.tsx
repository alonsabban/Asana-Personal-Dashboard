"use client";

import { useState } from "react";

const FEEDBACK_TO = "asabban@paloaltonetworks.com";

export default function Feedback() {
  const [open, setOpen]       = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");

  function close() {
    setOpen(false);
    setSubject("");
    setBody("");
  }

  function send() {
    const s = encodeURIComponent(subject.trim() || "Dashboard Feedback");
    const b = encodeURIComponent(body.trim());
    window.open(
      `https://mail.google.com/mail/?view=cm&to=${FEEDBACK_TO}&su=${s}&body=${b}`,
      "_blank",
    );
    close();
  }

  return (
    <>
      <button className="topbar-text-btn" onClick={() => setOpen(true)}>
        Feedback
      </button>

      {open && (
        <div className="modal-overlay" onClick={close}>
          <div
            className="modal-dialog"
            style={{ width: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Send Feedback</h3>
              <button className="modal-close" onClick={close}>×</button>
            </div>

            <div className="modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-faint)" }}>
                  Subject <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  className="input"
                  placeholder="e.g. Bug report, Feature request…"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && close()}
                  autoFocus
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-faint)" }}>
                  Message
                </label>
                <textarea
                  className="input"
                  placeholder="Describe the issue or idea…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && close()}
                  rows={5}
                  style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
                />
              </div>

              <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
                Opens Gmail compose addressed to{" "}
                <span style={{ color: "var(--text-dim)" }}>{FEEDBACK_TO}</span>.
              </p>
            </div>

            <div className="modal-foot">
              <button className="btn ghost" onClick={close}>Cancel</button>
              <button className="btn" onClick={send} disabled={!body.trim()}>
                Open in Gmail
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
