// Stripe webhook handlers for Team Store e-commerce
import { getStripeClient, getStripeWebhookSecret } from './stripeClient';
import { db } from './db';
import { orders } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();

    // Verify signature and construct event
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    // Handle checkout completion
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      await db.update(orders)
        .set({
          status: 'paid',
          stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
          customerEmail: session.customer_details?.email,
          customerName: session.customer_details?.name,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.stripeCheckoutSessionId, session.id));

      console.log(`Order paid: ${session.id}`);
    }

    // Handle payment intent succeeded (backup)
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;

      await db.update(orders)
        .set({
          status: 'paid',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.stripePaymentIntentId, paymentIntent.id));
    }
  }
}
