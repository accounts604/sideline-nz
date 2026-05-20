// Smoke test for Ezra's customer-context tools.
//
// Runs each new tool against a real env (DATABASE_URL + Shopify creds +
// Gmail OAuth) and prints what it returned. Designed to be safe to re-run
// — all four tools below are read-only except draft_customer_reply, which
// creates a Gmail DRAFT (never sends). Drafts pile up under the Drafts
// folder so you can spot/delete the test ones.
//
// Run:
//   npx tsx scripts/test-ezra-customer-context.ts
//   npx tsx scripts/test-ezra-customer-context.ts --email someone@example.com --order PO-2026-0018
//
// Optional flags:
//   --email <addr>        try lookup_shopify_order by this email
//   --order-number <#>    try lookup_shopify_order by this Shopify order # (with or without #)
//   --order <id|po|num>   try get_order_status by this UUID / PO ref / order number
//   --thread <id>         try get_email_thread by this Gmail thread id
//   --query <q>           try get_email_thread search (default: "subject:order")
//   --draft               actually create a draft (requires --email and --order)
//   --skip-gmail          skip gmail-dependent checks
//   --skip-shopify        skip shopify-dependent checks

import "dotenv/config";
import { findTool, looksLikePhone, escalationHit } from "../server/ezra/tools";
import { db } from "../server/db";
import { orders } from "@shared/schema";
import { desc, isNotNull, and } from "drizzle-orm";

function parseArgs(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const ARGS = parseArgs();
const CTX = { userId: "smoke-test", conversationId: "smoke-test" };

function banner(s: string) {
  console.log("\n" + "─".repeat(60));
  console.log("─── " + s);
  console.log("─".repeat(60));
}

function preview(obj: unknown, max = 800): string {
  const s = JSON.stringify(obj, null, 2);
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… (truncated, ${s.length} chars)`;
}

async function runTool(name: string, args: Record<string, unknown>) {
  const tool = findTool(name);
  if (!tool) { console.log(`✗ tool not registered: ${name}`); return null; }
  console.log(`→ ${name}(${JSON.stringify(args)})`);
  try {
    const result = await tool.execute(args, CTX);
    console.log(preview(result));
    return result;
  } catch (err) {
    console.log(`✗ threw: ${(err as Error).message}`);
    return null;
  }
}

async function pickRecentOrderForFallback(): Promise<{ id: string; poReference: string | null; orderNumber: string | null; customerEmail: string | null } | null> {
  const [row] = await db
    .select({
      id: orders.id,
      poReference: orders.poReference,
      orderNumber: orders.orderNumber,
      customerEmail: orders.customerEmail,
    })
    .from(orders)
    .where(and(isNotNull(orders.poReference)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row || null;
}

async function main() {
  banner("ENV check");
  console.log("DATABASE_URL:        ", process.env.DATABASE_URL ? "✓ set" : "✗ MISSING");
  console.log("SHOPIFY_STORE_URL:   ", process.env.SHOPIFY_STORE_URL ? "✓ set" : "✗ missing (shopify tests will skip)");
  console.log("SHOPIFY_ADMIN_TOKEN: ", process.env.SHOPIFY_ADMIN_TOKEN ? "✓ set" : "✗ missing");
  console.log("GOOGLE_REFRESH_TOKEN:", process.env.GOOGLE_REFRESH_TOKEN ? "✓ set" : "✗ missing (gmail tests will skip)");

  // ── Pick a fallback internal order if --order wasn't passed ──
  let orderForStatus = (ARGS.order as string) || "";
  let fallbackOrderRow: Awaited<ReturnType<typeof pickRecentOrderForFallback>> = null;
  if (!orderForStatus) {
    fallbackOrderRow = await pickRecentOrderForFallback();
    if (fallbackOrderRow) {
      orderForStatus = fallbackOrderRow.poReference || fallbackOrderRow.orderNumber || fallbackOrderRow.id;
      console.log(`\n(auto-picked most recent order: ${orderForStatus})`);
    }
  }

  // ── get_order_status ──
  banner("get_order_status");
  if (orderForStatus) {
    await runTool("get_order_status", { orderId: orderForStatus });
  } else {
    console.log("⊘ no order id available, and no orders in DB to fall back on");
  }

  // ── lookup_shopify_order ──
  banner("lookup_shopify_order");
  if (ARGS["skip-shopify"]) {
    console.log("⊘ --skip-shopify");
  } else if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ADMIN_TOKEN) {
    console.log("⊘ shopify env not set, skipping");
  } else {
    const needle =
      (ARGS.email as string) ||
      (ARGS["order-number"] as string) ||
      fallbackOrderRow?.customerEmail ||
      null;
    if (!needle) {
      console.log("⊘ no --email / --order-number provided and no fallback customer email on DB");
    } else {
      await runTool("lookup_shopify_order", { needle, extraMatches: 2 });
    }
  }

  // ── get_email_thread ──
  banner("get_email_thread");
  if (ARGS["skip-gmail"]) {
    console.log("⊘ --skip-gmail");
  } else if (!process.env.GOOGLE_REFRESH_TOKEN) {
    console.log("⊘ gmail env not set, skipping");
  } else if (ARGS.thread) {
    await runTool("get_email_thread", { threadId: ARGS.thread });
  } else {
    const q = (ARGS.query as string) || "subject:order";
    await runTool("get_email_thread", { searchQuery: q, maxResults: 1 });
  }

  // ── draft_customer_reply (only if explicitly requested) ──
  banner("draft_customer_reply");
  if (!ARGS.draft) {
    console.log("⊘ skipped — pass --draft (with --email and --order) to actually create a Gmail draft");
  } else if (!process.env.GOOGLE_REFRESH_TOKEN) {
    console.log("⊘ gmail env not set");
  } else {
    const to = (ARGS.email as string) || "";
    const orderRef = orderForStatus;
    if (!to || !orderRef) {
      console.log("⊘ need both --email <addr> and an order id (--order, or a recent order in DB)");
    } else {
      await runTool("draft_customer_reply", {
        to,
        subject: `Re: Sideline order ${orderRef} — status update`,
        body: `Hey,\n\nThanks for getting in touch about ${orderRef}. This is a test draft created by scripts/test-ezra-customer-context.ts — feel free to delete it from the Drafts folder.\n\nCheers,\nSideline Team`,
      });
    }
  }

  // ── Gate unit tests (pure functions, no Gmail traffic) ──
  banner("send_customer_reply — gate unit tests");
  const safeBody = `Hey,\n\nThanks for getting in touch about ${orderForStatus || "your order"}. We've got it in our system and the team is working on it — current stage is in production. We'll email you a tracking link as soon as it ships.\n\nCheers,\nSideline Team`;
  let pass = 0;
  let fail = 0;
  function check(label: string, ok: boolean, detail?: string) {
    if (ok) { pass++; console.log(`  ✓ ${label}`); }
    else { fail++; console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`); }
  }

  // Phone shapes must trigger
  const phoneVariants = [
    "021 555 1234", "+64 21 555 1234", "(09) 555 1234", "0800 123 456", "0212345678",
  ];
  for (const p of phoneVariants) {
    check(`phone "${p}" rejected`, looksLikePhone(`Call us on ${p}.`));
  }

  // Tracking-number shapes must NOT trigger phone gate (false-positive guard)
  const trackingVariants = [
    "CN123456789NZ", "1234567890", "EJ987654321NZ", "1Z999AA10123456784",
  ];
  for (const t of trackingVariants) {
    check(`tracking "${t}" allowed`, !looksLikePhone(`Tracking: ${t}`), "phone gate falsely flagged a tracking number");
  }

  // Escalation keywords must fire
  for (const kw of ["refund", "cancel", "wrong item", "speak to a manager", "complaint"]) {
    check(`escalation kw "${kw}" detected`, escalationHit(`I want a ${kw} please`) !== null);
  }

  // Safe body passes both
  check("safe body passes phone gate", !looksLikePhone(safeBody));
  check("safe body passes escalation gate", escalationHit(safeBody) === null);

  console.log(`\n  ${pass} pass, ${fail} fail`);

  // Gate-pass shape — only actually sends if --send-live, otherwise just shows what would happen
  if (ARGS["send-live"]) {
    const to = (ARGS.email as string) || "";
    if (!to) {
      console.log("⊘ --send-live needs --email <addr>");
    } else {
      console.log("\n[LIVE SEND TO " + to + "]");
      await runTool("send_customer_reply", {
        to,
        subject: `Re: Sideline order ${orderForStatus} — status`,
        body: safeBody,
        internalOrderRef: orderForStatus || "PO-TEST",
        customerStage: "received",
      });
    }
  } else {
    console.log("⊘ live send skipped — pass --send-live --email <addr> to actually send (BCCs ops + audits to TG 614)");
  }

  // ── flag_for_escalation: live post to TG 614 only with --escalate-live ──
  banner("flag_for_escalation");
  if (ARGS["escalate-live"]) {
    await runTool("flag_for_escalation", {
      customerEmail: (ARGS.email as string) || "test-customer@example.com",
      customerName: "Smoke Test",
      orderRef: orderForStatus || "PO-TEST",
      reason: "smoke test — not a real escalation",
      summary: "This is a test escalation card from scripts/test-ezra-customer-context.ts. Safe to ignore / delete.",
      gmailThreadId: (ARGS.thread as string) || undefined,
    });
  } else {
    console.log("⊘ skipped — pass --escalate-live to actually post a card to Telegram thread 614");
  }

  console.log("\n✓ done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ fatal:", err);
    process.exit(1);
  });
