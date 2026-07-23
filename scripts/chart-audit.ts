// Size chart stress test: structure, monotonic grading, layering logic,
// product mappings, legacy id normalization. Run: npx tsx scripts/chart-audit.ts
import { SIZE_CHART_DATA, SIZE_CHART_LABELS, SIZE_CHART_DIAGRAMS, suggestSizeChart, chartSizes, ALL_CHART_SIZES, normalizeChartType, type SizeChartType } from "../shared/size-charts";

const issues: string[] = [];
const warn = (s: string) => issues.push(s);

for (const [key, tables] of Object.entries(SIZE_CHART_DATA)) {
  for (const t of tables) {
    const n = t.headers.length - 1;
    for (const r of t.rows) if (r.values.length !== n) warn(`STRUCT ${key} / "${t.title}" / "${r.label}": ${r.values.length} values for ${n} size columns`);
    if (!t.tolerance) warn(`STRUCT ${key} / "${t.title}": no tolerance`);
  }
  if (key !== "none" && !SIZE_CHART_LABELS[key as SizeChartType]) warn(`LABEL missing for ${key}`);
  if (key !== "none" && !SIZE_CHART_DIAGRAMS[key as SizeChartType]) warn(`DIAGRAM missing for ${key}`);
}

for (const [key, tables] of Object.entries(SIZE_CHART_DATA)) {
  for (const t of tables) for (const r of t.rows) {
    let prev: number | null = null;
    r.values.forEach((v, i) => {
      if (typeof v === "number") {
        if (prev !== null && v < prev) warn(`MONO ${key} / "${t.title}" / "${r.label}": ${t.headers[i + 1]}=${v} < previous ${prev}`);
        prev = v;
      } else prev = null;
    });
    for (let i = 1; i < r.values.length; i++) {
      const a = r.values[i - 1], b = r.values[i];
      if (typeof a === "number" && typeof b === "number" && Math.abs(b - a) > 8)
        warn(`GRADE ${key} / "${r.label}": ${t.headers[i]}=${a} -> ${t.headers[i + 1]}=${b} (step ${(b - a).toFixed(1)})`);
    }
  }
}

const measure = (key: SizeChartType, tableIdx: number, rowLabel: string, size: string): number | null => {
  const t = SIZE_CHART_DATA[key]?.[tableIdx]; if (!t) return null;
  const i = t.headers.indexOf(size); if (i < 1) return null;
  const r = t.rows.find((r) => r.label.includes(rowLabel)); if (!r) return null;
  const v = r.values[i - 1]; return typeof v === "number" ? v : null;
};
for (const s of ["S", "M", "L", "XL", "2XL", "3XL"]) {
  const tee = measure("tshirt", 0, "½ Chest", s), hood = measure("hoodie", 0, "½ Chest", s),
        jack = measure("jacket", 0, "½ Chest", s), stad = measure("stadium-jacket", 0, "½ Chest", s);
  if (tee && hood && hood < tee) warn(`LAYER ${s}: hoodie ${hood} < tee ${tee}`);
  if (hood && jack && jack < hood) warn(`LAYER ${s}: jacket ${jack} < hoodie ${hood}`);
  if (jack && stad && stad < jack - 1.5) warn(`LAYER ${s}: stadium ${stad} noticeably < jacket ${jack} (worn over layers)`);
}

for (const legacy of ["kokonut-jacket"]) {
  const t = normalizeChartType(legacy);
  const hasLength = SIZE_CHART_DATA[t]?.some((tb) => tb.rows.some((r) => /length/i.test(r.label)));
  if (!hasLength) warn(`LEGACY ${legacy} -> ${t}: resolved chart has NO length row`);
}

for (const key of Object.keys(SIZE_CHART_DATA) as SizeChartType[]) {
  for (const s of chartSizes(key)) if (s.includes("/") && key !== "headwear") warn(`SIZELABEL ${key}: composite label "${s}" in customer size grids`);
}

console.log(`charts: ${Object.keys(SIZE_CHART_DATA).length}, size labels: ${ALL_CHART_SIZES.length}, sample mapping rugby-set -> ${suggestSizeChart("rugby-set")}`);
console.log(`\n=== ISSUES (${issues.length}) ===`);
issues.forEach((i) => console.log(" -", i));
process.exit(issues.filter((i) => i.startsWith("STRUCT")).length ? 1 : 0);
