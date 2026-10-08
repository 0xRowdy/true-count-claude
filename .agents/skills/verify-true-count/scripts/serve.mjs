#!/usr/bin/env node
// Static server for the Expo web export (output: "static"): /play -> play.html, /drills -> drills/index.html.
// Verification scaffolding only. Usage: node serve.mjs <distDir> <port> [host]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const [dist, port, host = "127.0.0.1"] = process.argv.slice(2);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json" };

async function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  for (const candidate of [clean, `${clean}.html`, join(clean, "index.html")]) {
    const file = join(dist, candidate);
    try { if ((await stat(file)).isFile()) return file; } catch { /* not this candidate; try the next */ }
  }
  return null;
}

createServer(async (req, res) => {
  const file = await resolve(req.url === "/" ? "/index.html" : req.url);
  if (!file) {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    return res.end(await readFile(join(dist, "+not-found.html")).catch(() => "not found"));
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(await readFile(file));
}).listen(Number(port), host, () => console.log(`verify-serve ready http://${host}:${port}`));
