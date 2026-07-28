// The designer portal shell — left nav, brand, and the views a designer gets.
//
// Server-rendered rather than React, because the whole point of this surface is
// that it needs no login: the token in the URL is the credential, same model as
// /job/<token> and /s/<token>. Onboarding a freelancer is sending them a link.
//
// Brand assets are served from client/public/brand/ at STABLE paths. The built
// /assets/* filenames are content-hashed and change every deploy, so they can
// never be referenced from a server-rendered string.

export type PortalView = "board" | "jobs" | "brand" | "earnings" | "standards";

export interface ShellOpts {
  displayName: string;
  token: string;
  view: PortalView;
  openCount: number;
  wipCap: number;
  tier: string;
  email?: string | null;
  title: string;
  subtitle?: string;
  body: string;
  extraScript?: string;
}

const NAV: Array<{ key: PortalView; label: string; icon: string }> = [
  { key: "board", label: "Design Board", icon: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>' },
  { key: "jobs", label: "My Jobs", icon: '<path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6 7 18.2l1.9-5.8L4 8.8h6.1z"/>' },
  { key: "brand", label: "Brand Kit", icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>' },
  { key: "earnings", label: "Earnings", icon: '<path d="M20 12V8H6a2 2 0 010-4h12v4"/><path d="M4 6v12a2 2 0 002 2h14v-4"/><path d="M18 12a2 2 0 000 4h4v-4z"/>' },
  { key: "standards", label: "Standards", icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' },
];

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderShell(o: ShellOpts): string {
  const base = `/designers/${encodeURIComponent(o.token)}`;
  const nav = NAV.map((n) => {
    const href = n.key === "board" ? base : `${base}/${n.key}`;
    const on = n.key === o.view;
    const badge = n.key === "jobs" && o.openCount ? `<span class="pill">${o.openCount}</span>` : "";
    return `<a class="nl${on ? " on" : ""}" href="${href}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${n.icon}</svg>
      ${n.label}${badge}</a>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Sideline — ${esc(o.displayName)}</title>
<style>
@font-face{font-family:'Peloric';src:url('/brand/Peloric-Bold.otf') format('opentype');font-weight:700;font-display:swap}
:root{--bg:#000;--card:#111;--line:rgba(255,255,255,.06);--line2:rgba(255,255,255,.08);
 --ink:#f0f0f0;--mute:rgba(255,255,255,.5);--faint:rgba(255,255,255,.35);--ghost:rgba(255,255,255,.25);
 --brand:#f97316;--ok:#22c55e;--wait:#f59e0b;--bad:#ef4444;
 --head:'Peloric','Bebas Neue','Oswald',sans-serif;
 --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
 --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:var(--head);font-weight:400;letter-spacing:.05em;text-transform:uppercase;margin:0}
h1{font-size:28px}
.shell{display:flex;min-height:100vh}
.side{width:250px;flex:none;border-right:1px solid var(--line2);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
.side .logo{padding:22px 18px 20px;border-bottom:1px solid var(--line2)}
.side .logo img{height:26px;display:block}
.side .logo p{font-size:10.5px;color:var(--faint);margin:8px 0 0;letter-spacing:2px;text-transform:uppercase}
.side nav{padding:14px 12px;flex:1;display:flex;flex-direction:column;gap:3px}
.nl{display:flex;align-items:center;gap:12px;padding:10px 15px;border-radius:8px;font-size:14px;color:var(--mute);
 border-left:3px solid transparent;text-decoration:none;transition:all .15s ease}
.nl:hover{color:var(--ink);background:rgba(255,255,255,.03)}
.nl.on{color:#fff;font-weight:600;background:rgba(249,115,22,.12);border-left-color:var(--brand)}
.nl svg{width:17px;height:17px;flex:none}
.pill{margin-left:auto;font-family:var(--mono);font-size:10px;font-weight:700;background:rgba(249,115,22,.25);color:#fff;border-radius:5px;padding:1px 6px}
.side .foot{padding:14px 18px;border-top:1px solid var(--line2)}
.side .foot b{display:block;font-size:12.5px;font-weight:600}
.side .foot span{font-size:10.5px;color:var(--faint);font-family:var(--mono);text-transform:uppercase;letter-spacing:.08em}
.main{flex:1;min-width:0;padding:26px 28px 70px}
.pagehd{margin-bottom:22px}
.pagehd p{font-size:14px;color:var(--mute);margin:6px 0 0;max-width:70ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(238px,1fr));gap:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:15px 16px}
.card.mine{border-color:rgba(249,115,22,.35)}
.card h3{font-size:17px;margin:0 0 3px}
.tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:9px}
.tag{font-size:10.5px;font-weight:700;border-radius:4px;padding:2px 7px;background:rgba(255,255,255,.07);color:var(--mute)}
.tag.p{background:rgba(249,115,22,.14);color:var(--brand)}
.tag.r{background:rgba(245,158,11,.14);color:var(--wait)}
.q{font-family:var(--mono);font-size:11px;color:var(--ghost);margin:0 0 10px}
.meta{display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:10px;font-size:12px;color:var(--mute)}
.meta b{color:#fff;font-family:var(--mono);font-size:13px}
.btn{display:block;width:100%;box-sizing:border-box;text-align:center;margin-top:11px;border:0;border-radius:8px;padding:10px;
 background:var(--brand);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;text-decoration:none}
.btn:hover{filter:brightness(1.1)}
.btn.off{background:rgba(255,255,255,.06);color:var(--ghost);cursor:not-allowed}
.note{background:var(--card);border:1px dashed rgba(255,255,255,.14);border-radius:12px;padding:18px 20px;color:var(--mute);font-size:13.5px;line-height:1.55}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:15px 16px}
.stat .k{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.4);margin:0}
.stat .v{font-size:24px;font-weight:700;font-family:var(--mono);margin:4px 0 0;font-variant-numeric:tabular-nums}
.stat .s{font-size:11.5px;color:var(--faint);margin:2px 0 0}
.checks{list-style:none;margin:0;padding:0}
.checks li{display:flex;gap:11px;padding:11px 0;border-top:1px solid var(--line);font-size:14px}
.checks li:first-child{border-top:0}
.checks .n{font-family:var(--mono);font-size:11px;color:var(--brand);font-weight:700;flex:none;width:20px;height:20px;
 border-radius:5px;background:rgba(249,115,22,.12);display:grid;place-items:center}
.rules{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:11px}
.rules li{font-size:13.5px;color:var(--mute);padding-left:16px;position:relative;line-height:1.5}
.rules li::before{content:"";position:absolute;left:0;top:8px;width:5px;height:5px;border-radius:50%;background:var(--brand)}
.rules b{color:var(--ink);font-weight:600}
.msg{margin-top:12px;font-size:13px;color:var(--wait);min-height:18px}
.files{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.file{background:#0a0a0a;border:1px solid var(--line);border-radius:9px;padding:10px;text-align:center;text-decoration:none;display:block}
.file:hover{border-color:rgba(249,115,22,.4)}
.file .ph{height:60px;border-radius:6px;background:#1a1a1a;display:grid;place-items:center;margin-bottom:7px;
 font-family:var(--mono);font-size:9px;color:var(--brand);letter-spacing:.06em}
.file .nm{font-size:10.5px;color:var(--mute);font-family:var(--mono);word-break:break-all;line-height:1.35}
@media (max-width:860px){
 .side{position:static;width:100%;height:auto;border-right:0;border-bottom:1px solid var(--line2)}
 .shell{flex-direction:column}
 .side nav{flex-direction:row;overflow-x:auto;padding:10px}
 .nl{border-left:0;border-bottom:3px solid transparent;white-space:nowrap}
 .nl.on{border-left:0;border-bottom-color:var(--brand)}
 .side .foot{display:none}
 .main{padding:20px 16px 60px}
}
</style></head><body>
<div class="shell">
  <aside class="side">
    <div class="logo"><img src="/brand/sideline-logo.png" alt="Sideline NZ"><p>Designer Portal</p></div>
    <nav>${nav}</nav>
    <div class="foot"><b>${esc(o.displayName)}</b><span>${esc(o.tier)} · ${o.openCount}/${o.wipCap} jobs</span></div>
  </aside>
  <main class="main">
    <div class="pagehd"><h1>${esc(o.title)}</h1>${o.subtitle ? `<p>${o.subtitle}</p>` : ""}</div>
    ${o.body}
  </main>
</div>
${o.extraScript ? `<script>${o.extraScript}</script>` : ""}
</body></html>`;
}
