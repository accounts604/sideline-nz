import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes/index";
import { sendTelegramCard } from "./telegram";
import { serveStatic } from "./static";
import { createServer } from "http";
import { WebhookHandlers } from "./webhookHandlers";

const app = express();
app.set("trust proxy", 1); // Trust first proxy (needed for secure cookies behind proxy)
const httpServer = createServer(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Register Stripe webhook route BEFORE express.json()
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
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

// Shopify webhook routes — must use express.raw() so HMAC verification can
// hash the exact bytes Shopify sent. Mounted BEFORE express.json() for the
// same reason as the Stripe webhook above.
import shopifyWebhooksRouter from "./routes/webhooks/shopify-orders";
app.use("/api/webhooks/shopify", express.raw({ type: "application/json", limit: "5mb" }), shopifyWebhooksRouter);

// Pre-mount a larger JSON parser for the base64 image upload route. Has to
// run BEFORE the global express.json() — once a 100KB body fails parsing
// upstream, the route-scoped middleware never gets to retry with a higher
// limit. Same pattern as the Stripe webhook's express.raw() above.
app.use("/api/uploads/blob", express.json({ limit: "60mb" }));

// JSON middleware for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Ops alerting — throttled so a burst of the same fault doesn't spam Telegram.
// Fail-soft: no-op if JARVESI_BOT_TOKEN/KIG_GROUP_CHAT_ID aren't set yet.
const _alertThrottle = new Map<string, number>();
function alertOps(key: string, text: string) {
  const now = Date.now();
  if (now - (_alertThrottle.get(key) || 0) < 5 * 60 * 1000) return;
  _alertThrottle.set(key, now);
  sendTelegramCard({ text }).catch(() => {});
}

// Crash visibility: log + alert before the process dies (or stays up). Mirrors
// the handlers mission-control adopted — a stray fire-and-forget rejection used
// to kill the process silently with Railway giving up after its retries.
process.on("unhandledRejection", (reason: any) => {
  console.error("[unhandledRejection]", reason);
  alertOps("unhandledRejection", `⚠️ Sideline unhandledRejection\n${String(reason?.message || reason).slice(0, 300)}`);
});
process.on("uncaughtException", (err: any) => {
  console.error("[uncaughtException]", err);
  alertOps("uncaughtException", `🚨 Sideline uncaughtException — process exiting for restart\n${String(err?.message || err).slice(0, 300)}`);
  process.exit(1);
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const port = parseInt(process.env.PORT || "5001", 10);

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) res.status(status).json({ message });
    // 5xx => surface it: the worklist 500 was caught by a human, not the system.
    // (Do NOT re-throw — that ran after headers were sent and only produced noise.)
    if (status >= 500) {
      console.error(`[5xx] ${req.method} ${req.path}:`, err?.stack || message);
      alertOps(`5xx:${req.path}`, `🚨 Sideline 5xx\n${req.method} ${req.path}\n${message}`);
    }
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  log("all routes and static serving ready");
})();
