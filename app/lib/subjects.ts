import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type SubjectDef = { name: string; hint: string };

const CONFIG_PATH = join(homedir(), ".asana_subjects.json");

/**
 * Subjects start empty for every user. They are personal — the whole point is
 * that you describe your own areas of work — so the app ships with none and
 * invites you to add them after connecting. Tasks stay in "Other" until then.
 */
export const DEFAULT_SUBJECTS: SubjectDef[] = [];

export async function getSubjectDefs(): Promise<SubjectDef[]> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as SubjectDef[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* not configured yet */
  }
  return DEFAULT_SUBJECTS;
}

/**
 * Whether the user has been through subject setup. Distinct from "has zero
 * subjects": someone may deliberately save an empty list, and we should not
 * keep nagging them. Presence of the file is the signal.
 */
export async function hasConfiguredSubjects(): Promise<boolean> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

export async function saveSubjectDefs(subjects: SubjectDef[]): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(subjects, null, 2), "utf8");
}
