"use client";

import { Fragment, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { AsanaTask, Subtask } from "@/app/lib/asana";
import CommentsPanel from "@/app/components/CommentsPanel";
import MentionTextarea from "@/app/components/MentionTextarea";

type SortKey = "name" | "subject" | "project" | "due" | "assignee" | "created";
type SortDir = "asc" | "desc";
type UserHit = { gid: string; name: string; email: string | null };
type ColKey  = "status" | "subject" | "project" | "assignee";

/* ── helpers ── */
function fmtDue(due: string) {
  return new Date(due + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function daysFromToday(due: string) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(due + "T00:00:00").getTime() - t.getTime()) / 86_400_000);
}
function subjClass(s: string) { return `subj-${s.toLowerCase().replace(/[^a-z]/g, "")}`; }
function truncate(s: string, n = 90) { return s.length > n ? s.slice(0, n) + "…" : s; }

function sortTasks(tasks: AsanaTask[], key: SortKey, dir: SortDir): AsanaTask[] {
  return [...tasks].sort((a, b) => {
    let cmp = 0;
    if (key === "name")     cmp = a.name.localeCompare(b.name);
    if (key === "subject")  cmp = a.subject.localeCompare(b.subject);
    if (key === "project")  cmp = a.project.localeCompare(b.project);
    if (key === "assignee") cmp = (a.assignee ?? "").localeCompare(b.assignee ?? "");
    if (key === "due") {
      if (!a.due && !b.due) cmp = 0;
      else if (!a.due) cmp = 1;
      else if (!b.due) cmp = -1;
      else cmp = a.due.localeCompare(b.due);
    }
    if (key === "created") {
      if (!a.createdAt && !b.createdAt) cmp = 0;
      else if (!a.createdAt) cmp = 1;
      else if (!b.createdAt) cmp = -1;
      else cmp = a.createdAt.localeCompare(b.createdAt);
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

const ColFilterDropdown = forwardRef<HTMLDivElement, {
  col: string;
  values: string[];
  active: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
  onClose: () => void;
}>(function ColFilterDropdown({ values, active, onToggle, onClear, onClose }, ref) {
  return (
    <div className="col-filter-dropdown" ref={ref}>
      {values.length === 0
        ? <div className="col-filter-empty">No values</div>
        : values.map((v) => (
          <label key={v} className="col-filter-option">
            <input type="checkbox" checked={active.has(v)} onChange={() => onToggle(v)} />
            {v === "(blank)" ? <em>{v}</em> : v}
          </label>
        ))
      }
      {active.size > 0 && (
        <button className="col-filter-clear" onClick={() => { onClear(); onClose(); }}>Clear</button>
      )}
    </div>
  );
});

export default function TaskTable({
  tasks,
  onChanged,
  availableSubjects = [],
  groupBy = "none",
}: {
  tasks: AsanaTask[];
  onChanged: () => void | Promise<void>;
  availableSubjects?: string[];
  groupBy?: "none" | "subject" | "project";
}) {
  const [sortKey, setSortKey]   = useState<SortKey>("due");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");
  const [filter, setFilter]     = useState<string>(() => {
    try { return localStorage.getItem("taskFilter") ?? "all"; } catch { return "all"; }
  });
  const [columnFilters, setColumnFilters] = useState<Map<string, Set<string>>>(() => {
    try {
      const raw = localStorage.getItem("taskColumnFilters");
      if (!raw) return new Map();
      const obj = JSON.parse(raw) as Record<string, string[]>;
      return new Map(Object.entries(obj).map(([k, v]) => [k, new Set(v)]));
    } catch { return new Map(); }
  });
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [expandedGid, setExp]   = useState<string | null>(null);
  // tracks which parent task gids have at least one subtask with status "in progress"
  const [subtaskInProgress, setSubtaskInProgress] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const seededGroupBy = useRef<string>("none");

  /* persist filter state */
  useEffect(() => { try { localStorage.setItem("taskFilter", filter); } catch {} }, [filter]);
  useEffect(() => {
    try {
      const obj = Object.fromEntries([...columnFilters.entries()].map(([k, v]) => [k, [...v]]));
      localStorage.setItem("taskColumnFilters", JSON.stringify(obj));
    } catch {}
  }, [columnFilters]);

  /* due-date inline edit */
  const [editDue, setEditDue]   = useState<{ gid: string; value: string } | null>(null);

  /* close column filter dropdown on outside click */
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openFilterCol) return;
    function handler(e: MouseEvent) {
      if (filterDropdownRef.current && filterDropdownRef.current.contains(e.target as Node)) return;
      setOpenFilterCol(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openFilterCol]);

  /* description inline edit */
  const [editDesc, setEditDesc] = useState<{ gid: string; value: string } | null>(null);
  const [savingDesc, setSavingDesc] = useState<string | null>(null);
  const [expandedDesc, setExpandedDesc] = useState<Set<string>>(new Set());

  /* assignee inline edit */
  const [editAsgn, setEditAsgn] = useState<{ gid: string; query: string; hits: UserHit[] } | null>(null);
  const [savingAsgn, setSavingAsgn] = useState<string | null>(null);
  const asgnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* section inline edit */
  const [editSection, setEditSection] = useState<string | null>(null); // gid being edited
  const [sectionOptions, setSectionOptions] = useState<{ gid: string; name: string }[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);

  /* subject inline edit */
  const [editSubj, setEditSubj] = useState<string | null>(null); // gid being edited

  /* status inline edit */
  const [editStatus, setEditStatus] = useState<string | null>(null); // gid being edited

  /* name inline edit */
  const [editName, setEditName] = useState<{ gid: string; value: string } | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const nameClickTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleNameClick = useCallback((gid: string, currentName: string) => {
    if (nameClickTimers.current[gid]) {
      clearTimeout(nameClickTimers.current[gid]);
      delete nameClickTimers.current[gid];
      return;
    }
    nameClickTimers.current[gid] = setTimeout(() => {
      delete nameClickTimers.current[gid];
      setEditName({ gid, value: currentName });
    }, 220);
  }, []);

  const handleNameDblClick = useCallback((gid: string) => {
    if (nameClickTimers.current[gid]) {
      clearTimeout(nameClickTimers.current[gid]);
      delete nameClickTimers.current[gid];
    }
    setExp((g) => g === gid ? null : gid);
  }, []);

  async function saveName(gid: string, value: string, original: string) {
    setEditName(null);
    if (value.trim() === original) return;
    setSavingName(gid);
    try {
      await fetch(`/api/asana/task/${gid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value.trim() }),
      });
      await onChanged();
    } finally { setSavingName(null); }
  }

  /* complete */
  const [busyGid, setBusy] = useState<string | null>(null);

  /* ── sort ── */
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }
  function filterIcon(col: ColKey) {
    const active = columnFilters.get(col) ?? new Set<string>();
    return (
      <span className="col-filter-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          className={`col-filter-btn${active.size > 0 ? " active" : ""}`}
          title={`Filter by ${col}`}
          onClick={() => setOpenFilterCol((v) => v === col ? null : col)}
        >▾</button>
        {openFilterCol === col && (
          <ColFilterDropdown
            ref={filterDropdownRef}
            col={col}
            values={colValues(col)}
            active={active}
            onToggle={(v) => toggleColFilter(col, v)}
            onClear={() => clearColFilter(col)}
            onClose={() => setOpenFilterCol(null)}
          />
        )}
      </span>
    );
  }

  const subjects    = Array.from(new Set(tasks.map((t) => t.subject))).sort();
  const projects    = Array.from(new Set(tasks.map((t) => t.project))).sort();

  /* column filter helpers */
  const BLANK = "(blank)";
  function colValues(col: ColKey): string[] {
    const vals = Array.from(new Set(tasks.map((t) => t[col]).filter(Boolean) as string[])).sort();
    if (tasks.some((t) => !t[col])) vals.push(BLANK);
    return vals;
  }
  function toggleColFilter(col: ColKey, value: string) {
    setColumnFilters((prev) => {
      const next = new Map(prev);
      const set  = new Set(next.get(col) ?? []);
      set.has(value) ? set.delete(value) : set.add(value);
      set.size === 0 ? next.delete(col) : next.set(col, set);
      return next;
    });
  }
  function clearColFilter(col: ColKey) {
    setColumnFilters((prev) => { const next = new Map(prev); next.delete(col); return next; });
  }
  const filtered = tasks
    .filter((t) => filter === "all" || t.subject === filter)
    .filter((t) => {
      for (const [col, vals] of columnFilters) {
        const v = t[col as ColKey] ?? null;
        const matches = v ? vals.has(v as string) : vals.has(BLANK);
        if (!matches) return false;
      }
      return true;
    });
  const displayed = sortTasks(filtered, sortKey, sortDir);

  const groups: { label: string; tasks: AsanaTask[] }[] =
    groupBy === "subject"
      ? subjects
          .filter((s) => filtered.some((t) => t.subject === s))
          .map((s) => ({ label: s, tasks: sortTasks(filtered.filter((t) => t.subject === s), sortKey, sortDir) }))
      : groupBy === "project"
      ? projects
          .filter((p) => filtered.some((t) => t.project === p))
          .map((p) => ({ label: p, tasks: sortTasks(filtered.filter((t) => t.project === p), sortKey, sortDir) }))
      : [{ label: "", tasks: displayed }];

  // Seed all groups as collapsed the first time grouping is active, and whenever groupBy mode changes.
  if (groupBy !== "none" && seededGroupBy.current !== groupBy) {
    seededGroupBy.current = groupBy;
    const allLabels = new Set(groups.map((g) => g.label));
    setCollapsedGroups(allLabels);
  }
  if (groupBy === "none" && seededGroupBy.current !== "none") {
    seededGroupBy.current = "none";
    setCollapsedGroups(new Set());
  }

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  /* ── actions ── */
  async function completeTask(gid: string) {
    setBusy(gid);
    try {
      await fetch("/api/asana/complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gid, completed: true }),
      });
      await onChanged();
    } finally { setBusy(null); }
  }

  async function saveDue(gid: string, value: string) {
    setEditDue(null);
    try {
      await fetch(`/api/asana/task/${gid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due: value || null }),
      });
      await onChanged();
    } catch { /* ignore */ }
  }

  async function saveDesc(gid: string, value: string, htmlNotes?: string | null) {
    setSavingDesc(gid);
    setEditDesc(null);
    try {
      await fetch(`/api/asana/task/${gid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(htmlNotes ? { htmlNotes } : { notes: value }),
      });
      await onChanged();
    } finally { setSavingDesc(null); }
  }

  function startAsgnEdit(gid: string, currentName: string | null) {
    setEditAsgn({ gid, query: currentName ?? "", hits: [] });
    if (currentName) searchAssignees(gid, currentName);
  }

  function searchAssignees(gid: string, q: string) {
    setEditAsgn((prev) => prev ? { ...prev, query: q } : null);
    if (asgnTimer.current) clearTimeout(asgnTimer.current);
    asgnTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/asana/users?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await r.json();
        setEditAsgn((prev) => prev?.gid === gid ? { ...prev, hits: j.users ?? [] } : prev);
      } catch { /* ignore */ }
    }, 220);
  }

  async function pickAssignee(taskGid: string, userGid: string | null) {
    setEditAsgn(null);
    setSavingAsgn(taskGid);
    try {
      await fetch(`/api/asana/task/${taskGid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee: userGid }),
      });
      await onChanged();
    } finally { setSavingAsgn(null); }
  }

  async function saveSubject(gid: string, subject: string) {
    setEditSubj(null);
    try {
      await fetch("/api/asana/classify", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gid, subject }),
      });
      await onChanged();
    } catch { /* ignore */ }
  }

  async function saveStatus(task: AsanaTask, optionGid: string | null) {
    setEditStatus(null);
    if (!task.statusFieldGid) return;
    try {
      await fetch(`/api/asana/task/${task.gid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customFields: { [task.statusFieldGid]: optionGid } }),
      });
      await onChanged();
    } catch { /* ignore */ }
  }

  async function startSectionEdit(task: AsanaTask) {
    if (!task.projectGid) return;
    setEditSection(task.gid);
    setSectionOptions([]);
    setLoadingSections(true);
    try {
      const r = await fetch(`/api/asana/sections?projectGid=${task.projectGid}`, { cache: "no-store" });
      const j = await r.json();
      setSectionOptions(j.sections ?? []);
    } finally {
      setLoadingSections(false);
    }
  }

  async function saveSection(taskGid: string, sectionGid: string) {
    setEditSection(null);
    try {
      await fetch(`/api/asana/task/${taskGid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionGid }),
      });
      await onChanged();
    } catch { /* ignore */ }
  }

  if (tasks.length === 0) return <div className="empty">No tasks.</div>;

  return (
    <div className="task-table-wrap">
      <div className="table-toolbar">
        {subjects.length > 1 && (
          <select className="input table-filter-sel" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All subjects ({tasks.length})</option>
            {subjects.map((s) => (
              <option key={s} value={s}>{s} ({tasks.filter((t) => t.subject === s).length})</option>
            ))}
          </select>
        )}
        {columnFilters.size > 0 && (
          <button className="btn ghost col-filter-clear-all" onClick={() => setColumnFilters(new Map())}>
            Clear filters ×
          </button>
        )}
        <span className="table-count">{displayed.length} task{displayed.length !== 1 ? "s" : ""}</span>
      </div>

      <table className="task-table">
        <thead>
          <tr>
            <th className="th-check" />
            <th className="th-name th-sortable"    onClick={() => toggleSort("name")}>Task {sortIcon("name")}</th>
            <th className="th-subj th-sortable"    onClick={() => toggleSort("subject")}>Subject {sortIcon("subject")}{filterIcon("subject")}</th>
            <th className="th-status">Status{filterIcon("status")}</th>
            <th className="th-proj th-sortable"    onClick={() => toggleSort("project")}>Project {sortIcon("project")}{filterIcon("project")}</th>
            <th className="th-section">Group</th>
            <th className="th-due  th-sortable"    onClick={() => toggleSort("due")}>Due {sortIcon("due")}</th>
            <th className="th-created th-sortable" onClick={() => toggleSort("created")}>Created {sortIcon("created")}</th>
            <th className="th-desc">Description</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ label, tasks: groupTasks }) => (
            <Fragment key={label || "__all"}>
              {groupBy !== "none" && (() => {
                const isCollapsed = collapsedGroups.has(label);
                return (
                  <tr className="group-header-tr group-header-clickable" onClick={() => toggleGroup(label)}>
                    <td colSpan={9}>
                      <span className={`group-caret${isCollapsed ? "" : " open"}`}>▸</span>
                      {groupBy === "subject"
                        ? <span className={`pill subj ${subjClass(label)}`}>{label}</span>
                        : <span className="group-header-label">{label}</span>
                      }
                      <span className="group-count">{groupTasks.length} task{groupTasks.length !== 1 ? "s" : ""}</span>
                    </td>
                  </tr>
                );
              })()}
              {!collapsedGroups.has(label) && groupTasks.map((task) => {
            const days   = task.due ? daysFromToday(task.due) : null;
            const over   = days !== null && days < 0;
            const today  = days === 0;
            const isExp  = expandedGid === task.gid;
            const isDueEdit  = editDue?.gid  === task.gid;
            const isDescEdit = editDesc?.gid === task.gid;
            const isAsgnEdit = editAsgn?.gid === task.gid;

            return (
              <Fragment key={task.gid}>
                <tr className={`task-tr${over ? " task-tr-over" : ""}${isExp ? " task-tr-exp" : ""}`}>

                  {/* complete */}
                  <td className="td-check">
                    <button className="task-check" title="Mark complete"
                      disabled={busyGid === task.gid} onClick={() => completeTask(task.gid)}>✓</button>
                  </td>

                  {/* name — single-click to edit, double-click to expand */}
                  <td className="td-name">
                    <div className="task-name-btn" aria-expanded={isExp}>
                      <span
                        className={`caret ${isExp ? "open" : ""}`}
                        aria-hidden
                        style={{ cursor: "pointer" }}
                        onClick={() => setExp((g) => g === task.gid ? null : task.gid)}
                      >▸</span>
                      {editName?.gid === task.gid ? (
                        <input
                          className="input task-name-input"
                          value={editName.value}
                          autoFocus
                          onChange={(e) => setEditName((d) => d ? { ...d, value: e.target.value } : null)}
                          onBlur={() => saveName(task.gid, editName.value, task.name)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveName(task.gid, editName.value, task.name);
                            if (e.key === "Escape") setEditName(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ flex: 1 }}
                        />
                      ) : (
                        <span
                          className={`task-name${savingName === task.gid ? " saving" : ""}`}
                          title="Click to edit name · Double-click to expand"
                          onClick={() => handleNameClick(task.gid, task.name)}
                          onDoubleClick={() => handleNameDblClick(task.gid)}
                          style={{ cursor: "pointer" }}
                        >
                          {task.name}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* subject — click pill to change */}
                  <td className="td-subj"
                    title={availableSubjects.length > 1 ? "Click to change subject" : undefined}>
                    {editSubj === task.gid && availableSubjects.length > 0 ? (
                      <select
                        className="input subj-select"
                        defaultValue={task.subject}
                        autoFocus
                        onChange={(e) => saveSubject(task.gid, e.target.value)}
                        onBlur={() => setEditSubj(null)}
                      >
                        {availableSubjects.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`pill subj ${subjClass(task.subject)}${availableSubjects.length > 1 ? " subj-clickable" : ""}`}
                        onClick={() => availableSubjects.length > 1 && setEditSubj(task.gid)}
                      >
                        {task.subject}{task.track && task.track !== "General" ? ` · ${task.track}` : ""}
                      </span>
                    )}
                  </td>

                  {/* status */}
                  <td className="td-status"
                    title={task.statusFieldGid ? "Click to change status" : undefined}>
                    {editStatus === task.gid && task.statusFieldGid ? (
                      <select
                        className="input subj-select"
                        defaultValue={task.statusOptions.find((o) => o.name === task.status)?.gid ?? ""}
                        autoFocus
                        onChange={(e) => saveStatus(task, e.target.value || null)}
                        onBlur={() => setEditStatus(null)}
                      >
                        <option value="">— clear —</option>
                        {task.statusOptions.map((o) => (
                          <option key={o.gid} value={o.gid}>{o.name}</option>
                        ))}
                      </select>
                    ) : task.status ? (
                      <>
                        <span
                          className={`pill status status-${task.status.toLowerCase().replace(/\s+/g, "-")}${task.statusFieldGid ? " subj-clickable" : ""}`}
                          onClick={() => task.statusFieldGid && setEditStatus(task.gid)}
                        >
                          {task.status}
                        </span>
                        {subtaskInProgress.has(task.gid) && (
                          <span className="pill status status-in-progress subtask-status-badge" title="A subtask is In Progress">↳</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span
                          className={`no-val${task.statusFieldGid ? " subj-clickable" : ""}`}
                          onClick={() => task.statusFieldGid && setEditStatus(task.gid)}
                        >
                          {task.statusFieldGid ? "Set status" : "—"}
                        </span>
                        {subtaskInProgress.has(task.gid) && (
                          <span className="pill status status-in-progress subtask-status-badge" title="A subtask is In Progress">↳ In Progress</span>
                        )}
                      </>
                    )}
                  </td>

                  {/* project */}
                  <td className="td-proj">
                    {task.projectGid ? (
                      <a
                        href={`https://app.asana.com/0/${task.projectGid}/list`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {task.project}
                      </a>
                    ) : (
                      task.project
                    )}
                  </td>

                  {/* section / group — click to change */}
                  <td className="td-section"
                    title={task.projectGid ? "Click to change group" : undefined}>
                    {editSection === task.gid ? (
                      loadingSections ? (
                        <span className="no-val">Loading…</span>
                      ) : (
                        <select
                          className="input subj-select"
                          defaultValue={task.sectionGid ?? ""}
                          autoFocus
                          onChange={(e) => saveSection(task.gid, e.target.value)}
                          onBlur={() => setEditSection(null)}
                        >
                          {sectionOptions.map((s) => (
                            <option key={s.gid} value={s.gid}>{s.name}</option>
                          ))}
                        </select>
                      )
                    ) : (
                      <span
                        className={`section-label${task.projectGid ? " subj-clickable" : ""}`}
                        onClick={() => task.projectGid && startSectionEdit(task)}
                      >
                        {task.section ?? <span className="no-val">—</span>}
                      </span>
                    )}
                  </td>

                  {/* due — click cell to edit inline */}
                  <td className="td-due" title="Click to edit"
                    onClick={() => { if (!isDueEdit) setEditDue({ gid: task.gid, value: task.due ?? "" }); }}>
                    {isDueEdit ? (
                      <input type="date" className="input due-inline-input"
                        value={editDue!.value} autoFocus
                        onChange={(e) => setEditDue((d) => d ? { ...d, value: e.target.value } : null)}
                        onBlur={() => saveDue(task.gid, editDue!.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveDue(task.gid, editDue!.value); if (e.key === "Escape") setEditDue(null); }}
                        onClick={(e) => e.stopPropagation()} />
                    ) : (
                      <span className={`due-label${over ? " over" : ""}`}>
                        {task.due ? fmtDue(task.due) : <span className="no-val">—</span>}
                        {over   && <span className="due-pip danger">{-days!}d</span>}
                        {today  && <span className="due-pip today">Today</span>}
                      </span>
                    )}
                  </td>

                  {/* created — read-only */}
                  <td className="td-created">
                    {task.createdAt
                      ? new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : <span className="no-val">—</span>}
                  </td>

                  {/* description — click to edit inline, or edit in expanded panel */}
                  <td className="td-desc"
                    onClick={() => { if (!isDescEdit) setEditDesc({ gid: task.gid, value: task.notes }); }}>
                    {isDescEdit ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <MentionTextarea
                          value={editDesc!.value}
                          onChange={(v) => setEditDesc((d) => d ? { ...d, value: v } : null)}
                          onBlur={(plain, html) => saveDesc(task.gid, plain, html)}
                          rows={3}
                          autoFocus
                          className="input desc-textarea"
                        />
                      </div>
                    ) : (
                      <span className={`desc-preview${savingDesc === task.gid ? " saving" : ""}`}>
                        {task.notes ? (() => {
                          const words = task.notes.split(/\s+/);
                          const isExpanded = expandedDesc.has(task.gid);
                          const needsTrunc = words.length > 20;
                          const shown = isExpanded ? task.notes : words.slice(0, 20).join(" ");
                          return <>
                            {shown}{needsTrunc && !isExpanded && "…"}
                            {needsTrunc && (
                              <span
                                className="desc-expand-toggle"
                                onClick={(e) => { e.stopPropagation(); setExpandedDesc((s) => { const n = new Set(s); isExpanded ? n.delete(task.gid) : n.add(task.gid); return n; }); }}
                              >
                                {isExpanded ? "show less" : "expand to show more"}
                              </span>
                            )}
                          </>;
                        })() : <span className="no-val">—</span>}
                      </span>
                    )}
                  </td>
                </tr>

                {/* expanded row — description + comments/subtasks side by side */}
                {isExp && (
                  <tr className="detail-tr">
                    <td colSpan={9}>
                      <div className="detail-panel detail-panel-cols">
                        <div className="detail-desc-col">
                          <div className="expand-section-title">Description</div>
                          <MentionTextarea
                            defaultValue={task.notes}
                            onBlur={(plain, html) => { if (plain !== task.notes) saveDesc(task.gid, plain, html); }}
                            placeholder="Add a description… (@name to mention)"
                            rows={10}
                            className="input detail-desc-textarea"
                          />
                          {savingDesc === task.gid && <span className="no-val" style={{ fontSize: 11, marginTop: 4, display: "block" }}>Saving…</span>}
                          <div className="detail-assignee-row" style={{ position: "relative" }}>
                            <span className="expand-section-title">Assignee</span>
                            {editAsgn?.gid === task.gid ? (
                              <div className="asgn-edit-wrap" style={{ flex: 1 }}>
                                <input className="input" autoFocus
                                  value={editAsgn.query}
                                  placeholder="Search…"
                                  onChange={(e) => searchAssignees(task.gid, e.target.value)}
                                  onBlur={() => setTimeout(() => setEditAsgn(null), 180)}
                                  onKeyDown={(e) => e.key === "Escape" && setEditAsgn(null)}
                                  style={{ fontSize: 12, padding: "3px 7px", height: "auto" }} />
                                {editAsgn.hits.length > 0 && (
                                  <div className="hits">
                                    <button className="hit" onMouseDown={() => pickAssignee(task.gid, null)}>
                                      <span className="host">Unassign</span>
                                    </button>
                                    {editAsgn.hits.map((u) => (
                                      <button key={u.gid} className="hit" onMouseDown={() => pickAssignee(task.gid, u.gid)}>
                                        <span>{u.name}</span>
                                        {u.email && <span className="host">{u.email}</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="asgn-display" title="Click to change"
                                onClick={() => startAsgnEdit(task.gid, task.assignee)}>
                                {savingAsgn === task.gid
                                  ? <span className="no-val">Saving…</span>
                                  : task.assignee ?? <span className="no-val">—</span>}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="detail-comments-col">
                          <CommentsPanel
                            gid={task.gid}
                            onSubtasksLoaded={(subtasks: Subtask[]) => {
                              const hasInProgress = subtasks.some(
                                (s) => !s.completed && s.status?.toLowerCase().includes("in progress"),
                              );
                              setSubtaskInProgress((prev) => {
                                const next = new Set(prev);
                                hasInProgress ? next.add(task.gid) : next.delete(task.gid);
                                return next;
                              });
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
            </Fragment>
          ))}

        </tbody>
      </table>
    </div>
  );
}
