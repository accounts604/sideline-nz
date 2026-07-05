import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Google Analytics 4 (GA4) integration, gated on the VITE_GA_ID build env var.
 * Set VITE_GA_ID=G-XXXXXXXXXX (Railway → Variables) and redeploy to switch it on;
 * with no ID set this renders nothing (zero overhead, safe by default).
 *
 * Loads gtag.js once, then fires a page_view on every client-side route change
 * (this is an SPA, so navigations don't reload the page).
 */
const GA_ID = (import.meta as any).env?.VITE_GA_ID as string | undefined;

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

export default function Analytics() {
  const [location] = useLocation();
  const loaded = useRef(false);

  // Load gtag.js once.
  useEffect(() => {
    if (!GA_ID || loaded.current) return;
    loaded.current = true;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer!.push(arguments); };
    window.gtag("js", new Date());
    // send_page_view:false — we send page_view manually per route change below
    window.gtag("config", GA_ID, { send_page_view: false });
  }, []);

  // Fire a page_view on each route change.
  useEffect(() => {
    if (!GA_ID || !window.gtag) return;
    window.gtag("event", "page_view", {
      page_path: location,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [location]);

  return null;
}
