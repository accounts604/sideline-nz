// Shopify orders/create webhook — auto-tags supporter-campaign orders with
// `club:<slug>` based on the line-item product handles.
//
// Why this exists: the Shopify Flow that previously tagged these orders
// stopped firing somewhere between 2026-04-12 and now (we found 0/157
// orders carrying any tag on 2026-05-19). Rather than depend on Flow we
// now own this step server-side.
//
// Lifecycle:
//   1. Shopify POSTs orders/create here on every new order
//   2. We verify X-Shopify-Hmac-Sha256 using SHOPIFY_WEBHOOK_SECRET
//   3. We match each line item's product handle against a static prefix
//      map (matches today's club_accounts entries). On match → apply tag.
//   4. We respond 200 fast — never block Shopify on slow tag mutations.
//      Tag work runs after the response is sent.
//
// New supporter campaigns: add an entry to HANDLE_PREFIX_TO_TAG below when
// you onboard a new club. (Could be DB-driven from club_accounts later;
// for now the static map is easy to audit.)

import { Router, type Request, type Response } from "express";
import crypto from "crypto";

const router = Router();

// Product-handle prefix → club tag mapping. Longest prefix first so e.g.
// "wesley-college-rugby-supporters-" wins over "wesley-college-rugby-".
const HANDLE_PREFIX_TO_TAG: Array<{ prefix: string; tag: string }> = [
  { prefix: "2026-wesley-college-rugby-supporters-", tag: "club:wesley-college-rugby" },
  { prefix: "2026-kbhs-rugby-",                       tag: "club:kbhs-rugby" },
  { prefix: "2026-onewhero-rugby-",                   tag: "club:onewhero-rugby" },
  { prefix: "2026-st-peters-1st-xv-",                 tag: "club:st-peters-college-1st-xv" },
  { prefix: "2026-weymouth-rugby-",                   tag: "club:weymouth-rugby" },
  { prefix: "2026-avondale-rugby-",                   tag: "club:avondale-rugby" },
  { prefix: "2026-aorere-college-",                   tag: "club:aorere-college" },
  { prefix: "2026-richmond-rovers-senior-as-",        tag: "club:richmond-rovers-senior-as" },
  { prefix: "2026-richmond-rovers-under-16s-",        tag: "club:richmond-rovers-under-16s" },
  { prefix: "2026-dalestate-girls-rugby-",            tag: "club:dalestate-girls-rugby" },
  { prefix: "2026-manurewa-rfc-div-3-",               tag: "club:manurewa-rfc-div-3" },
  { prefix: "2026-nws-",                              tag: "club:narre-warren-fc" },
  { prefix: "nws-",                                   tag: "club:narre-warren-fc" },
  { prefix: "2026-orfc-",                             tag: "club:otahuhu-rfc" },
  { prefix: "orfc-",                                  tag: "club:otahuhu-rfc" },
];

function tagsForLineHandles(handles: string[]): string[] {
  const out = new Set<string>();
  for (const h of handles) {
    if (!h) continue;
    for (const { prefix, tag } of HANDLE_PREFIX_TO_TAG) {
      if (h.startsWith(prefix)) { out.add(tag); break; }
    }
  }
  return Array.from(out);
}

function verifyHmac(rawBody: Buffer, hmacHeader: string | undefined, secret: string): boolean {
  if (!hmacHeader) return false;
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

async function applyTags(orderGid: string, tags: string[]): Promise<void> {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2024-10";
  if (!storeUrl || !token) {
    console.warn("[shopify-webhook] Admin API not configured — cannot apply tags");
    return;
  }
  const MUTATION = /* GraphQL */ `
    mutation($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }
  `;
  const res = await fetch(`https://${storeUrl}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: MUTATION, variables: { id: orderGid, tags } }),
  });
  if (!res.ok) {
    console.error(`[shopify-webhook] tagsAdd HTTP ${res.status}: ${await res.text()}`);
    return;
  }
  const body = await res.json();
  const errors = body?.data?.tagsAdd?.userErrors ?? [];
  if (errors.length) console.error(`[shopify-webhook] tagsAdd userErrors:`, errors);
}

// POST /api/webhooks/shopify/orders-create
//
// Mount this with express.raw() body parsing — HMAC verification needs the
// exact bytes Shopify sent, before JSON parsing strips/normalises them.
router.post("/orders-create", async (req: Request, res: Response) => {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const hmac = req.header("X-Shopify-Hmac-Sha256") || undefined;

  // Raw body comes through as Buffer when mounted with express.raw.
  // Type as any to keep this file dependency-free of express body-parser types.
  const raw = (req as any).body as Buffer;
  if (!Buffer.isBuffer(raw)) {
    console.error("[shopify-webhook] Body is not a Buffer — confirm raw body parser is mounted");
    return res.status(400).send("body must be raw");
  }

  if (!secret) {
    console.warn("[shopify-webhook] SHOPIFY_WEBHOOK_SECRET not set — rejecting webhook");
    return res.status(503).send("webhook secret not configured");
  }
  if (!verifyHmac(raw, hmac, secret)) {
    return res.status(401).send("invalid HMAC");
  }

  // Parse + acknowledge fast. Tag work happens after the response.
  let order: any;
  try { order = JSON.parse(raw.toString("utf8")); }
  catch (err) { return res.status(400).send("invalid JSON"); }

  res.status(200).send("ok");

  // Backgrounded — Shopify just wants its 200.
  setImmediate(async () => {
    try {
      const orderGid = `gid://shopify/Order/${order.id}`;
      const orderName = order.name || `#${order.order_number || order.id}`;
      const lineHandles: string[] = (order.line_items || []).map((li: any) => li?.product_handle || li?.handle).filter(Boolean);
      const newTags = tagsForLineHandles(lineHandles);

      if (newTags.length === 0) {
        console.log(`[shopify-webhook] ${orderName} — no club tags matched (handles: ${lineHandles.join(", ")})`);
        return;
      }
      const existingTags: string[] = typeof order.tags === "string"
        ? order.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : Array.isArray(order.tags) ? order.tags : [];
      const toAdd = newTags.filter((t) => !existingTags.includes(t));
      if (toAdd.length === 0) {
        console.log(`[shopify-webhook] ${orderName} — already tagged: ${newTags.join(", ")}`);
        return;
      }
      await applyTags(orderGid, toAdd);
      console.log(`[shopify-webhook] ${orderName} — tagged: ${toAdd.join(", ")}`);
    } catch (err) {
      console.error("[shopify-webhook] background tag work failed:", err);
    }
  });
});

export default router;
