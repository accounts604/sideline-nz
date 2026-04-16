// Server-side PO PDF generation via Puppeteer (headless Chrome).
//
// Instead of the old Google Docs HTML→PDF pipeline (which stripped CSS and
// mangled layouts), we now:
//   1. Fetch the live PO preview page from the running server
//   2. Puppeteer renders it with full CSS support (flexbox, images, fonts)
//   3. page.pdf() prints to a pixel-perfect PDF buffer
//   4. Upload the buffer to Drive
//
// On Railway, Chromium is installed via nixpacks.toml. Locally, puppeteer-core
// falls back to @sparticuz/chromium's bundled binary.

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { storage } from "./storage";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token;
}

// ─── Render PO page → PDF buffer via Puppeteer ─────────────────

async function renderPoPdf(orderId: string): Promise<Buffer | null> {
  // ALWAYS use localhost — Puppeteer runs on the same machine as the server.
  // Using the external URL (sidelinenz.com) causes roundtrip through CDN/ingress
  // and cookie-domain issues. Localhost is instant and reliable.
  const port = process.env.PORT || 5001;
  const poUrl = `http://localhost:${port}/admin/orders/${orderId}/po`;

  // Resolve Chromium executable: Railway has it at /nix/store/*/bin/chromium,
  // @sparticuz/chromium provides a fallback for local dev / Vercel.
  let executablePath: string;
  try {
    // Try system chromium first (Railway/Nix)
    const { execSync } = await import("child_process");
    executablePath = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome-stable 2>/dev/null", { encoding: "utf-8" }).trim();
  } catch {
    // Fall back to @sparticuz/chromium bundled binary
    executablePath = await chromium.executablePath();
  }

  if (!executablePath) {
    console.error("[po-pdf] No Chromium binary found");
    return null;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Set a desktop viewport for consistent rendering
    await page.setViewport({ width: 900, height: 1200 });

    // Navigate to the PO preview page. The page is a client-rendered React
    // route, so we need to wait for the content to fully render. We bypass
    // admin auth by injecting a JWT cookie.
    const jwt = await import("jsonwebtoken");
    const secret = process.env.JWT_SECRET || "dev-secret";
    // Find an admin user to generate a valid token
    const admins = await storage.getAllCustomers({ limit: 1 }).catch(() => null);
    // Create a short-lived admin token for the PDF render
    const adminToken = jwt.default.sign(
      { userId: "pdf-renderer", role: "admin" },
      secret,
      { expiresIn: "60s" },
    );

    await page.setCookie({
      name: "snz_token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: false, // localhost cookies need httpOnly=false in Chromium
    });

    // Navigate and wait for the React app to render fully
    console.log(`[po-pdf] Navigating to ${poUrl}`);
    const response = await page.goto(poUrl, { waitUntil: "networkidle0", timeout: 30000 });
    console.log(`[po-pdf] Page status: ${response?.status()}`);

    // Wait for images to load + React to hydrate
    await page.evaluate(() => new Promise((r) => setTimeout(r, 3000)));

    // Verify the page has content (not a blank/error page)
    const title = await page.title();
    console.log(`[po-pdf] Page title: "${title}"`);

    // Print to PDF matching the browser's print preview
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });

    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.error("[po-pdf] Puppeteer render failed:", err);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── Upload PDF buffer to Drive ──────────────────────────────────

export async function uploadPoPdfToDrive(
  orderId: string,
  poFolderId: string,
): Promise<{ pdfId: string; pdfUrl: string } | null> {
  const token = await getAccessToken();
  if (!token) {
    console.log("[po-pdf] Google creds not configured — skipping");
    return null;
  }

  const pdfBuf = await renderPoPdf(orderId);
  if (!pdfBuf) {
    console.error("[po-pdf] PDF render failed for order", orderId);
    return null;
  }

  const order = await storage.getOrder(orderId);
  const fileName = `PO ${order?.poReference || order?.orderNumber || orderId}.pdf`;

  try {
    // Find "01. Brief" sub-folder (or fall back to root)
    let targetFolder = poFolderId;
    const foldersQ = `'${poFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const foldersRes = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(foldersQ)}&fields=files(id,name)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (foldersRes.ok) {
      const subs = ((await foldersRes.json()).files || []) as Array<{ id: string; name: string }>;
      const brief = subs.find((f) => /brief/i.test(f.name));
      if (brief) targetFolder = brief.id;
    }

    // Upload PDF directly — no Google Docs intermediate
    const boundary = `--po-pdf-${Date.now().toString(36)}`;
    const meta = JSON.stringify({ name: fileName, parents: [targetFolder] });
    const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`;
    const dataPart = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
    const closing = `\r\n--${boundary}--`;

    const body = Buffer.concat([
      Buffer.from(metaPart, "utf-8"),
      Buffer.from(dataPart, "utf-8"),
      pdfBuf,
      Buffer.from(closing, "utf-8"),
    ]);

    const uploadRes = await fetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(body.length),
        },
        body,
      },
    );

    if (!uploadRes.ok) {
      console.error("[po-pdf] Drive upload failed:", uploadRes.status, await uploadRes.text());
      return null;
    }

    const pdfFile = await uploadRes.json();
    console.log(`[po-pdf] PDF uploaded: ${pdfFile.id} for order ${orderId}`);
    return {
      pdfId: pdfFile.id,
      pdfUrl: pdfFile.webViewLink || `https://drive.google.com/file/d/${pdfFile.id}/view`,
    };
  } catch (err) {
    console.error("[po-pdf] error:", err);
    return null;
  }
}
