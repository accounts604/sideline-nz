// GHL Contacts client — find, search, upsert, get.
// Single source of truth for admin-side contact sync between sideline-nz
// portal users and GHL contacts.

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

function creds() {
  const apiKey = process.env.SIDELINE_GHL_API_KEY;
  const locationId = process.env.SIDELINE_GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null;
  return { apiKey, locationId };
}

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Version: GHL_VERSION,
  };
}

export interface GhlContact {
  id: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  tags?: string[];
  customFields?: Array<{ id?: string; key?: string; field_value?: any; value?: any }>;
}

export async function findGhlContactByEmail(email: string): Promise<GhlContact | null> {
  const c = creds();
  if (!c) return null;
  try {
    const res = await fetch(
      `${GHL_API_BASE}/contacts/search/duplicate?locationId=${c.locationId}&email=${encodeURIComponent(email)}`,
      { headers: authHeaders(c.apiKey) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.contact || null;
  } catch (err) {
    console.error("[GHL contacts] findByEmail error:", err);
    return null;
  }
}

export async function getGhlContact(contactId: string): Promise<GhlContact | null> {
  const c = creds();
  if (!c) return null;
  try {
    const res = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
      headers: authHeaders(c.apiKey),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.contact || null;
  } catch (err) {
    console.error("[GHL contacts] get error:", err);
    return null;
  }
}

export interface GhlSearchResult {
  contacts: GhlContact[];
  total: number;
}

export async function searchGhlContacts(query: string, limit = 10): Promise<GhlSearchResult> {
  const c = creds();
  if (!c) return { contacts: [], total: 0 };
  try {
    const res = await fetch(`${GHL_API_BASE}/contacts/search`, {
      method: "POST",
      headers: authHeaders(c.apiKey),
      body: JSON.stringify({
        locationId: c.locationId,
        pageLimit: limit,
        query,
      }),
    });
    if (!res.ok) {
      console.error("[GHL contacts] search failed:", res.status, await res.text());
      return { contacts: [], total: 0 };
    }
    const data = await res.json();
    return {
      contacts: data.contacts || [],
      total: data.total || 0,
    };
  } catch (err) {
    console.error("[GHL contacts] search error:", err);
    return { contacts: [], total: 0 };
  }
}

export interface UpsertContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyName?: string;
  tags?: string[];
  customFields?: Array<{ key: string; field_value: string }>;
}

export interface UpsertContactResult {
  contactId: string | null;
  created: boolean;
  error?: string;
}

/**
 * Find-or-create a GHL contact by email.
 * If the contact exists, patch with any new fields (non-empty). If not, create.
 * Returns the contactId (or null when GHL is not configured / the call fails).
 */
export async function upsertGhlContact(input: UpsertContactInput): Promise<UpsertContactResult> {
  const c = creds();
  if (!c) {
    console.log("[GHL contacts] credentials missing — skip upsert for", input.email);
    return { contactId: null, created: false, error: "ghl_not_configured" };
  }

  const existing = await findGhlContactByEmail(input.email);

  const body: Record<string, any> = { locationId: c.locationId };
  if (input.email) body.email = input.email;
  if (input.firstName) body.firstName = input.firstName;
  if (input.lastName) body.lastName = input.lastName;
  if (input.phone) body.phone = input.phone;
  if (input.companyName) body.companyName = input.companyName;
  if (input.tags && input.tags.length) body.tags = input.tags;
  if (input.customFields && input.customFields.length) body.customFields = input.customFields;

  try {
    if (existing?.id) {
      // Merge tags rather than overwrite
      if (input.tags && input.tags.length) {
        const merged = Array.from(new Set([...(existing.tags || []), ...input.tags]));
        body.tags = merged;
      }
      const res = await fetch(`${GHL_API_BASE}/contacts/${existing.id}`, {
        method: "PUT",
        headers: authHeaders(c.apiKey),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("[GHL contacts] update failed:", res.status, text);
        return { contactId: existing.id, created: false, error: text };
      }
      return { contactId: existing.id, created: false };
    }

    const res = await fetch(`${GHL_API_BASE}/contacts/`, {
      method: "POST",
      headers: authHeaders(c.apiKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[GHL contacts] create failed:", res.status, text);
      return { contactId: null, created: false, error: text };
    }
    const data = await res.json();
    const contactId = data.contact?.id || data.id || null;
    return { contactId, created: true };
  } catch (err: any) {
    console.error("[GHL contacts] upsert error:", err);
    return { contactId: null, created: false, error: err.message || "unknown" };
  }
}

/**
 * Create a GHL opportunity in a given pipeline/stage.
 * Used when admin creates an order — so the order has an opportunity to track.
 */
export interface CreateOpportunityInput {
  contactId: string;
  pipelineId: string;
  stageId: string;
  name: string;
  monetaryValue?: number;
  status?: "open" | "won" | "lost" | "abandoned";
}

export async function createGhlOpportunity(
  input: CreateOpportunityInput,
): Promise<{ opportunityId: string | null; error?: string }> {
  const c = creds();
  if (!c) return { opportunityId: null, error: "ghl_not_configured" };
  try {
    const res = await fetch(`${GHL_API_BASE}/opportunities/`, {
      method: "POST",
      headers: authHeaders(c.apiKey),
      body: JSON.stringify({
        locationId: c.locationId,
        pipelineId: input.pipelineId,
        pipelineStageId: input.stageId,
        name: input.name,
        contactId: input.contactId,
        status: input.status || "open",
        monetaryValue: input.monetaryValue,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[GHL contacts] create opportunity failed:", res.status, text);
      return { opportunityId: null, error: text };
    }
    const data = await res.json();
    return { opportunityId: data.opportunity?.id || data.id || null };
  } catch (err: any) {
    console.error("[GHL contacts] create opportunity error:", err);
    return { opportunityId: null, error: err.message || "unknown" };
  }
}

/**
 * Find the contact's existing open opportunity in the given pipeline.
 * Returns the most-recently-updated open opp, or null if none exist.
 *
 * Used by admin PO flow to AVOID creating a duplicate card when a customer
 * already has an active deal — instead the admin should advance the existing
 * one (set PO reference, monetary value, stage).
 */
export async function findOpenOpportunityForContact(
  contactId: string,
  pipelineId: string,
): Promise<{ id: string; name: string; pipelineStageId: string } | null> {
  const c = creds();
  if (!c) return null;
  try {
    const url = `${GHL_API_BASE}/opportunities/search?location_id=${c.locationId}&pipeline_id=${pipelineId}&contact_id=${contactId}&limit=20`;
    const res = await fetch(url, { headers: authHeaders(c.apiKey) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const open = (data.opportunities || []).filter(
      (o: any) => !["won", "lost", "abandoned"].includes((o.status || "").toLowerCase()),
    );
    if (!open.length) return null;
    open.sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    return { id: open[0].id, name: open[0].name, pipelineStageId: open[0].pipelineStageId };
  } catch (err: any) {
    console.error("[GHL contacts] find open opportunity error:", err);
    return null;
  }
}

/**
 * Advance an existing opportunity: update stage, name (if currently a placeholder),
 * monetary value, and PO reference custom field. Used by admin PO flow.
 */
export async function advanceGhlOpportunity(
  opportunityId: string,
  updates: {
    pipelineStageId?: string;
    name?: string;
    monetaryValue?: number;
    poReference?: string;
    customerName?: string;
    projectDescription?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  const c = creds();
  if (!c) return { success: false, error: "ghl_not_configured" };

  // Opp custom field IDs (created in KIG GHL location 2026-05-02)
  const FIELD_IDS = {
    po_reference: "OJ7LXbQTrA4jX5hGEEZ3",
    customer_name: "qwmFWayjtm9HRTzVI3fi",
    order_total: "JraLLVKiFZ7OWkZNUgiS",
    project_description: "Y570dpLa3S77UZmdn2qQ",
  };

  const body: any = {};
  if (updates.pipelineStageId) body.pipelineStageId = updates.pipelineStageId;
  if (updates.name) body.name = updates.name;
  if (typeof updates.monetaryValue === "number") body.monetaryValue = updates.monetaryValue;

  const customFields: any[] = [];
  if (updates.poReference) customFields.push({ id: FIELD_IDS.po_reference, key: "po_reference", field_value: updates.poReference });
  if (updates.customerName) customFields.push({ id: FIELD_IDS.customer_name, key: "customer_name", field_value: updates.customerName });
  if (updates.projectDescription) customFields.push({ id: FIELD_IDS.project_description, key: "project_description", field_value: updates.projectDescription });
  if (typeof updates.monetaryValue === "number") customFields.push({ id: FIELD_IDS.order_total, key: "order_total", field_value: `$${updates.monetaryValue.toFixed(2)}` });
  if (customFields.length) body.customFields = customFields;

  try {
    const res = await fetch(`${GHL_API_BASE}/opportunities/${opportunityId}`, {
      method: "PUT",
      headers: authHeaders(c.apiKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[GHL contacts] advance opportunity failed:", res.status, text);
      return { success: false, error: text };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[GHL contacts] advance opportunity error:", err);
    return { success: false, error: err.message || "unknown" };
  }
}
