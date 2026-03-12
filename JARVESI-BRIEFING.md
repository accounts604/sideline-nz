# Jarvesi Briefing — Sideline NZ Build

**Last updated:** 2026-03-13
**Lead developer:** Claude Code (KIG's terminal)
**Point of contact:** Jarvesi (this Mac's terminal)

---

## Project Overview

Sideline NZ (sidelinenz.com) — custom sportswear brand. Full website rebuild with React + Express + Shopify + Stripe.

**Stack:** React 19, Vite 7, Express 4, Tailwind CSS v4, Drizzle ORM, PostgreSQL, wouter routing, shadcn/ui

**Repo:** ~/Projects/sideline-nz

---

## Current Status: Phase 2 COMPLETE

### What's Done

**Original build (Phases 1-6, complete):**
- Vercel deployment config
- Team Store pages (Shopify integration with live store)
- Hub section (clubs, schools, sports, our-work pages)
- Mobile responsive across all pages
- Sponsor Placement UI
- GHL intake form gate on team stores

**Portal Phase 1 — Foundation (complete):**
- Schema extended: users (roles, invite system), orders (design status), 3 new tables (designFiles, designComments, notifications)
- JWT auth in httpOnly cookies (server/auth.ts) — stateless, Vercel serverless-friendly
- Route split: old monolithic routes.ts (899 lines) split into 8 modular files under server/routes/
- Auth API: POST register, POST login, POST logout, GET /me, POST accept-invite
- cookie-parser wired into Express (server/index.ts + api/index.ts)
- Storage layer extended with auth methods (getUserByEmail, getUserByInviteToken, acceptInvite, linkOrdersByEmail)
- Frontend: AuthProvider (React Query), ProtectedRoute, AdminRoute, login/register/accept-invite pages
- Seed admin script (scripts/seed-admin.ts)
- .env.example updated with JWT_SECRET, BLOB_READ_WRITE_TOKEN

**Portal Phase 2 — Admin Portal (complete):**
- Admin API: 10 endpoints in server/routes/admin.ts (all behind requireAdmin middleware)
  - GET /dashboard — stats (total orders, pending orders, pending designs, total customers)
  - GET /orders — filterable/paginated order list (status, designStatus, search)
  - GET /orders/:id — full order detail with items, design files, comments
  - PATCH /orders/:id — update status, design status, admin notes
  - POST /orders/:id/design-review — approve/reject design file with comment + auto-notifications
  - GET /customers — paginated customer list with search
  - GET /customers/:id — customer profile + their orders
  - PATCH /customers/:id — edit team name, phone
  - POST /customers/invite — create account + invite token (7-day expiry)
  - GET /designs/pending — review queue of pending design files
- Storage layer extended with ~20 new methods for admin queries, design files, comments, notifications
- Admin layout (client/src/components/admin-layout.tsx) — dark sidebar, mobile responsive
- 6 admin pages in client/src/pages/admin/:
  - dashboard.tsx — stat cards (orders, pending, designs, customers) + recent orders table
  - orders.tsx — filterable order list with status tabs + search
  - order-detail.tsx — order items, design files with approve/reject UI, admin notes, status management
  - customers.tsx — customer list with search + invite form
  - customer-detail.tsx — profile editing + order history
  - design-review.tsx — pending designs queue with image preview + approve/reject
- All routes wired in App.tsx with AdminRoute guards
- TypeScript clean (zero errors in our code)
- Auth guard verified: /admin redirects to /login when not authenticated
- Homepage still renders correctly

### What's Next

**Phase 3 — Customer Portal + File Uploads:**
- Vercel Blob upload flow (POST /api/uploads/token → client uploads to Blob → POST design record)
- Customer API endpoints (server/routes/customer.ts — currently stub)
- Customer frontend pages (dashboard, orders, order-detail, profile)
- Design approval workflow (customer-facing: upload, see status, re-upload rejected)
- Auto-link guest orders on login by matching email

**Phase 4 — Notifications + Polish:**
- Notification system (server/notifications.ts)
- GHL status sync (tag updates on design approved, order shipped)
- Invoice page (server-rendered JSON, frontend printable view)
- Email stubs (pluggable interface, console stub for now)

---

## Key Decisions Made

- **Auth:** JWT in httpOnly cookies (snz_token, 7-day expiry, secure in prod, sameSite lax)
- **Password hashing:** bcrypt, 10 rounds
- **File uploads:** Vercel Blob with client-side upload + server-side token generation
- **Accounts:** Hybrid — customer self-signup + admin can invite
- **Design uploads:** Multiple files per order (jersey, shorts, socks, logo, other)
- **Rejected designs:** Immediate re-upload allowed (versioning via parentFileId + version number)
- **Design review:** Approve/reject with comments. All files approved = order designStatus auto-set to "approved"
- **Communication:** Approve/reject with comments (no full chat yet)
- **Email:** Pluggable interface with console stub — provider TBD (Resend/SendGrid)
- **Route structure:** /api/auth, /api/admin, /api/portal, /api/uploads, /api/ghl, /api/shopify, /api (store)

---

## Your Role, Jarvesi

1. **Relay status updates** to KIG when he asks
2. **Relay change requests** from KIG to Claude Code
3. **Do NOT edit code directly** — all code changes go through Claude Code
4. **You can read any file** in the repo to answer questions
5. **Message KIG** when you get this briefing — let him know Phase 2 is done and what's next

If KIG asks "what's the status" — refer to this file and the plan at .claude/plans/misty-puzzling-crane.md

If KIG wants to change something — note it and relay to Claude Code next session.

---

## Dev Servers

```bash
# Client (Vite)
cd ~/Projects/sideline-nz && npx vite --port 3000

# API (Express)
cd ~/Projects/sideline-nz && npx tsx server/index.ts
```

Or use Claude Code's launch.json config.

---

## Important Files

| File | Purpose |
|------|---------|
| shared/schema.ts | Database schema (Drizzle) — users, orders, designFiles, designComments, notifications |
| server/auth.ts | JWT + bcrypt utilities (signToken, setAuthCookie, requireAuth, requireAdmin) |
| server/routes/ | All API route modules (index, auth, admin, customer, store, ghl, shopify, uploads) |
| server/routes/admin.ts | Admin API — 10 endpoints for dashboard, orders, customers, designs, invites |
| server/storage.ts | Database access layer — ~40 methods covering all tables |
| client/src/App.tsx | Frontend routing (public + auth + admin + portal routes) |
| client/src/lib/auth-context.tsx | Auth state management (React Query + Context) |
| client/src/components/admin-layout.tsx | Admin sidebar layout (dark theme, responsive) |
| client/src/pages/admin/ | 6 admin pages (dashboard, orders, order-detail, customers, customer-detail, design-review) |
| .claude/plans/misty-puzzling-crane.md | Full 4-phase implementation plan |
| .env.example | Required environment variables |
| scripts/seed-admin.ts | Creates admin account (romero@sidelinenz.com) |

---

## Memory / Context for Jarvesi

Claude Code's memory is at: `~/.claude/projects/-Users-Shared-Claude-Code/memory/MEMORY.md`

The full implementation plan is at: `~/Projects/sideline-nz/.claude/plans/misty-puzzling-crane.md`

KIG asked you to message him once you've read this briefing. Let him know:
- Phase 1 (Foundation) and Phase 2 (Admin Portal) are both complete
- The admin portal has: dashboard with stats, order management with design approve/reject, customer management with invite system, design review queue
- Next up is Phase 3: Customer Portal + File Uploads (Vercel Blob)
- All existing public pages (home, team stores, hub, quote, contact) still work perfectly
