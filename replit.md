# Sideline NZ - Custom Sports Apparel Website

## Overview

Sideline NZ is a marketing website for a New Zealand sports apparel brand serving rugby clubs and schools. The site is designed to capture leads, guide users through enquiry pathways, and present a professional, trustworthy brand image. The primary goal is conversion through embedded forms and clear calls-to-action.

**Brand positioning:** "Sideline NZ is not a uniform supplier. We are a club growth partner." — reliable service, clean designs, clear timelines, no stress. Uses apparel as a vehicle for identity, sponsorship leverage, and community pride.

**Target users:**
- Rugby club managers/administrators (time-poor, want fast replies)
- School sports coordinators (risk-averse, need organized processes)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework:** React with Vite (not Next.js despite attached asset references)
- **Routing:** Wouter for client-side navigation
- **Styling:** Tailwind CSS with custom theme variables
- **UI Components:** shadcn/ui component library (Radix primitives)
- **State Management:** TanStack React Query for server state
- **Typography:** DM Sans (body, font-weight 300), Bebas Neue (stat numbers, decorative), Peloric (headings)

### Design Patterns
- Component-based architecture with clear separation between pages and reusable components
- Path aliases configured (`@/` for client/src, `@shared/` for shared, `@assets/` for attached_assets)
- Custom splash loader for first-visit experience with session storage persistence
- Mobile-first responsive design with slide-in accordion menu

### Backend Architecture
- **Runtime:** Express.js server with TypeScript
- **Build:** esbuild for server bundling, Vite for client
- **Development:** Hot module replacement via Vite middleware
- **Static Serving:** Built client assets served from `dist/public`

### Data Storage
- **ORM:** Drizzle ORM with PostgreSQL dialect
- **Schema Location:** `shared/schema.ts`
- **Current Implementation:** In-memory storage (`MemStorage` class) as placeholder
- **Database Ready:** Drizzle config expects `DATABASE_URL` environment variable

### Shopify Integration
- **Storefront API:** GraphQL endpoint via `VITE_SHOPIFY_STORE_URL` and `VITE_SHOPIFY_TOKEN` env vars
- **Store URL:** sideline-nz-2.myshopify.com
- **Client:** `client/src/lib/shopify.ts` — all Shopify API calls (collections, products, cart creation)
- **Hooks:** `client/src/hooks/use-shopify.ts` — React Query hooks for data fetching
- **Collections = Team Stores:** Each Shopify collection appears as a team store card
- **Products:** Displayed within individual store pages with size selector, name/number fields, add-to-cart → Shopify checkout
- **Homepage:** Team Stores carousel shows first 6 collections; Products carousel shows products tagged "featured"
- **Auto-sync:** Adding collections/products in Shopify automatically reflects on the site

### Key Pages
- Home (hero carousel, ticker strip, team stores carousel, clubs/schools splits, products carousel, testimonial, our work grid, hub mockup form, customer logos, CTA band)
- Clubs (dark landing — hero, stat, 3 content sections, CTA)
- Schools (dark landing — hero, stat, 3 content sections, CTA)
- Sports (sport selection grid)
- Quote (6-step dark form wizard with progress bar)
- Contact (dark form with Bebas Neue contact details)
- Team Stores (Shopify collections directory — dark grid, live data)
- Our Work (dark masonry portfolio grid)

### Key Components
- `hub-section.tsx` - Full-width mockup request form section (black bg, white text), POSTs to /api/ghl/mockup-request
- `hero-carousel.tsx` - Full-height hero with locker room background, player carousel, and CTA buttons
- `team-store-explainer-modal.tsx` - Modal explaining Team Store concept with "Include" CTA
- `customer-logos.tsx` - Scrolling customer logo strip on white background (27 logos)

## External Dependencies

### UI Framework
- Radix UI primitives for accessible components
- Embla Carousel for carousel functionality
- cmdk for command palette
- vaul for drawer components
- react-day-picker for calendar

### Database
- PostgreSQL via `DATABASE_URL` environment variable
- Drizzle Kit for schema migrations (`drizzle-kit push`)
- connect-pg-simple for session storage (available but not currently active)

### Form Handling
- react-hook-form with zod resolvers
- drizzle-zod for schema-to-validation integration

### Development Tools
- Replit-specific Vite plugins (cartographer, dev-banner, runtime-error-modal)
- Custom meta images plugin for OpenGraph tags

### Design System
- **Theme:** Full dark editorial palette — black/white only
- **Page Background:** #000000 (black) everywhere
- **Text:** #f0f0f0 primary, rgba(255,255,255,0.45) secondary, rgba(255,255,255,0.25) muted
- **Cards:** #111 background, 1px solid rgba(255,255,255,0.08) border, border-radius: 6px
- **CTA Buttons:** White bg (#fff), black text, border-radius: 4px, uppercase, tracking-wider
- **Ghost Buttons:** border 1px solid rgba(255,255,255,0.2), white text, border-radius: 4px
- **Section Labels:** xs text, tracking-[0.2em], uppercase, white/25 (e.g. "BROWSE", "SHOP", "PORTFOLIO")
- **Carousels:** Horizontal scroll with prev/next circle buttons
- **Inputs:** bg rgba(255,255,255,0.05), border rgba(255,255,255,0.1), text #f0f0f0, border-radius 4px, 16px font on mobile
- **Section padding:** 80px 52px desktop, 44px 20px mobile

### Fonts
- Google Fonts: DM Sans (body, weight 300), Bebas Neue (stat numbers, decorative accents), Inter, Oswald (fallbacks)
- Local Font: Peloric Bold (brand identity font for all h1-h4 headings)
- font-heading = Peloric (all h1-h4, font-normal weight, scaled-down sizes)
- font-display = Bebas Neue (stat counters, decorative quote marks, inner page hero titles)
- Heading sizes: hero h1 = clamp(64px,10vw,118px), page titles = clamp(52px,7vw,96px), section h2 = text-2xl sm:text-3xl

### Brand Copy
- Tone: Confident but grounded, direct, community-minded, practical
- Ticker: "Serving Clubs Since 2021", "NZ Owned & Operated", "Free Quote Within 48 Hours", etc.
- Clubs stat: "Est. 2021" / "Club Growth Partner"
- Schools stat: "100%" / "School Safe Process"
- Testimonial: Generic club manager quote from Auckland
- Hub form: 48-hour mockup delivery promise
- CTA: "Ready to build your team store?"
