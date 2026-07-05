import { useEffect } from "react";

const SITE_NAME = "Sideline NZ";
const BASE_URL = "https://sidelinenz.com";
const DEFAULT_IMAGE = `${BASE_URL}/opengraph.jpg`;

export interface SeoProps {
  /** Page title. " | Sideline NZ" is appended automatically unless `bareTitle`. */
  title: string;
  description: string;
  /** Path (e.g. "/team-stores") or absolute URL for the canonical + og:url. */
  path?: string;
  image?: string;
  type?: "website" | "article" | "product";
  /** Structured data object(s) rendered as JSON-LD. */
  jsonLd?: object | object[];
  bareTitle?: boolean;
  noindex?: boolean;
}

/**
 * Dependency-free per-page SEO head manager. Sets document.title + meta/OG/Twitter/canonical
 * tags on mount and keeps them in sync, so each route gets unique, crawlable metadata (Google
 * renders client JS). No react-helmet dependency.
 */
export default function Seo({ title, description, path, image, type = "website", jsonLd, bareTitle, noindex }: SeoProps) {
  useEffect(() => {
    const fullTitle = bareTitle ? title : `${title} | ${SITE_NAME}`;
    const url = path ? (path.startsWith("http") ? path : BASE_URL + path) : (typeof window !== "undefined" ? window.location.href.split("?")[0] : BASE_URL);
    const img = image || DEFAULT_IMAGE;

    document.title = fullTitle;

    const setMeta = (selector: string, attr: "name" | "property", key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        el.setAttribute("data-seo", "1");
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[name="robots"]', "name", "robots", noindex ? "noindex,nofollow" : "index,follow");
    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:type"]', "property", "og:type", type);
    setMeta('meta[property="og:url"]', "property", "og:url", url);
    setMeta('meta[property="og:image"]', "property", "og:image", img);
    setMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
    setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", img);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      canonical.setAttribute("data-seo", "1");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);

    // JSON-LD structured data (replaced per page)
    document.head.querySelectorAll('script[data-seo-jsonld]').forEach((n) => n.remove());
    if (jsonLd) {
      const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      for (const block of blocks) {
        const s = document.createElement("script");
        s.type = "application/ld+json";
        s.setAttribute("data-seo-jsonld", "1");
        s.text = JSON.stringify(block);
        document.head.appendChild(s);
      }
    }
  }, [title, description, path, image, type, JSON.stringify(jsonLd), bareTitle, noindex]);

  return null;
}

export { BASE_URL, SITE_NAME, DEFAULT_IMAGE };
