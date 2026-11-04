// Create history through a drill, download it, restore on a clean device, and reload.
// Repeated and malformed imports must leave the restored history intact.
import { readFile } from "node:fs/promises";

const visible = (locator) => locator.filter({ visible: true }).first();

export default async ({ page, url, shot, check }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(url("/drills/true-count"));
  await visible(page.getByText(/^Question 1$/)).waitFor();
  await page.keyboard.type("2");
  await visible(page.getByRole("button", { name: /^Answer: / })).click();
  await visible(page.getByRole("button", { name: "Next question" })).waitFor();
  await visible(page.getByRole("button", { name: "End session", exact: true })).click();

  await page.goto(url("/session"));
  const create = () => visible(page.getByRole("button", { name: "Create backup", exact: true }));
  const backupJSON = () => visible(page.getByRole("textbox", { name: "Backup JSON", exact: true }));
  const restoreJSON = () => visible(page.getByRole("textbox", { name: "Restore backup JSON" }));
  const importSessions = () => visible(page.getByRole("button", { name: "Import sessions" }));

  await create().click();
  await backupJSON().waitFor();
  const archive = await backupJSON().inputValue();
  const original = JSON.parse(archive);
  check(original.format === "true-count.sessions", "backup uses the versioned session archive");
  check(
    original.sessions.length === 1 && original.sessions[0].conversionChecks.length === 1,
    "backup includes the drill answer just recorded",
  );
  check(original.sessions[0].endedAt !== null, "backup includes the explicit session end");
  const downloading = page.waitForEvent("download");
  await visible(page.getByRole("button", { name: "Download backup" })).click();
  const downloaded = await downloading;
  check(downloaded.suggestedFilename().endsWith(".json"), "download is a JSON file");
  check(
    (await readFile(await downloaded.path(), "utf8")) === archive,
    "download contains exactly the previewed backup",
  );
  await shot("backup-ready-mobile");

  // Simulate clearing app data. No archive is injected into storage; restore uses the UI.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await visible(
    page.getByText("No Sessions recorded yet. One opens the first time you deal."),
  ).waitFor();
  await visible(page.getByRole("button", { name: "Restore backup", exact: true })).click();
  await restoreJSON().fill(archive);
  await importSessions().click();
  await visible(page.getByText(/^Sessions added: 1\. Already on this device: 0\./)).waitFor();
  await visible(page.getByText("1 session recorded", { exact: true })).waitFor();
  await shot("restored-mobile");

  await page.reload();
  await visible(page.getByText("1 session recorded", { exact: true })).waitFor();
  await create().click();
  await backupJSON().waitFor();
  check(
    JSON.stringify(JSON.parse(await backupJSON().inputValue()).sessions) ===
      JSON.stringify(original.sessions),
    "restored session and decision log survive reload unchanged",
  );

  await visible(page.getByRole("button", { name: "Restore backup", exact: true })).click();
  await restoreJSON().fill(archive);
  await importSessions().click();
  await visible(page.getByText(/^Sessions added: 0\. Already on this device: 1\./)).waitFor();
  check(true, "repeated restore skips existing sessions");
  await restoreJSON().fill("{ broken JSON");
  await importSessions().click();
  await visible(page.getByRole("alert").filter({ hasText: /Not valid JSON/ })).waitFor();
  check(
    (await restoreJSON().inputValue()) === "{ broken JSON",
    "failed restore keeps input for correction",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot("malformed-backup-desktop");
  await restoreJSON().fill(
    JSON.stringify({
      ...original,
      sessions: [{ ...original.sessions[0], id: "broken-nested-record", rounds: [null] }],
    }),
  );
  await importSessions().click();
  await visible(page.getByRole("alert").filter({ hasText: /not a Session/ })).waitFor();
  check(true, "valid JSON with malformed nested records is rejected before storage");
  await create().click();
  await backupJSON().waitFor();
  check(
    JSON.stringify(JSON.parse(await backupJSON().inputValue()).sessions) ===
      JSON.stringify(original.sessions),
    "malformed and repeated restores leave all history unchanged",
  );
  await page.reload();
  await visible(page.getByText("1 session recorded", { exact: true })).waitFor();
  check(true, "history remains persisted after malformed import");

  // A temporary storage read failure must be visible and recoverable without losing rows.
  await visible(page.getByRole("button", { name: "Restore backup", exact: true })).click();
  await restoreJSON().fill(archive);
  await page.evaluate(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith("truecount/v1/session/"))
        throw new Error("Simulated storage read failure");
      return original.call(this, key);
    };
    globalThis.restoreSessionReads = () => {
      Storage.prototype.getItem = original;
    };
  });
  await importSessions().click();
  const storageError = visible(
    page.getByRole("alert").filter({ hasText: /Could not load session history/ }),
  );
  await storageError.waitFor();
  check(true, "storage read failure shows a retryable error without discarding history");
  await shot("storage-read-error");
  await page.evaluate(() => globalThis.restoreSessionReads());
  await visible(page.getByRole("button", { name: "Reload history" })).click();
  await storageError.waitFor({ state: "hidden" });
  await visible(page.getByText("1 session recorded", { exact: true })).waitFor();
  check(true, "history reload recovers after storage becomes readable");
};
