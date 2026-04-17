// Bundle server/api-entry.ts into a single self-contained JS file
// so Vercel doesn't need to trace imports into server/ and shared/
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
  // Keep npm packages external — Vercel installs them from package.json
  external: [
    "express",
    "cookie-parser",
    "dotenv",
    "vite",
    "nanoid",
    "drizzle-orm",
    "drizzle-orm/*",
    "postgres",
    "stripe",
    "jsonwebtoken",
    "bcryptjs",
    "zod",
    "@vercel/blob",
    // Node built-ins
    "http",
    "https",
    "fs",
    "path",
    "os",
    "crypto",
    "child_process",
    "util",
    "url",
    "stream",
    "buffer",
    "events",
    "net",
    "tls",
    "assert",
    "querystring",
  ],
  // Banner to help with ESM compatibility
  banner: {
    js: '// Bundled by esbuild — all server/ and shared/ code is inlined\nimport { createRequire } from "module";\nconst require = createRequire(import.meta.url);',
  },
});

console.log("✅ api/index.js bundled successfully");
