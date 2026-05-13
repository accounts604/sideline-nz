/**
 * End-to-end test: every web-form field round-trips through GHL.
 *
 * 1. Builds a full-fields payload for each form (free-mockup-intake, start-a-project, contact, mockup-request)
 * 2. Calls the patched createGhlContact() exported from routes/ghl.ts
 * 3. Reads the resulting contact back from GHL
 * 4. Compares: every input field should be present (top-level, customField, or in additional_notes)
 * 5. Deletes the test contact
 *
 * Test emails are clearly tagged form-test-<timestamp>-<form>@kig-test.local so they
 * never collide with real leads.
 */
import "dotenv/config";
import { createGhlContact } from "../server/routes/ghl";

const KEY = process.env.SIDELINE_GHL_API_KEY!;
const LOC = process.env.SIDELINE_GHL_LOCATION_ID!;
const HDR = { Authorization: `Bearer ${KEY}`, Version: "2021-07-28", "Content-Type": "application/json" };
const NOW = Date.now();

async function ghlGet(path: string) {
  const r = await fetch(`https://services.leadconnectorhq.com${path}`, { headers: HDR });
  return r.json();
}

async function ghlDelete(id: string) {
  return fetch(`https://services.leadconnectorhq.com/contacts/${id}`, { method: "DELETE", headers: HDR });
}

async function fieldNameMap(): Promise<Record<string, string>> {
  const d: any = await ghlGet(`/locations/${LOC}/customFields?model=contact`);
  const map: Record<string, string> = {};
  for (const f of d.customFields || []) map[f.id] = f.name.trim();
  return map;
}

interface TestCase {
  label: string;
  tags: string[];
  payload: any;
}

const TESTS: TestCase[] = [
  {
    label: "free-mockup-intake (richest)",
    tags: ["free-mockup-request", "rugby-union", "100-200"],
    payload: {
      name: "TestUser Intake",
      email: `form-test-${NOW}-intake@kig-test.local`,
      phone: "+64210000000",
      organization: "Test Rugby Club",
      club_type: "School",
      sport: ["Rugby Union", "Touch"],
      role: "Coach",
      kit_items: ["Jerseys", "Shorts", "Socks", "Hoodies"],
      quantity_range: "100–200",
      primary_colour: "Black",
      secondary_colour: "Gold",
      timeline: "ASAP",
      current_supplier: "None",
      design_direction: "Bold and modern",
      logo_status: "Yes — high quality file",
      logo_notes: "Vector PDF available",
      design_notes: "Heritage stripe pattern",
      logo_file_url: "https://example.com/logo.png",
      contact_name: "TestUser Intake",
      source: "sidelinenz.com free-mockup-intake",
    },
  },
  {
    label: "start-a-project (long form)",
    tags: ["website lead", "start a project"],
    payload: {
      name: "TestUser Project",
      email: `form-test-${NOW}-project@kig-test.local`,
      phone: "+64210000001",
      organization: "Test FC",
      user_type: "Club Manager",
      role: "Club Manager",
      member_count: "150",
      current_supplier: "Dynasty",
      sports: "Rugby League",
      mockup_interest: "Yes",
      needs: "Full kit refresh",
      estimated_quantity: "200",
      kit_quantity: "150",
      supporter_quantity: "50",
      teams_involved: "Premier, Reserves, Junior",
      kit_items: "Jersey, Shorts, Socks",
      personalisation: "Numbers + names",
      supporter_audience: "Family + alumni",
      style_preference: "Modern with heritage nods",
      fundraising_interest: "Yes",
      sponsorship_interest: "Maybe",
      timing: "Q3 2026",
      season_start: "2026-08-01",
      design_stage: "Concept",
      budget_range: "$15,000–$25,000",
      notes: "Need approval from board",
      approval_process: "Board vote",
      main_concern: "Quality + delivery time",
      school_event_date: "",
      slt_friendly: "",
      team_store_interest: "Yes",
      team_store_audience: "Supporters + alumni",
      team_store_goal: "Fundraising",
      source: "sidelinenz.com start-a-project",
    },
  },
  {
    label: "contact-form (gate signup)",
    tags: ["website lead", "team store gate"],
    payload: {
      name: "TestUser Contact",
      email: `form-test-${NOW}-contact@kig-test.local`,
      phone: "+64210000002",
      organization: "Test Sports Academy",
      enquiry_type: "team-store-gate",
      message: "Interested in setting up a team store",
      source: "sidelinenz.com contact-form",
    },
  },
  {
    label: "mockup-request (hub form)",
    tags: ["website lead", "free mockup request"],
    payload: {
      organization: "Test Mockup Org",
      sport: "Rugby Union",
      sports: "Rugby Union",
      email: `form-test-${NOW}-mockup@kig-test.local`,
      phone: "+64210000003",
      mockup_interest: "Yes please",
      source: "sidelinenz.com hub-mockup-form",
    },
  },
];

(async () => {
  const fmap = await fieldNameMap();
  const results: any[] = [];

  for (const t of TESTS) {
    console.log(`\n=== ${t.label} ===`);
    const r = await createGhlContact(t.payload, t.tags);
    if (!r.success || !r.contactId) {
      console.log(`  ❌ create failed: ${JSON.stringify(r)}`);
      continue;
    }

    // Read back
    const back: any = await ghlGet(`/contacts/${r.contactId}`);
    const c = back.contact || back;
    const cf: Record<string, string> = {};
    for (const f of c.customFields || []) cf[fmap[f.id] || f.id] = f.value;

    console.log(`  ✓ contactId=${r.contactId}`);
    console.log(`  email=${c.email}  companyName=${c.companyName || "—"}  phone=${c.phone || "—"}`);
    console.log(`  customFields (${Object.keys(cf).length}):`);
    for (const [k, v] of Object.entries(cf)) {
      const val = String(v).length > 80 ? String(v).slice(0, 80) + "…" : v;
      console.log(`    • ${k.padEnd(28)} = ${val}`);
    }

    // Verify every payload field made it somewhere
    const pl = t.payload;
    const inputKeys = Object.keys(pl).filter(k => pl[k] && k !== "name" && k !== "email" && k !== "phone" && k !== "source");
    const missing: string[] = [];
    const additionalNotes = cf["Additional Notes"] || "";
    for (const k of inputKeys) {
      const ghlKeyForCustomField = {
        organization: "_company", role: "Role", contact_name: "Contact Name",
        current_supplier: "Current Supplier", kit_items: "Kit Items",
        quantity_range: "Quantity Range", primary_colour: "Primary Colour",
        secondary_colour: "Secondary Colour", timeline: "Timeline",
        design_direction: "Design Direction", logo_status: "Logo Status",
        logo_notes: "Logo Notes", design_notes: "Design Notes",
        club_type: "Club Type", sport: "Sport", sports: "Sport",
        timing: "Timeline", notes: "Notes",
      } as any;
      const expectedField = ghlKeyForCustomField[k];
      if (k === "organization") {
        if (c.companyName) continue;
        missing.push(`${k} (expected companyName)`);
      } else if (expectedField && cf[expectedField]) {
        continue;
      } else if (additionalNotes.includes(`${k}:`)) {
        continue;
      } else {
        missing.push(k);
      }
    }
    console.log(`  ${missing.length === 0 ? "✅ ALL FIELDS LANDED" : `⚠️  ${missing.length} missing: ${missing.join(", ")}`}`);

    results.push({ label: t.label, contactId: r.contactId, fieldCount: Object.keys(cf).length, missing });

    // Cleanup
    await ghlDelete(r.contactId);
    console.log(`  🗑  test contact deleted`);
  }

  console.log("\n\n=== SUMMARY ===");
  for (const r of results) {
    const status = r.missing.length === 0 ? "✅" : "⚠️ ";
    console.log(`${status} ${r.label.padEnd(30)} cf=${r.fieldCount}  missing=${r.missing.join(", ") || "none"}`);
  }
})();
