"use client";

import { useState } from "react";
import { useAsana } from "@/app/components/AsanaProvider";

const PAT_HELP_URL =
  "https://app.asana.com/0/my-apps";

/**
 * Blocking first-run gate. Without a token the dashboard has nothing to show,
 * so this cannot be dismissed — no overlay click-through, no close button.
 * Once Asana confirms the token, the real page renders.
 */
export default function SetupGate() {
  const { refresh } = useAsana();
  const [pat, setPat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<string | null>(null);

  async function connect() {
    const token = pat.trim();
    if (!token) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asanaPat: token }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Could not save that token.");
        return;
      }

      // Greet by name so it's obvious the token resolved to the right account.
      setWelcome(json.identity?.name ?? null);
      await refresh();
    } catch {
      setError("Could not reach the server. Is the app still running?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay setup-overlay">
      <div className="modal-dialog" style={{ width: 560 }}>
        <div className="modal-head">
          <h3>Connect your Asana account</h3>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 0 }}>
            This dashboard pulls every task assigned to you in Asana into one
            place. To do that it needs a Personal Access Token — think of it as
            a key that only you hold. It is stored on this machine and never
            leaves it.
          </p>

          <ol className="setup-steps">
            <li>
              Open{" "}
              <a href={PAT_HELP_URL} target="_blank" rel="noopener noreferrer">
                Asana → My Apps
              </a>{" "}
              and create a Personal Access Token.
            </li>
            <li>Copy it — Asana only shows it once.</li>
            <li>Paste it below.</li>
          </ol>

          <label className="setup-label" htmlFor="setup-pat">
            Asana Personal Access Token
          </label>
          <input
            id="setup-pat"
            className="input"
            type="password"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            placeholder="1/1234567890:abcdef…"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving) connect();
            }}
          />

          {error && (
            <div className="banner" style={{ marginTop: 12, fontSize: 12 }}>
              {error}
            </div>
          )}

          {welcome && (
            <div className="setup-ok" style={{ marginTop: 12 }}>
              Connected as <strong>{welcome}</strong> — loading your tasks…
            </div>
          )}
        </div>

        <div className="modal-foot" style={{ justifyContent: "flex-end" }}>
          <button
            className="btn"
            onClick={connect}
            disabled={saving || !pat.trim()}
          >
            {saving ? "Checking with Asana…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
