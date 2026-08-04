import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Optional AWS Bedrock credentials for AI task classification. The dashboard
 * works without these — tasks fall back to keyword rules.
 */
export type AwsSettings = {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  modelId?: string;
};

/**
 * Per-user dashboard configuration. Lives in the user's home directory so the
 * repo stays generic and nothing personal is ever committed.
 *
 * Security model, stated plainly: this file is plain JSON, protected by the
 * operating-system account boundary and nothing else. That is a real boundary —
 * another Windows user cannot read it — but anyone with access to *this* account
 * can. Encrypting it at rest would be theatre: the app has to decrypt it
 * unattended on every request, so the key would have to live beside the
 * ciphertext. What this design does buy, and the reason it exists: secrets are
 * no longer in a repo-adjacent `.env.local` that gets zipped, emailed, or
 * committed by accident, and they are never sent to the browser.
 */
export type DashboardSettings = {
  /** Asana Personal Access Token. Entered through the app, never in the repo. */
  asanaPat?: string;
  /** Greeting fallback when Asana's /users/me is unavailable. */
  displayName?: string;
  /** Job role, used to give the AI classifier context. */
  role?: string;
  /** Optional AWS Bedrock credentials for AI classification. */
  aws?: AwsSettings;
};

const SETTINGS_PATH = join(homedir(), ".dashboard_settings.json");

export async function getSettings(): Promise<DashboardSettings> {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as DashboardSettings;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* not configured yet — first run */
  }
  return {};
}

/**
 * Write settings, restricting the file to the owner. On Windows this is a
 * best-effort hint rather than a real ACL change, so it is never fatal — the
 * meaningful protection is the user-account boundary either way.
 */
async function writeSettings(value: DashboardSettings): Promise<void> {
  try {
    await writeFile(SETTINGS_PATH, JSON.stringify(value, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch (e) {
    throw new Error(`Could not write ${SETTINGS_PATH}: ${String(e)}`);
  }
}

/**
 * Merge a patch into the stored settings. Merging (rather than overwriting)
 * lets separate UI sections save independently without clobbering each other.
 *
 * `aws` is merged one level deeper on purpose: the UI can save just a region or
 * just a model id, and a shallow merge would silently drop the stored keys.
 */
export async function saveSettings(
  patch: Partial<DashboardSettings>,
): Promise<void> {
  const current = await getSettings();
  const merged: DashboardSettings = { ...current, ...patch };
  if (patch.aws) merged.aws = { ...current.aws, ...patch.aws };
  await writeSettings(merged);
}

/** Forget the stored token — used by the "Disconnect" action. */
export async function clearAsanaPat(): Promise<void> {
  const current = await getSettings();
  delete current.asanaPat;
  await writeSettings(current);
}

/** Forget the stored AWS credentials, leaving region/model preferences intact. */
export async function clearAwsCredentials(): Promise<void> {
  const current = await getSettings();
  if (current.aws) {
    delete current.aws.accessKeyId;
    delete current.aws.secretAccessKey;
  }
  await writeSettings(current);
}
