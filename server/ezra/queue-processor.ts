// Customer-query queue processor (reusable core).
//
// Extracted from scripts/process-sideline-queue.ts so the same logic powers
// both the CLI script (manual triage) and the cron HTTP endpoint
// (POST /api/cron/process-customer-queue). The script keeps its own
// pretty-print output; this module returns structured results.
//
// Flow per thread:
//   1. Pull the Gmail thread + find the most recent inbound message
//   2. Skip bounce/auto-reply/our-domain senders
//   3. Pre-fetch likely matches (Shopify by email/order#, internal by PO ref)
//   4. Hydrate Ezra prompt + run one chat turn
//   5. Ezra picks send_customer_reply / flag_for_escalation / draft_customer_reply
//   6. Apply sideline-auto-handled label, remove sideline-auto-queue
//
// Dry-run (default) does steps 1–4 but skips the Ezra call + label apply.

import {
  searchGmailMessages,
  getGmailThread,
  applyGmailLabels,
  isGmailConfigured,
} from "../gmail";
import { isShopifyAdminConfigured } from "../shopify-admin";
import { findTool } from "./tools";
import { getOrCreateConversation, runChatTurn } from "./index";

export const QUEUE_LABEL = "sideline-auto-queue";
export const HANDLED_LABEL = "sideline-auto-handled";
export const DEFAULT_QUERY = `label:${QUEUE_LABEL} -label:${HANDLED_LABEL}`;

const OUR_DOMAINS = ["sidelinenz.com", "kig.co.nz"];
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

export interface ProcessThreadResult {
  threadId: string;
  status: string;   // dry_run | skipped | send_customer_reply | flag_for_escalation | draft_customer_reply | no_action | error
  reason?: string;
  iterations?: number;
}

export interface ProcessQueueOptions {
  live?: boolean;          // false = dry-run (no Ezra call, no labels)
  query?: string;          // Gmail search; defaults to DEFAULT_QUERY
  threadId?: string;       // single-thread override
  limit?: number;          // max threads (default 5, max 25)
  log?: (line: string) => void; // optional logger; falls back to no-op
}

export interface ProcessQueueResult {
  scanned: number;
  results: ProcessThreadResult[];
  totals: Record<string, number>;
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

  const sorted = [...messages].sort((a, b) => b.internalDate - a.internalDate);
  const inbound = sorted.find((m) => !isFromUs(m.fromEmail));
  if (!inbound) return null;

  const newest = sorted[0];
  if (newest.id !== inbound.id) return null;

  if (isSkippableSender(inbound.fromEmail) || isSkippableSubject(inbound.subject)) {
    return { __skipReason: `noise:${isSkippableSender(inbound.fromEmail) ? "sender" : "subject"}`, threadId } as any;
  }

  const subject = inbound.subject || "";
  const body = inbound.body || "";
  const haystack = `${subject}\n${body}`;
  const poMatch = haystack.match(PO_REGEX)?.[0];
  const orderNumMatch = haystack.match(ORDER_NUM_REGEX)?.[0];
  const shopifyNumMatch = haystack.match(SHOPIFY_NUM_REGEX)?.[0];

  const lookupShopify = findTool("lookup_shopify_order");
  const getOrderStatus = findTool("get_order_status");
  const toolCtx = { userId: "sideline-queue", conversationId: "preview" };

  let shopifyByEmail: any = null;
  let shopifyByNumber: any = null;
  let internalByPo: any = null;
  let internalByOrderNum: any = null;

  if (isShopifyAdminConfigured() && lookupShopify) {
    try { shopifyByEmail = await lookupShopify.execute({ needle: inbound.fromEmail, extraMatches: 3 }, toolCtx); }
    catch (e) { shopifyByEmail = { error: (e as Error).message }; }
    if (shopifyNumMatch) {
      try { shopifyByNumber = await lookupShopify.execute({ needle: shopifyNumMatch }, toolCtx); }
      catch (e) { shopifyByNumber = { error: (e as Error).message }; }
    }
  }
  if (getOrderStatus) {
    if (poMatch) {
      try { internalByPo = await getOrderStatus.execute({ orderId: poMatch }, toolCtx); }
      catch (e) { internalByPo = { error: (e as Error).message }; }
    }
    if (orderNumMatch) {
      try { internalByOrderNum = await getOrderStatus.execute({ orderId: orderNumMatch }, toolCtx); }
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
    prefetched: { shopifyByEmail, shopifyByNumber, internalByPo, internalByOrderNum },
  };
}

function buildEzraInstruction(c: NonNullable<Awaited<ReturnType<typeof gatherContext>>>): string {
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

export async function processThread(threadId: string, opts: { live: boolean; log: (s: string) => void }): Promise<ProcessThreadResult> {
  const { live, log } = opts;
  const ctx = await gatherContext(threadId);
  if (!ctx) {
    log(`⊘ ${threadId} — no inbound, or our reply is newest`);
    return { threadId, status: "skipped", reason: "no_inbound_or_already_replied" };
  }
  if ((ctx as any).__skipReason) {
    const reason = (ctx as any).__skipReason as string;
    log(`⊘ ${threadId} — ${reason}`);
    if (live) await applyGmailLabels(threadId, { add: [HANDLED_LABEL] });
    return { threadId, status: "skipped", reason };
  }

  log(`→ ${threadId} from ${ctx.from.email} — "${ctx.subject.slice(0, 60)}"`);

  if (!live) {
    return { threadId, status: "dry_run" };
  }

  const conv = await getOrCreateConversation({
    userId: "sideline-queue",
    channel: "gmail",
    channelRef: threadId,
    scopeKind: "gmail-thread",
    scopeId: threadId,
  });
  const instruction = buildEzraInstruction(ctx);
  const result = await runChatTurn({
    conversationId: conv.id,
    userId: "sideline-queue",
    message: instruction,
  });

  await applyGmailLabels(threadId, {
    add: [HANDLED_LABEL],
    remove: [QUEUE_LABEL],
  });

  const lastAction = [...result.toolCalls].reverse().find((tc) =>
    ["send_customer_reply", "flag_for_escalation", "draft_customer_reply"].includes(tc.name),
  );
  return {
    threadId,
    status: lastAction?.name || "no_action",
    iterations: result.iterations,
  };
}

export async function processCustomerQueue(opts: ProcessQueueOptions = {}): Promise<ProcessQueueResult> {
  const log = opts.log || (() => {});
  if (!isGmailConfigured()) {
    throw new Error("Gmail not configured (GOOGLE_REFRESH_TOKEN / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing)");
  }
  const live = Boolean(opts.live);
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 25);

  let threadIds: string[] = [];
  if (opts.threadId) {
    threadIds = [opts.threadId];
  } else {
    const query = opts.query || DEFAULT_QUERY;
    log(`Gmail query: ${query} (limit ${limit})`);
    const refs = await searchGmailMessages(query, limit * 3);
    const seen = new Set<string>();
    for (const r of refs) {
      if (seen.has(r.threadId)) continue;
      seen.add(r.threadId);
      threadIds.push(r.threadId);
      if (threadIds.length >= limit) break;
    }
  }

  const results: ProcessThreadResult[] = [];
  for (const tid of threadIds) {
    try {
      const r = await processThread(tid, { live, log });
      results.push(r);
    } catch (err) {
      log(`✗ ${tid} — ${(err as Error).message}`);
      results.push({ threadId: tid, status: "error", reason: (err as Error).message });
    }
  }

  const totals = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  return { scanned: threadIds.length, results, totals };
}
