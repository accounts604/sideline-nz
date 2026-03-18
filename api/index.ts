// Vercel serverless function — wraps the Express app
// ALL imports are dynamic to catch module-level crashes
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

// Health/diagnostic endpoint — always works, no dependencies
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    node: process.version,
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      STRIPE_PUBLISHABLE_KEY: !!process.env.STRIPE_PUBLISHABLE_KEY,
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
      JWT_SECRET: !!process.env.JWT_SECRET,
      SHOPIFY_STORE_URL: !!process.env.SHOPIFY_STORE_URL,
      SHOPIFY_TOKEN: !!process.env.SHOPIFY_TOKEN,
    },
  });
});

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

// Register all API routes lazily using dynamic imports
let routesRegistered = false;
let registrationError: string | null = null;

async function ensureRoutes() {
  if (registrationError) {
    throw new Error(registrationError);
  }
  if (routesRegistered) return;

  try {
    // Dynamic import: catches module-level crashes
    const { WebhookHandlers } = await import("../server/webhookHandlers");

    // Stripe webhook route MUST be before json middleware,
    // but we already added json above. Re-add raw route at a specific path.
    // We need to insert this before the json parser, so we use a separate mini-app.
    const webhookApp = express();
    webhookApp.post(
      "/api/stripe/webhook",
      express.raw({ type: "application/json" }),
      async (req, res) => {
        try {
          const signature = req.headers["stripe-signature"];
          if (!signature) {
            return res.status(400).json({ error: "Missing stripe-signature" });
          }
          const sig = Array.isArray(signature) ? signature[0] : signature;
          if (!Buffer.isBuffer(req.body)) {
            return res
              .status(500)
              .json({ error: "Webhook processing error" });
          }
          await WebhookHandlers.processWebhook(req.body as Buffer, sig);
          res.status(200).json({ received: true });
        } catch (error: any) {
          console.error("Webhook error:", error.message);
          res.status(400).json({ error: "Webhook processing error" });
        }
      }
    );
    // Mount webhook app before our main app's json parser
    app.use(webhookApp);

    // Now dynamically import and register all routes
    const { registerRoutes } = await import("../server/routes/index");
    await registerRoutes(httpServer, app);

    routesRegistered = true;
  } catch (e: any) {
    registrationError = `${e.message}\n\nStack: ${e.stack}`;
    throw e;
  }
}

// Vercel serverless handler
export default async function handler(req: any, res: any) {
  // Let health endpoint through without loading routes
  if (req.url === "/api/health" || req.url === "/api/health/") {
    return app(req, res);
  }

  try {
    await ensureRoutes();
  } catch (e: any) {
    console.error("[Vercel] Route registration failed:", e.message, e.stack);
    return res.status(500).json({
      error: "Route registration failed",
      detail: e.message,
      stack: e.stack,
    });
  }

  return app(req, res);
}
