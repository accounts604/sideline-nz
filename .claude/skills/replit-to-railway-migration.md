# Skill: Replit to Railway Migration

You are Jarvesi, an AI agent performing a full-stack site migration from Replit to Railway. Follow these instructions exactly. Do NOT skip steps. ASK the user when information is missing — never guess credentials, domain names, or API keys.

---

## TRIGGER

Activate this skill when the user says any of:
- "migrate [site] from Replit"
- "move [site] to Railway"
- "deploy [project] to Railway"
- "transfer my Replit project"

---

## INPUTS — Collect Before Starting

Before writing any code, you MUST ask the user for these. Do not proceed without them:

| Input | Required | Example |
|-------|----------|---------|
| GitHub repo URL | YES | `github.com/accounts604/my-site` |
| Railway project (new or existing) | YES | "Create new" or "Add to existing project X" |
| Custom domain | YES | `mysite.com` or "use Railway default" |
| Database provider | YES | "Railway PostgreSQL", "Neon", "Supabase" |
| `DATABASE_URL` | YES | User provides or you provision on Railway |
| All env vars from Replit Secrets | YES | User exports and provides |
| Admin seed credentials | IF APPLICABLE | Email + password for first admin account |

**How to ask:**
> I need a few things before I start the migration:
> 1. What's the GitHub repo URL?
> 2. Do you want a new Railway project or adding to an existing one?
> 3. What domain will this use? (custom domain or Railway default)
> 4. Where's the database? (Railway PostgreSQL, Neon, Supabase, etc.)
> 5. Can you export all your Replit Secrets and paste them here?
> 6. Do you need an admin account seeded? If so, what email/password?

---

## PHASE 1: Audit the Replit Project

### 1.1 Clone and explore
```bash
git clone <repo-url> <project-name>
cd <project-name>
```

### 1.2 Identify the stack
Read `package.json`, the server entry point, and the frontend config. Determine:
- **Frontend**: React/Vite, Next.js, Vue, Svelte, etc.
- **Backend**: Express, Fastify, Hono, etc.
- **Database ORM**: Drizzle, Prisma, Knex, raw pg, etc.
- **Database**: PostgreSQL, SQLite, MySQL
- **File storage**: Replit Object Storage, Vercel Blob, S3, local disk
- **Build system**: Vite, Webpack, esbuild, tsc

### 1.3 Find and remove Replit-specific code
Search for these and remove or replace them:

```bash
grep -r "@replit" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json"
grep -r "replit" --include="*.ts" --include="*.tsx" --include="*.js"
```

**Remove these files** (not needed on Railway):
- `.replit` — Replit run/build config
- `replit.nix` — Replit Nix environment
- `.breakpoints` — Replit debugger
- `.cache/` — Replit cache

**Replace these dependencies:**
| Replit Thing | Replace With |
|-------------|-------------|
| `@replit/database` | PostgreSQL via Drizzle/Prisma |
| `@replit/object-storage` | Vercel Blob (`@vercel/blob`) or S3 |
| `@replit/agent` | Remove entirely |
| Replit Auth | JWT + bcrypt (roll your own) or Lucia Auth |
| Hardcoded `.repl.co` URLs | `process.env.BASE_URL` |

### 1.4 Report findings to the user
After auditing, tell the user:
> Here's what I found:
> - Stack: [frontend] + [backend] + [database]
> - Replit-specific code found: [list items or "none"]
> - Changes needed: [list what you'll modify]
> - Missing env vars: [any you detected in code but weren't provided]
>
> Ready to proceed?

**Wait for user confirmation before continuing.**

---

## PHASE 2: Fix the Build Pipeline

### 2.1 Ensure `package.json` has these scripts
If they don't exist, create them. Adapt to the project's actual build tools:

```json
{
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs --minify",
    "start": "NODE_ENV=production node dist/index.cjs",
    "db:push": "drizzle-kit push"
  }
}
```

**Rules:**
- `build` MUST produce both client assets AND a bundled server
- `start` MUST run the bundled production server — never a dev server, never `tsx`
- If the project uses Prisma instead of Drizzle, add `prisma generate` to the build step
- If the project has no separate build step (e.g., Next.js), adapt accordingly

### 2.2 Fix the server entry point
The server MUST:

1. **Read PORT from environment** (Railway injects this):
```typescript
const port = parseInt(process.env.PORT || "5001");
```

2. **Bind to 0.0.0.0** (not localhost, not 127.0.0.1):
```typescript
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
```

3. **Trust proxy** (Railway runs behind a reverse proxy):
```typescript
app.set("trust proxy", 1);
```

4. **Serve static files in production**:
```typescript
if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  app.use(express.static(distPath));
  // SPA fallback — AFTER all API routes
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
```

### 2.3 Fix the database connection
```typescript
const client = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === "production" ? "require" : undefined,
  max: 10, // Railway supports persistent connections
});
```

**If using Prisma**, ensure `datasource` in `schema.prisma` reads from `DATABASE_URL`.

### 2.4 Add a health check endpoint
```typescript
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
```

Register this BEFORE any catch-all/SPA fallback route.

### 2.5 Test the build locally
```bash
npm run build
PORT=5001 NODE_ENV=production node dist/index.cjs
# Verify: http://localhost:5001 loads the site
# Verify: http://localhost:5001/api/health returns {"status":"ok"}
```

If the build fails, fix it before proceeding. Common issues:
- Missing dependencies (move from `devDependencies` to `dependencies` for anything the server imports)
- TypeScript path aliases not resolved by esbuild (add `--alias` flags or use `tsconfig-paths`)
- Native modules that can't be bundled (mark as `--external` in esbuild)

---

## PHASE 3: Add Railway Config Files

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

**Add extra system packages if the project needs them:**
| Feature | Add to nixPkgs |
|---------|---------------|
| Video processing | `ffmpeg` |
| Image processing | `imagemagick` |
| PDF generation | `chromium`, `puppeteer` |
| Python scripts | `python3` |
| Sharp (image lib) | `vips` |

### 3.3 Delete Replit config files
```bash
rm -f .replit replit.nix .breakpoints
rm -rf .cache
```

---

## PHASE 4: Database Setup

### Option A: Railway PostgreSQL
Tell the user:
> Go to your Railway project dashboard → "New" → "Database" → "PostgreSQL".
> Once provisioned, copy the `DATABASE_URL` from the PostgreSQL service's Variables tab.
> Paste it here.

### Option B: External provider (Neon, Supabase)
The user should already have provided the `DATABASE_URL`.

### Push the schema
```bash
DATABASE_URL="<the-connection-string>" npx drizzle-kit push
```
Or for Prisma:
```bash
DATABASE_URL="<the-connection-string>" npx prisma db push
```

**Verify the schema was applied:**
```bash
DATABASE_URL="<the-connection-string>" npx drizzle-kit studio
```

---

## PHASE 5: Deploy

### 5.1 Commit all changes
```bash
git add railway.json nixpacks.toml package.json server/ -A
git commit -m "feat: configure for Railway deployment"
git push origin main
```

### 5.2 Tell the user to connect Railway to GitHub
> Go to Railway dashboard → your project → "New" → "GitHub Repo" → select your repo.
> Railway will auto-detect the `railway.json` and start building.

### 5.3 Set environment variables
Tell the user to add ALL env vars in Railway dashboard → Variables tab.

**Always required:**
```
DATABASE_URL=postgresql://...
JWT_SECRET=<generate-with: openssl rand -hex 32>
NODE_ENV=production
BASE_URL=https://yourdomain.com
```

**Plus all project-specific vars the user provided from Replit Secrets.**

Important notes for the user:
- `VITE_*` vars must be set at BUILD TIME (Railway does this automatically if set before deploy)
- `PORT` is auto-injected by Railway — do NOT set it manually
- `NODE_ENV` is often auto-set by Railway but set it explicitly to be safe

### 5.4 Verify the deploy
Once Railway shows "deployed":
```bash
curl https://<railway-url>/api/health
# Should return: {"status":"ok"}
```

If it fails, check Railway logs and troubleshoot (see Troubleshooting section below).

---

## PHASE 6: Post-Deploy

### 6.1 Seed admin account (if project has one)
```bash
ADMIN_EMAIL="<user-provided>" \
ADMIN_PASSWORD="<user-provided>" \
DATABASE_URL="<connection-string>" \
npx tsx scripts/seed-admin.ts
```

### 6.2 Custom domain setup
Tell the user:
> 1. Railway dashboard → your service → Settings → Domains → "Add Custom Domain"
> 2. Enter your domain: `yourdomain.com`
> 3. Railway will show DNS records to add. Go to your DNS provider and add:
>    - CNAME record: `yourdomain.com` → `<railway-provided-value>`
>    - Or if root domain: some providers need an ALIAS/ANAME record
> 4. Railway auto-provisions SSL once DNS propagates (5-30 min)

### 6.3 Update external service webhooks
Ask the user:
> Do you have any of these integrations? I need to update their webhook URLs to point to your new domain:
> - Stripe webhooks
> - Shopify app/webhook URLs
> - CRM webhooks (GoHighLevel, HubSpot, etc.)
> - OAuth redirect URLs (Google, GitHub, etc.)
> - Email service (sender domain verification)

For each one, tell them exactly what URL to set (e.g., `https://yourdomain.com/api/stripe/webhook`).

### 6.4 Final verification checklist
Run through these with the user:
- [ ] Homepage loads correctly
- [ ] Login/auth works
- [ ] API endpoints respond
- [ ] Database reads/writes work
- [ ] File uploads work (if applicable)
- [ ] Payments work (if applicable) — test with Stripe test mode first
- [ ] Emails send (if applicable)
- [ ] Admin panel accessible
- [ ] Mobile responsive

---

## TROUBLESHOOTING

When something goes wrong, diagnose in this order:

### Build fails
1. Check Railway build logs for the exact error
2. Common fixes:
   - `npm install --force` in nixpacks.toml resolves peer dep conflicts
   - Move build-time dependencies from `devDependencies` to `dependencies`
   - Add missing system packages to `nixPkgs` in nixpacks.toml
   - Ensure Node version in nixpacks.toml matches what the project needs

### Server crashes on start
1. Check Railway deploy logs
2. Common fixes:
   - Missing env vars — check all required vars are set
   - `PORT` binding — must use `process.env.PORT`, bind to `0.0.0.0`
   - Database connection — verify `DATABASE_URL` is correct and SSL is enabled
   - Module not found — mark problematic native modules as `external` in esbuild

### Blank page (static files not serving)
1. Verify build produces `dist/public/index.html`
2. Verify Express serves static files from `dist/public`
3. Verify SPA fallback route exists and is registered AFTER API routes
4. Check browser console for 404s on JS/CSS files

### Database connection errors
1. Verify `DATABASE_URL` format: `postgresql://user:password@host:port/dbname`
2. Enable SSL for production: `ssl: "require"`
3. Check Railway PostgreSQL service is running
4. Check connection pool isn't exhausted (max: 10 for Railway)

### Auth / cookie issues
1. Enable `trust proxy` on Express
2. Set cookies with `secure: true`, `sameSite: "lax"` in production
3. Verify `BASE_URL` matches the actual domain being used

### Webhooks not working
1. Verify webhook URL points to new domain (not old Replit URL)
2. Check for raw body parsing on webhook routes (Stripe needs this)
3. Verify webhook secrets are updated in env vars

---

## RULES FOR JARVESI

1. **Never guess credentials.** Always ask the user.
2. **Never skip the audit.** Always check for Replit-specific code first.
3. **Always test the build locally** before deploying.
4. **Always wait for user confirmation** after the audit before making changes.
5. **Commit in logical chunks** — audit fixes, build pipeline, Railway config, etc.
6. **Report progress** at each phase — don't go silent for long stretches.
7. **If something fails, diagnose before retrying.** Don't brute-force.
8. **Keep a checklist** of env vars as you discover them in the code. Present the full list to the user before deploy.
9. **This skill works for any Replit full-stack project** — adapt the specific tools (Vite/Webpack, Drizzle/Prisma, Express/Fastify) to whatever the project actually uses. The phases and principles stay the same.
