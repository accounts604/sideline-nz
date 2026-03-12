// Centralized notification dispatch
// Creates DB notification + sends email + syncs GHL tags

import { storage } from "./storage";
import { sendDesignApprovedEmail, sendDesignRejectedEmail, sendOrderShippedEmail } from "./email";
import { syncGhlTag } from "./ghl-sync";

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
    await sendDesignApprovedEmail(opts.customerEmail, opts.orderNumber, opts.label).catch(err =>
      console.error("Failed to send design approved email:", err)
    );
  }

  // GHL tag
  if (opts.customerEmail) {
    await syncGhlTag(opts.customerEmail, "Design Approved").catch(err =>
      console.error("Failed to sync GHL tag:", err)
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
    await sendDesignRejectedEmail(opts.customerEmail, opts.orderNumber, opts.label, opts.comment).catch(err =>
      console.error("Failed to send design rejected email:", err)
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
    await sendOrderShippedEmail(opts.customerEmail, opts.orderNumber).catch(err =>
      console.error("Failed to send order shipped email:", err)
    );
  }

  // GHL tag
  if (opts.customerEmail) {
    await syncGhlTag(opts.customerEmail, "Order Shipped").catch(err =>
      console.error("Failed to sync GHL tag:", err)
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
