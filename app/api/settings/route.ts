import { NextResponse } from "next/server";
import {
  clearAsanaPat,
  clearAwsCredentials,
  getSettings,
  saveSettings,
} from "@/app/lib/settings";
import { hasAsanaToken, verifyToken } from "@/app/lib/asana";
import { hasConfiguredSubjects } from "@/app/lib/subjects";
import {
  DEFAULT_MODEL_ID,
  DEFAULT_REGION,
  hasAICredentials,
  verifyAwsCredentials,
} from "@/app/lib/classify";

export const dynamic = "force-dynamic";

/** Show enough of a key to be recognisable without revealing it. */
function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

/**
 * GET → connection state for the setup gate and settings panel.
 *
 * Deliberately never returns the Asana token or the AWS secret key. The access
 * key is masked so the user can confirm *which* key is stored without the value
 * being readable. Non-secret preferences (region, model) come back in full so
 * the form can show them.
 */
export async function GET() {
  try {
    const settings = await getSettings();
    const aws = settings.aws ?? {};
    return NextResponse.json({
      hasPat: await hasAsanaToken(),
      displayName: settings.displayName ?? null,
      role: settings.role ?? null,
      hasConfiguredSubjects: await hasConfiguredSubjects(),
      hasAI: await hasAICredentials(),
      aws: {
        hasKeys: !!(aws.accessKeyId?.trim() && aws.secretAccessKey?.trim()),
        /** Masked — never the raw value. */
        accessKeyIdMasked: aws.accessKeyId?.trim()
          ? maskKey(aws.accessKeyId)
          : null,
        region: aws.region?.trim() || DEFAULT_REGION,
        modelId: aws.modelId?.trim() || DEFAULT_MODEL_ID,
        /**
         * True when credentials come from the environment rather than the UI,
         * so the panel can explain why AI is on with no keys shown.
         */
        fromEnv:
          !aws.accessKeyId?.trim() && !!process.env.AWS_ACCESS_KEY_ID?.trim(),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST { asanaPat?, displayName?, role?, aws? }
 *
 * Both kinds of credential are verified with a live call before being written,
 * so an invalid paste is rejected with a readable message instead of being
 * saved and failing silently later.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      asanaPat?: string;
      displayName?: string;
      role?: string;
      aws?: {
        accessKeyId?: string;
        secretAccessKey?: string;
        region?: string;
        modelId?: string;
      };
    };

    const patch: Parameters<typeof saveSettings>[0] = {};
    let identity: { name: string; email: string; workspace: string | null } | null = null;

    if (typeof body.asanaPat === "string" && body.asanaPat.trim()) {
      const token = body.asanaPat.trim();
      try {
        identity = await verifyToken(token);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : String(e) },
          { status: 400 },
        );
      }
      patch.asanaPat = token;
    }

    if (typeof body.displayName === "string") patch.displayName = body.displayName.trim();
    if (typeof body.role === "string") patch.role = body.role.trim();

    if (body.aws) {
      const stored = (await getSettings()).aws ?? {};
      const accessKeyId = body.aws.accessKeyId?.trim() ?? "";
      const secretAccessKey = body.aws.secretAccessKey?.trim() ?? "";
      const region = body.aws.region?.trim() || stored.region || DEFAULT_REGION;
      const modelId = body.aws.modelId?.trim() || stored.modelId || DEFAULT_MODEL_ID;

      // New keys supplied → verify them. Region/model only → verify against the
      // keys already stored, since changing region can itself break access.
      const keyToTest = accessKeyId || stored.accessKeyId?.trim() || "";
      const secretToTest = secretAccessKey || stored.secretAccessKey?.trim() || "";

      if (!keyToTest || !secretToTest) {
        return NextResponse.json(
          { error: "Both an access key ID and a secret access key are required." },
          { status: 400 },
        );
      }

      const check = await verifyAwsCredentials({
        accessKeyId: keyToTest,
        secretAccessKey: secretToTest,
        region,
        modelId,
      });
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }

      patch.aws = { region, modelId };
      if (accessKeyId) patch.aws.accessKeyId = accessKeyId;
      if (secretAccessKey) patch.aws.secretAccessKey = secretAccessKey;
    }

    if (Object.keys(patch).length > 0) await saveSettings(patch);

    return NextResponse.json({ ok: true, identity });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * DELETE ?target=aws → forget the AWS credentials (AI classification off).
 * DELETE            → disconnect Asana: forget the stored token.
 */
export async function DELETE(req: Request) {
  try {
    const target = new URL(req.url).searchParams.get("target");
    if (target === "aws") {
      await clearAwsCredentials();
    } else {
      await clearAsanaPat();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
