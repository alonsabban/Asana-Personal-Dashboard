"use client";

import { useEffect, useRef, useState } from "react";

type Project = { gid: string; name: string };
type Section = { gid: string; name: string };

export default function AddTaskModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [showHits, setShowHits] = useState(false);

  const [sections, setSections] = useState<Section[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    fetch("/api/asana/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProjects(j.projects ?? []))
      .catch(() => {})
      .finally(() => setProjectsLoaded(true));
  }, []);

  // Fetch sections whenever the selected project changes
  useEffect(() => {
    setSelectedSection(null);
    setSections([]);
    if (!selectedProject) return;
    setSectionsLoading(true);
    fetch(`/api/asana/sections?projectGid=${selectedProject.gid}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSections(j.sections ?? []))
      .catch(() => {})
      .finally(() => setSectionsLoading(false));
  }, [selectedProject]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/asana/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          projectGid: selectedProject?.gid ?? null,
          sectionGid: selectedSection?.gid ?? null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      await onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const filteredProjects = projectSearch.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
    : projects;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Add task">
        <div className="modal-head">
          <h3>Add task</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="banner">{error}</div>}

          <div className="field">
            <label className="field-label">Task name</label>
            <input
              ref={nameRef}
              className="input"
              placeholder="What needs to be done?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
            />
          </div>

          <div className="field">
            <label className="field-label">Project (optional)</label>
            {selectedProject ? (
              <div className="project-selected">
                <span className="project-selected-name">{selectedProject.name}</span>
                <button
                  className="project-clear"
                  onClick={() => { setSelectedProject(null); setProjectSearch(""); }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="project-search-wrap">
                <input
                  className="input project-search-input"
                  placeholder={projectsLoaded ? "Search project…" : "Loading projects…"}
                  value={projectSearch}
                  disabled={!projectsLoaded}
                  onChange={(e) => { setProjectSearch(e.target.value); setShowHits(true); }}
                  onFocus={() => setShowHits(true)}
                  onBlur={() => setTimeout(() => setShowHits(false), 150)}
                />
                {showHits && filteredProjects.length > 0 && (
                  <div className="hits">
                    {filteredProjects.map((p) => (
                      <button
                        key={p.gid}
                        className="hit"
                        onMouseDown={() => {
                          setSelectedProject(p);
                          setProjectSearch("");
                          setShowHits(false);
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                {showHits && projectsLoaded && filteredProjects.length === 0 && projectSearch.trim() && (
                  <div className="hits">
                    <span className="host" style={{ padding: "8px 12px", display: "block" }}>No match</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedProject && (
            <div className="field">
              <label className="field-label">Section (optional)</label>
              {sectionsLoading ? (
                <div className="input" style={{ color: "var(--text-faint)", pointerEvents: "none" }}>
                  Loading sections…
                </div>
              ) : sections.length === 0 ? (
                <div className="input" style={{ color: "var(--text-faint)", pointerEvents: "none" }}>
                  No sections in this project
                </div>
              ) : (
                <select
                  className="input"
                  value={selectedSection?.gid ?? ""}
                  onChange={(e) => {
                    const hit = sections.find((s) => s.gid === e.target.value) ?? null;
                    setSelectedSection(hit);
                  }}
                >
                  <option value="">— any section —</option>
                  {sections.map((s) => (
                    <option key={s.gid} value={s.gid}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Adding…" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}
