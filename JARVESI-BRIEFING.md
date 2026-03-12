# Jarvesi Briefing — Sideline NZ Build

**Last updated:** 2026-03-12
**Lead developer:** Claude Code (KIG's terminal)
**Point of contact:** Jarvesi (this Mac's terminal)

---

## Project Overview

Sideline NZ (sidelinenz.com) — custom sportswear brand. Full website rebuild with React + Express + Shopify + Stripe.

**Stack:** React 19, Vite 7, Express 4, Tailwind CSS v4, Drizzle ORM, PostgreSQL, wouter routing, shadcn/ui

**Repo:** ~/Projects/sideline-nz

---

## Current Status: ALL 4 PHASES COMPLETE

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
- Admin API: 11 endpoints in server/routes/admin.ts (all behind requireAdmin middleware)
  - GET /dashboard — stats (total orders, pending orders, pending designs, total customers)
  - GET /orders — filterable/paginated order list (status, designStatus, search)
  - GET /orders/:id — full order detail with items, design files, comments
  - PATCH /orders/:id — update status, design status, admin notes + auto-notify customer
  - POST /orders/:id/design-review — approve/reject design file with comment + notifications + email + GHL sync
  - GET /orders/:id/invoice — admin invoice data
  - GET /customers — paginated customer list with search
  - GET /customers/:id — customer profile + their orders
  - PATCH /customers/:id — edit team name, phone
  - POST /customers/invite — create account + invite token (7-day expiry) + send invite email
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

**Portal Phase 3 — Customer Portal + File Uploads (complete):**
- Vercel Blob upload flow (POST /api/uploads/token → client uploads to Blob → POST design record)
- Customer API: 9 endpoints in server/routes/customer.ts (all behind requireAuth)
  - GET /orders — customer's orders
  - GET /orders/:id — order detail (ownership check)
  - POST /orders/:id/designs — upload design file record (after Blob upload)
  - POST /orders/:id/designs/:did/reupload — re-upload rejected design (versioning)
  - GET /orders/:id/invoice — invoice data for printable view
  - GET /notifications — customer notifications
  - PATCH /notifications/:id/read — mark notification read
  - GET /profile — customer profile
  - PATCH /profile — update team name, phone
- Portal layout (client/src/components/portal-layout.tsx) — dark sidebar, notification badge, responsive
- 6 customer pages in client/src/pages/portal/:
  - dashboard.tsx — stat cards (active orders, designs needed, unread notifications) + recent orders
  - orders.tsx — order list with status badges
  - order-detail.tsx — order items, design files with upload/re-upload, review comments, "View Invoice" button
  - profile.tsx — edit team name, phone, account info
  - notifications.tsx — activity feed with mark-as-read, links to orders
  - invoice.tsx — clean printable invoice with company branding, line items, totals
- Auto-link guest orders on login by matching email (auth.ts)

**Portal Phase 4 — Notifications + Polish (complete):**
- Email service (server/email.ts) — pluggable interface with console stub
  - Templates: design approved, design rejected, order shipped, invite
  - Provider factory: set EMAIL_PROVIDER env var to swap to Resend/SendGrid later
- GHL sync (server/ghl-sync.ts) — tag management by email
  - Finds contacts via GHL API search
  - Adds tags: "Design Approved", "Order Shipped"
  - Graceful fallback when GHL credentials not configured
- Notification system (server/notifications.ts) — centralized dispatch
  - notifyDesignApproved: DB notification + email + GHL tag
  - notifyDesignRejected: DB notification + email
  - notifyOrderShipped: DB notification + email + GHL tag
  - notifyOrderStatusChange: auto-dispatches for processing/shipped/delivered
- Admin design-review now triggers full pipeline (DB + email + GHL)
- Admin order status update now notifies customer
- Admin invite now sends invite email

---

## Key Decisions Made

- **Auth:** JWT in httpOnly cookies (snz_token, 7-day expiry, secure in prod, sameSite lax)
- **Password hashing:** bcrypt, 10 rounds
- **File uploads:** Vercel Blob with client-side upload + server-side token generation (50MB limit)
- **Accounts:** Hybrid — customer self-signup + admin can invite
- **Design uploads:** Multiple files per order (jersey, shorts, socks, logo, other)
- **Rejected designs:** Immediate re-upload allowed (versioning via parentFileId + version number)
- **Design review:** Approve/reject with comments. All files approved = order designStatus auto-set to "approved"
- **Communication:** Approve/reject with comments (no full chat yet)
- **Email:** Pluggable interface with console stub — swap to Resend/SendGrid via EMAIL_PROVIDER env var
- **GHL sync:** Tag-based — adds tags to contacts on design approved + order shipped
- **Route structure:** /api/auth, /api/admin, /api/portal, /api/uploads, /api/ghl, /api/shopify, /api (store)

---

## Your Role, Jarvesi

1. **Relay status updates** to KIG when he asks
2. **Relay change requests** from KIG to Claude Code
3. **Do NOT edit code directly** — all code changes go through Claude Code
4. **You can read any file** in the repo to answer questions
5. **Message KIG** when you get this briefing — let him know all 4 phases are done

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
| server/email.ts | Pluggable email service — console stub, templates for design/order/invite emails |
| server/ghl-sync.ts | GHL tag sync — finds contacts by email, adds tags |
| server/notifications.ts | Centralized notification dispatch — DB + email + GHL in one call |
| server/routes/ | All API route modules (index, auth, admin, customer, store, ghl, shopify, uploads) |
| server/routes/admin.ts | Admin API — 11 endpoints for dashboard, orders, customers, designs, invites, invoices |
| server/routes/customer.ts | Customer API — 9 endpoints for orders, designs, notifications, profile, invoices |
| server/routes/uploads.ts | Vercel Blob upload token generation |
| server/storage.ts | Database access layer — ~40 methods covering all tables |
| client/src/App.tsx | Frontend routing (public + auth + admin + portal routes) |
| client/src/lib/auth-context.tsx | Auth state management (React Query + Context) |
| client/src/components/admin-layout.tsx | Admin sidebar layout (dark theme, responsive) |
| client/src/components/portal-layout.tsx | Customer portal sidebar layout (dark theme, responsive, notification badge) |
| client/src/pages/admin/ | 6 admin pages (dashboard, orders, order-detail, customers, customer-detail, design-review) |
| client/src/pages/portal/ | 6 customer pages (dashboard, orders, order-detail, profile, notifications, invoice) |
| .claude/plans/misty-puzzling-crane.md | Full 4-phase implementation plan |
| .env.example | Required environment variables |
| scripts/seed-admin.ts | Creates admin account (romero@sidelinenz.com) |

---

## What Could Come Next (if KIG wants)

- **Email provider:** Swap console stub to Resend or SendGrid (just set EMAIL_PROVIDER + API key)
- **Full chat:** Add threaded comments on orders (beyond approve/reject)
- **Order tracking:** Courier integration (NZ Post, Aramex)
- **Bulk operations:** Multi-select orders for status updates
- **Analytics:** Order volume charts, revenue dashboard
- **SSO:** Google/Microsoft login for customers

---

## Memory / Context for Jarvesi

Claude Code's memory is at: `~/.claude/projects/-Users-Shared-Claude-Code/memory/MEMORY.md`

The full implementation plan is at: `~/Projects/sideline-nz/.claude/plans/misty-puzzling-crane.md`

All 4 portal phases are complete:
- Phase 1: Foundation (auth, schema, route split)
- Phase 2: Admin Portal (dashboard, orders, customers, design review)
- Phase 3: Customer Portal (dashboard, orders, designs, profile, notifications, file uploads)
- Phase 4: Notifications + Polish (email service, GHL sync, invoices, centralized notifications)
