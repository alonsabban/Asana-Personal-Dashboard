"use client";

import { useState } from "react";

const FEEDBACK_EMAIL = "asabban@paloaltonetworks.com";

export default function Feedback() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyEmail() {
    navigator.clipboard.writeText(FEEDBACK_EMAIL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="feedback-wrap">
      <button className="topbar-text-btn" onClick={() => setOpen((v) => !v)}>
        Feedback
      </button>

      {open && (
        <>
          <div className="feedback-backdrop" onClick={() => setOpen(false)} />
          <div className="feedback-popover">
            <p>
              Contact{" "}
              <button className="feedback-email-btn" onClick={copyEmail} title="Click to copy email">
                Alon Sabban
              </button>
              {" "}for any feedback or issue.
            </p>
            {copied && <span className="feedback-copied">Copied!</span>}
          </div>
        </>
      )}
    </div>
  );
}
