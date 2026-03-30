import { Router } from "express";
import { storage } from "../storage";
import { getUncachableStripeClient } from "../stripeClient";
import { emailService } from "../email";
import { z } from "zod";

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

  const ghlPayload = {
    locationId,
    firstName: contactData.name?.split(" ")[0] || "",
    lastName: contactData.name?.split(" ").slice(1).join(" ") || "",
    email: contactData.email,
    phone: contactData.phone,
    tags,
    source: contactData.source || "sidelinenz.com",
    customFields: [] as { key: string; field_value: string }[],
  };

  const customFieldMappings: Record<string, string> = {
    user_type: "user_type",
    role: "role",
    organization: "organization",
    member_count: "member_count",
    current_supplier: "current_supplier",
    sports: "sports",
    sport: "sport",
    mockup_interest: "mockup_interest",
    needs: "needs",
    estimated_quantity: "estimated_quantity",
    teams_involved: "teams_involved",
    kit_items: "kit_items",
    personalisation: "personalisation",
    supporter_audience: "supporter_audience",
    style_preference: "style_preference",
    fundraising_interest: "fundraising_interest",
    sponsorship_interest: "sponsorship_interest",
    timing: "timing",
    season_start: "season_start",
    design_stage: "design_stage",
    budget_range: "budget_range",
    approval_process: "approval_process",
    main_concern: "main_concern",
    notes: "notes",
    school_event_date: "school_event_date",
    slt_friendly: "slt_friendly",
    team_store_interest: "team_store_interest",
    team_store_audience: "team_store_audience",
    team_store_goal: "team_store_goal",
    enquiry_type: "enquiry_type",
    message: "message",
    submitted_at: "submitted_at",
    // Smart Quote fields
    quote_number: "quote_number",
    quote_total: "quote_total",
    quote_status: "quote_status",
    quote_items: "quote_items",
    quote_valid_until: "quote_valid_until",
    quote_url: "quote_url",
    // Free Mockup Intake fields
    club_type: "club_type",
    contact_name: "contact_name",
    quantity_range: "quantity_range",
    primary_colour: "primary_colour",
    secondary_colour: "secondary_colour",
    timeline: "timeline",
    design_direction: "design_direction",
    logo_status: "logo_status",
    logo_notes: "logo_notes",
    design_notes: "design_notes",
    logo_file_url: "logo_file_url",
  };

  for (const [formKey, ghlKey] of Object.entries(customFieldMappings)) {
    if (contactData[formKey]) {
      const value = Array.isArray(contactData[formKey])
        ? contactData[formKey].join(", ")
        : String(contactData[formKey]);
      ghlPayload.customFields.push({ key: ghlKey, field_value: value });
    }
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

// Sideline - Merch Orders pipeline
const SIDELINE_PIPELINE_ID = "bne386ArJCVV5iuUs86h";
const SIDELINE_STAGE_LEAD_RECEIVED = "0c31b3f0-5191-4fe8-912b-3cf469a01511";

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

    const tags = payload.enquiry_type === "team-store-gate"
      ? ["Website Lead", "Team Store Gate"]
      : ["Website Lead", "Contact Form"];

    const result = await createGhlContact(enriched, tags);

    if (!result.success && result.reason === "credentials_missing") {
      console.log("GHL not configured - form data logged above");
    }

    // Add to Sideline pipeline for gate signups and general contact leads
    if (result.contactId) {
      const opportunityName = payload.enquiry_type === "team-store-gate"
        ? `Team Store Signup — ${payload.name}`
        : `Contact Enquiry — ${payload.name}`;
      await createGhlOpportunity(result.contactId, opportunityName, SIDELINE_PIPELINE_ID, SIDELINE_STAGE_LEAD_RECEIVED);
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

    res.json({ ok: true, id: contactId });
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
      // Log error but don't fail the webhook — continue with normal flow
    } else {
      console.log(`[GHL Webhook] Collection created successfully:`, collectionData);
    }

    // Return 200 immediately — webhook is processed
    res.json({ ok: true, contactId: payload.contactId, collection: collectionData });
  } catch (e: any) {
    console.error("GHL shopify-team-store-ready webhook error:", e);
    // Still return 200 to acknowledge webhook was received
    res.status(200).json({ ok: false, error: e.message || "Processing error" });
  }
});

export default router;
