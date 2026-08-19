/**
 * Regression guard for the customer DESIGN PROOF page (/proof/<token>).
 *
 * This page renders server-side via generatePoHtml(orderId, { audience:
 * "customer", interactive: true }). If it throws, the customer sees a generic
 * "Something went wrong" page and cannot view/edit their order — a silent,
 * revenue-blocking outage. Two real incidents this guards against:
 *
 *   1. A logo element with a NUMERIC sizeMm (the auto Sideline maker's mark
 *      wrote `sizeMm: 60`) made esc() call .replace on a number and throw.
 *      Root fix: esc() coerces any value. This test feeds numeric/boolean/
 *      object junk through the render and asserts it never throws.
 *
 *   2. The personalise-vs-grid toggle: every sized garment must render BOTH a
 *      size grid and a personalise table, with exactly one visible (the other
 *      [hidden]). If that invariant breaks, customers lose a mode or a line
 *      gets double-counted on submit.
 *
 * DB-free and deterministic — mocks storage.getOrderWithDetails, so it runs
 * anywhere (CI, pre-deploy) with no secrets. The LIVE proof pages are checked
 * separately by the production monitor.
 *
 * Run:  npx tsx scripts/test-proof-render.ts   (exit 0 = pass, 1 = fail)
 */
import { strict as assert } from "node:assert";
import { storage } from "../server/storage";
import { proofSubmitSchema } from "../server/routes/approvals";

let failures = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log("  ✓", name); }
  catch (e: any) { failures++; console.log("  ✗", name, "\n     →", e?.message); }
}

// Build an order-with-details shape. Overrides let each case bend one thing.
function order(overrides: any = {}) {
  return {
    order: {
      id: "ord", orderNumber: "SNZ-1", poReference: "PO-1", accountName: "Test FC",
      customerName: "Pat Q", customerFirstName: "Pat", customerLastName: "Q",
      customerEmail: "pat@example.com", deliveryAddress: null,
      createdAt: new Date("2026-06-01T00:00:00Z"), dueDate: "2026-08-01",
      isRepeatOrder: false, poComments: null, artworkApproved: false,
      ...(overrides.order || {}),
    },
    items: overrides.items ?? [],
    sizeBreakdowns: overrides.sizeBreakdowns ?? [],
  };
}

function item(overrides: any = {}) {
  return {
    id: "it1", productName: "Training Tee", productType: "tshirt",
    material: "Poly", brandingMethod: "Sublimation",
    productColors: [{ hex: "#123456", name: "Navy" }],
    designBrief: null, designNotes: null, quantity: 10,
    sizeChartType: "tshirt", elementUrls: [], designPrints: null,
    mockupImages: null, frontDesignUrl: null, backDesignUrl: null, ...overrides,
  };
}

async function render(data: any): Promise<string> {
  (storage as any).getOrderWithDetails = async () => data;
  const { generatePoHtml } = await import("../server/po-pdf");
  const html = await generatePoHtml("ord", { audience: "customer", interactive: true, submitUrl: "/api/approve/tok/submit" });
  assert.ok(html && html.length > 0, "render returned empty");
  return html!;
}

// Assert the inline <script> is syntactically valid JS.
function assertScriptParses(html: string) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "no <script> block found");
  new Function(m![1]); // throws on syntax error
}

// Toggle invariant: N item blocks ⇒ N toggles, 2N mode panels, N hidden.
function assertToggleInvariant(html: string, expectBlocks: number) {
  // Match the wrapper div (`data-item-block data-item-id=`), NOT the script's
  // CSS selector reference (`[data-item-block][data-item-id=`).
  const blocks = (html.match(/data-item-block data-item-id=/g) || []).length;
  const toggles = (html.match(/data-modetoggle/g) || []).length;
  const panels = (html.match(/data-modepanel="(grid|roster)"/g) || []).length;
  const hidden = (html.match(/data-modepanel="(grid|roster)" hidden/g) || []).length;
  assert.equal(blocks, expectBlocks, `item blocks ${blocks} != ${expectBlocks}`);
  assert.equal(toggles, expectBlocks, `toggles ${toggles} != ${expectBlocks}`);
  assert.equal(panels, expectBlocks * 2, `panels ${panels} != ${expectBlocks * 2}`);
  assert.equal(hidden, expectBlocks, `hidden panels ${hidden} != ${expectBlocks} (exactly one hidden per item)`);
}

// Execute the page's OWN snzCollect against a minimal DOM stub. No jsdom in this
// repo, so we stub only the handful of calls snzCollect makes. This runs the
// emitted browser code rather than asserting on its source text.
function runCollect(html: string, rowValues: Array<Record<string, string>>): any {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "no <script> block found");
  const cell = (v: string) => ({ value: v });
  const trs = rowValues.map((vals) => ({
    querySelector: (sel: string) => {
      const key = (sel.match(/data-cell="([^"]+)"/) || [])[1];
      return key && key in vals ? cell(vals[key]) : null;
    },
  }));
  const table = {
    getAttribute: (a: string) => (a === "data-item-id" ? "it1" : null),
    closest: () => null,                       // not inside a hidden panel → visible
    querySelectorAll: (sel: string) => (sel === "tbody tr" ? trs : []),
  };
  const document = {
    querySelectorAll: (sel: string) => (sel === "table[data-roster]" ? [table] : []),
    querySelector: () => null,
    addEventListener: () => {},
  };
  const fn = new Function("document", m![1] + "\n;return snzCollect('approved');");
  return fn(document);
}

async function main() {
  console.log("customer proof render — regression guard\n");

  // ── The actual outage: numeric sizeMm on a logo element ──
  const numericMark = await render(order({
    items: [item({ elementUrls: [
      { name: "Sideline", url: "https://x/logo.png", position: "Center Back", application: "Embroidery", sizeMm: 60 },       // number!
      { name: "Club", url: "https://x/club.png", position: "Left Chest", application: "Embroidery", sizeMm: "85 × 60 mm" },   // string
    ] })],
    sizeBreakdowns: [{ orderItemId: "it1", size: "M", quantity: 5 }, { orderItemId: "it1", size: "L", quantity: 5 }],
  }));
  check("  → renders and the numeric size survives to output", () => {
    assert.ok(numericMark.includes("60"), "escaped numeric sizeMm '60' missing from output");
    assertScriptParses(numericMark);
    assertToggleInvariant(numericMark, 1);
  });

  // ── esc() must tolerate any junk type (broadest guard) ──
  const junk = await render(order({
    items: [item({ elementUrls: [
      { name: 42 as any, url: "https://x/a.png", position: "Right Chest", application: true as any, sizeMm: { mm: 60 } as any, threadColours: [123 as any] },
    ] })],
    sizeBreakdowns: [{ orderItemId: "it1", size: "M", quantity: 3 }],
  }));
  check("  → junk render parses + toggle intact", () => { assertScriptParses(junk); assertToggleInvariant(junk, 1); });

  // ── Every sized garment gets BOTH modes, regardless of seeded data ──
  const gridSeeded = await render(order({
    items: [item()],
    sizeBreakdowns: [{ orderItemId: "it1", size: "M", quantity: 5 }], // no names → default grid
  }));
  check("grid-seeded order (no names) still offers a Personalise panel", () => {
    assert.ok(gridSeeded.includes('data-modepanel="roster"'), "roster (personalise) panel missing");
    assert.ok(gridSeeded.includes('data-mode="grid"'), "should default to grid when no names");
    assertToggleInvariant(gridSeeded, 1);
  });

  const rosterSeeded = await render(order({
    items: [item()],
    sizeBreakdowns: [{ orderItemId: "it1", size: "M", quantity: 1, playerName: "Miranda", namePlacement: "MIRANDA" }],
  }));
  check("roster-seeded order (has names) still offers a Sizes & quantities panel", () => {
    assert.ok(rosterSeeded.includes('data-modepanel="grid"'), "grid panel missing");
    assert.ok(rosterSeeded.includes('data-mode="roster"'), "should default to roster when names present");
    assertToggleInvariant(rosterSeeded, 1);
  });

  // ── Multi-item order: invariant holds per line (scoped add/renumber) ──
  const multi = await render(order({
    items: [item({ id: "a" }), item({ id: "b", productName: "Shorts", sizeChartType: "shorts" }), item({ id: "c", productName: "Cap", productType: "cap", sizeChartType: "none" })],
    sizeBreakdowns: [{ orderItemId: "a", size: "M", quantity: 2 }, { orderItemId: "b", size: "L", quantity: 2 }],
  }));
  check("multi-item order: sized lines each get their own toggle+panels", () => {
    assertScriptParses(multi);
    // 'a' and 'b' are sized (2 blocks); 'c' is one-size (no chart) → no block.
    assertToggleInvariant(multi, 2);
  });

  // ── Jersey numbers: the proof form must CAPTURE the number-to-size pairing ──
  // Real incident (Narre Warren PO-2026-0035, Jul 2026): the roster table had
  // no jersey-number field, so the client encoded the pairing in row order and
  // it was lost on save. Puffin got 23 sizes it could not match to 23 printed
  // numbers. These guard the column, the prefill, and the submit payload.
  const numbered = await render(order({
    items: [item({ productName: "Rugby Match Jersey", productType: "jersey" })],
    sizeBreakdowns: [
      { orderItemId: "it1", size: "M", quantity: 1, playerNumber: "7" },
      { orderItemId: "it1", size: "2XL", quantity: 1, playerNumber: "23" },
    ],
  }));
  check("jersey no. column renders, prefills, and defaults to the roster mode", () => {
    assert.ok(numbered.includes("Jersey no."), "Jersey no. column header missing");
    assert.ok(numbered.includes('data-cell="playerNumber"'), "jersey number input missing");
    assert.ok(/data-cell="playerNumber"[^>]*value="7"/.test(numbered), "existing number 7 not prefilled");
    assert.ok(/data-cell="playerNumber"[^>]*value="23"/.test(numbered), "existing number 23 not prefilled");
    assert.ok(numbered.includes('data-mode="roster"'), "numbered rows should default to the personalise table");
    assertScriptParses(numbered);
    assertToggleInvariant(numbered, 1);
  });

  check("submit payload carries playerNumber (runs the page's own snzCollect)", () => {
    const payload = runCollect(numbered, [
      { playerNumber: "7", playerName: "Sione", size: "M", quantity: "1", nameOnBack: "SIONE" },
      { playerNumber: "23", playerName: "", size: "2XL", quantity: "1", nameOnBack: "" },
    ]);
    const rows = payload.rosters[0].rows;
    assert.equal(rows.length, 2, `expected 2 collected rows, got ${rows.length}`);
    assert.equal(rows[0].playerNumber, "7", `row 1 playerNumber was ${JSON.stringify(rows[0].playerNumber)}`);
    assert.equal(rows[1].playerNumber, "23", `row 2 playerNumber was ${JSON.stringify(rows[1].playerNumber)}`);
    assert.equal(rows[0].size, "M");
    assert.equal(rows[1].quantity, 1);
  });

  check("the API schema accepts playerNumber instead of stripping it", () => {
    const parsed = proofSubmitSchema.parse({
      decision: "approved",
      rosters: [{ itemId: "it1", rows: [{ playerNumber: "7", playerName: "Sione", size: "M", quantity: 1 }] }],
    });
    assert.equal(parsed.rosters?.[0].rows[0].playerNumber, "7", "zod dropped playerNumber from the payload");
  });

  // ── The supplier sheet is the payoff: it must print the number ──
  // Rendered outside check() because check() is synchronous: an await inside it
  // would swallow the assertion into an unhandled rejection and report a pass.
  (storage as any).getOrderWithDetails = async () => order({
    items: [item({ productName: "Rugby Match Jersey" })],
    sizeBreakdowns: [{ orderItemId: "it1", size: "M", quantity: 1, playerNumber: "7" }],
  });
  const { generatePoHtml: genSheet } = await import("../server/po-pdf");
  const supplierSheet = await genSheet("ord", { audience: "supplier" });
  check("supplier sheet prints #number beside the size", () => {
    assert.ok(supplierSheet && supplierSheet.includes("#7"), "supplier sidebar did not print #7");
  });

  // ── Degenerate shapes must not throw ──
  for (const [label, data] of Object.entries({
    "empty items": order({ items: [] }),
    "all-null item fields": order({ items: [item({ productType: null, material: null, brandingMethod: null, productColors: null, quantity: null, sizeChartType: null, elementUrls: null })], sizeBreakdowns: null }),
    "unknown chart type": order({ items: [item({ sizeChartType: "not_a_chart", productType: "mystery" })], sizeBreakdowns: [{ orderItemId: "it1", size: "M", quantity: 1 }] }),
    "null order fields": order({ order: { orderNumber: null, poReference: null, accountName: null, customerName: null }, items: [item()], sizeBreakdowns: [{ orderItemId: "it1", size: "M", quantity: 1 }] }),
  })) {
    const html = await render(data);
    check(`degenerate: ${label} renders + script parses`, () => { assert.ok(html.length > 0); assertScriptParses(html); });
  }

  console.log(failures === 0 ? "\nALL PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e?.stack || e?.message); process.exit(1); });
