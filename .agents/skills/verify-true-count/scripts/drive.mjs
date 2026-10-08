#!/usr/bin/env node
// Run one flow (flows/*.mjs) against a launched instance with Playwright + Chromium, headless.
// Usage: node drive.mjs <flow.mjs> <baseUrl> <evidenceDir>
// A flow exports `default async ({ page, url, shot, log, check })`. Throwing = FAIL.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [flowPath, baseUrl, evidence] = process.argv.slice(2);
mkdirSync(evidence, { recursive: true });

// Playwright comes from the fleet toolchain (mise npm:playwright), not this repo's dependencies.
const pwRoot = execSync("mise where npm:playwright", { encoding: "utf8" }).trim();
const require = createRequire(join(pwRoot, "node_modules", "noop.js"));
const { chromium } = require("playwright");

const lines = [];
const log = (msg) => { const l = `[${new Date().toISOString()}] ${msg}`; lines.push(l); console.log(l); };
let n = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));
const shot = async (name) => {
  const file = join(evidence, `${String(++n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log(`screenshot ${file}`);
  return file;
};
const url = (path = "/") => new URL(path, baseUrl).toString();
const check = (cond, msg) => { if (!cond) throw new Error(`check failed: ${msg}`); log(`ok: ${msg}`); };

let status = "PASS";
try {
  const flow = (await import(pathToFileURL(resolve(flowPath)).href)).default;
  await flow({ page, url, shot, log, check });
  if (consoleErrors.length) log(`console errors (${consoleErrors.length}):\n  ${consoleErrors.join("\n  ")}`);
} catch (err) {
  status = "FAIL";
  log(`FAIL: ${err?.stack ?? err}`);
  await shot("failure").catch(() => {});
} finally {
  await browser.close();
  writeFileSync(join(evidence, "log.txt"), lines.join("\n") + "\n");
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ flow: flowPath, baseUrl, status, consoleErrors }, null, 2));
  console.log(`${status} — evidence: ${evidence}`);
  process.exit(status === "PASS" ? 0 : 1);
}
