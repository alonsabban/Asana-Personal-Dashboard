"use client";

import { useEffect, useState } from "react";

type SubjectRow = {
  originalName: string; // name when loaded — used to detect renames
  name: string;
  hint: string;
};

/**
 * Settings modal: connection at the top, subject taxonomy below. Both live here
 * so there is one obvious place to configure the dashboard.
 */
export default function SubjectSettings({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows]         = useState<SubjectRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [hasAI, setHasAI]       = useState(false);
  const [newName, setNewName]   = useState("");
  const [newHint, setNewHint]   = useState("");

  /* connection section */
  const [hasPat, setHasPat]         = useState(false);
  const [editingPat, setEditingPat] = useState(false);
  const [pat, setPat]               = useState("");
  const [patSaving, setPatSaving]   = useState(false);
  const [patError, setPatError]     = useState<string | null>(null);
  const [patOk, setPatOk]           = useState<string | null>(null);

  /* AI (AWS Bedrock) section */
  const [awsOpen, setAwsOpen]         = useState(false);
  const [awsHasKeys, setAwsHasKeys]   = useState(false);
  const [awsMasked, setAwsMasked]     = useState<string | null>(null);
  const [awsFromEnv, setAwsFromEnv]   = useState(false);
  const [awsKey, setAwsKey]           = useState("");
  const [awsSecret, setAwsSecret]     = useState("");
  const [awsRegion, setAwsRegion]     = useState("");
  const [awsModel, setAwsModel]       = useState("");
  const [awsSaving, setAwsSaving]     = useState(false);
  const [awsError, setAwsError]       = useState<string | null>(null);
  const [awsOk, setAwsOk]             = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/asana/subjects").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([subj, settings]) => {
        setHasAI(!!settings.hasAI);
        setHasPat(!!settings.hasPat);
        const aws = settings.aws ?? {};
        setAwsHasKeys(!!aws.hasKeys);
        setAwsMasked(aws.accessKeyIdMasked ?? null);
        setAwsFromEnv(!!aws.fromEnv);
        setAwsRegion(aws.region ?? "");
        setAwsModel(aws.modelId ?? "");
        setRows(
          (subj.subjects ?? []).map((s: { name: string; hint: string }) => ({
            originalName: s.name,
            name: s.name,
            hint: s.hint,
          })),
        );
      })
      .finally(() => setLoading(false));
  }, []);

  function update(idx: number, field: "name" | "hint", value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    );
  }

  function remove(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function addRow() {
    const name = newName.trim();
    if (!name) return;
    setRows((prev) => [
      ...prev,
      { originalName: "", name, hint: newHint.trim() },
    ]);
    setNewName("");
    setNewHint("");
  }

  async function savePat() {
    const token = pat.trim();
    if (!token) return;
    setPatSaving(true);
    setPatError(null);
    setPatOk(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asanaPat: token }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPatError(json.error ?? "Could not save that token.");
        return;
      }
      setPatOk(json.identity?.name ?? "Connected");
      setHasPat(true);
      setEditingPat(false);
      setPat("");
      onSaved();
    } catch {
      setPatError("Could not reach the server.");
    } finally {
      setPatSaving(false);
    }
  }

  async function saveAws() {
    setAwsSaving(true);
    setAwsError(null);
    setAwsOk(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aws: {
            accessKeyId: awsKey.trim() || undefined,
            secretAccessKey: awsSecret.trim() || undefined,
            region: awsRegion.trim() || undefined,
            modelId: awsModel.trim() || undefined,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAwsError(json.error ?? "Could not save those credentials.");
        return;
      }
      setAwsOk("AI classification is on — verified against AWS.");
      setHasAI(true);
      setAwsHasKeys(true);
      setAwsFromEnv(false);
      if (awsKey.trim()) {
        const k = awsKey.trim();
        setAwsMasked(k.length <= 8 ? "••••" : `${k.slice(0, 4)}••••${k.slice(-4)}`);
      }
      setAwsKey("");
      setAwsSecret("");
      setAwsOpen(false);
      onSaved();
    } catch {
      setAwsError("Could not reach the server.");
    } finally {
      setAwsSaving(false);
    }
  }

  async function removeAws() {
    if (!confirm("Turn off AI classification and forget the stored AWS keys?")) return;
    setAwsSaving(true);
    setAwsError(null);
    setAwsOk(null);
    try {
      const res = await fetch("/api/settings?target=aws", { method: "DELETE" });
      if (!res.ok) {
        setAwsError("Could not remove those credentials.");
        return;
      }
      setHasAI(false);
      setAwsHasKeys(false);
      setAwsMasked(null);
      setAwsOpen(false);
      onSaved();
    } finally {
      setAwsSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      // Build rename map: only for rows whose name actually changed
      const renames: Record<string, string> = {};
      for (const row of rows) {
        if (row.originalName && row.originalName !== row.name) {
          renames[row.originalName] = row.name;
        }
      }

      const res = await fetch("/api/asana/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjects: rows
            .filter((r) => r.name.trim())
            .map((r) => ({ name: r.name.trim(), hint: r.hint })),
          renames,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? "Could not save subjects. Please try again.");
        return;
      }

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function resetCache() {
    if (!confirm("This will re-classify every task with AI on the next refresh. Continue?")) return;
    await fetch("/api/asana/classify", { method: "DELETE" });
    onClose();
    onSaved();
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog" style={{ width: 580 }}>
        <div className="modal-head">
          <h3>Settings</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* ── Asana connection ── */}
          <div className="settings-section">
            <h4 className="settings-section-title">Asana connection</h4>

            {!editingPat ? (
              <div className="settings-row">
                <span style={{ fontSize: 13 }}>
                  {hasPat ? (
                    <>
                      <span className="pill status status-connected">Connected</span>
                      <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>
                        Token stored on this machine
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-dim)" }}>Not connected</span>
                  )}
                </span>
                <button className="btn ghost" onClick={() => setEditingPat(true)}>
                  {hasPat ? "Change token" : "Add token"}
                </button>
              </div>
            ) : (
              <div>
                <input
                  className="input"
                  type="password"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Paste a new Personal Access Token"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !patSaving) savePat(); }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn" onClick={savePat} disabled={patSaving || !pat.trim()}>
                    {patSaving ? "Checking…" : "Save token"}
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => { setEditingPat(false); setPat(""); setPatError(null); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {patError && (
              <div className="banner" style={{ marginTop: 8, fontSize: 12 }}>{patError}</div>
            )}
            {patOk && (
              <div className="setup-ok" style={{ marginTop: 8 }}>
                Connected as <strong>{patOk}</strong>
              </div>
            )}
          </div>

          {/* ── AI classification (optional) ── */}
          <div className="settings-section">
            <h4 className="settings-section-title">
              AI classification <span className="settings-optional">optional</span>
            </h4>

            <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 0 }}>
              With AWS Bedrock credentials the dashboard sorts each new task into
              your subjects automatically. Without them everything stays as
              “Other” and you sort by hand — the dashboard works either way.
              Keys are stored on this machine only and never sent to the browser.
            </p>

            {!awsOpen ? (
              <div className="settings-row">
                <span style={{ fontSize: 13 }}>
                  {hasAI ? (
                    <>
                      <span className="pill status status-connected">On</span>
                      <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>
                        {awsFromEnv
                          ? "Using credentials from the environment"
                          : `Key ${awsMasked ?? "stored"} · ${awsRegion}`}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-dim)" }}>
                      Off — tasks stay as “Other”
                    </span>
                  )}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {awsHasKeys && (
                    <button
                      className="btn ghost"
                      onClick={removeAws}
                      disabled={awsSaving}
                      title="Forget the stored AWS keys and turn AI classification off"
                    >
                      Remove
                    </button>
                  )}
                  <button className="btn ghost" onClick={() => setAwsOpen(true)}>
                    {awsHasKeys ? "Change keys" : "Add keys"}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="setup-label" htmlFor="aws-key">Access key ID</label>
                <input
                  id="aws-key"
                  className="input"
                  type="text"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={awsHasKeys ? "Leave blank to keep the stored key" : "AKIA…"}
                  value={awsKey}
                  onChange={(e) => setAwsKey(e.target.value)}
                />

                <label className="setup-label" htmlFor="aws-secret" style={{ marginTop: 8 }}>
                  Secret access key
                </label>
                <input
                  id="aws-secret"
                  className="input"
                  type="password"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={awsHasKeys ? "Leave blank to keep the stored secret" : "…"}
                  value={awsSecret}
                  onChange={(e) => setAwsSecret(e.target.value)}
                />

                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label className="setup-label" htmlFor="aws-region">Region</label>
                    <input
                      id="aws-region"
                      className="input"
                      spellCheck={false}
                      placeholder="us-east-1"
                      value={awsRegion}
                      onChange={(e) => setAwsRegion(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label className="setup-label" htmlFor="aws-model">Model</label>
                    <input
                      id="aws-model"
                      className="input"
                      spellCheck={false}
                      placeholder="anthropic.claude-3-haiku-20240307-v1:0"
                      value={awsModel}
                      onChange={(e) => setAwsModel(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn" onClick={saveAws} disabled={awsSaving}>
                    {awsSaving ? "Checking with AWS…" : "Save & test"}
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setAwsOpen(false);
                      setAwsKey("");
                      setAwsSecret("");
                      setAwsError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {awsError && (
              <div className="banner" style={{ marginTop: 8, fontSize: 12 }}>{awsError}</div>
            )}
            {awsOk && (
              <div className="setup-ok" style={{ marginTop: 8 }}>{awsOk}</div>
            )}
          </div>

          {/* ── Subjects ── */}
          <div className="settings-section">
            <h4 className="settings-section-title">Subjects</h4>

            <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Subjects are your own categories — “Customer work”, “Admin”,
              whatever matches how you think. Optional, but they let the
              dashboard group tasks by context instead of one long list. The AI
              classifies each <em>new</em> task once from its name and
              description. Rename a subject to relabel existing tasks instantly.
            </p>

            {loading ? (
              <div className="spin">Loading…</div>
            ) : (
              <table className="subj-table">
                <thead>
                  <tr>
                    <th className="subj-col-label">Subject</th>
                    <th className="subj-col-label">
                      Classification hint
                      <span className="subj-col-sub"> — describe what belongs here</span>
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          className="input"
                          value={row.name}
                          placeholder="Subject name"
                          onChange={(e) => update(i, "name", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={row.hint}
                          placeholder="Description — helps the AI classify tasks"
                          onChange={(e) => update(i, "hint", e.target.value)}
                        />
                      </td>
                      <td className="subj-table-action">
                        <button className="icon-btn" title="Remove subject" onClick={() => remove(i)}>✕</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="subj-table-addrow">
                    <td>
                      <input
                        className="input"
                        value={newName}
                        placeholder="New subject…"
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addRow()}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={newHint}
                        placeholder="Description (optional)"
                        onChange={(e) => setNewHint(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addRow()}
                      />
                    </td>
                    <td className="subj-table-action">
                      <button
                        className="btn ghost"
                        onClick={addRow}
                        disabled={!newName.trim()}
                        style={{ whiteSpace: "nowrap" }}
                      >+ Add</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="modal-foot" style={{ justifyContent: "space-between" }}>
          <button
            className="btn ghost"
            onClick={resetCache}
            style={{ fontSize: 12, color: "var(--text-faint)" }}
            title="Wipe the classification cache so every task is re-classified on next refresh"
          >
            Re-classify all…
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={save} disabled={saving || loading}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
