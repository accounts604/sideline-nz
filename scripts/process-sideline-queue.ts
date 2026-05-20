// Sideline customer-query queue processor.
//
// One-shot script. Reads Gmail for unhandled customer queries, hydrates
// context (Shopify order match by sender email, internal order by PO ref
// in subject/body), spawns an Ezra turn, lets Ezra decide which tool to
// call (send_customer_reply / flag_for_escalation / draft_customer_reply),
// then applies the `sideline-auto-handled` label to mark the thread done.
//
// Dry-run by default (safe to invoke any time). Pass --live to actually
// call Ezra and let the tool side-effects happen.
//
// Run:
//   npx tsx scripts/process-sideline-queue.ts                 # dry-run, default query
//   npx tsx scripts/process-sideline-queue.ts --live          # actually act
//   npx tsx scripts/process-sideline-queue.ts --thread <id>   # one specific thread
//   npx tsx scripts/process-sideline-queue.ts --query "..."   # custom Gmail search
//   npx tsx scripts/process-sideline-queue.ts --limit 1
//
// Queue convention (label-based, applied by a Gmail filter or manually):
//   `sideline-auto-queue` — apply to inbound customer threads you want
//                           Ezra to handle
//   `sideline-auto-handled` — applied by this script after processing;
//                             threads with this label are excluded from
//                             the default query so we don't double-handle
//
// Until the filter is configured, the default search is broad
// (`to:orders@sidelinenz.com newer_than:7d -label:sideline-auto-handled`)
// which lets us test against real history; in production wire it tighter.

import "dotenv/config";
import {
  searchGmailMessages,
  getGmailThread,
  applyGmailLabels,
  isGmailConfigured,
} from "../server/gmail";
import { fetchShopifyOrderByNumberOrEmail, isShopifyAdminConfigured } from "../server/shopify-admin";
import { findTool } from "../server/ezra/tools";
import { getOrCreateConversation, runChatTurn } from "../server/ezra";

const QUEUE_LABEL = "sideline-auto-queue";
const HANDLED_LABEL = "sideline-auto-handled";
// Default queue is label-based on purpose: marketing/transactional/receipt
// emails land in the same inbox, so a pure to:orders@ query is unsafe —
// Ezra would happily try to reply to Canva marketing or DHL receipts. The
// human (or a Gmail filter) decides what enters the queue by applying
// `sideline-auto-queue`. Override with --query when testing against history.
const DEFAULT_QUERY = `label:${QUEUE_LABEL} -label:${HANDLED_LABEL}`;
const OUR_DOMAINS = ["sidelinenz.com", "kig.co.nz"]; // sender on these = us; skip
const SKIP_SENDER_PATTERNS = [
  /^mailer-daemon@/i, /^postmaster@/i, /^noreply@/i, /^no-?reply@/i, /^donotreply@/i,
  /@bounces\./i, /@mailer-daemon\./i,
];
const SKIP_SUBJECT_PATTERNS = [
  /delivery status notification/i, /undeliverable/i, /undelivered mail/i,
  /out of office/i, /automatic reply/i, /vacation responder/i,
];
const PO_REGEX = /\bPO-\d{4}-\d{4}\b/;
const ORDER_NUM_REGEX = /\bSL-\d{4}-[A-Z0-9]{2,4}-\d{2,4}\b/;
const SHOPIFY_NUM_REGEX = /#\d{3,6}\b/;

function parseArgs(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const ARGS = parseArgs();
const LIVE = Boolean(ARGS.live);

function banner(s: string) {
  console.log("\n" + "═".repeat(60));
  console.log("══ " + s);
  console.log("═".repeat(60));
}

function preview(s: string, max = 400): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… (truncated, ${s.length} chars)`;
}

function isFromUs(fromEmail: string): boolean {
  const lower = (fromEmail || "").toLowerCase();
  return OUR_DOMAINS.some((d) => lower.endsWith("@" + d) || lower.endsWith("." + d));
}

function isSkippableSender(fromEmail: string): boolean {
  const lower = (fromEmail || "").toLowerCase();
  return SKIP_SENDER_PATTERNS.some((re) => re.test(lower));
}

function isSkippableSubject(subject: string): boolean {
  return SKIP_SUBJECT_PATTERNS.some((re) => re.test(subject || ""));
}

async function gatherContext(threadId: string) {
  const messages = await getGmailThread(threadId);
  if (messages.length === 0) return null;

  // Find the most recent inbound (not from us). That's the message we're
  // responding to. Iterate from newest to oldest.
  const sorted = [...messages].sort((a, b) => b.internalDate - a.internalDate);
  const inbound = sorted.find((m) => !isFromUs(m.fromEmail));
  if (!inbound) return null; // entire thread is outbound — nothing to respond to

  // Latest activity: if our reply came AFTER the inbound, we've already
  // handled it. Skip.
  const newest = sorted[0];
  if (newest.id !== inbound.id) return null;

  // Drop bounce notifications, auto-replies, vacation responders, etc.
  // These shouldn't go through Ezra — we'd just try to "reply" to mailer-daemon.
  if (isSkippableSender(inbound.fromEmail) || isSkippableSubject(inbound.subject)) {
    return { __skipReason: `noise:${isSkippableSender(inbound.fromEmail) ? "sender" : "subject"}`, threadId } as any;
  }

  const subject = inbound.subject || "";
  const body = inbound.body || "";
  const haystack = `${subject}\n${body}`;
  const poMatch = haystack.match(PO_REGEX)?.[0];
  const orderNumMatch = haystack.match(ORDER_NUM_REGEX)?.[0];
  const shopifyNumMatch = haystack.match(SHOPIFY_NUM_REGEX)?.[0];

  // Pre-fetch likely matches so Ezra starts with hydrated context.
  const lookupShopify = findTool("lookup_shopify_order");
  const getOrderStatus = findTool("get_order_status");
  const ctx = { userId: "sideline-queue", conversationId: "preview" };

  let shopifyByEmail: any = null;
  let shopifyByNumber: any = null;
  let internalByPo: any = null;
  let internalByOrderNum: any = null;

  if (isShopifyAdminConfigured() && lookupShopify) {
    try {
      shopifyByEmail = await lookupShopify.execute({ needle: inbound.fromEmail, extraMatches: 3 }, ctx);
    } catch (e) { shopifyByEmail = { error: (e as Error).message }; }
    if (shopifyNumMatch) {
      try {
        shopifyByNumber = await lookupShopify.execute({ needle: shopifyNumMatch }, ctx);
      } catch (e) { shopifyByNumber = { error: (e as Error).message }; }
    }
  }
  if (getOrderStatus) {
    if (poMatch) {
      try { internalByPo = await getOrderStatus.execute({ orderId: poMatch }, ctx); }
      catch (e) { internalByPo = { error: (e as Error).message }; }
    }
    if (orderNumMatch) {
      try { internalByOrderNum = await getOrderStatus.execute({ orderId: orderNumMatch }, ctx); }
      catch (e) { internalByOrderNum = { error: (e as Error).message }; }
    }
  }

  return {
    threadId,
    inboundMessageId: inbound.id,
    from: { name: inbound.fromName, email: inbound.fromEmail },
    subject,
    body,
    threadLength: messages.length,
    poRefDetected: poMatch || null,
    orderNumberDetected: orderNumMatch || null,
    shopifyNumberDetected: shopifyNumMatch || null,
    prefetched: {
      shopifyByEmail,
      shopifyByNumber,
      internalByPo,
      internalByOrderNum,
    },
  };
}

function buildEzraInstruction(c: NonNullable<Awaited<ReturnType<typeof gatherContext>>>): string {
  // Hydrated prompt — gives Ezra all the context up-front so it can decide
  // in one model turn instead of a long tool-call chain. Ezra still has the
  // tools available if it wants to fetch more, but typically it'll just
  // classify + compose + call exactly one action tool.
  const lines: string[] = [
    "A customer email arrived in orders@sidelinenz.com. Decide whether to:",
    "  (a) AUTO-SEND a reply — only for plain status queries with an unambiguous order match and a real status signal. Use send_customer_reply.",
    "  (b) ESCALATE to a human — anything refund/cancel/complaint/wrong/missing/manager/legal-flavoured, or anything where you don't have enough info. Use flag_for_escalation.",
    "  (c) DRAFT for human review — anything else (product/sizing questions, custom design enquiries, ambiguous match). Use draft_customer_reply.",
    "",
    "If you call send_customer_reply you MUST pass the threadId so the reply attaches inline. Use the threadId below.",
    "",
    `Thread id: ${c.threadId}`,
    `From: ${c.from.name ? c.from.name + " " : ""}<${c.from.email}>`,
    `Subject: ${c.subject}`,
    `Thread depth: ${c.threadLength} message(s)`,
    "",
    "── Pre-fetched context (already looked up for you) ──",
    JSON.stringify(c.prefetched, null, 2),
    "",
    "── Customer's most recent message ──",
    c.body.length > 4000 ? c.body.slice(0, 4000) + "\n… (truncated)" : c.body,
    "",
    "Decide and act. One tool call. Don't ask me clarifying questions — make the call based on what you have.",
  ];
  return lines.join("\n");
}

async function processThread(threadId: string) {
  banner(`Thread ${threadId}`);
  const ctx = await gatherContext(threadId);
  if (!ctx) {
    console.log("⊘ skip — no inbound message, or our reply is already the newest");
    return { threadId, status: "skipped", reason: "no_inbound_or_already_replied" };
  }
  if ((ctx as any).__skipReason) {
    const reason = (ctx as any).__skipReason as string;
    console.log(`⊘ skip — ${reason}`);
    // Label these so they don't show up again next run. Still LIVE-gated so
    // dry-run never mutates Gmail state.
    if (LIVE) await applyGmailLabels(threadId, { add: [HANDLED_LABEL] });
    return { threadId, status: "skipped", reason };
  }

  console.log(`From: ${ctx.from.name} <${ctx.from.email}>`);
  console.log(`Subject: ${ctx.subject}`);
  console.log(`Detected refs: po=${ctx.poRefDetected || "—"}, order#=${ctx.orderNumberDetected || "—"}, shopify=${ctx.shopifyNumberDetected || "—"}`);
  console.log(`Body preview:\n  ${preview(ctx.body, 240).replace(/\n/g, "\n  ")}`);
  console.log("\nPre-fetch summary:");
  console.log(`  shopifyByEmail.primary: ${ctx.prefetched.shopifyByEmail?.primary ? `${ctx.prefetched.shopifyByEmail.primary.name} (${ctx.prefetched.shopifyByEmail.primary.fulfillmentStatus})` : "—"}`);
  console.log(`  shopifyByNumber.primary: ${ctx.prefetched.shopifyByNumber?.primary ? `${ctx.prefetched.shopifyByNumber.primary.name}` : "—"}`);
  console.log(`  internalByPo: ${ctx.prefetched.internalByPo && !ctx.prefetched.internalByPo.error ? `${ctx.prefetched.internalByPo.poReference} (${ctx.prefetched.internalByPo.customerStage})` : "—"}`);
  console.log(`  internalByOrderNum: ${ctx.prefetched.internalByOrderNum && !ctx.prefetched.internalByOrderNum.error ? ctx.prefetched.internalByOrderNum.poReference : "—"}`);

  if (!LIVE) {
    console.log("\n[dry-run] would now call Ezra with the hydrated instruction; pass --live to do it.");
    return { threadId, status: "dry_run" };
  }

  // Live: spawn an Ezra turn against the per-thread conversation.
  const conv = await getOrCreateConversation({
    userId: "sideline-queue",
    channel: "gmail",
    channelRef: threadId,
    scopeKind: "gmail-thread",
    scopeId: threadId,
  });
  const instruction = buildEzraInstruction(ctx);
  console.log(`\n→ runChatTurn(conversation=${conv.id}, model=${process.env.AI_PROVIDER || "gemini"})`);
  const result = await runChatTurn({
    conversationId: conv.id,
    userId: "sideline-queue",
    message: instruction,
  });

  console.log(`Iterations: ${result.iterations}, tokens in/out: ${result.usage.inputTokens || "?"}/${result.usage.outputTokens || "?"}`);
  console.log(`Tool calls (${result.toolCalls.length}):`);
  for (const tc of result.toolCalls) {
    console.log(`  • ${tc.name}(${preview(JSON.stringify(tc.args), 120)})`);
    console.log(`    → ${preview(JSON.stringify(tc.result), 200)}`);
  }
  console.log(`Final assistant text: ${preview(result.assistantText, 240)}`);

  // Apply handled label + remove queue label so the thread doesn't get
  // reprocessed next run. If the customer replies again, Romero (or the
  // Gmail filter) re-applies sideline-auto-queue → it re-enters the queue.
  const labelled = await applyGmailLabels(threadId, {
    add: [HANDLED_LABEL],
    remove: [QUEUE_LABEL],
  });
  console.log(labelled ? `✓ labelled ${HANDLED_LABEL} (removed ${QUEUE_LABEL})` : `✗ label modify failed`);

  // Classify outcome from the tool calls Ezra actually made.
  const lastAction = [...result.toolCalls].reverse().find((tc) =>
    ["send_customer_reply", "flag_for_escalation", "draft_customer_reply"].includes(tc.name),
  );
  return {
    threadId,
    status: lastAction?.name || "no_action",
    iterations: result.iterations,
  };
}

async function main() {
  banner("ENV");
  console.log("LIVE mode:           ", LIVE ? "✓ ACTING" : "○ dry-run");
  console.log("GOOGLE_REFRESH_TOKEN:", process.env.GOOGLE_REFRESH_TOKEN ? "✓ set" : "✗ MISSING (cannot read Gmail)");
  console.log("SHOPIFY_ADMIN_TOKEN: ", process.env.SHOPIFY_ADMIN_TOKEN ? "✓ set" : "○ missing (Shopify lookups will skip)");
  console.log("GEMINI_API_KEY:      ", process.env.GEMINI_API_KEY ? "✓ set" : (LIVE ? "✗ MISSING — runChatTurn will throw in --live" : "○ missing (not needed in dry-run)"));
  console.log("DATABASE_URL:        ", process.env.DATABASE_URL ? "✓ set" : "✗ MISSING");
  if (!isGmailConfigured()) {
    console.error("\n✗ Gmail not configured. Aborting.");
    process.exit(1);
  }

  // Resolve target threads
  let threadIds: string[] = [];
  if (typeof ARGS.thread === "string") {
    threadIds = [ARGS.thread];
  } else {
    const query = (ARGS.query as string) || DEFAULT_QUERY;
    const limit = Math.min(parseInt((ARGS.limit as string) || "5", 10) || 5, 25);
    console.log(`\nGmail query: ${query}`);
    console.log(`Limit: ${limit}`);
    const refs = await searchGmailMessages(query, limit * 3); // overfetch — we'll dedupe to threads
    const seen = new Set<string>();
    for (const r of refs) {
      if (seen.has(r.threadId)) continue;
      seen.add(r.threadId);
      threadIds.push(r.threadId);
      if (threadIds.length >= limit) break;
    }
    console.log(`Found ${threadIds.length} unique thread(s) to consider.`);
  }

  if (threadIds.length === 0) {
    console.log("\n✓ Queue empty.");
    return;
  }

  const results: Array<{ threadId: string; status: string; iterations?: number; reason?: string }> = [];
  for (const tid of threadIds) {
    try {
      const r = await processThread(tid);
      results.push(r);
    } catch (err) {
      console.error(`\n✗ thread ${tid} failed:`, (err as Error).message);
      results.push({ threadId: tid, status: "error", reason: (err as Error).message });
    }
  }

  banner("SUMMARY");
  for (const r of results) console.log(`  ${r.threadId}  →  ${r.status}${r.reason ? "  (" + r.reason + ")" : ""}`);
  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  console.log(`\nTotals: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error("\n✗ fatal:", err); process.exit(1); });
