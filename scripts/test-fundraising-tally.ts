// Logic tests for the fundraising tally: exclusion rules, idempotency of the
// in-place description patch, and escaping. Pure functions only — no network,
// so this runs without Shopify credentials.
//   npm run test:tally

import { computeTally, patchDescription, renderCollectionTally, renderProductTally, CLUB_SHARE_CENTS_PER_UNIT, type CampaignConfig } from "../server/fundraising-tally";

const cfg: CampaignConfig = { handle:"h", club:"Malisi Samoa NZ", goalUnits:100, countFrom:"2026-08-05" };
const mk = (id:string, status:string, date:string, qty:number, email:string|null) => ({
  id, name:id, customerName:null, customerEmail:email, totalCents:0, currency:"NZD",
  financialStatus:status, fulfillmentStatus:null, createdAt:date, tags:[],
  lines:[{ title:"x", variantTitle:null, quantity:qty, unitPriceCents:0 }],
}) as any;

let pass=0, fail=0;
const ok=(n:string,c:boolean)=>{ c?pass++:fail++; console.log(`${c?"PASS":"FAIL"}  ${n}`); };

// exclusion rules
const orders=[
  mk("1","PAID","2026-08-10T00:00:00Z",3,"a@x.com"),
  mk("2","PAID","2026-08-11T00:00:00Z",2,"b@x.com"),
  mk("3","REFUNDED","2026-08-12T00:00:00Z",5,"c@x.com"),   // refunded -> excluded
  mk("4","VOIDED","2026-08-12T00:00:00Z",9,"d@x.com"),     // voided -> excluded
  mk("5","PAID","2026-07-01T00:00:00Z",7,"e@x.com"),       // before countFrom -> excluded
  mk("6","PAID","2026-08-13T00:00:00Z",1,"a@x.com"),       // same supporter as #1
];
const t=computeTally(cfg,orders);
ok("counts only standing, in-window orders (3+2+1=6)", t.units===6);
ok("refunded excluded", t.units!==11);
ok("pre-countFrom excluded", t.units!==13);
ok("distinct supporters deduped by email (a,b = 2)", t.supporters===2);
ok("raised = units x share", t.raisedCents===6*CLUB_SHARE_CENTS_PER_UNIT);
ok("pct vs 100 goal", t.pct===6);
ok("orderCount excludes filtered", t.orderCount===3);

// zero-state
const z=computeTally(cfg,[]);
ok("zero campaign is safe", z.units===0 && z.raisedCents===0 && z.pct===0);
ok("zero renders invite not $0", renderCollectionTally(z).includes("Be the first"));

// idempotency - collection
const hero=`<div>HERO</div><!-- SPLIT --><div>BODY</div>`;
const b1=renderCollectionTally(t);
const once=patchDescription(hero,b1,"collection");
const twice=patchDescription(once,b1,"collection");
ok("collection: inserted before SPLIT", once.indexOf("SPC-TALLY")<once.indexOf("<!-- SPLIT -->"));
ok("collection: idempotent (2 runs == 1 run)", once===twice);
ok("collection: hero+body preserved", twice.includes("HERO")&&twice.includes("BODY"));
ok("collection: exactly one tally block", (twice.match(/<!--SPC-TALLY-->/g)||[]).length===1);

// value change replaces in place, does not duplicate
const t2={...t,units:40,raisedCents:20000,pct:40};
const updated=patchDescription(once,renderCollectionTally(t2 as any),"collection");
ok("collection: updates value in place", updated.includes("$200")&&!updated.includes("$30"));
ok("collection: still one block after update", (updated.match(/<!--SPC-TALLY-->/g)||[]).length===1);

// product
const pd=`<p>Product copy.</p>`;
const p1=patchDescription(pd,renderProductTally(t),"product");
const p2=patchDescription(p1,renderProductTally(t),"product");
ok("product: idempotent", p1===p2);
ok("product: original copy preserved", p2.startsWith("<p>Product copy.</p>"));
ok("product: states the per-item amount", p2.includes("$5 from this item"));

// html escaping
const evil={...t, club:'<script>x</script>'} as any;
ok("club name is escaped", !renderCollectionTally(evil).includes("<script>"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
