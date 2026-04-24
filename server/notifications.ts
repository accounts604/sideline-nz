// Centralized notification dispatch
// Creates DB notification + sends email + syncs GHL tags. Every external
// call is wrapped in tracked() so silent failures surface in the
// integration_events table instead of disappearing into stderr.

import { storage } from "./storage";
import { sendDesignApprovedEmail, sendDesignRejectedEmail, sendOrderShippedEmail } from "./email";
import { syncGhlTag } from "./ghl-sync";
import { tracked } from "./integration-events";

export async function notifyDesignApproved(opts: {
  userId: string;
  orderId: string;
  designFileId: string;
  label: string;
  orderNumber: string;
  customerEmail?: string | null;
}) {
  // DB notification
  await storage.createNotification({
    userId: opts.userId,
    type: "design_approved",
    title: "Design Approved",
    message: `Your ${opts.label} design has been approved.`,
    orderId: opts.orderId,
    designFileId: opts.designFileId,
  });

  // Email
  if (opts.customerEmail) {
    await tracked(
      { system: "resend", action: "sendDesignApprovedEmail", orderId: opts.orderId, userId: opts.userId, context: { label: opts.label } },
      () => sendDesignApprovedEmail(opts.customerEmail!, opts.orderNumber, opts.label),
    );
  }

  // GHL tag
  if (opts.customerEmail) {
    await tracked(
      { system: "ghl", action: "syncTag:DesignApproved", orderId: opts.orderId, userId: opts.userId },
      () => syncGhlTag(opts.customerEmail!, "Design Approved"),
    );
  }
}

export async function notifyDesignRejected(opts: {
  userId: string;
  orderId: string;
  designFileId: string;
  label: string;
  orderNumber: string;
  customerEmail?: string | null;
  comment?: string;
}) {
  // DB notification
  await storage.createNotification({
    userId: opts.userId,
    type: "design_rejected",
    title: "Design Needs Revision",
    message: opts.comment || `Your ${opts.label} design needs revision.`,
    orderId: opts.orderId,
    designFileId: opts.designFileId,
  });

  // Email
  if (opts.customerEmail) {
    await tracked(
      { system: "resend", action: "sendDesignRejectedEmail", orderId: opts.orderId, userId: opts.userId, context: { label: opts.label } },
      () => sendDesignRejectedEmail(opts.customerEmail!, opts.orderNumber, opts.label, opts.comment),
    );
  }
}

export async function notifyOrderShipped(opts: {
  userId: string;
  orderId: string;
  orderNumber: string;
  customerEmail?: string | null;
}) {
  // DB notification
  await storage.createNotification({
    userId: opts.userId,
    type: "order_shipped",
    title: "Order Shipped",
    message: `Your order ${opts.orderNumber} has been shipped!`,
    orderId: opts.orderId,
  });

  // Email
  if (opts.customerEmail) {
    await tracked(
      { system: "resend", action: "sendOrderShippedEmail", orderId: opts.orderId, userId: opts.userId },
      () => sendOrderShippedEmail(opts.customerEmail!, opts.orderNumber),
    );
  }

  // GHL tag
  if (opts.customerEmail) {
    await tracked(
      { system: "ghl", action: "syncTag:OrderShipped", orderId: opts.orderId, userId: opts.userId },
      () => syncGhlTag(opts.customerEmail!, "Order Shipped"),
    );
  }
}

export async function notifyOrderStatusChange(opts: {
  userId: string;
  orderId: string;
  orderNumber: string;
  newStatus: string;
  customerEmail?: string | null;
}) {
  // Only create DB notification for significant status changes
  const notifyStatuses = ["processing", "shipped", "delivered"];
  if (!notifyStatuses.includes(opts.newStatus)) return;

  if (opts.newStatus === "shipped") {
    return notifyOrderShipped(opts);
  }

  await storage.createNotification({
    userId: opts.userId,
    type: `order_${opts.newStatus}`,
    title: `Order ${opts.newStatus.charAt(0).toUpperCase() + opts.newStatus.slice(1)}`,
    message: `Your order ${opts.orderNumber} is now ${opts.newStatus}.`,
    orderId: opts.orderId,
  });
}

export async function notifyNewMessage(opts: {
  userId: string;
  orderId: string;
  orderNumber: string;
}) {
  await storage.createNotification({
    userId: opts.userId,
    type: "new_message",
    title: "New Message",
    message: `New message on order ${opts.orderNumber}`,
    orderId: opts.orderId,
  });
}

export async function notifyQcIssue(opts: {
  userId: string;
  orderId: string;
  orderNumber: string;
  checkType: string;
}) {
  await storage.createNotification({
    userId: opts.userId,
    type: "qc_issue",
    title: "Quality Check Issue",
    message: `A quality issue was found during ${opts.checkType.replace(/_/g, " ")} on order ${opts.orderNumber}. Our team is working on it.`,
    orderId: opts.orderId,
  });
}
