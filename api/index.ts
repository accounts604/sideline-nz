// Vercel serverless function — wraps the Express app
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";

console.log("[Vercel] Serverless function module loading...");

let app: ReturnType<typeof express>;
let httpServer: ReturnType<typeof createServer>;
let initError: string | null = null;

try {
  app = express();
  httpServer = createServer(app);

  // Stripe webhook route MUST be registered BEFORE express.json()
  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        const { WebhookHandlers } = await import("../server/webhookHandlers");
        const signature = req.headers['stripe-signature'];
        if (!signature) {
          return res.status(400).json({ error: 'Missing stripe-signature' });
        }
        const sig = Array.isArray(signature) ? signature[0] : signature;
        if (!Buffer.isBuffer(req.body)) {
          return res.status(500).json({ error: 'Webhook processing error' });
        }
        await WebhookHandlers.processWebhook(req.body as Buffer, sig);
        res.status(200).json({ received: true });
      } catch (error: any) {
        console.error('Webhook error:', error.message);
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("[Vercel] Express error:", message);
    res.status(status).json({ message });
  });

  console.log("[Vercel] Express app initialized successfully");
} catch (e: any) {
  console.error("[Vercel] FATAL: Failed to initialize Express app:", e.message, e.stack);
  initError = e.message;
}

// Register all API routes (lazy)
let routesRegistered = false;
async function ensureRoutes() {
  if (!routesRegistered) {
    console.log("[Vercel] Registering routes...");
    const { registerRoutes } = await import("../server/routes/index");
    await registerRoutes(httpServer, app);
    routesRegistered = true;
    console.log("[Vercel] Routes registered successfully");
  }
}

// Vercel serverless handler
export default async function handler(req: any, res: any) {
  // If initialization failed, return the error
  if (initError) {
    return res.status(500).json({
      error: "Serverless function initialization failed",
      detail: initError,
    });
  }

  try {
    await ensureRoutes();
  } catch (e: any) {
    console.error("[Vercel] FATAL: Route registration failed:", e.message, e.stack);
    return res.status(500).json({
      error: "Route registration failed",
      detail: e.message,
      stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
    });
  }

  return app(req, res);
}
