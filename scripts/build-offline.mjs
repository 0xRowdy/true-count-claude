// Precache the complete Expo export so every trainer route can open without a network.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const root = fileURLToPath(dist);
const files = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (!entry.name.startsWith(".") && !/\.(map)$/.test(entry.name) && entry.name !== "sw.js")
      files.push(relative(root, path));
  }
}
await collect(root);
files.sort();
const template = await readFile(new URL("./offline-worker.js", import.meta.url), "utf8");
const hash = createHash("sha256").update(template);
for (const file of files) hash.update(file).update(await readFile(join(root, file)));
const version = hash.digest("hex").slice(0, 16);
const assets = files.map((file) => `/${file}`);
await writeFile(
  new URL("sw.js", dist),
  template
    .replace("__CACHE_NAME__", JSON.stringify(`truecount-offline-${version}`))
    .replace("__ASSETS__", JSON.stringify(assets)),
);
console.log(`Offline build ${version}: ${files.length} cached resources`);
