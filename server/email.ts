// Pluggable email service interface
// Console stub for now — swap to Resend/SendGrid later

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
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

// Factory — reads EMAIL_PROVIDER env var (future: "resend", "sendgrid")
function createEmailService(): EmailService {
  const provider = process.env.EMAIL_PROVIDER;

  switch (provider) {
    // Future providers go here:
    // case "resend": return new ResendEmailService();
    // case "sendgrid": return new SendGridEmailService();
    default:
      return new ConsoleEmailService();
  }
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
