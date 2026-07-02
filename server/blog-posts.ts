// Server-rendered blog content. Each post is plain HTML (images live on the
// Shopify CDN). Author new posts here; the /blog routes render them with full
// SEO markup. Links written as /collections/... or /pages/... are rewritten to
// the teamstore domain at load time so copy can be written store-relative.

export interface BlogPost {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string; // ISO date
  featuredImage: string;
  featuredImageAlt: string;
  tags: string[];
  body: string;
}

const TEAMSTORE = "https://teamstore.sidelinenz.com";
const teamstoreify = (html: string) =>
  html.replace(/href="\/(collections|pages)\//g, `href="${TEAMSTORE}/$1/`);

const posts: BlogPost[] = [
  {
    slug: "onewhero-rugby-2026-supporters-range-mockup-vs-real",
    title: "From Mockup to Match Day: Onewhero Rugby's 2026 Supporters Range",
    summary:
      "Onewhero Rugby's 2026 supporters gear photographed off the production line, side by side with the design mockups the club approved. Custom rugby jerseys, hoodies, tees and knitted beanies by Sideline NZ.",
    publishedAt: "2026-07-03",
    featuredImage:
      "https://cdn.shopify.com/s/files/1/0697/0972/5811/files/onewhero-rugby-long-sleeve-jersey-2026-real.jpg?v=1783003483",
    featuredImageAlt: "Finished Onewhero Rugby 2026 long sleeve supporters jersey",
    tags: ["rugby union", "supporters merch", "custom teamwear", "Onewhero Rugby"],
    body: teamstoreify(`<p>When Onewhero Rugby asked us for a 2026 supporters range, we showed them digital mockups within days. A few weeks later, the real thing landed in Auckland. Here is how the finished gear stacks up against the designs the club approved, straight off the production line.</p>

<h2>From approved mockup to finished kit</h2>
<p>Every Sideline NZ order starts with a free design mockup. The club sees exactly what their gear will look like before committing a single dollar. Below is the proof of why that process works: the delivered garments next to the mockups Onewhero signed off.</p>

<h3>The long sleeve jersey</h3>
<div class="compare">
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/2026_Onewhero_Rugby_Long_Sleeve_Polo_-_Front_5c2a8990-3355-43d7-8d50-570d666e5d4b.png?v=1777355755" alt="Onewhero Rugby 2026 long sleeve jersey design mockup by Sideline NZ" loading="lazy"><figcaption>The mockup Onewhero approved</figcaption></figure>
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/onewhero-rugby-long-sleeve-jersey-2026-real.jpg?v=1783003483" alt="Finished Onewhero Rugby 2026 long sleeve supporters jersey, black and royal blue hoops with embroidered club crest" loading="lazy"><figcaption>The finished jersey, fresh off production</figcaption></figure>
</div>
<p>Black and royal hoops, a crisp white collar and the Onewhero RFC crest exactly where the design put it. The inner collar carries Sideline taping and a printed size label, so there are no scratchy tags on game day.</p>

<h3>Hoodies, two ways</h3>
<div class="compare">
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/2026_Onewhero_Rugby_Hoodie_-_Front_5abd617b-71a7-4b4d-9d75-77a44b14f7e5.png?v=1777355731" alt="Onewhero Rugby 2026 hoodie design mockup" loading="lazy"><figcaption>Hoodie mockup</figcaption></figure>
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/onewhero-rugby-pullover-hoodie-2026-real.jpg?v=1783003483" alt="Finished Onewhero Rugby pullover hoodie with sublimated blue pattern sleeves and embroidered crest" loading="lazy"><figcaption>The delivered pullover, sublimated sleeves and all</figcaption></figure>
</div>
<p>The range includes a youth zip-through as well, with a blue lined hood and the crest on the chest. Youth sizes run right down to Y14 so the whole clubhouse is covered.</p>
<figure class="single"><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/onewhero-rugby-zip-hoodie-2026-real.jpg?v=1783003483" alt="Onewhero Rugby youth zip hoodie in black and royal blue, size Y14" loading="lazy"><figcaption>Youth zip hoodie, size Y14</figcaption></figure>

<h3>Training tee and the pompom beanie</h3>
<div class="compare">
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/onewhero-rugby-training-tee-2026-real.jpg?v=1783003483" alt="Onewhero Rugby training tee with blue speed line sublimation print" loading="lazy"><figcaption>Training tee with sublimated speed lines</figcaption></figure>
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/onewhero-rugby-pompom-beanie-2026-real.jpg?v=1783003483" alt="Onewhero Rugby knitted pompom beanie with ONEWHERO lettering and embroidered crest" loading="lazy"><figcaption>Knitted beanie with the club name knitted in, not printed</figcaption></figure>
</div>
<p>Look closely at the beanie: the ONEWHERO lettering is knitted into the fabric and the crest is stitched embroidery. That is the difference between merch that lasts one season and merch that gets handed down.</p>
<figure class="single"><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/onewhero-rugby-beanie-embroidery-detail.jpg?v=1783003483" alt="Close up of embroidered Onewhero RFC crest on navy knitted beanie cuff" loading="lazy"><figcaption>Embroidered crest detail</figcaption></figure>

<h2>Get your club's range</h2>
<p>The full Onewhero range is live now in the <a href="/collections/2026-onewhero-rugby-supporters-merch-range">Onewhero Rugby team store</a>, alongside every other club on the <a href="/pages/shop-by-club">Sideline team store</a>.</p>
<p>Want this for your club? It costs nothing to see your own designs: <a href="/free-mockup">get a free mockup</a> from Sideline NZ, or browse what we make for <a href="/sports/rugby">rugby clubs across New Zealand</a>. We build your online team store for free, supporters buy direct, and the club keeps the fundraising margin.</p>`),
  },
  {
    slug: "wesley-college-2026-supporters-range-mockup-vs-real",
    title: "Wesley College 2026 Supporters Range: The Mockups vs The Real Thing",
    summary:
      "Wesley College's 2026 rugby supporters range, from approved digital mockups to finished jerseys, tapa print tees, windbreakers and knitted beanies. Custom school sportswear by Sideline NZ.",
    publishedAt: "2026-07-03",
    featuredImage:
      "https://cdn.shopify.com/s/files/1/0697/0972/5811/files/wesley-college-supporters-jersey-2026-real.jpg?v=1783003661",
    featuredImageAlt: "Finished Wesley College 2026 supporters rugby jersey",
    tags: ["rugby union", "supporters merch", "school sport", "Wesley College"],
    body: teamstoreify(`<p>Wesley College is the oldest registered school in New Zealand, established 1844, and their 2026 rugby supporters range needed to carry that history. Here is the finished gear next to the mockups the school approved, photographed as it came off the line.</p>

<h2>Design first, then the real thing</h2>
<p>Every range we make starts as a free digital mockup. Wesley saw their full supporters kit on screen, tweaked what they wanted, and only then did production start. This is what arrived.</p>

<h3>The supporters jersey</h3>
<div class="compare">
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/2026_Wesley_College_Rugby_Supporters_Long_Sleeve_Rugby_Polo_-_Front_7e599402-3747-470c-9d3d-d440c6a96a83.png?v=1778065121" alt="Wesley College 2026 supporters rugby jersey design mockup by Sideline NZ" loading="lazy"><figcaption>The approved mockup</figcaption></figure>
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/wesley-college-supporters-jersey-2026-real.jpg?v=1783003661" alt="Finished Wesley College 2026 supporters rugby jersey, black and white hoops with school crest" loading="lazy"><figcaption>The finished jersey</figcaption></figure>
</div>
<p>Black and white hoops, white collar, and the Wesley crest with "2026 Supporters" and the school's est. 1844 marque printed sharp on the chest.</p>

<h3>The tapa print tee</h3>
<div class="compare">
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/2026_Wesley_College_Rugby_Supporters_Dri_fit_tee_-_Front_51ee8cfe-ac89-40d1-af44-2e15ae538a03.png?v=1778065012" alt="Wesley College supporters tee design mockup with Pasifika tapa pattern" loading="lazy"><figcaption>Tee mockup</figcaption></figure>
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/wesley-college-tapa-supporters-tee-2026-real.jpg?v=1783003661" alt="Finished Wesley College supporters tee with lilac Pasifika tapa sublimation print" loading="lazy"><figcaption>The delivered tee, full sublimation</figcaption></figure>
</div>
<p>The lilac tapa pattern is sublimated into the fabric, not printed on top, so it will never crack or peel. It is a proper piece of Pasifika design that supporters will wear well beyond game day.</p>

<h3>Windbreaker and beanie</h3>
<div class="compare">
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/wesley-college-supporters-windbreaker-2026-real.jpg?v=1783003661" alt="Wesley College supporters windbreaker jacket in black and grey with school crest" loading="lazy"><figcaption>Full zip windbreaker for the sideline in July</figcaption></figure>
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/wesley-college-pompom-beanie-2026-real.jpg?v=1783003661" alt="Wesley College knitted pompom beanie with WESLEY lettering and embroidered shield patch" loading="lazy"><figcaption>Knitted beanie, WESLEY worked into the knit</figcaption></figure>
</div>
<figure class="single"><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/wesley-college-beanie-crest-embroidery-detail.jpg?v=1783003661" alt="Close up of embroidered Wesley College three crown shield patch on black knitted beanie" loading="lazy"><figcaption>The three crown shield, stitched not printed</figcaption></figure>

<h2>Shop the range or start your own</h2>
<p>The full range is live in the <a href="/collections/2026-wesley-college-rugby-supporters-merch-range">Wesley College team store</a>. Browse every school and club range on the <a href="/pages/shop-by-club">Sideline team store</a>.</p>
<p>If you run sport at a school, this whole process costs you nothing to start: <a href="/free-mockup">request a free mockup</a>, and we will build your school's own online supporters store, handle every order and delivery, and pass the fundraising margin back to your programme. See how it works for <a href="/schools">schools</a> at Sideline NZ.</p>`),
  },
  {
    slug: "st-peters-1st-xv-2026-mockup-to-finished-kit",
    title: "St Peter's College 1st XV: From Approved Design to Finished Kit",
    summary:
      "The St Peter's College 1st XV 2026 supporters range photographed at production: royal and gold rugby jersey, fleece hoodie, tee and jacquard knitted scarf, next to the mockups the college approved.",
    publishedAt: "2026-07-03",
    featuredImage:
      "https://cdn.shopify.com/s/files/1/0697/0972/5811/files/st-peters-1st-xv-rugby-jersey-2026-real.jpg?v=1783003661",
    featuredImageAlt: "Finished St Peter's College 1st XV 2026 rugby jersey",
    tags: ["rugby union", "supporters merch", "school sport", "St Peter's College"],
    body: teamstoreify(`<p>The St Peter's College 1st XV supporters range was one of the most popular drops on our team store this season, and now the physical gear is out in the world. Here is the finished kit photographed at production, side by side with the mockups the college approved.</p>

<h2>Mockup versus match day</h2>

<h3>The 1st XV rugby jersey</h3>
<div class="compare">
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/rugby-jersey-v2.jpg?v=1774896312" alt="St Peter's College 1st XV 2026 rugby jersey design mockup by Sideline NZ" loading="lazy"><figcaption>The approved design</figcaption></figure>
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/st-peters-1st-xv-rugby-jersey-2026-real.jpg?v=1783003661" alt="Finished St Peter's College 1st XV 2026 supporters rugby jersey, royal blue with gold hoops" loading="lazy"><figcaption>The finished jersey</figcaption></figure>
</div>
<figure class="single"><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/st-peters-1st-xv-jersey-collar-detail.jpg?v=1783003483" alt="St Peter's 1st XV jersey collar detail showing gold 2026 ST PETERS print and white collar" loading="lazy"><figcaption>Collar detail: 2026 ST.PETERS 1ST XV, printed sharp</figcaption></figure>

<h3>The hoodie</h3>
<div class="compare">
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/hoodie-v2.jpg?v=1774897697" alt="St Peter's College 1st XV hoodie design mockup" loading="lazy"><figcaption>Hoodie mockup</figcaption></figure>
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/st-peters-1st-xv-hoodie-2026-real.jpg?v=1783003483" alt="Finished St Peter's 1st XV royal blue fleece hoodie with gold print and drawstrings" loading="lazy"><figcaption>Royal fleece with gold metal tipped drawstrings</figcaption></figure>
</div>
<figure class="single"><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/st-peters-1st-xv-hoodie-print-detail.jpg?v=1783003483" alt="Close up of St Peter's 1st XV hoodie chest print and gold drawstring tips" loading="lazy"><figcaption>The details make it: metal tipped drawstrings, orange lined hood</figcaption></figure>

<h3>Tee and the knitted scarf</h3>
<div class="compare">
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/st-peters-1st-xv-supporters-tee-2026-real.jpg?v=1783003661" alt="St Peter's 1st XV supporters tee in royal blue with gold and white print" loading="lazy"><figcaption>The supporters tee</figcaption></figure>
  <figure><img src="https://cdn.shopify.com/s/files/1/0697/0972/5811/files/st-peters-college-knitted-scarf-2026-real.jpg?v=1783003661" alt="St Peter's College knitted supporters scarf in blue and gold with fringed ends" loading="lazy"><figcaption>Old school terrace scarf, jacquard knitted both sides</figcaption></figure>
</div>
<p>The scarf is the piece we are proudest of: ST PETER'S COLLEGE and the number 23 are knitted through in jacquard, blue one side and gold the other, with proper fringed ends. Nothing printed, nothing stuck on.</p>

<h2>Your school's turn</h2>
<p>The range lives in the <a href="/collections/st-peters-college-1st-xv-2026-supporters-merch-range">St Peter's College 1st XV team store</a>, and you can browse every drop on the <a href="/pages/shop-by-club">Sideline team store</a>.</p>
<p>Sideline NZ builds supporter ranges for <a href="/schools">schools</a> and <a href="/clubs">clubs</a> across New Zealand: free design mockups, a free hosted team store, and the fundraising margin goes back to your programme. <a href="/free-mockup">Get your free mockup</a> to see your own colours first.</p>`),
  },
];

export const BLOG_POSTS: BlogPost[] = posts.sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt)
);

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
