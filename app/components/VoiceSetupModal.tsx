"use client";

import { useEffect, useState } from "react";

const ADMIN_EMAIL = "asabban@paloaltonetworks.com";

export default function VoiceSetupModal({ onClose }: { onClose: () => void }) {
  const [apiUrl, setApiUrl] = useState("");
  const [mobileUrl, setMobileUrl] = useState("");
  const [userToken, setUserToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        const vb = j.voiceBroker;
        if (vb?.apiUrl)    setApiUrl(vb.apiUrl);
        if (vb?.mobileUrl) setMobileUrl(vb.mobileUrl);
        setUserToken(vb?.userToken || crypto.randomUUID());
      })
      .catch(() => setUserToken(crypto.randomUUID()));
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
    if (!trimmedApi) { setError("Broker API URL is required."); return; }
    if (!trimmedApi.startsWith("https://")) { setError("Broker API URL must start with https://"); return; }

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

          {error && <div className="banner" style={{ marginBottom: 12 }}>{error}</div>}
          {saved && <div className="banner" style={{ marginBottom: 12, borderColor: "var(--success)", color: "var(--success)" }}>Saved ✓</div>}

          {/* Mobile link — main action */}
          <div style={{
            background: voicePageUrl ? "rgba(0,196,255,0.06)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${voicePageUrl ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 10,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 20,
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: voicePageUrl ? "var(--accent)" : "var(--text-faint)", margin: 0 }}>
              📱 Your personal voice link
            </p>
            {voicePageUrl ? (
              <>
                <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0 }}>
                  Open this on your phone to add tasks by voice. Keep it private — it routes directly to your Asana.
                </p>
                <p style={{ fontSize: 13, wordBreak: "break-all", color: "var(--text)", margin: 0, lineHeight: 1.6 }}>
                  {voicePageUrl}
                </p>
                <button className="btn" style={{ alignSelf: "flex-start", fontSize: 13 }} onClick={copyLink}>
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
              </>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-faint)", margin: 0, lineHeight: 1.6 }}>
                Fill in the two fields below to get your link. Don't have the values?{" "}
                <a href={`mailto:${ADMIN_EMAIL}`} style={{ color: "var(--accent)" }}>Ask Alon Sabban</a>.
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Broker API URL</label>
              <input
                className="input"
                placeholder={`Ask ${ADMIN_EMAIL} for this value`}
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Mobile page URL</label>
              <input
                className="input"
                placeholder={`Ask ${ADMIN_EMAIL} for this value`}
                value={mobileUrl}
                onChange={(e) => setMobileUrl(e.target.value)}
              />
            </div>

            {/* Token — auto-generated, read-only */}
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label" style={{ opacity: 0.5 }}>Your token — auto-generated, nothing to do here</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="input"
                  value={userToken}
                  readOnly
                  style={{ flex: 1, fontFamily: "monospace", fontSize: 12, opacity: 0.4, cursor: "default" }}
                />
                <button
                  className="btn ghost"
                  style={{ whiteSpace: "nowrap", fontSize: 12, opacity: 0.6 }}
                  onClick={() => { navigator.clipboard.writeText(userToken); setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000); }}
                >
                  {tokenCopied ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>

          </div>
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
