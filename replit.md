# Sideline NZ — Master Context

## Overview

Sideline NZ is a full-stack e-commerce and lead-generation platform for a New Zealand custom sports apparel brand. It serves rugby clubs, schools, and sports teams with custom teamwear — jerseys, shorts, socks, caps, hoodies, etc.

**Brand positioning:** "Sideline NZ is not a uniform supplier. We are a club growth partner." — reliable service, clean designs, clear timelines, no stress. Uses apparel as a vehicle for identity, sponsorship leverage, and community pride.

**Owner:** Romero Tagi (Kingdom Investment Group / KIG)

**Target users:**
- Rugby club managers/administrators (time-poor, want fast replies)
- School sports coordinators (risk-averse, need organized processes)

**Live URL:** Deployed on Railway (production), Vercel (fallback)
**Store:** sideline-nz-2.myshopify.com (Shopify Storefront API)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Wouter (routing), TanStack React Query |
| Styling | Tailwind CSS 4, shadcn/ui (Radix primitives) |
| Backend | Express.js + TypeScript (tsx) |
| Database | PostgreSQL (Neon), Drizzle ORM |
| Payments | Stripe (checkout sessions + webhooks) |
| E-commerce | Shopify Storefront API (GraphQL) |
| CRM | GoHighLevel (GHL) — contact creation, tags, custom fields |
| AI Mockups | Gemini 2.5 Flash (image gen), ElevenLabs (voiceover), ffmpeg (video) |
| Task Mgmt | ClickUp API (task creation from mockup requests) |
| Email | Resend API |
| File Storage | Vercel Blob |
| Build | esbuild (server), Vite (client) |
| Deploy | Railway (primary), Vercel (fallback) |

---

## Project Structure

```
sideline-nz/
├── client/                     # Frontend React app
│   ├── src/
│   │   ├── App.tsx             # Router — all routes defined here
│   │   ├── pages/              # Page components
│   │   │   ├── home.tsx        # Homepage
│   │   │   ├── clubs.tsx       # Clubs landing
│   │   │   ├── schools.tsx     # Schools landing
│   │   │   ├── sports.tsx      # Sport selection grid
│   │   │   ├── quote.tsx       # 6-step quote wizard
│   │   │   ├── contact.tsx     # Contact form
│   │   │   ├── team-stores.tsx # Shopify collections directory
│   │   │   ├── team-store-detail.tsx
│   │   │   ├── our-work.tsx    # Portfolio grid
│   │   │   ├── free-mockup.tsx # Free mockup lead form
│   │   │   ├── get-mockup.tsx  # Mockup generation flow
│   │   │   ├── sponsor-placement.tsx
│   │   │   ├── login.tsx / register.tsx / accept-invite.tsx
│   │   │   ├── quote-view.tsx  # Public quote view (token-based)
│   │   │   ├── admin/          # Admin portal (12 pages)
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── orders.tsx / order-detail.tsx
│   │   │   │   ├── purchase-order.tsx / create-po.tsx
│   │   │   │   ├── customers.tsx / customer-detail.tsx
│   │   │   │   ├── design-review.tsx
│   │   │   │   ├── mockups.tsx / mockup-detail.tsx
│   │   │   │   └── quotes.tsx / quote-detail.tsx / create-quote.tsx / quote-templates.tsx
│   │   │   ├── portal/         # Customer portal (5 pages)
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── orders.tsx / order-detail.tsx
│   │   │   │   ├── profile.tsx / notifications.tsx / invoice.tsx
│   │   │   └── club-portal/    # Club portal (5 pages)
│   │   │       ├── index.tsx / login.tsx / dashboard.tsx
│   │   │       ├── mockup-review.tsx / order-tracking.tsx
│   │   ├── components/         # 21 custom + 60 shadcn/ui components
│   │   │   ├── layout.tsx          # Marketing site shell (nav + footer)
│   │   │   ├── admin-layout.tsx    # Admin portal shell
│   │   │   ├── portal-layout.tsx   # Customer portal shell
│   │   │   ├── club-portal-layout.tsx
│   │   │   ├── client-shell.tsx    # Root wrapper
│   │   │   ├── hero-carousel.tsx   # Homepage hero
│   │   │   ├── hub-section.tsx     # Mockup request form section
│   │   │   ├── customer-logos.tsx  # Logo carousel (27 logos)
│   │   │   ├── cart-drawer.tsx     # Shopping cart sidebar
│   │   │   ├── mobile-menu.tsx     # Mobile nav drawer
│   │   │   ├── splash-loader.tsx   # First-visit loader
│   │   │   ├── production-tracker.tsx
│   │   │   ├── order-chat.tsx      # Order messaging widget
│   │   │   ├── protected-route.tsx # Auth guards (ProtectedRoute, AdminRoute, ClubPortalRoute)
│   │   │   ├── rugby-jersey.tsx / basketball-jersey.tsx / netball-jersey.tsx / football-jersey.tsx / league-jersey.tsx
│   │   │   └── ui/                 # shadcn/ui primitives (60 components)
│   │   ├── hooks/
│   │   │   └── use-shopify.ts      # Shopify React Query hooks
│   │   ├── lib/
│   │   │   ├── shopify.ts          # Shopify Storefront API client
│   │   │   ├── auth-context.tsx    # Auth state (login, register, logout)
│   │   │   └── queryClient.ts      # React Query config
│   │   └── index.css               # Tailwind + custom CSS
│   └── public/                     # Static assets
├── server/                         # Backend Express API
│   ├── index.ts                    # App entry, middleware, Stripe webhook
│   ├── db.ts                       # Drizzle ORM connection (Neon PostgreSQL)
│   ├── auth.ts                     # JWT auth, bcrypt, middleware (requireAuth, requireAdmin, requireClubAuth)
│   ├── storage.ts                  # Database query layer (809 lines)
│   ├── stripeClient.ts             # Stripe singleton
│   ├── webhookHandlers.ts          # Stripe event handlers
│   ├── email.ts                    # Resend email service
│   ├── notifications.ts            # Email notification templates
│   ├── ghl-sync.ts                 # GHL contact/tag sync
│   ├── static.ts                   # Production static file serving
│   ├── vite.ts                     # Dev server HMR setup
│   ├── routes/
│   │   ├── index.ts                # Route registration
│   │   ├── auth.ts                 # /api/auth/* (register, login, logout, me, accept-invite)
│   │   ├── store.ts                # /api/* (products, cart, checkout, Stripe config)
│   │   ├── shopify.ts              # /api/shopify/* (collections, products, cart proxy)
│   │   ├── ghl.ts                  # /api/ghl/* (contact-form, free-mockup-intake, quote-request, team-store-inquiry)
│   │   ├── admin.ts                # /api/admin/* (dashboard, orders, customers, design-review)
│   │   ├── customer.ts             # /api/portal/* (orders, designs, messages)
│   │   ├── club-portal.ts          # /api/club-portal/* (login, dashboard, mockup-approval, orders)
│   │   ├── mockups.ts              # /api/mockups/* (request, status, admin CRUD, retry)
│   │   ├── quotes.ts               # /api/admin/quotes/*, /api/quotes/:token (CRUD, send, accept/reject)
│   │   └── uploads.ts              # /api/uploads (Vercel Blob upload)
│   └── mockup/                     # AI Mockup engine
│       ├── orchestrator.ts         # Pipeline: Gemini → ElevenLabs → ffmpeg → email
│       ├── gemini.ts               # Image generation via Gemini 2.5 Flash
│       ├── elevenlabs.ts           # Voiceover synthesis
│       ├── video.ts                # Video montage creation
│       └── clickup.ts              # ClickUp task creation
├── shared/
│   └── schema.ts                   # Drizzle schema + Zod validators (20 tables)
├── attached_assets/                # 109 reference images, PDFs, logos
├── script/build.mjs                # esbuild server bundler
├── scripts/
│   ├── bundle-api.mjs              # Vercel API bundler
│   ├── seed-admin.ts               # Create initial admin user
│   └── seed-products.ts            # Load Stripe products
├── vite.config.ts                  # Vite config (aliases: @, @shared, @assets)
├── drizzle.config.ts               # Drizzle Kit config
├── railway.json                    # Railway deploy config
├── vercel.json                     # Vercel deploy config
├── nixpacks.toml                   # Railway build (Node 22)
└── package.json                    # npm scripts, dependencies
```

---

## Database Schema (20 tables)

| Table | Purpose |
|-------|---------|
| `users` | Customer/admin accounts (JWT auth, bcrypt passwords) |
| `carts` | Shopping carts (session or user-linked) |
| `cartItems` | Cart line items |
| `orders` | Full order lifecycle (pending → paid → processing → shipped → delivered) |
| `orderItems` | Line items with design fields (colors, branding, front/back URLs) |
| `orderSizeBreakdowns` | Size/qty/player name/number per item |
| `productionStages` | Production pipeline tracking (received → design_review → production → QC → shipped) |
| `qualityChecks` | QC checkpoints with photo evidence |
| `designFiles` | Design uploads per order (jersey, shorts, socks, logo) with approval workflow |
| `designComments` | Review comments + approve/reject actions |
| `orderMessages` | Threaded chat per order (admin/customer/system/bot) |
| `orderActivity` | Full audit trail (JSONB details) |
| `ghlProducts` | GHL↔Stripe product mapping |
| `clubAccounts` | Club portal accounts (separate from users, $297 product) |
| `mockupRequests` | Free mockup lead submissions (name, colors, sport, logo, status pipeline) |
| `mockupDesigns` | AI-generated designs (1-4 per request, with generation time tracking) |
| `quoteTemplates` | Reusable quote templates (sport/category/items) |
| `quotes` | Smart quotes (draft → sent → viewed → accepted/rejected, with access tokens) |
| `quoteItems` | Quote line items |
| `notifications` | User notification center (design_approved, order_shipped, etc.) |

---

## Portals (4 interfaces)

### 1. Public Marketing Site
Routes: `/`, `/clubs`, `/schools`, `/sports`, `/team-stores`, `/our-work`, `/quote`, `/contact`, `/free-mockup`, `/get-mockup`, `/sponsor-placement`

Key features:
- Hero carousel with player images
- Ticker strip (brand claims)
- Team Stores (Shopify collections — auto-sync)
- 6-step quote wizard
- Free mockup generator (AI-powered)
- Customer logo carousel (27 logos)
- Hub section (48-hour mockup promise)

### 2. Admin Portal (`/admin/*`)
Auth: `requireAdmin` middleware
12 pages: Dashboard, Orders, Order Detail, Purchase Orders, Customers, Customer Detail, Design Review, Mockups, Mockup Detail, Quotes, Quote Detail, Create Quote, Quote Templates

Key features:
- Dashboard stats (orders, revenue, pipeline)
- Full order management with production stage tracking
- Design file review (approve/reject)
- Smart Quote system (create, send, track, convert to order)
- AI mockup pipeline management (retry failed, view generated designs)
- Customer invite system

### 3. Customer Portal (`/portal/*`)
Auth: `requireAuth` middleware (JWT cookie `snz_token`)
5 pages: Dashboard, Orders, Order Detail, Profile, Notifications, Invoice

Key features:
- View order status and production progress
- Upload design files (jersey, shorts, socks, logo)
- Re-upload rejected designs
- Order messaging (chat with admin)
- Invoice view
- Notification center

### 4. Club Portal (`/club-portal/*`)
Auth: `requireClubAuth` middleware (separate JWT)
5 pages: Index, Login, Dashboard, Mockup Review, Order Tracking

Key features:
- Club-specific login (separate from customer accounts)
- Review AI-generated mockups (approve/request revision)
- Track order status through production
- Tied to Shopify store URL per club

---

## Key Integrations

### Shopify Storefront API
- **Purpose:** Team stores (each collection = a team's store)
- **Client:** `client/src/lib/shopify.ts` (GraphQL)
- **Server proxy:** `server/routes/shopify.ts`
- **Hooks:** `useCollections()`, `useCollectionByHandle(handle)`, `useFeaturedProducts()`
- **Cart:** Creates Shopify cart → redirects to Shopify checkout
- **Auto-sync:** New collections/products in Shopify appear on site automatically

### Stripe
- **Purpose:** E-commerce payments
- **Server:** `server/stripeClient.ts`, `server/webhookHandlers.ts`
- **Checkout:** Creates checkout sessions, webhook confirms payment
- **Webhook events:** `checkout.session.completed`, `payment_intent.succeeded`
- **Important:** Webhook route registered BEFORE `express.json()` (needs raw body)

### GoHighLevel (GHL)
- **Purpose:** CRM — lead capture, contact management, pipeline tracking
- **Server:** `server/routes/ghl.ts`, `server/ghl-sync.ts`
- **Forms → GHL:** contact-form, free-mockup-intake, quote-request, team-store-inquiry
- **Actions:** Creates contacts, adds tags, maps 30+ custom fields
- **Location:** pDSz4XY8gwQEWCmiAkzW

### AI Mockup Engine
- **Purpose:** Free mockup lead generation — user submits team info, gets AI-designed jerseys
- **Pipeline:** `server/mockup/orchestrator.ts`
  1. Gemini 2.5 Flash generates 1-4 jersey design images
  2. ElevenLabs synthesizes voiceover
  3. ffmpeg creates video montage
  4. Email sent to lead with designs
- **Status tracking:** pending → generating → designs_ready → video_ready → sent
- **ClickUp:** Creates task in ClickUp for follow-up

### ClickUp
- **Purpose:** Task creation from mockup requests
- **Server:** `server/mockup/clickup.ts`
- **Team ID:** 90161483847

### Vercel Blob
- **Purpose:** File uploads (design files, images)
- **Server:** `server/routes/uploads.ts`

### Resend
- **Purpose:** Transactional email
- **Server:** `server/email.ts`

---

## Design System

### Theme
- **Palette:** Full dark editorial — black/white only
- **Page background:** #000000
- **Text:** #f0f0f0 primary, rgba(255,255,255,0.45) secondary, rgba(255,255,255,0.25) muted
- **Cards:** #111 bg, 1px solid rgba(255,255,255,0.08) border, 6px radius
- **CTA Buttons:** White bg, black text, 4px radius, uppercase, tracking-wider
- **Ghost Buttons:** 1px solid rgba(255,255,255,0.2), white text, 4px radius
- **Section Labels:** xs text, tracking-[0.2em], uppercase, white/25
- **Inputs:** bg rgba(255,255,255,0.05), border rgba(255,255,255,0.1), 4px radius, 16px font mobile
- **Section padding:** 80px 52px desktop, 44px 20px mobile

### Typography
- **font-body:** DM Sans (Google Fonts, weight 300)
- **font-heading:** Peloric Bold (local font, all h1-h4, normal weight)
- **font-display:** Bebas Neue (Google Fonts, stat counters, decorative, hero titles)
- **Sizes:** hero h1 = clamp(64px,10vw,118px), page titles = clamp(52px,7vw,96px), section h2 = text-2xl sm:text-3xl

### Brand Copy
- **Tone:** Confident but grounded, direct, community-minded, practical
- **Ticker claims:** "Serving Clubs Since 2021", "NZ Owned & Operated", "Free Quote Within 48 Hours"
- **Hub promise:** 48-hour free mockup delivery
- **CTA:** "Ready to build your team store?"

---

## Auth System

### Customer Auth (JWT)
- Register → bcrypt hash → JWT in `snz_token` cookie
- Login → verify password → JWT
- Invite flow → admin sends invite token → customer accepts
- Middleware: `optionalAuth`, `requireAuth`, `requireAdmin`

### Club Portal Auth (separate JWT)
- Club-specific accounts (`clubAccounts` table)
- 7-day token expiry
- Middleware: `requireClubAuth`

---

## NPM Scripts

```bash
npm run dev          # Development server (Express + Vite HMR)
npm run dev:client   # Vite only (port 3000)
npm run dev:server   # Express only
npm run build        # Production build (esbuild + Vite)
npm run build:vercel # Vercel-specific build
npm run start        # Production server (dist/index.cjs)
npm run check        # TypeScript check
npm run db:push      # Push Drizzle schema to database
```

---

## Path Aliases

```
@/       → client/src/
@shared/ → shared/
@assets/ → attached_assets/
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_PUBLISHABLE_KEY` | Stripe client-side |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `VITE_SHOPIFY_STORE_URL` | Shopify store domain |
| `VITE_SHOPIFY_TOKEN` | Shopify Storefront API token |
| `SIDELINE_GHL_API_KEY` | GoHighLevel API key |
| `SIDELINE_GHL_LOCATION_ID` | GHL location |
| `GEMINI_API_KEY` | Google Gemini for mockup generation |
| `GEMINI_MODEL` | Gemini model (gemini-2.5-flash) |
| `ELEVENLABS_API_KEY` | ElevenLabs voiceover |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice selection |
| `RESEND_API_KEY` | Resend email service |
| `CLICKUP_API_KEY` | ClickUp task creation |
| `CLICKUP_TEAM_ID` | ClickUp team |
| `CLICKUP_SPACE_ID` | ClickUp space |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |
| `JWT_SECRET` | JWT signing key |
| `BASE_URL` | Server base URL |
| `VITE_SITE_URL` | Client-facing URL |
| `PORT` | Server port (default 5001) |
| `NODE_ENV` | development / production |

---

## Jersey SVG Components

Interactive SVG jersey components for the mockup/customizer flow:
- `rugby-jersey.tsx` — Rugby jersey with panels
- `basketball-jersey.tsx` — Basketball singlet
- `netball-jersey.tsx` — Netball dress
- `football-jersey.tsx` — Football/soccer jersey
- `league-jersey.tsx` — League jersey

These render colorizable SVGs that respond to primary/secondary/accent color props.
