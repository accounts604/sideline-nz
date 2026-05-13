// In-app AI worker — Phase 1 entry point.
//
// runTask is the only thing other modules import. Each task:
//   1. Validates its input
//   2. Fetches context from the DB (no LLM tool-use loop yet — keep simple)
//   3. Loads its skill (system prompt) and calls the active provider
//   4. Parses the structured JSON response
//   5. Returns the result; the audit wrapper logs to integration_events
//
// Tasks are switch-cased rather than registered to keep the type narrowing
// tight — each task's input/output is a discriminated union.

import { getProvider } from "./providers/select";
import { withAiAudit } from "./audit";
import { getOrder, getClubAccount, resolveClubDisplayName } from "./tools";
import { SKILLS } from "./skills/name-asset";

function loadSkill(name: string): string {
  const body = SKILLS[name];
  if (!body) throw new Error(`Unknown skill: ${name}`);
  return body;
}

// ----- name-asset task -----

export type NameAssetInput = {
  assetUrl: string;
  context: {
    orderId?: string;
    clubAccountId?: string;
    clubName?: string;          // explicit override — wins over orderId/clubAccountId lookups
    productHint?: string;
    side?: "front" | "back";
  };
  userId?: string;
};

export type NameAssetOutput = {
  canonicalName: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
};

const NAME_ASSET_SCHEMA = {
  type: "object",
  properties: {
    canonicalName: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reasoning: { type: "string" },
  },
  required: ["canonicalName", "confidence", "reasoning"],
} as const;

async function runNameAsset(input: NameAssetInput): Promise<NameAssetOutput> {
  if (!input.assetUrl) throw new Error("assetUrl is required");

  // Resolve club context — explicit clubName wins (no DB round trip), then
  // orderId-derived, then clubAccountId. DB errors are caught and downgraded
  // to "unknown club" so a transient Neon blip doesn't kill the whole call.
  let clubName: string | null = input.context.clubName?.trim() || null;
  if (!clubName && input.context.orderId) {
    try {
      const order = await getOrder(input.context.orderId);
      if (order?.clubAccountId) {
        const club = await getClubAccount(order.clubAccountId);
        clubName = resolveClubDisplayName(club);
      }
    } catch (err: any) {
      console.warn("[ai/name-asset] club lookup via orderId failed:", err?.message || err);
    }
  }
  if (!clubName && input.context.clubAccountId) {
    try {
      const club = await getClubAccount(input.context.clubAccountId);
      clubName = resolveClubDisplayName(club);
    } catch (err: any) {
      console.warn("[ai/name-asset] club lookup via clubAccountId failed:", err?.message || err);
    }
  }

  const year = new Date().getFullYear();
  const provider = getProvider();
  const system = loadSkill("name-asset");

  const userParts: string[] = [
    `Year: ${year}`,
    `Club: ${clubName ?? "Unknown (no orderId or clubAccountId supplied)"}`,
  ];
  if (input.context.productHint) userParts.push(`Product hint: ${input.context.productHint}`);
  if (input.context.side) userParts.push(`Side hint: ${input.context.side}`);
  userParts.push("", "Inspect the image attached and produce the canonical name.");
  const userMessage = userParts.join("\n");

  return withAiAudit(
    {
      taskName: "name-asset",
      orderId: input.context.orderId ?? null,
      userId: input.userId ?? null,
      extra: { hasClubContext: clubName !== null, productHint: input.context.productHint ?? null },
    },
    async () => {
      const resp = await provider.complete({
        system,
        user: userMessage,
        images: [{ url: input.assetUrl }],
        jsonSchema: NAME_ASSET_SCHEMA,
        maxOutputTokens: 256,
        temperature: 0.1,
      });

      let parsed: NameAssetOutput;
      try {
        parsed = JSON.parse(resp.text);
      } catch (err: any) {
        throw new Error(`Provider returned non-JSON: ${resp.text.slice(0, 200)}`);
      }
      if (!parsed.canonicalName || !parsed.confidence) {
        throw new Error(`Provider response missing required fields: ${resp.text.slice(0, 200)}`);
      }
      return parsed;
    },
  );
}

// ----- dispatch -----

export type AiTaskInput = { taskName: "name-asset"; input: NameAssetInput };

export async function runTask(req: AiTaskInput): Promise<NameAssetOutput> {
  switch (req.taskName) {
    case "name-asset":
      return runNameAsset(req.input);
    default:
      throw new Error(`Unknown AI task: ${(req as any).taskName}`);
  }
}
