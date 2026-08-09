"use client";

import { useEffect, useRef, useState } from "react";

export default function VoiceSetupModal({ onClose }: { onClose: () => void }) {
  const [apiUrl, setApiUrl] = useState("");
  const [mobileUrl, setMobileUrl] = useState("");
  const [userToken, setUserToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const apiInputRef = useRef<HTMLInputElement>(null);

  // Load existing settings on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        const vb = j.voiceBroker;
        if (vb?.apiUrl)    setApiUrl(vb.apiUrl);
        if (vb?.mobileUrl) setMobileUrl(vb.mobileUrl);
        if (vb?.userToken) {
          setUserToken(vb.userToken);
        } else {
          // Generate a new token for this user on first open
          setUserToken(crypto.randomUUID());
        }
      })
      .catch(() => {
        setUserToken(crypto.randomUUID());
      });
    apiInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    const trimmedApi = apiUrl.trim();
    const trimmedMobile = mobileUrl.trim();
    if (!trimmedApi) { setError("API URL is required."); return; }
    if (!trimmedApi.startsWith("https://")) { setError("API URL must start with https://"); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceBroker: {
            apiUrl: trimmedApi,
            userToken,
            ...(trimmedMobile ? { mobileUrl: trimmedMobile } : {}),
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const voicePageUrl = mobileUrl && userToken
    ? `${mobileUrl.replace(/\/$/, "")}?token=${userToken}`
    : null;

  async function copyLink() {
    if (!voicePageUrl) return;
    await navigator.clipboard.writeText(voicePageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Voice setup">
        <div className="modal-head">
          <h3>🎤 Voice Setup</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 16, lineHeight: 1.5 }}>
            Deploy the voice broker to AWS (see <code style={{ fontSize: 11 }}>voice-broker/deploy.sh</code>),
            then paste the URLs from the deploy output below.
          </p>

          {error && <div className="banner" style={{ marginBottom: 12 }}>{error}</div>}
          {saved && <div className="banner" style={{ marginBottom: 12, borderColor: "var(--success)", color: "var(--success)" }}>Saved ✓</div>}

          <div className="field">
            <label className="field-label">Broker API URL</label>
            <input
              ref={apiInputRef}
              className="input"
              placeholder="https://abc123.execute-api.us-east-1.amazonaws.com"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label">Mobile page URL (CloudFront)</label>
            <input
              className="input"
              placeholder="https://d1234abcd.cloudfront.net"
              value={mobileUrl}
              onChange={(e) => setMobileUrl(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label">Your token</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="input"
                value={userToken}
                readOnly
                style={{ flex: 1, fontFamily: "monospace", fontSize: 12, color: "var(--text-faint)" }}
              />
              <button
                className="btn ghost"
                style={{ whiteSpace: "nowrap", fontSize: 12 }}
                onClick={() => { navigator.clipboard.writeText(userToken); }}
                title="Copy token"
              >
                Copy
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
              Auto-generated. Each person gets their own token — tasks route to their Asana only.
            </p>
          </div>

          {voicePageUrl && (
            <div className="field">
              <label className="field-label">Your voice page link</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="input"
                  value={voicePageUrl}
                  readOnly
                  style={{ flex: 1, fontSize: 11, fontFamily: "monospace", color: "var(--accent)" }}
                />
                <button
                  className="btn ghost"
                  style={{ whiteSpace: "nowrap", fontSize: 12 }}
                  onClick={copyLink}
                  title="Copy link"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                Open this URL on your phone to add tasks by voice. Bookmark it.
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose} disabled={saving}>Close</button>
          <button className="btn" onClick={save} disabled={saving || !apiUrl.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
