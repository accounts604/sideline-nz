import { Router } from "express";
import { BLOG_POSTS, getPost, type BlogPost } from "../blog-posts";

// Server-rendered blog: real HTML for crawlers (the SPA is client-rendered, so
// SEO content lives here instead). Registered before the SPA fallback.

const router = Router();
const SITE = "https://sidelinenz.com";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00+12:00`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

function page(opts: {
  title: string;
  description: string;
  canonical: string;
  ogType: string;
  ogImage?: string;
  jsonLd?: object;
  content: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${opts.canonical}">
<meta property="og:site_name" content="Sideline NZ">
<meta property="og:type" content="${opts.ogType}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${opts.canonical}">
${opts.ogImage ? `<meta property="og:image" content="${opts.ogImage}">\n<meta name="twitter:card" content="summary_large_image">` : ""}
${opts.jsonLd ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#000;color:#fff;font-family:"DM Sans",system-ui,sans-serif;line-height:1.65}
  a{color:#fff}
  header{position:sticky;top:0;background:rgba(0,0,0,.92);backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,.07);z-index:10}
  .nav{max-width:1080px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
  .wordmark{font-family:"Bebas Neue",sans-serif;font-size:26px;letter-spacing:.08em;text-decoration:none}
  .nav nav{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
  .nav nav a{font-size:11px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;color:rgba(255,255,255,.5)}
  .nav nav a:hover{color:#fff}
  .nav .cta{background:#fff;color:#000;padding:8px 14px;border-radius:4px;font-weight:600}
  main{max-width:820px;margin:0 auto;padding:40px 20px 80px}
  h1{font-family:"Bebas Neue",sans-serif;font-size:clamp(34px,6vw,54px);line-height:1.05;letter-spacing:.02em;margin:8px 0 10px}
  h2{font-family:"Bebas Neue",sans-serif;font-size:30px;letter-spacing:.03em;margin:44px 0 10px}
  h3{font-size:19px;margin:32px 0 8px}
  .meta{color:rgba(255,255,255,.4);font-size:13px;letter-spacing:.1em;text-transform:uppercase}
  article p{color:rgba(255,255,255,.78)}
  article a{color:#fff;text-underline-offset:3px}
  .hero{width:100%;border-radius:10px;margin:22px 0 8px}
  .compare{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}
  .compare figure{flex:1;min-width:260px;margin:0}
  figure.single{margin:14px 0;max-width:540px}
  article img{width:100%;border-radius:8px;background:#111}
  figcaption{font-size:13px;color:rgba(255,255,255,.45);margin-top:6px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-top:28px}
  .card{border:1px solid rgba(255,255,255,.1);border-radius:12px;overflow:hidden;text-decoration:none;display:block;background:#0a0a0a}
  .card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
  .card .pad{padding:16px}
  .card h2{font-size:22px;margin:0 0 8px}
  .card p{color:rgba(255,255,255,.55);font-size:14px;margin:0}
  .band{margin-top:60px;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:28px;text-align:center}
  .band a.btn{display:inline-block;background:#fff;color:#000;padding:12px 22px;border-radius:4px;font-weight:700;text-decoration:none;font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin-top:12px}
  footer{border-top:1px solid rgba(255,255,255,.07);padding:32px 20px;text-align:center;color:rgba(255,255,255,.3);font-size:12px;letter-spacing:.08em}
  footer a{color:rgba(255,255,255,.4);text-decoration:none;margin:0 10px}
</style>
</head>
<body>
<header><div class="nav">
  <a class="wordmark" href="/">SIDELINE&nbsp;NZ</a>
  <nav>
    <a href="/sports">Sports</a>
    <a href="/team-stores">Team Stores</a>
    <a href="/blog">Blog</a>
    <a href="/contact">Contact</a>
    <a class="cta" href="/free-mockup">Get free mockup</a>
  </nav>
</div></header>
<main>${opts.content}</main>
<footer>
  <div><a href="/">Home</a><a href="/blog">Blog</a><a href="https://teamstore.sidelinenz.com">Shop</a><a href="/terms">Terms</a></div>
  <div style="margin-top:10px">&copy; ${new Date().getFullYear()} Sideline Custom Goods Ltd</div>
</footer>
</body>
</html>`;
}

function postCard(p: BlogPost): string {
  return `<a class="card" href="/blog/${p.slug}">
    <img src="${p.featuredImage}" alt="${esc(p.featuredImageAlt)}" loading="lazy">
    <div class="pad"><h2>${esc(p.title)}</h2><p>${esc(p.summary)}</p>
    <p class="meta" style="margin-top:10px">${fmtDate(p.publishedAt)}</p></div>
  </a>`;
}

router.get("/blog", (_req, res) => {
  const html = page({
    title: "Blog | Sideline NZ — Custom Teamwear & Supporters Merch",
    description:
      "Stories from the Sideline NZ production line: club and school supporter ranges from approved mockup to finished kit, fundraising team stores, and custom teamwear across New Zealand.",
    canonical: `${SITE}/blog`,
    ogType: "website",
    ogImage: BLOG_POSTS[0]?.featuredImage,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Sideline NZ Blog",
      url: `${SITE}/blog`,
      publisher: { "@type": "Organization", name: "Sideline NZ", url: SITE },
    },
    content: `<p class="meta">Sideline NZ</p><h1>From the Sideline</h1>
      <p style="color:rgba(255,255,255,.6);max-width:640px">Real gear, real clubs. What we design, what we deliver, and how supporter ranges fund grassroots sport in New Zealand.</p>
      <div class="cards">${BLOG_POSTS.map(postCard).join("")}</div>`,
  });
  res.type("html").send(html);
});

router.get("/blog/:slug", (req, res, next) => {
  const post = getPost(req.params.slug);
  if (!post) return next();
  const canonical = `${SITE}/blog/${post.slug}`;
  const html = page({
    title: `${post.title} | Sideline NZ`,
    description: post.summary,
    canonical,
    ogType: "article",
    ogImage: post.featuredImage,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.summary,
      image: post.featuredImage,
      datePublished: post.publishedAt,
      keywords: post.tags.join(", "),
      mainEntityOfPage: canonical,
      author: { "@type": "Organization", name: "Sideline NZ", url: SITE },
      publisher: { "@type": "Organization", name: "Sideline NZ", url: SITE },
    },
    content: `<p class="meta">${fmtDate(post.publishedAt)} · Sideline NZ</p>
      <h1>${esc(post.title)}</h1>
      <img class="hero" src="${post.featuredImage}" alt="${esc(post.featuredImageAlt)}">
      <article>${post.body}</article>
      <div class="band">
        <h2 style="margin-top:0">Want this for your club or school?</h2>
        <p style="color:rgba(255,255,255,.6)">Free design mockups. A free online team store. Your supporters buy direct and your club keeps the margin.</p>
        <a class="btn" href="/free-mockup">Get a free mockup</a>
      </div>
      <p style="margin-top:28px"><a href="/blog">&larr; All posts</a></p>`,
  });
  res.type("html").send(html);
});

export default router;
