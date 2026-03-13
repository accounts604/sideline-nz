import { Router } from "express";
import { storage } from "../storage";
import { getUncachableStripeClient } from "../stripeClient";
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

    const result = await createGhlContact(enriched, ["Website Lead", "Contact Form"]);

    if (!result.success && result.reason === "credentials_missing") {
      console.log("GHL not configured - form data logged above");
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

export default router;
