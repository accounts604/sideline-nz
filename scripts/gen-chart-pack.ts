// Master size chart pack generator — renders EVERY chart from
// shared/size-charts.ts into one supplier-facing HTML document (Annex A of the
// Puffin Supply Terms). Regenerate whenever charts change, then print to PDF:
//   npx tsx scripts/gen-chart-pack.ts [output.html]
//   chrome --headless --print-to-pdf=out.pdf --no-pdf-header-footer file://.../out.html
import { SIZE_CHART_DATA, type SizeChartType, type SizeTable } from '../shared/size-charts';
import * as fs from 'fs';
const esc = (s: any) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const tableHtml = (t: SizeTable) => `
  <h3>${esc(t.title)}</h3>
  <table><thead><tr>${t.headers.map((h,i)=>`<th${i===0?' class="lbl"':''}>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${t.rows.map(r=>`<tr><td class="lbl">${esc(r.label)}</td>${r.values.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <p class="tol">Tolerance ${esc(t.tolerance)}</p>`;
const section = (title: string, note: string, keys: SizeChartType[]) => `
  <section><h2>${esc(title)}</h2><p class="note">${note}</p>
  ${keys.flatMap(k => SIZE_CHART_DATA[k].map(tableHtml)).join('')}</section>`;
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:Helvetica,Arial,sans-serif;color:#111;font-size:11px;margin:34px 40px;}
  h1{font-size:22px;letter-spacing:1px;text-transform:uppercase;margin:0 0 2px;}
  .sub{color:#555;font-size:12px;margin-bottom:6px;}
  .rules{background:#f5f5f5;border:1px solid #ddd;padding:10px 14px;font-size:11.5px;margin:14px 0 6px;}
  h2{font-size:15px;text-transform:uppercase;border-bottom:2px solid #111;padding-bottom:4px;margin:26px 0 4px;page-break-after:avoid;}
  h3{font-size:12px;margin:14px 0 4px;page-break-after:avoid;}
  .note{color:#555;font-style:italic;margin:2px 0 8px;}
  table{border-collapse:collapse;width:100%;page-break-inside:avoid;}
  th,td{border:1px solid #bbb;padding:4px 6px;text-align:center;font-size:10.5px;}
  th{background:#111;color:#fff;font-size:10px;}
  td.lbl,th.lbl{text-align:left;font-weight:700;white-space:nowrap;}
  .tol{color:#888;font-size:9.5px;text-align:right;margin:3px 0 0;}
  footer{margin-top:24px;color:#999;font-size:9.5px;border-top:1px solid #ddd;padding-top:6px;}
</style></head><body>
  <h1>Sideline NZ &middot; Master Size Charts</h1>
  <div class="sub">Version July 2026 (rev 3, Rugby Long Sleeve Jersey in classic relaxed fit) &middot; All measurements in centimetres, garment laid flat and relaxed &middot; Also published at sidelinenz.com/size-chart</div>
  <div class="rules"><b>Production rules:</b> Every PO prints the centimetre measurements from these charts. Cut to the printed centimetres; size labels are names only. Where a chart or measurement is unclear, pause that line and ask before cutting. Playing Kit uses the Kokonut chart (identical numbers below) so existing Kokonut patterns can be used for those garments only. All other garments follow these tables, never the Kokonut chart.</div>
  ${section('1. Playing Kit — Sports Fit', 'Rugby jerseys and rugby shorts, match wear. These numbers are identical to the Kokonut chart: use those patterns. Kids K6 to K16 = our Y6 to Y16.', ['rugby-jersey'])}
  ${section('2. Rugby Long Sleeve Jersey — Classic Relaxed Fit', 'Traditional rugby jersey: roomy chest and LONG body (72 to 92 cm). This is NOT the playing cut and NOT the Kokonut pattern. Cut to these centimetres. FABRIC: cotton or cotton blend, 330 gsm, confirmed before production.', ['rugby-long-sleeve'])}
  ${section('3. Rugby Kit — Supporters Cut (Relaxed)', 'Optional fuller cut, ordered by name on the PO line. Longer body, relaxed fit.', ['rugby-jersey-supporters'])}
  ${section('4. Jackets — All Styles', 'ONE chart for softshell, rugby shell, windbreaker and quarter zip: the same size fits the same across every style. Do not use house or Kokonut jacket patterns.', ['jacket'])}
  ${section('5. Stadium Jacket — Longline', 'Sub coat cut below the knee. Note the body lengths: this is NOT the standard jacket pattern.', ['stadium-jacket'])}
  ${section('6. T-Shirts and Polos', 'Confirmed correct by delivered orders. No change from current production where it followed this chart.', ['tshirt'])}
  ${section('7. Hoodies and Crew Necks', 'Confirmed correct by delivered orders.', ['hoodie'])}
  ${section('8. Singlets', '', ['singlet'])}
  ${section('9. Shorts (Casual / Training)', '', ['shorts'])}
  ${section('10. Trackpants', '', ['trackpants'])}
  ${section('11. Socks', 'Sized by shoe size.', ['socks'])}
  ${section('12. Headwear', 'Bucket hat in TWO sizes. Cap one size, 62 cm perimeter. Circumference is the critical measurement.', ['headwear'])}
  ${section('13. Beanie', '', ['beanie'])}
  <footer>Sideline Custom Goods Limited &middot; info@sidelinenz.com &middot; This document is Annex A (Size Charts) to the Sideline x Puffin Supply Terms of Service.</footer>
</body></html>`;
const out = process.argv[2] || '/Users/kigagent/.openclaw/workspace/deliverables/sideline/sideline-master-size-charts-jul2026.html';
fs.writeFileSync(out, html);
console.log('written', out, html.length);
