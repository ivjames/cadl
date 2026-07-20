// Minimal, dependency-free static server for the built CADL app.
//
// Runs under pm2 on the lab980 droplet (see DEPLOY.md). It deliberately reads
// its port from the app-dir .env that `provision-site` also uses to configure
// the nginx proxy_pass, so the app and nginx can never disagree on the port
// (the failure mode that produces a 502). Serves dist/ with SPA fallback and
// long-cache headers for hashed /assets, on 127.0.0.1 to match the vhost.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, relative, isAbsolute, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");
const ASSETS_PREFIX = join(DIST, "assets") + sep;

function resolvePort() {
  if (process.env.PORT) return Number(process.env.PORT);
  try {
    const env = readFileSync(join(ROOT, ".env"), "utf8");
    const match = env.match(/^\s*(?:export\s+)?PORT\s*=\s*["']?(\d+)/m);
    if (match) return Number(match[1]);
  } catch {
    /* no .env — fall through to the platform default */
  }
  return 8060;
}

const PORT = resolvePort();
const HOST = process.env.HOST || "127.0.0.1";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function insideDist(filePath) {
  const rel = relative(DIST, filePath);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

async function resolveFile(urlPath) {
  let candidate = join(DIST, urlPath);
  if (!insideDist(candidate) && candidate !== DIST) return join(DIST, "index.html");
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) candidate = join(candidate, "index.html");
    await stat(candidate);
    return candidate;
  } catch {
    return join(DIST, "index.html"); // SPA fallback
  }
}

const server = createServer(async (req, res) => {
  try {
    const rawPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const filePath = await resolveFile(rawPath);
    const body = await readFile(filePath);
    const type = CONTENT_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
    const cache = filePath.startsWith(ASSETS_PREFIX)
      ? "public, max-age=31536000, immutable"
      : "no-cache";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (err) {
    // Log the real reason so a 500 is diagnosable in `pm2 logs` — the usual
    // cause is a missing dist/ (build never ran), not a genuine server fault.
    console.error(`cadl: failed to serve ${req.url}:`, err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`cadl static server listening on http://${HOST}:${PORT} (serving ${DIST})`);
  if (!existsSync(join(DIST, "index.html"))) {
    console.error(
      `cadl: WARNING — ${join(DIST, "index.html")} is missing. ` +
        `Run 'npm run build' (or 'cadl deploy'); every request will 500 until dist/ exists.`,
    );
  }
});
