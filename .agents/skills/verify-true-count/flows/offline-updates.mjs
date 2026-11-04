// A private server simulates deployments without changing dist or the shared verification server.
/* global window, caches, self */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

export default async ({ page, shot, check, log }) => {
  const dist = join(process.cwd(), "dist");
  const template = await readFile(join(dist, "sw.js"), "utf8");
  check(
    !/__CACHE_NAME__|__ASSETS__/.test(template),
    "generated worker has no unresolved placeholders",
  );
  const assets = JSON.parse(template.match(/const ASSETS = (\[[^\n]*\]);/)[1]);
  let revision = "first";
  let failInstall = false;
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".ttf": "font/ttf",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
  };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    response.setHeader("x-offline-build", revision);
    response.setHeader("cache-control", "public, max-age=86400");
    if (path === "/sw.js") {
      response.setHeader("content-type", "text/javascript");
      response.setHeader("cache-control", "no-cache");
      response.end(
        template
          .replace(
            /const CACHE = [^;]+;/,
            `const CACHE = ${JSON.stringify(`truecount-offline-test-${revision}`)};`,
          )
          .replace(
            /const ASSETS = [^\n]+;/,
            `const ASSETS = ${JSON.stringify([...assets, "/install-check"])};`,
          ),
      );
      return;
    }
    if (path === "/install-check") {
      response.writeHead(failInstall ? 503 : 200);
      response.end(revision);
      return;
    }
    const clean = path.replace(/\/$/, "");
    for (const candidate of [path, `${clean}.html`, `${clean}/index.html`]) {
      try {
        const contents = await readFile(join(dist, candidate));
        response.setHeader("content-type", types[extname(candidate)] ?? "application/octet-stream");
        response.end(contents);
        return;
      } catch {
        // Try the next Expo static route representation.
      }
    }
    response.writeHead(404);
    response.end("Not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = page.context();
  let first;
  const firstErrors = [];
  try {
    // The runner uses browser.newPage's single-page context; a real popup shares its storage.
    const opened = page.waitForEvent("popup");
    await page.evaluate(() => window.open("about:blank"));
    first = await opened;
    first.on("pageerror", (error) => firstErrors.push(String(error)));
    await first.goto(`${origin}/session`, { waitUntil: "networkidle" });
    await first.waitForFunction(() => navigator.serviceWorker.controller !== null);
    check(
      (await first.evaluate(async () =>
        (await fetch("/session.html")).headers.get("x-offline-build"),
      )) === "first",
      "first install serves its cached HTML",
    );

    revision = "second";
    const newWorker = context.waitForEvent("serviceworker");
    await first.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    const worker = await newWorker;
    await first.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration.waiting?.state === "installed") return;
      const installing = registration.installing;
      await new Promise((resolve, reject) =>
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") resolve();
          if (installing.state === "redundant") reject(new Error("Second install failed"));
        }),
      );
    });
    check(
      (await first.evaluate(async () =>
        (await fetch("/session.html")).headers.get("x-offline-build"),
      )) === "first",
      "existing tab keeps the first build while the second waits",
    );
    check(
      (await first.evaluate(async () => {
        const cache = await caches.open("truecount-offline-test-second");
        return (await cache.match("/session.html")).headers.get("x-offline-build");
      })) === "second",
      "new install bypasses stale HTTP cache and fetches the second HTML",
    );

    // Listen before closing the final controlled tab; the runner page is still about:blank.
    await worker.evaluate(() => {
      self.activationDone = new Promise((resolve) => {
        const waiting = self.registration.waiting;
        waiting.addEventListener("statechange", () => {
          if (waiting.state === "activated") resolve();
        });
      });
    });
    await first.close();
    await worker.evaluate(() => self.activationDone);
    await page.goto(`${origin}/session`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    check(
      JSON.stringify(await page.evaluate(() => caches.keys())) ===
        JSON.stringify(["truecount-offline-test-second"]),
      "activation removes the first cache after its last tab closes",
    );

    revision = "broken";
    failInstall = true;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const failed = new Promise((resolve) =>
        registration.addEventListener(
          "updatefound",
          () => {
            const installing = registration.installing;
            installing.addEventListener("statechange", () => {
              if (installing.state === "redundant") resolve();
            });
          },
          { once: true },
        ),
      );
      await registration.update();
      await failed;
    });
    check(
      (await page.evaluate(async () =>
        (await fetch("/session.html")).headers.get("x-offline-build"),
      )) === "second",
      "a failed install leaves the second build active and usable",
    );
    await context.setOffline(true);
    const offline = await page.reload({ waitUntil: "networkidle" });
    check(
      offline.headers()["x-offline-build"] === "second",
      "offline reload uses the second cached HTML",
    );
    await page.getByRole("heading", { name: "Statistics", exact: true }).waitFor();
    check(firstErrors.length === 0, "old-build tab has no application errors");
    await shot("offline-after-update-and-failed-install");
    log("Upgrade checks used a private HTTP origin; shared build and server were unchanged.");
  } finally {
    await context.setOffline(false);
    await first?.close().catch(() => {});
    await page.goto("about:blank");
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};
