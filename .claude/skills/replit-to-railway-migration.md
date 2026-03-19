# Skill: Replit to Railway Migration

Migrate a full-stack Replit project (React/Vite + Express + PostgreSQL) to Railway.

---

## Pre-Flight Checklist

Before starting, gather:
- [ ] Replit project URL or local clone
- [ ] All environment variables from Replit Secrets
- [ ] Domain name (if custom)
- [ ] Database connection string (or plan to provision on Railway)
- [ ] Any external service API keys (Stripe, Shopify, CRM, etc.)

---

## Phase 1: Clone & Audit the Replit Project

### 1.1 Get the code locally
```bash
# If on Replit, push to GitHub first, then clone
git clone <repo-url> <project-name>
cd <project-name>
```

### 1.2 Audit the project structure
Identify:
- **Frontend framework**: React/Vite, Next.js, etc.
- **Backend framework**: Express, Fastify, etc.
- **Database**: PostgreSQL (Drizzle/Prisma), SQLite, etc.
- **File storage**: Replit Object Storage, Vercel Blob, S3, etc.
- **Build output**: Where client and server bundles go
- **Port binding**: How the server reads PORT (Replit uses PORT env var — Railway does too)

### 1.3 Check for Replit-specific dependencies
Look for and remove/replace:
- `@replit/agent` or `@replit/database` imports
- Replit Object Storage references → migrate to Vercel Blob, S3, or Railway volume
- `.replit` file (Replit run config) — not needed
- `replit.nix` (Nix packages for Replit) — replaced by `nixpacks.toml`
- Hardcoded `localhost` or Replit URLs in the code

```bash
# Search for Replit-specific code
grep -r "replit" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json"
grep -r "@replit" --include="*.ts" --include="*.tsx" --include="*.js"
```

---

## Phase 2: Configure Build Pipeline

### 2.1 Verify package.json scripts
Ensure these scripts exist and work:

```json
{
  "scripts": {
    "dev": "node server/index.ts",
    "build": "vite build && esbuild server/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs",
    "start": "NODE_ENV=production node dist/index.cjs",
    "check": "tsc --noEmit",
    "db:push": "drizzle-kit push"
  }
}
```

Key requirements:
- `build` must produce both client assets AND a bundled server
- `start` must run the production server (NOT a dev server)
- Server must read `PORT` from env (Railway injects this)

### 2.2 Verify server binds correctly
The Express server must:
- Listen on `process.env.PORT` (Railway assigns this dynamically)
- Bind to `0.0.0.0` (not `127.0.0.1` or `localhost`)
- Trust proxy (for secure cookies behind Railway's reverse proxy)

```typescript
// server/index.ts
const port = parseInt(process.env.PORT || "5001");
app.set("trust proxy", 1);

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
```

### 2.3 Verify static file serving
The server must serve the built client in production:

```typescript
// server/static.ts or in server/index.ts
import path from "path";
import express from "express";

export function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");

  app.use(express.static(distPath));

  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
```

### 2.4 Verify database connection handles production SSL
```typescript
// server/db.ts
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === "production" ? "require" : undefined,
  max: process.env.VERCEL ? 1 : 10, // connection pooling
});
```

---

## Phase 3: Add Railway Config Files

### 3.1 Create `railway.json`
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "nixpacksConfigPath": "nixpacks.toml"
  },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### 3.2 Create `nixpacks.toml`
```toml
[phases.setup]
nixPkgs = ["nodejs_22", "npm-10_x", "openssl"]

[phases.install]
cmds = ["npm install --force"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npm run start"
```

Add extra packages as needed:
- `ffmpeg` — if generating video
- `imagemagick` — if processing images
- `python3` — if using Python scripts
- `chromium` — if doing server-side rendering/screenshots

### 3.3 Add a health check endpoint
```typescript
// In your routes setup
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
```

---

## Phase 4: Database Migration

### Option A: Railway PostgreSQL (simplest)
1. In Railway dashboard → New Service → PostgreSQL
2. Copy the `DATABASE_URL` from the PostgreSQL service
3. Add it to your app's environment variables in Railway

### Option B: External PostgreSQL (Neon, Supabase, etc.)
1. Create a database on your provider
2. Copy the connection string
3. Add as `DATABASE_URL` in Railway env vars

### Push schema
```bash
# Run locally with the production DATABASE_URL
DATABASE_URL="postgresql://..." npx drizzle-kit push
```

Or add a migration command to your build pipeline if needed.

---

## Phase 5: Deploy to Railway

### 5.1 Create Railway project
1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub Repo
3. Select the repository

### 5.2 Set environment variables
In Railway dashboard → Variables, add ALL env vars:

**Always required:**
```
DATABASE_URL=postgresql://...
JWT_SECRET=<generate-a-strong-secret>
NODE_ENV=production
```

**Common integrations (add as applicable):**
```
# Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# File uploads
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Email
RESEND_API_KEY=re_...

# CRM
GHL_API_KEY=...
GHL_LOCATION_ID=...

# E-commerce
VITE_SHOPIFY_STORE_URL=...
VITE_SHOPIFY_TOKEN=...

# AI services
GEMINI_API_KEY=...
ELEVENLABS_API_KEY=...

# Site URL (for meta tags, emails, etc.)
BASE_URL=https://yourdomain.com
VITE_SITE_URL=https://yourdomain.com
```

**Tip:** Export all Replit Secrets first, then import into Railway.

### 5.3 Trigger deploy
Railway auto-deploys on push. Or manually trigger via dashboard.

### 5.4 Verify deployment
```bash
# Check health endpoint
curl https://your-app.up.railway.app/api/health

# Check logs in Railway dashboard for errors
```

---

## Phase 6: Post-Deploy Setup

### 6.1 Seed admin account (one-time)
```bash
# Run against live database
ADMIN_EMAIL="admin@yourdomain.com" \
ADMIN_PASSWORD="YourSecurePassword!" \
DATABASE_URL="postgresql://..." \
npx tsx scripts/seed-admin.ts
```

### 6.2 Configure custom domain
1. Railway dashboard → Settings → Domains
2. Add your custom domain (e.g., `yourdomain.com`)
3. Update DNS:
   - Add CNAME record pointing to Railway's domain
   - Railway auto-provisions SSL

### 6.3 Set up Stripe webhooks (if applicable)
1. Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/stripe/webhook`
3. Select events: `checkout.session.completed`, `payment_intent.succeeded`, etc.
4. Copy signing secret → set as `STRIPE_WEBHOOK_SECRET` in Railway

### 6.4 Update external service URLs
Update callback/webhook URLs in all external services:
- Stripe webhooks
- GoHighLevel/CRM webhooks
- Shopify app URLs
- OAuth redirect URLs
- Email service sender domains

---

## Troubleshooting

### Build fails
- Check `nixpacks.toml` has correct Node version
- Verify `npm install --force` resolves peer dependency conflicts
- Check for missing native dependencies (add to nixPkgs)

### Server won't start
- Confirm `PORT` env var is read (Railway injects it)
- Confirm binding to `0.0.0.0` not `localhost`
- Check Railway logs for missing env vars

### Database connection fails
- Verify `DATABASE_URL` is set in Railway
- Ensure SSL is enabled for production (`ssl: "require"`)
- Check connection pool size (10 for Railway, 1 for serverless)

### Static files not serving (blank page)
- Verify `dist/public/` exists after build
- Check the SPA fallback route sends `index.html`
- Ensure static middleware is registered AFTER API routes

### CORS / Cookie issues
- Enable `trust proxy` on Express
- Set cookie `sameSite: "lax"` and `secure: true` for production
- Verify `BASE_URL` matches the actual domain

---

## File Checklist

After migration, your repo should have:

```
├── railway.json          # Railway deploy config
├── nixpacks.toml         # Build phases + system packages
├── package.json          # build + start scripts
├── server/
│   ├── index.ts          # Binds to PORT, serves static in prod
│   ├── db.ts             # SSL-aware DB connection
│   └── static.ts         # SPA static file serving
├── client/               # Frontend source
├── shared/               # Shared types/schema
├── scripts/
│   └── seed-admin.ts     # One-time admin seeding
└── dist/                 # Build output (gitignored)
    ├── index.cjs         # Bundled server
    └── public/           # Client assets
```

---

## Quick Reference Commands

```bash
# Local dev
npm run dev

# Build for production
npm run build

# Test production locally
PORT=5001 NODE_ENV=production npm run start

# Push database schema
DATABASE_URL="postgresql://..." npx drizzle-kit push

# Seed admin
ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="secure" DATABASE_URL="..." npx tsx scripts/seed-admin.ts
```
