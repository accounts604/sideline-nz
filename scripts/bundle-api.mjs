// Bundle server/api-entry.ts → api/index.js (one self-contained JS file).
// The source lives OUTSIDE /api so the bundled output doesn't collide with
// the source — Vercel errors when api/ contains both index.ts and index.js.
import { build } from "esbuild";

await build({
  entryPoints: ["server/api-entry.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "api/index.js",
  // Resolve @shared/* path alias
  alias: {
    "@shared": "./shared",
  },
  // Only externalize packages with binary deps or huge native bundles —
  // Vercel still pulls them via Node Modules File Tracing (NFT). Everything
  // else gets inlined into api/index.js so the function package stays under
  // Vercel's 300MB size limit. Node built-ins (`http`, `fs`, etc) are
  // implicit-external on platform:node.
  external: [
    "puppeteer-core",
    "@sparticuz/chromium",
    // Vite is dev-only; keep it external so esbuild doesn't try to bundle
    // its plugin code into the function.
    "vite",
  ],
  // Banner to help with ESM compatibility
  banner: {
    js: '// Bundled by esbuild — all server/ and shared/ code is inlined\nimport { createRequire } from "module";\nconst require = createRequire(import.meta.url);',
  },
});

console.log("✅ api/index.js bundled successfully");
