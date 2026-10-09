#!/usr/bin/env node
// Run one flow (flows/*.mjs) against a launched instance with Playwright + Chromium, headless.
// Usage: PLAYWRIGHT_ROOT=<dir> node drive.mjs <flow.mjs> <baseUrl> <evidenceDir>
// A flow exports `default async ({ page, url, shot, log, check })`. Throwing = FAIL.
// Evidence (log.txt, result.json) is written whatever fails, including Playwright/browser startup.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [flowPath, baseUrl, evidence] = process.argv.slice(2);
mkdirSync(evidence, { recursive: true });

const lines = [];
const consoleErrors = [];
const log = (msg) => { const l = `[${new Date().toISOString()}] ${msg}`; lines.push(l); console.log(l); };
let browser, page, n = 0;
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
  // Playwright isn't a repo dependency; verify.sh resolves where it lives (CI or mise) into $PLAYWRIGHT_ROOT.
  const pwRoot = process.env.PLAYWRIGHT_ROOT;
  if (!pwRoot) throw new Error("PLAYWRIGHT_ROOT unset: run flows via verify.sh drive, or set it");
  const { chromium } = createRequire(join(pwRoot, "node_modules", "noop.js"))("playwright");
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  const flow = (await import(pathToFileURL(resolve(flowPath)).href)).default;
  await flow({ page, url, shot, log, check });
  if (consoleErrors.length) log(`console errors (${consoleErrors.length}):\n  ${consoleErrors.join("\n  ")}`);
} catch (err) {
  status = "FAIL";
  log(`FAIL: ${err?.stack ?? err}`);
  if (page) await shot("failure").catch(() => {});
} finally {
  await browser?.close().catch((err) => log(`browser close failed: ${err?.message ?? err}`));
  writeFileSync(join(evidence, "log.txt"), lines.join("\n") + "\n");
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ flow: flowPath, baseUrl, status, consoleErrors }, null, 2));
  console.log(`${status} — evidence: ${evidence}`);
  process.exit(status === "PASS" ? 0 : 1);
}
