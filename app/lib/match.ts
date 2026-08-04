import type { AsanaTask } from "@/app/lib/asana";

/**
 * Case-insensitive free-text match against a task's name, project, subject and
 * track. Supports multiple space-separated terms (all must match — AND).
 * An empty query matches everything.
 */
export function taskMatches(task: AsanaTask, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [task.name, task.project, task.subject, task.track ?? ""]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}
