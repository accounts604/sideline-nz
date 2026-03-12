// GHL tag sync — adds tags to contacts by email
// Used by notification system to update GHL when design approved, order shipped, etc.

const GHL_API_BASE = "https://services.leadconnectorhq.com";

interface GhlContact {
  id: string;
  tags: string[];
}

async function findContactByEmail(email: string): Promise<GhlContact | null> {
  const apiKey = process.env.SIDELINE_GHL_API_KEY;
  const locationId = process.env.SIDELINE_GHL_LOCATION_ID;
  if (!apiKey || !locationId) return null;

  try {
    const res = await fetch(
      `${GHL_API_BASE}/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
        },
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const contact = data.contact;
    if (!contact) return null;

    return { id: contact.id, tags: contact.tags || [] };
  } catch (err) {
    console.error("GHL find contact error:", err);
    return null;
  }
}

async function addTagToContact(contactId: string, tags: string[]): Promise<boolean> {
  const apiKey = process.env.SIDELINE_GHL_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({ tags }),
    });

    return res.ok;
  } catch (err) {
    console.error("GHL add tag error:", err);
    return false;
  }
}

/**
 * Add a tag to a GHL contact by email.
 * If GHL credentials are not configured, logs and returns silently.
 */
export async function syncGhlTag(email: string, tag: string): Promise<void> {
  const apiKey = process.env.SIDELINE_GHL_API_KEY;
  if (!apiKey) {
    console.log(`[GHL] Credentials not configured — would add tag "${tag}" to ${email}`);
    return;
  }

  const contact = await findContactByEmail(email);
  if (!contact) {
    console.log(`[GHL] Contact not found for ${email} — skipping tag "${tag}"`);
    return;
  }

  // Don't add duplicate tags
  if (contact.tags.includes(tag)) {
    console.log(`[GHL] Contact ${email} already has tag "${tag}"`);
    return;
  }

  const updatedTags = [...contact.tags, tag];
  const success = await addTagToContact(contact.id, updatedTags);

  if (success) {
    console.log(`[GHL] Added tag "${tag}" to contact ${email}`);
  } else {
    console.error(`[GHL] Failed to add tag "${tag}" to contact ${email}`);
  }
}
