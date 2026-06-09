import { Router } from "express";
import { storage } from "../storage";
import { getUncachableStripeClient } from "../stripeClient";
import { emailService } from "../email";
import { z } from "zod";
import { db } from "../db";
import { orders, orderActivity, mockupRequests } from "@shared/schema";
import { eq } from "drizzle-orm";
import { SIDELINE_PIPELINE_ID, SIDELINE_STAGE_IDS, SIDELINE_STAGE_NAMES } from "../ghl-config";
import { isSidelinePipelineStage, type SidelinePipelineStage } from "@shared/pipeline";
import { tracked, logIntegrationEvent } from "../integration-events";
import { runMockupPipeline } from "../mockup/orchestrator";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Free-text colour names → hex, covering the most common rugby/league/netball palette.
// Falls through to null when input is unrecognised; caller decides whether to skip the pipeline.
const COLOUR_NAME_TO_HEX: Record<string, string> = {
  "black": "#000000",
  "white": "#ffffff",
  "navy": "#1e3a5f", "navy blue": "#1e3a5f", "dark blue": "#1e3a5f",
  "royal": "#1e40af", "royal blue": "#1e40af",
  "blue": "#2563eb",
  "sky blue": "#0ea5e9", "light blue": "#0ea5e9", "sky": "#0ea5e9",
  "red": "#dc2626",
  "maroon": "#7f1d1d", "dark red": "#7f1d1d",
  "green": "#16a34a",
  "forest green": "#14532d", "dark green": "#14532d", "bottle green": "#14532d",
  "yellow": "#facc15",
  "gold": "#f59e0b",
  "orange": "#f97316",
  "purple": "#7c3aed",
  "pink": "#ec4899",
  "grey": "#6b7280", "gray": "#6b7280",
  "silver": "#9ca3af",
  "brown": "#92400e",
};

function coerceToHex(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (HEX_RE.test(v)) return v.toLowerCase();
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  return COLOUR_NAME_TO_HEX[v] ?? null;
}

const router = Router();

// ====== GHL API Integration ======
const GHL_API_BASE = "https://services.leadconnectorhq.com";

export async function createGhlContact(contactData: any, tags: string[] = []) {
  const apiKey = process.env.SIDELINE_GHL_API_KEY;
  const locationId = process.env.SIDELINE_GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    console.log("GHL credentials not configured - logging submission:", contactData);
    return { success: false, reason: "credentials_missing" };
  }

  const ghlPayload: any = {
    locationId,
    firstName: contactData.name?.split(" ")[0] || contactData.contact_name?.split(" ")[0] || "",
    lastName: contactData.name?.split(" ").slice(1).join(" ") || contactData.contact_name?.split(" ").slice(1).join(" ") || "",
    email: contactData.email,
    phone: contactData.phone,
    tags,
    source: contactData.source || "sidelinenz.com",
    customFields: [] as { key: string; field_value: string }[],
  };

  // Top-level GHL contact field, NOT custom — drives opp naming
  if (contactData.organization) ghlPayload.companyName = contactData.organization;

  // Form key → canonical GHL custom field key. Only fields that EXIST in GHL.
  // Synonyms (e.g. sports→sport) normalize before send.
  // Verified against GHL location pDSz4XY8gwQEWCmiAkzW custom field list 2026-05-04.
  const customFieldMappings: Record<string, string> = {
    role: "role",
    contact_name: "contact_name",
    current_supplier: "current_supplier",
    kit_items: "kit_items",
    quantity_range: "quantity_range",
    primary_colour: "primary_colour",
    secondary_colour: "secondary_colour",
    timeline: "timeline",
    design_direction: "design_direction",
    logo_status: "logo_status",
    logo_notes: "logo_notes",
    design_notes: "design_notes",
    club_type: "club_type",
    sport: "sport",
    sports: "sport", // synonym
    timing: "timeline", // synonym
    notes: "notes",
    quote_number: "quote_number",
    quote_total: "quote_total",
    quote_status: "quote_status",
    quote_items: "quote_items",
    quote_valid_until: "quote_valid_until",
    quote_url: "quote_url",
    // Form keys mapped to existing GHL fields with different names (added 2026-05-04
    // — these were silently falling into additional_notes blob before).
    user_type: "organisation_type",
    organisation_type: "organisation_type",
    estimated_quantity: "expected_numbers",
    expected_numbers: "expected_numbers",
    budget_range: "budget_signal",
    budget_signal: "budget_signal",
    approval_process: "decision_maker",
    decision_maker: "decision_maker",
    main_concern: "pain_point_summary",
    pain_point_summary: "pain_point_summary",
    enquiry_type: "package_interest", // contact-form enquiry type → package_interest field
    // NOTE: preferred_date/backup_date/follow_up_date/proposal_date in GHL are
    // typed date fields — they reject free-form strings like "March 2026".
    // season_start / school_event_date stay in additional_notes overflow.
  };

  // Pour fields that don't have a dedicated custom field into additional_notes
  // so they aren't lost. These survive as raw context for Ezra.
  // Trimmed 2026-05-04 — fields now in customFieldMappings removed.
  const additionalNotesFields = [
    "member_count", "mockup_interest", "needs",
    "kit_quantity", "supporter_quantity", "teams_involved", "personalisation",
    "supporter_audience", "style_preference", "fundraising_interest", "sponsorship_interest",
    "design_stage", "slt_friendly", "team_store_interest", "team_store_audience",
    "team_store_goal", "message", "logo_file_url", "submitted_at",
    "season_start", "school_event_date", // typed date GHL fields reject free-form strings
  ];

  for (const [formKey, ghlKey] of Object.entries(customFieldMappings)) {
    if (contactData[formKey]) {
      const value = Array.isArray(contactData[formKey])
        ? contactData[formKey].join(", ")
        : String(contactData[formKey]);
      ghlPayload.customFields.push({ key: ghlKey, field_value: value });
    }
  }

  const overflowLines: string[] = [];
  for (const k of additionalNotesFields) {
    if (contactData[k]) {
      const v = Array.isArray(contactData[k]) ? contactData[k].join(", ") : String(contactData[k]);
      overflowLines.push(`${k}: ${v}`);
    }
  }
  if (overflowLines.length) {
    ghlPayload.customFields.push({ key: "additional_notes", field_value: overflowLines.join("\n") });
  }

  try {
    const response = await fetch(`${GHL_API_BASE}/contacts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify(ghlPayload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("GHL API error:", response.status, responseText);
      return { success: false, reason: "api_error", status: response.status, details: responseText };
    }

    const result = JSON.parse(responseText);
    console.log("GHL contact created:", result.contact?.id || result.id);
    return { success: true, contactId: result.contact?.id || result.id };
  } catch (error: any) {
    console.error("GHL API request failed:", error.message);
    return { success: false, reason: "request_failed", error: error.message };
  }
}

async function createGhlOpportunity(contactId: string, name: string, pipelineId: string, stageId: string) {
  const apiKey = process.env.SIDELINE_GHL_API_KEY;
  const locationId = process.env.SIDELINE_GHL_LOCATION_ID;
  if (!apiKey || !locationId) return;

  try {
    const res = await fetch(`${GHL_API_BASE}/opportunities/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({
        pipelineId,
        pipelineStageId: stageId,
        locationId,
        contactId,
        name,
        status: "open",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("GHL opportunity creation error:", res.status, text);
    } else {
      const data = await res.json();
      console.log("GHL opportunity created:", data.opportunity?.id || data.id);
    }
  } catch (err) {
    console.error("GHL opportunity request failed:", err);
  }
}

// Sideline - Merch Orders pipeline — IDs imported from ../ghl-config
const SIDELINE_STAGE_LEAD_RECEIVED = SIDELINE_STAGE_IDS["Lead Received"];

// Push: move a GHL opportunity to a new stage (used by portal actions).
// GHL is source of truth, so portal handlers trigger this when the user takes
// an action that should advance the deal — the GHL webhook then mirrors the
// new stage back into `orders.pipelineStage` so everything stays in sync.
export async function updateGhlOpportunityStage(
  opportunityId: string,
  stage: SidelinePipelineStage,
): Promise<{ success: boolean; reason?: string }> {
  const apiKey = process.env.SIDELINE_GHL_API_KEY;
  if (!apiKey) return { success: false, reason: "credentials_missing" };

  const stageId = SIDELINE_STAGE_IDS[stage];
  if (!stageId) return { success: false, reason: "unknown_stage" };

  try {
    const res = await fetch(`${GHL_API_BASE}/opportunities/${opportunityId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({
        pipelineId: SIDELINE_PIPELINE_ID,
        pipelineStageId: stageId,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("GHL stage update error:", res.status, text);
      return { success: false, reason: "api_error" };
    }
    return { success: true };
  } catch (err: any) {
    console.error("GHL stage update request failed:", err.message);
    return { success: false, reason: "request_failed" };
  }
}

// ====== Form Submissions ======

const projectSubmissionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone is required"),
  user_type: z.string().optional(),
  role: z.string().optional(),
  organization: z.string().optional(),
  member_count: z.string().optional(),
  current_supplier: z.string().optional(),
  sports: z.string().optional(),
  mockup_interest: z.string().optional(),
  needs: z.string().optional(),
  estimated_quantity: z.string().optional(),
  kit_quantity: z.string().optional(),
  supporter_quantity: z.string().optional(),
  teams_involved: z.string().optional(),
  kit_items: z.string().optional(),
  personalisation: z.string().optional(),
  supporter_audience: z.string().optional(),
  style_preference: z.string().optional(),
  fundraising_interest: z.string().optional(),
  sponsorship_interest: z.string().optional(),
  timing: z.string().optional(),
  season_start: z.string().optional(),
  design_stage: z.string().optional(),
  budget_range: z.string().optional(),
  notes: z.string().optional(),
  approval_process: z.string().optional(),
  main_concern: z.string().optional(),
  school_event_date: z.string().optional(),
  slt_friendly: z.string().optional(),
  team_store_interest: z.string().optional(),
  team_store_audience: z.string().optional(),
  team_store_goal: z.string().optional(),
});

router.post("/submit-project", async (req, res) => {
  try {
    const parsed = projectSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Invalid submission data";
      return res.status(400).json({ error: firstError });
    }

    const payload = parsed.data;
    const enriched = {
      ...payload,
      source: "sidelinenz.com start-a-project",
      submitted_at: new Date().toISOString(),
    };

    const result = await createGhlContact(enriched, ["Website Lead", "Start a Project"]);

    if (!result.success && result.reason === "credentials_missing") {
      console.log("GHL not configured - form data logged above");
    }

    if (result.contactId) {
      await createGhlOpportunity(
        result.contactId,
        `Website Lead — ${payload.name}`,
        SIDELINE_PIPELINE_ID,
        SIDELINE_STAGE_LEAD_RECEIVED,
      );
    }

    res.json({ ok: true, id: result.contactId || crypto.randomUUID() });
  } catch (e: any) {
    console.error("Submit project error:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
});

const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone is required"),
  enquiry_type: z.string().optional(),
  message: z.string().optional(),
  organization: z.string().optional(),
});

router.post("/contact", async (req, res) => {
  try {
    const parsed = contactFormSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Invalid submission data";
      return res.status(400).json({ error: firstError });
    }

    const payload = parsed.data;
    const enriched = {
      ...payload,
      source: "sidelinenz.com contact-form",
      submitted_at: new Date().toISOString(),
    };

    // Team-store-gate is buyer-intent → a real lead. A general contact-form
    // submission is an ENQUIRY, not a lead: tag it "Enquiry" and do NOT create a
    // pipeline deal (only quote requests / gate signups become pipeline leads).
    const isGate = payload.enquiry_type === "team-store-gate";
    const tags = isGate
      ? ["Website Lead", "Team Store Gate"]
      : ["Enquiry", "Contact Form"];

    const result = await createGhlContact(enriched, tags);

    if (!result.success && result.reason === "credentials_missing") {
      console.log("GHL not configured - form data logged above");
    }

    // Pipeline deal only for gate signups (leads). General enquiries get no deal.
    if (result.contactId && isGate) {
      await createGhlOpportunity(result.contactId, `Team Store Signup — ${payload.name}`, SIDELINE_PIPELINE_ID, SIDELINE_STAGE_LEAD_RECEIVED);
    }

    res.json({ ok: true, id: result.contactId || crypto.randomUUID() });
  } catch (e: any) {
    console.error("Contact form error:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
});

const mockupRequestSchema = z.object({
  club_name: z.string().min(1, "Club name is required"),
  sport: z.string().min(1, "Sport is required"),
  email: z.string().email("Valid email is required"),
});

router.post("/mockup-request", async (req, res) => {
  try {
    const parsed = mockupRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Invalid submission data";
      return res.status(400).json({ error: firstError });
    }

    const payload = parsed.data;
    const enriched = {
      organization: payload.club_name,
      sports: payload.sport,
      email: payload.email,
      mockup_interest: "Yes please",
      source: "sidelinenz.com hub-mockup-form",
      submitted_at: new Date().toISOString(),
    };

    const result = await createGhlContact(enriched, ["Website Lead", "Free Mockup Request"]);

    if (!result.success && result.reason === "credentials_missing") {
      console.log("GHL not configured - mockup request logged above");
    }

    if (result.contactId) {
      await createGhlOpportunity(
        result.contactId,
        `Free Mockup — ${payload.club_name}`,
        SIDELINE_PIPELINE_ID,
        SIDELINE_STAGE_LEAD_RECEIVED,
      );
    }

    res.json({ ok: true, id: result.contactId || crypto.randomUUID() });
  } catch (e: any) {
    console.error("Mockup request error:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
});

const intakeFormSchema = z.object({
  club_type: z.string().min(1, "Club type is required"),
  organization: z.string().min(1, "Organization name is required"),
  sport: z.array(z.string()).min(1, "At least one sport is required"),
  contact_name: z.string().min(1, "Contact name is required"),
  role: z.string().min(1, "Role is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  kit_items: z.array(z.string()).min(1, "At least one kit item is required"),
  quantity_range: z.string().min(1, "Quantity range is required"),
  primary_colour: z.string().min(1, "Primary colour is required"),
  secondary_colour: z.string().optional(),
  timeline: z.string().min(1, "Timeline is required"),
  current_supplier: z.string().optional(),
  design_direction: z.string().min(1, "Design direction is required"),
  logo_status: z.string().min(1, "Logo status is required"),
  logo_notes: z.string().optional(),
  design_notes: z.string().optional(),
  logo_file_url: z.string().optional(),
  terms_agreed: z.boolean(),
});

router.post("/intake", async (req, res) => {
  try {
    const parsed = intakeFormSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Invalid submission data";
      return res.status(400).json({ error: firstError });
    }

    const payload = parsed.data;

    // Build tags: include "free-mockup-request", first sport lowercased+hyphenated, quantity range, and logo-recreation-needed if applicable
    const tags = [
      "free-mockup-request",
      payload.sport[0]?.toLowerCase().replace(/\s+/g, "-") || "sport",
      payload.quantity_range,
    ];

    // Add tag if user needs logo recreation
    if (payload.logo_status === "No logo yet") {
      tags.push("logo-recreation-needed");
    }

    // Map form data to GHL contact structure
    const enriched = {
      name: payload.contact_name,
      email: payload.email,
      phone: payload.phone || "",
      club_type: payload.club_type,
      organization: payload.organization,
      sport: payload.sport.join(", "),
      role: payload.role,
      kit_items: payload.kit_items.join(", "),
      quantity_range: payload.quantity_range,
      primary_colour: payload.primary_colour,
      secondary_colour: payload.secondary_colour || "",
      timeline: payload.timeline,
      current_supplier: payload.current_supplier || "",
      design_direction: payload.design_direction,
      logo_status: payload.logo_status,
      logo_notes: payload.logo_notes || "",
      design_notes: payload.design_notes || "",
      logo_file_url: payload.logo_file_url || "",
      source: "sidelinenz.com free-mockup-intake",
      submitted_at: new Date().toISOString(),
    };

    const result = await createGhlContact(enriched, tags);
    const contactId = result.contactId || crypto.randomUUID();

    // Send email notification if logo file was uploaded
    if (payload.logo_file_url) {
      const subject = `Logo Upload — ${payload.organization} — ${contactId}`;
      const html = `
        <h2>Free Mockup Intake — Logo Upload</h2>
        <p><strong>Organization:</strong> ${payload.organization}</p>
        <p><strong>Contact Name:</strong> ${payload.contact_name}</p>
        <p><strong>Email:</strong> ${payload.email}</p>
        <p><strong>Phone:</strong> ${payload.phone || "N/A"}</p>
        <hr />
        <p><strong>Club Type:</strong> ${payload.club_type}</p>
        <p><strong>Sport:</strong> ${payload.sport.join(", ")}</p>
        <p><strong>Role:</strong> ${payload.role}</p>
        <p><strong>Kit Items:</strong> ${payload.kit_items.join(", ")}</p>
        <p><strong>Quantity Range:</strong> ${payload.quantity_range}</p>
        <hr />
        <p><strong>Primary Colour:</strong> ${payload.primary_colour}</p>
        <p><strong>Secondary Colour:</strong> ${payload.secondary_colour || "N/A"}</p>
        <p><strong>Timeline:</strong> ${payload.timeline}</p>
        <p><strong>Design Direction:</strong> ${payload.design_direction}</p>
        <p><strong>Logo Status:</strong> ${payload.logo_status}</p>
        <hr />
        <p><strong>Logo File:</strong> <a href="${payload.logo_file_url}">${payload.logo_file_url}</a></p>
        <p><strong>Logo Notes:</strong> ${payload.logo_notes || "N/A"}</p>
        <p><strong>Design Notes:</strong> ${payload.design_notes || "N/A"}</p>
        <p><strong>Current Supplier:</strong> ${payload.current_supplier || "N/A"}</p>
        <hr />
        <p><strong>GHL Contact ID:</strong> ${contactId}</p>
        <p><strong>Submitted:</strong> ${new Date().toISOString()}</p>
      `;

      await emailService.send({
        to: "info@sidelinenz.com",
        subject,
        text: `Free Mockup Intake — Logo Upload\n\nOrganization: ${payload.organization}\nEmail: ${payload.email}\nLogo: ${payload.logo_file_url}\nContact ID: ${contactId}`,
        html,
      });
    }

    if (!result.success && result.reason === "credentials_missing") {
      console.log("GHL not configured - intake form logged above");
    }

    if (result.contactId) {
      await createGhlOpportunity(
        result.contactId,
        `Free Mockup Intake — ${payload.organization}`,
        SIDELINE_PIPELINE_ID,
        SIDELINE_STAGE_LEAD_RECEIVED,
      );
    }

    // Dual-write to mockup_requests so the admin pipeline picks this up.
    // If primary_colour resolves to hex, kick off generation; otherwise park
    // as 'failed' with a clear error so it's visible for manual review.
    let mockupRequestId: string | null = null;
    try {
      const primaryHex = coerceToHex(payload.primary_colour);
      const secondaryHex = coerceToHex(payload.secondary_colour);
      const canRunPipeline = primaryHex !== null;

      const [row] = await db
        .insert(mockupRequests)
        .values({
          contactName: payload.contact_name,
          contactEmail: payload.email,
          contactPhone: payload.phone || null,
          teamName: payload.organization,
          sport: (payload.sport[0] || "").toLowerCase(),
          primaryColor: primaryHex ?? payload.primary_colour,
          secondaryColor: secondaryHex ?? payload.secondary_colour ?? null,
          accentColor: null,
          logoUrl: payload.logo_file_url || null,
          notes: [payload.design_notes, payload.logo_notes].filter(Boolean).join("\n\n") || null,
          status: canRunPipeline ? "pending" : "failed",
          errorMessage: canRunPipeline
            ? null
            : `Primary colour "${payload.primary_colour}" not recognised as hex — manual review needed before retry.`,
          ghlContactId: result.contactId || null,
        })
        .returning({ id: mockupRequests.id });
      mockupRequestId = row?.id ?? null;

      if (canRunPipeline && mockupRequestId) {
        runMockupPipeline(mockupRequestId).catch((err) => {
          console.error(`[Intake] Background pipeline failed for ${mockupRequestId}:`, err.message);
        });
      } else if (mockupRequestId) {
        console.log(`[Intake] Created mockup_request ${mockupRequestId} in 'failed' status — colour "${payload.primary_colour}" needs manual review.`);
      }
    } catch (mockupErr: any) {
      // Mockup mirror is best-effort: GHL contact is already saved, so do not 500 the request.
      console.error("[Intake] Failed to mirror to mockup_requests:", mockupErr.message);
    }

    res.json({ ok: true, id: contactId, mockupRequestId });
  } catch (e: any) {
    console.error("Intake form error:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
});

// ====== GHL Product Sync ======

const ghlProductSchema = z.object({
  action: z.enum(["create", "update", "delete"]).default("create"),
  ghl_product_id: z.string(),
  store_slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z.number(),
  image_url: z.string().optional(),
  sizes: z.array(z.string()).optional().default(["XS", "S", "M", "L", "XL", "2XL"]),
  category: z.string().optional(),
});

router.post("/product-sync", async (req, res) => {
  try {
    const webhookSecret = process.env.GHL_PRODUCT_WEBHOOK_SECRET;
    const providedSecret = req.headers["x-ghl-secret"] as string;

    if (webhookSecret && providedSecret !== webhookSecret) {
      console.error("GHL product sync: Invalid webhook secret");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = ghlProductSchema.parse(req.body);
    console.log("GHL product sync received:", payload);

    if (payload.action === "delete") {
      const existing = await storage.getGhlProduct(payload.ghl_product_id);
      if (existing?.stripeProductId) {
        const stripe = await getUncachableStripeClient();
        await stripe.products.update(existing.stripeProductId, { active: false });
      }
      await storage.deactivateGhlProduct(payload.ghl_product_id);
      return res.json({ success: true, action: "deleted" });
    }

    const existing = await storage.getGhlProduct(payload.ghl_product_id);
    const priceInCents = Math.round(payload.price * 100);
    const stripe = await getUncachableStripeClient();

    if (existing) {
      if (existing.stripeProductId) {
        await stripe.products.update(existing.stripeProductId, {
          name: payload.name,
          description: payload.description || undefined,
          images: payload.image_url ? [payload.image_url] : undefined,
          metadata: {
            store_slug: payload.store_slug,
            category: payload.category || "",
            ghl_product_id: payload.ghl_product_id,
          },
        });

        const existingSizes = existing.sizes || [];
        const sizesChanged = JSON.stringify(existingSizes.sort()) !== JSON.stringify([...payload.sizes].sort());
        const priceChanged = priceInCents !== existing.priceInCents;

        if (priceChanged || sizesChanged) {
          const oldPriceIds = (existing.stripePriceIds as Record<string, string>) || {};
          for (const priceId of Object.values(oldPriceIds)) {
            await stripe.prices.update(priceId, { active: false });
          }

          const newPriceIds: Record<string, string> = {};
          for (const size of payload.sizes) {
            const price = await stripe.prices.create({
              product: existing.stripeProductId,
              unit_amount: priceInCents,
              currency: "nzd",
              metadata: { size },
            });
            newPriceIds[size] = price.id;
          }

          await storage.updateGhlProduct(payload.ghl_product_id, {
            name: payload.name,
            description: payload.description,
            imageUrl: payload.image_url,
            priceInCents,
            sizes: payload.sizes,
            category: payload.category,
            stripePriceIds: newPriceIds,
          });
        } else {
          await storage.updateGhlProduct(payload.ghl_product_id, {
            name: payload.name,
            description: payload.description,
            imageUrl: payload.image_url,
            category: payload.category,
          });
        }
      }

      return res.json({ success: true, action: "updated", stripeProductId: existing.stripeProductId });
    }

    // Create new Stripe product
    const stripeProduct = await stripe.products.create({
      name: payload.name,
      description: payload.description || undefined,
      images: payload.image_url ? [payload.image_url] : undefined,
      metadata: {
        store_slug: payload.store_slug,
        category: payload.category || "",
        ghl_product_id: payload.ghl_product_id,
      },
    });

    const stripePriceIds: Record<string, string> = {};
    for (const size of payload.sizes) {
      const price = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: priceInCents,
        currency: "nzd",
        metadata: { size },
      });
      stripePriceIds[size] = price.id;
    }

    await storage.createGhlProduct({
      ghlProductId: payload.ghl_product_id,
      stripeProductId: stripeProduct.id,
      storeSlug: payload.store_slug,
      name: payload.name,
      description: payload.description,
      imageUrl: payload.image_url,
      priceInCents,
      sizes: payload.sizes,
      category: payload.category,
      active: true,
      stripePriceIds,
    });

    console.log(`GHL product created in Stripe: ${stripeProduct.id}`);
    res.json({ success: true, action: "created", stripeProductId: stripeProduct.id });
  } catch (e: any) {
    console.error("GHL product sync error:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
});

router.get("/products/:storeSlug", async (req, res) => {
  try {
    const products = await storage.getGhlProductsByStore(req.params.storeSlug);
    res.json({ data: products });
  } catch (e: any) {
    console.error("GHL products error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ====== Shopify Team Store Ready Webhook ======

const shopifyTeamStoreWebhookSchema = z.object({
  contactId: z.string(),
  eventType: z.string(),
  contact: z.object({
    id: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    customFields: z.array(z.object({
      key: z.string(),
      field_value: z.string().optional(),
    })).optional().default([]),
  }).optional(),
});

router.post("/shopify-team-store-ready", async (req, res) => {
  try {
    // Verify webhook signature if secret is provided
    const webhookSecret = process.env.GHL_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers["x-ghl-signature"] as string;
      if (!signature || signature !== webhookSecret) {
        console.error("GHL webhook: Invalid signature");
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const payload = shopifyTeamStoreWebhookSchema.parse(req.body);
    
    console.log(`[GHL Webhook] Shopify team store ready: ${payload.contactId}`);

    // Extract club name and handle from contact custom fields
    let clubName = "";
    let clubHandle = "";
    
    if (payload.contact?.customFields) {
      const customFields = payload.contact.customFields.reduce((acc: any, field: any) => {
        acc[field.key] = field.field_value;
        return acc;
      }, {});
      
      clubName = customFields.organization || customFields.club_name || "";
      clubHandle = clubName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    }

    // Fallback: use contact name if organization not found
    if (!clubName && payload.contact?.firstName) {
      clubName = `${payload.contact.firstName} ${payload.contact.lastName || ""}`.trim();
      clubHandle = clubName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    }

    if (!clubName || !clubHandle) {
      console.error("[GHL Webhook] Missing club name or handle data");
      return res.status(400).json({ error: "Missing club name or handle" });
    }

    // Call the Shopify collection creation endpoint (internal call)
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${process.env.PORT || 3000}`;
    const collectionEndpoint = `${baseUrl}/api/shopify/create-collection`;

    console.log(`[GHL Webhook] Creating Shopify collection: ${clubName} (${clubHandle})`);

    // APIEase collection creation is the single highest-risk fire-and-forget
    // we ship — the webhook must return 200 to GHL (or GHL will retry + dedupe),
    // but if the collection fails the club portal never goes live. Tracked
    // explicitly (not via tracked()) because we want the inner HTTP status
    // in the log, not just a thrown-or-not boolean.
    const apieaseStart = Date.now();
    const collectionResponse = await fetch(collectionEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        club_name: clubName,
        club_handle: clubHandle,
        description: `${clubName} Team Store`,
      }),
    });

    const collectionData = await collectionResponse.json().catch(() => ({}));

    if (!collectionResponse.ok) {
      console.error(`[GHL Webhook] Collection creation failed:`, collectionData);
      void logIntegrationEvent({
        system: "apiease",
        action: "createCollection",
        status: "failed",
        durationMs: Date.now() - apieaseStart,
        error: `HTTP ${collectionResponse.status}: ${JSON.stringify(collectionData).slice(0, 500)}`,
        meta: { clubName, clubHandle, contactId: payload.contactId },
      });
      // Log error but don't fail the webhook — continue with normal flow
    } else {
      console.log(`[GHL Webhook] Collection created successfully:`, collectionData);
      void logIntegrationEvent({
        system: "apiease",
        action: "createCollection",
        status: "success",
        durationMs: Date.now() - apieaseStart,
        meta: { clubName, clubHandle, contactId: payload.contactId, collectionId: (collectionData as any)?.id },
      });
    }

    // Return 200 immediately — webhook is processed
    res.json({ ok: true, contactId: payload.contactId, collection: collectionData });
  } catch (e: any) {
    console.error("GHL shopify-team-store-ready webhook error:", e);
    // Still return 200 to acknowledge webhook was received
    res.status(200).json({ ok: false, error: e.message || "Processing error" });
  }
});

// ====== GHL → Portal: Opportunity Stage Changed Webhook ======
//
// How to wire this in GHL:
//   1. Create a workflow triggered on "Opportunity Stage Changed"
//      (filter to the Sideline - Merch Orders pipeline).
//   2. Add a "Custom Webhook" action pointing to:
//        POST https://<host>/api/ghl/webhook/opportunity-stage
//   3. In the webhook payload mapping, include at minimum:
//        opportunityId  → {{opportunity.id}}
//        pipelineId     → {{opportunity.pipeline_id}}
//        stageId        → {{opportunity.pipeline_stage_id}}
//        stageName      → {{opportunity.pipeline_stage_name}}  (optional but helpful)
//   4. Set the `x-ghl-signature` header to GHL_WEBHOOK_SECRET (same pattern
//      already used by /shopify-team-store-ready).
//
// Behavior:
//   - If pipelineId is present and isn't the Sideline pipeline, ignore (200 ok).
//     Prevents RTS/Popup pipeline events from clobbering Sideline orders.
//   - Looks up the order by orders.ghlOpportunityId. If no match, log + 200 ok
//     (GHL opportunities can exist before we've linked them to an order).
//   - Updates orders.pipelineStage and writes an orderActivity row with
//     action "pipeline_stage_changed" and details { from, to, source }.

const opportunityStageWebhookSchema = z.object({
  opportunityId: z.string().min(1),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  stageName: z.string().optional(),
}).refine((v) => !!(v.stageId || v.stageName), {
  message: "Either stageId or stageName must be provided",
});

router.post("/webhook/opportunity-stage", async (req, res) => {
  try {
    // Optional signature verification (same pattern as /shopify-team-store-ready)
    const webhookSecret = process.env.GHL_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers["x-ghl-signature"] as string;
      if (!signature || signature !== webhookSecret) {
        console.error("[GHL stage webhook] Invalid signature");
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const parsed = opportunityStageWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("[GHL stage webhook] Invalid payload:", parsed.error.errors);
      return res.status(400).json({ error: "Invalid payload" });
    }
    const payload = parsed.data;

    // Ignore events from other pipelines — don't clobber Sideline orders.pipelineStage
    if (payload.pipelineId && payload.pipelineId !== SIDELINE_PIPELINE_ID) {
      return res.status(200).json({ ok: true, ignored: "not_sideline_pipeline" });
    }

    // Resolve the stage name from stageId (preferred) or stageName (fallback)
    let stageName: SidelinePipelineStage | undefined;
    if (payload.stageId && SIDELINE_STAGE_NAMES[payload.stageId]) {
      stageName = SIDELINE_STAGE_NAMES[payload.stageId];
    } else if (payload.stageName && isSidelinePipelineStage(payload.stageName)) {
      stageName = payload.stageName;
    }

    if (!stageName) {
      console.error("[GHL stage webhook] Could not resolve stage:", {
        stageId: payload.stageId,
        stageName: payload.stageName,
      });
      // 200 so GHL doesn't retry forever on a stage we don't know
      return res.status(200).json({ ok: true, ignored: "unknown_stage" });
    }

    // Find the order linked to this GHL opportunity
    const [order] = await db
      .select({ id: orders.id, pipelineStage: orders.pipelineStage })
      .from(orders)
      .where(eq(orders.ghlOpportunityId, payload.opportunityId))
      .limit(1);

    if (!order) {
      console.log(
        `[GHL stage webhook] No linked order for opportunity ${payload.opportunityId} (stage → ${stageName}) — ignoring`,
      );
      return res.status(200).json({ ok: true, ignored: "no_linked_order" });
    }

    const previousStage = order.pipelineStage;
    if (previousStage === stageName) {
      // No-op — GHL webhook echoed a stage we already have
      return res.status(200).json({ ok: true, noop: true });
    }

    // Update the order and log the activity
    await db
      .update(orders)
      .set({ pipelineStage: stageName, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: null,
      action: "pipeline_stage_changed",
      details: {
        from: previousStage,
        to: stageName,
        source: "ghl_webhook",
        ghlOpportunityId: payload.opportunityId,
      },
    });

    console.log(
      `[GHL stage webhook] Order ${order.id}: ${previousStage || "(null)"} → ${stageName}`,
    );
    res.status(200).json({ ok: true, orderId: order.id, stage: stageName });
  } catch (e: any) {
    console.error("[GHL stage webhook] Error:", e);
    // 200 so GHL doesn't retry on our bugs — log is the alert
    res.status(200).json({ ok: false, error: e.message || "Processing error" });
  }
});

export default router;
