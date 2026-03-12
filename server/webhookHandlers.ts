// Stripe webhook handlers for Team Store e-commerce
import { getStripeSync } from './stripeClient';
import { db } from './db';
import { orders } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    // Validate payload is a Buffer
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    
    // Process with stripe-replit-sync first
    await sync.processWebhook(payload, signature);
    
    // Parse the event to handle order updates
    const event = JSON.parse(payload.toString());
    
    // Handle checkout completion
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Update order status to paid
      await db.update(orders)
        .set({ 
          status: 'paid',
          stripePaymentIntentId: session.payment_intent,
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
