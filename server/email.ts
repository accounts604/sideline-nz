// Pluggable email service interface
// Console stub for now — swap to Resend/SendGrid later.
// Supplier PO dispatch uses sendGmail directly (Gmail API on the KIG admin
// account) so replies land back in the orders@sidelinenz.com inbox.

import { sendGmail, isGmailConfigured } from "./gmail";
import { computeMilestones } from "@shared/po-milestones";

export interface EmailAttachment {
  filename: string;
  content: Buffer | string; // Buffer or base64 string
  contentType?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

export interface EmailService {
  send(payload: EmailPayload): Promise<{ success: boolean; messageId?: string }>;
}

// Console stub — logs emails to stdout
class ConsoleEmailService implements EmailService {
  async send(payload: EmailPayload) {
    const id = `console_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[EMAIL] To: ${payload.to}`);
    console.log(`[EMAIL] Subject: ${payload.subject}`);
    console.log(`[EMAIL] Body: ${payload.text}`);
    console.log(`[EMAIL] ID: ${id}`);
    return { success: true, messageId: id };
  }
}

// Resend HTTP API — keeps us SDK-free.
class ResendEmailService implements EmailService {
  constructor(private apiKey: string, private from: string) {}

  async send(payload: EmailPayload) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [payload.to],
        reply_to: payload.replyTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        attachments: payload.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
          content_type: a.contentType,
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[EMAIL] Resend ${res.status}: ${body.slice(0, 300)}`);
      return { success: false };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { success: true, messageId: json.id };
  }
}

// Factory — explicit EMAIL_PROVIDER wins; otherwise auto-pick Resend if its key is set.
function createEmailService(): EmailService {
  const provider = process.env.EMAIL_PROVIDER;
  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM || "Sideline NZ <hello@sidelinenz.com>";

  if (provider === "resend" || (!provider && resendKey)) {
    if (!resendKey) {
      console.warn("[EMAIL] EMAIL_PROVIDER=resend but RESEND_API_KEY missing — falling back to console");
      return new ConsoleEmailService();
    }
    return new ResendEmailService(resendKey, resendFrom);
  }

  // Future: case "sendgrid" etc.
  return new ConsoleEmailService();
}

export const emailService = createEmailService();

// ====== Pre-built email templates ======

export async function sendDesignApprovedEmail(to: string, orderNumber: string, label: string) {
  return emailService.send({
    to,
    subject: `Design Approved — ${orderNumber}`,
    text: `Your ${label} design for order ${orderNumber} has been approved. No further action needed for this file.`,
    html: `<p>Your <strong>${label}</strong> design for order <strong>${orderNumber}</strong> has been approved.</p><p>No further action needed for this file.</p>`,
  });
}

export async function sendDesignRejectedEmail(to: string, orderNumber: string, label: string, comment?: string) {
  const commentLine = comment ? `\n\nFeedback: ${comment}` : "";
  return emailService.send({
    to,
    subject: `Design Needs Revision — ${orderNumber}`,
    text: `Your ${label} design for order ${orderNumber} needs revision. Please log in to your portal to re-upload.${commentLine}`,
    html: `<p>Your <strong>${label}</strong> design for order <strong>${orderNumber}</strong> needs revision.</p>${comment ? `<p><em>Feedback: ${comment}</em></p>` : ""}<p>Please <a href="${process.env.BASE_URL || "https://sidelinenz.com"}/portal">log in to your portal</a> to re-upload.</p>`,
  });
}

export async function sendOrderShippedEmail(to: string, orderNumber: string) {
  return emailService.send({
    to,
    subject: `Order Shipped — ${orderNumber}`,
    text: `Your order ${orderNumber} has been shipped! You can track your order status in your portal.`,
    html: `<p>Your order <strong>${orderNumber}</strong> has been shipped!</p><p>You can track your order status in your <a href="${process.env.BASE_URL || "https://sidelinenz.com"}/portal">portal</a>.</p>`,
  });
}

export async function sendMockupApprovalRequest(
  to: string,
  orderNumber: string,
  link: string,
  clientName: string | null,
) {
  const greeting = clientName ? `Hi ${clientName},` : "Hi,";
  return emailService.send({
    to,
    subject: `Mockup ready for your approval — ${orderNumber}`,
    text: `${greeting}\n\nYour mockup for ${orderNumber} is ready. Review it and let us know if it's approved or if you'd like changes.\n\n${link}\n\nThis link expires in 14 days.`,
    html: `<p>${greeting}</p>
<p>Your mockup for <strong>${orderNumber}</strong> is ready. Review it and let us know if it's approved or if you'd like changes.</p>
<p><a href="${link}">Review your mockup</a></p>
<p><small>This link expires in 14 days.</small></p>`,
  });
}

export async function sendClientApprovalResult(
  to: string,
  orderNumber: string,
  decision: "approved" | "changes_requested",
  changesNotes: string | null,
) {
  const label = decision === "approved" ? "APPROVED" : "CHANGES REQUESTED";
  const subject = decision === "approved"
    ? `Client approved mockup — ${orderNumber}`
    : `Client requested changes — ${orderNumber}`;
  const notesBlock = changesNotes ? `\n\nClient notes:\n${changesNotes}` : "";
  return emailService.send({
    to,
    subject,
    text: `${label}: ${orderNumber}${notesBlock}\n\nCheck the admin order detail page for the full activity log.`,
    html: `<p><strong>${label}</strong>: ${orderNumber}</p>${changesNotes ? `<p><em>Client notes:</em> ${changesNotes}</p>` : ""}<p>Check the admin order detail page for the full activity log.</p>`,
  });
}

export const SIDELINE_ORDERS_FROM = "Sideline NZ Orders <orders@sidelinenz.com>";

export interface DispatchSupplierInput {
  to: string;
  cc?: string | string[];
  supplierName?: string | null;
  orderNumber: string;
  poReference?: string | null;
  accountName?: string | null;
  dueDate?: string | null;         // YYYY-MM-DD
  deliveryAddress?: string | null;
  driveFolderUrl?: string | null;
  supplierPortalUrl?: string;
  items?: Array<{
    productName: string;
    material?: string | null;
    brandingMethod?: string | null;
    quantity: number;
    productColors?: Array<{ hex: string; name?: string }> | null;
  }>;
}

/**
 * Rich Gmail dispatch to the supplier — replaces the old console stub for the
 * PO-raised flow. Includes line items, material + branding, delivery address,
 * Drive folder link, and the 35-day milestone schedule so the supplier has
 * every date they need to hit. From: orders@sidelinenz.com. Reply-To is the
 * same address so the thread lives in the orders@ inbox.
 */
export async function sendSupplierPoDispatchGmail(input: DispatchSupplierInput): Promise<string | null> {
  if (!isGmailConfigured()) {
    console.log("[email] Gmail not configured — would dispatch PO to", input.to);
    return null;
  }

  const portalUrl = input.supplierPortalUrl || `${process.env.BASE_URL || "https://sidelinenz.com"}/supplier`;
  const milestones = input.dueDate ? computeMilestones(input.dueDate) : null;

  const hi = input.supplierName ? `Hi ${input.supplierName},` : "Hi team,";
  const poLine = `<strong>${input.poReference || input.orderNumber}</strong>${input.accountName ? ` — ${input.accountName}` : ""}`;

  const itemsHtml = input.items && input.items.length
    ? `<table style="border-collapse:collapse;margin:12px 0;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="text-align:left;padding:8px;border:1px solid #ddd">Product</th>
            <th style="text-align:left;padding:8px;border:1px solid #ddd">Material</th>
            <th style="text-align:left;padding:8px;border:1px solid #ddd">Branding</th>
            <th style="text-align:left;padding:8px;border:1px solid #ddd">Colours</th>
            <th style="text-align:right;padding:8px;border:1px solid #ddd">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${input.items.map((it) => `
            <tr>
              <td style="padding:8px;border:1px solid #ddd">${it.productName}</td>
              <td style="padding:8px;border:1px solid #ddd">${it.material || "—"}</td>
              <td style="padding:8px;border:1px solid #ddd">${it.brandingMethod || "—"}</td>
              <td style="padding:8px;border:1px solid #ddd">${(it.productColors || []).map((c) => `${c.name || c.hex}`).join(", ") || "—"}</td>
              <td style="padding:8px;border:1px solid #ddd;text-align:right">${it.quantity}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : "";

  const milestonesHtml = milestones
    ? `<h3 style="margin:18px 0 6px;font-size:14px">35-Day Schedule</h3>
       <table style="border-collapse:collapse;margin:4px 0 12px;font-size:13px">
         ${milestones.map((m) => {
           const isShipDeadline = m.key === "ship_production";
           return `
           <tr style="${isShipDeadline ? "background:#fee2e2" : ""}">
             <td style="padding:4px 12px 4px 0;color:${isShipDeadline ? "#dc2626" : "#666"};font-weight:${isShipDeadline ? "700" : "400"}">Day ${m.dayNumber}</td>
             <td style="padding:4px 12px 4px 0;font-weight:${isShipDeadline ? "700" : "600"};color:${isShipDeadline ? "#dc2626" : "inherit"}">${m.label}${isShipDeadline ? " ← YOUR DEADLINE" : ""}</td>
             <td style="padding:4px 0;font-family:ui-monospace,Menlo,monospace;color:${isShipDeadline ? "#dc2626" : "inherit"};font-weight:${isShipDeadline ? "700" : "400"}">${m.date}</td>
           </tr>`;
         }).join("")}
       </table>`
    : "";

  // Avoid "PO PO-2026-..." — if reference already starts with PO, don't prefix again.
  const ref = input.poReference || input.orderNumber;
  const refLabel = /^PO[-\s]/i.test(ref) ? ref : `PO ${ref}`;
  // Supplier due date is Day 21 (Ship from Production), not the customer's Day 35.
  // Show both in the subject so the supplier knows their deadline at a glance.
  let shipDate = "";
  if (input.dueDate) {
    const ms = computeMilestones(input.dueDate);
    const ship = ms?.find((m) => m.key === "ship_production");
    shipDate = ship ? ship.date : input.dueDate;
  }
  const subject = `${refLabel}${input.accountName ? ` - ${input.accountName}` : ""}${shipDate ? ` - SHIP BY ${shipDate}` : ""}`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:640px">
      <p>${hi}</p>
      <p>A new production sheet has been raised. ${poLine}.</p>
      ${itemsHtml}
      ${input.deliveryAddress ? `<p><strong>Delivery:</strong><br/>${input.deliveryAddress.replace(/\n/g, "<br/>")}</p>` : ""}
      ${milestonesHtml}
      <p>
        ${input.driveFolderUrl ? `<a href="${input.driveFolderUrl}" style="display:inline-block;padding:10px 14px;background:#f97316;color:#fff;text-decoration:none;border-radius:6px;margin-right:8px">Open Drive Folder</a>` : ""}
        <a href="${portalUrl}" style="display:inline-block;padding:10px 14px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Supplier Portal</a>
      </p>
      <p style="color:#666;font-size:12px">Reply to this email if anything in the spec or dates needs to change before production starts.</p>
      <p style="color:#666;font-size:12px">— Sideline NZ</p>
    </div>`;

  // Self-cc the orders@ inbox so every thread stays searchable internally.
  const ccList = [
    ...(Array.isArray(input.cc) ? input.cc : input.cc ? [input.cc] : []),
    "orders@sidelinenz.com",
  ].filter((e, i, a) => !!e && a.indexOf(e) === i);

  return sendGmail({
    from: SIDELINE_ORDERS_FROM,
    to: input.to,
    cc: ccList,
    replyTo: "orders@sidelinenz.com",
    subject,
    html,
  });
}

export async function sendSupplierPoRaisedEmail(
  to: string,
  orderNumber: string,
  poReference: string | null,
  deliveryAddress: string | null,
) {
  const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
  const link = `${baseUrl}/supplier`;
  const refLine = poReference ? `\nRef: ${poReference}` : "";
  const addrLine = deliveryAddress ? `\nDelivery: ${deliveryAddress}` : "";
  return emailService.send({
    to,
    subject: `New Production Sheet — ${orderNumber}`,
    text: `A new production sheet has been raised to you.\n\nRef: ${orderNumber}${refLine}${addrLine}\n\nLog in to your supplier portal to download tech-pack files and mark progress: ${link}`,
    html: `<p>A new production sheet has been raised to you.</p>
<p><strong>Ref:</strong> ${orderNumber}${poReference ? `<br/><strong>PO:</strong> ${poReference}` : ""}${deliveryAddress ? `<br/><strong>Delivery:</strong> ${deliveryAddress}` : ""}</p>
<p><a href="${link}">Log in to your supplier portal</a> to download tech-pack files and mark progress.</p>`,
  });
}

export async function sendInviteEmail(to: string, inviteToken: string, teamName?: string) {
  const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
  const link = `${baseUrl}/accept-invite?token=${inviteToken}`;
  const greeting = teamName ? `You've been invited to join the Sideline NZ portal for ${teamName}.` : "You've been invited to join the Sideline NZ customer portal.";
  return emailService.send({
    to,
    subject: "You're Invited — Sideline NZ Portal",
    text: `${greeting}\n\nSet up your account: ${link}\n\nThis link expires in 7 days.`,
    html: `<p>${greeting}</p><p><a href="${link}">Set up your account</a></p><p><small>This link expires in 7 days.</small></p>`,
  });
}
