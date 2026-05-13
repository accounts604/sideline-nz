// Telegram dispatch — posts cards into the KIG Engine group, defaulting to
// the Sideline thread (ID 614). Used by the PO sample/bulk approval flow:
// raising a sample/bulk PO posts an approval card with Send / Edit / Hold
// buttons; tapping a button hits Telegram, the mission-control bridge
// catches the callback, and POSTs back to /po-decision on this server.
//
// Env (Railway and/or workspace/telegram/TOKENS.env):
//   JARVESI_BOT_TOKEN | JARVESI_TOKEN | TELEGRAM_BOT_TOKEN — bot token
//   KIG_GROUP_CHAT_ID | KIG_ENGINE_ROOM_ID  — group chat ID (-100…)
//   SIDELINE_THREAD_ID — message_thread_id, default 614
//
// If the bot token or chat ID isn't set the helpers log + no-op rather
// than throwing — the API call that triggered the post still succeeds.

const TG_API = "https://api.telegram.org";

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface SendCardOptions {
  text: string;
  buttons?: InlineButton[][]; // rows of buttons
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  threadId?: number; // override SIDELINE_THREAD_ID
  disableWebPagePreview?: boolean;
}

function botToken(): string | null {
  return (
    process.env.JARVESI_BOT_TOKEN ||
    process.env.JARVESI_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN ||
    null
  );
}

function groupChatId(): string | null {
  // KIG_ENGINE_ROOM_ID is the legacy name in workspace/telegram/TOKENS.env;
  // KIG_GROUP_CHAT_ID is the descriptive alias for new Railway deploys.
  return process.env.KIG_GROUP_CHAT_ID || process.env.KIG_ENGINE_ROOM_ID || null;
}

function defaultThreadId(): number {
  const t = process.env.SIDELINE_THREAD_ID;
  return t ? parseInt(t, 10) : 614;
}

export function isTelegramConfigured(): boolean {
  return Boolean(botToken() && groupChatId());
}

export async function sendTelegramCard(opts: SendCardOptions): Promise<{
  ok: boolean;
  messageId?: number;
  reason?: string;
}> {
  const token = botToken();
  const chatId = groupChatId();
  if (!token || !chatId) {
    console.warn("[telegram] missing JARVESI_BOT_TOKEN or KIG_GROUP_CHAT_ID — skipping post");
    return { ok: false, reason: "not_configured" };
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_thread_id: opts.threadId ?? defaultThreadId(),
    text: opts.text,
    parse_mode: opts.parseMode ?? "HTML",
    disable_web_page_preview: opts.disableWebPagePreview ?? true,
  };
  if (opts.buttons && opts.buttons.length) {
    payload.reply_markup = { inline_keyboard: opts.buttons };
  }

  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json();
    if (!json.ok) {
      console.error("[telegram] sendMessage failed:", json.description || json);
      return { ok: false, reason: json.description || "api_error" };
    }
    return { ok: true, messageId: json.result?.message_id };
  } catch (err: any) {
    console.error("[telegram] sendMessage threw:", err?.message || err);
    return { ok: false, reason: err?.message || "fetch_error" };
  }
}

// PO approval card builder — used for both sample + bulk POs. Three buttons:
// Send (dispatches Gmail to supplier), Edit (no-op; admin tweaks in UI then
// re-taps Send), Hold (sets po_held_at and pauses the flow until manually
// resumed).
export function buildPoApprovalCard(input: {
  orderId: string;
  poReference: string;
  poKind: "sample" | "bulk";
  accountName: string | null;
  supplierName: string | null;
  itemSummary: string; // e.g. "5 lines • qty 5 (sample)" or "5 lines • qty 350 (bulk)"
  totalNzd: number; // dollars
  driveFolderUrl: string | null;
  pdfUrl: string | null;
  parentSampleRef?: string | null; // shown on bulk cards only
}): SendCardOptions {
  const kindLabel = input.poKind === "sample" ? "🧪 Sample PO" : "📦 Bulk PO";
  const lines: string[] = [
    `<b>${kindLabel}</b> — ${esc(input.poReference)}`,
    input.accountName ? `Client: ${esc(input.accountName)}` : "",
    input.supplierName ? `Supplier: ${esc(input.supplierName)}` : "Supplier: <i>not assigned</i>",
    input.parentSampleRef ? `Sample: ${esc(input.parentSampleRef)}` : "",
    input.itemSummary,
    `Total: $${input.totalNzd.toFixed(2)} NZD`,
  ].filter(Boolean);

  const linkLine: string[] = [];
  if (input.pdfUrl) linkLine.push(`<a href="${input.pdfUrl}">📄 PO PDF</a>`);
  if (input.driveFolderUrl) linkLine.push(`<a href="${input.driveFolderUrl}">📁 Drive folder</a>`);
  if (linkLine.length) lines.push(linkLine.join(" • "));

  return {
    text: lines.join("\n"),
    buttons: [
      [
        { text: "✅ Send", callback_data: `po_send_${input.orderId}` },
        { text: "✏️ Edit", callback_data: `po_edit_${input.orderId}` },
        { text: "⏸️ Hold", callback_data: `po_hold_${input.orderId}` },
      ],
    ],
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
