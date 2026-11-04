/**
 * Every in-app path written in the UI source resolves to a route file in `app/`.
 *
 * Typed routes are off (ADR-0006), so an `href` or `router.push` target is a plain string and
 * a typo, or a link to a screen that was never built, compiles and ships as a 404. The e2e
 * `links` flow crawls the rendered anchors; this catches the targets an anchor never shows
 * (buttons that call `router.push`, maps of hrefs that only render for some data).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { TITLED_ROUTES, pageTitle } from "./pageTitle";

const ROOT = join(__dirname, "..", "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/**
 * `app/(tabs)/(trainer)/drills/index.tsx` → `/drills`: route groups (`(tabs)`) are not part of
 * the URL, and layouts and `+` files are not routes.
 */
function appRoutes(): Set<string> {
  const routes = new Set<string>();
  for (const file of walk(join(ROOT, "app"))) {
    const rel = relative(join(ROOT, "app"), file).split(sep).join("/");
    if (!/\.tsx?$/.test(rel)) continue;
    const parts = rel
      .replace(/\.tsx?$/, "")
      .split("/")
      .filter((p) => !/^\(.+\)$/.test(p));
    if (parts.some((p) => p.startsWith("_") || p.startsWith("+"))) continue;
    if (parts[parts.length - 1] === "index") parts.pop();
    routes.add(`/${parts.join("/")}`);
  }
  return routes;
}

const routes = appRoutes();
/** First path segments that belong to the app; other slash-strings (asset paths, regexes) are ignored. */
const segments = new Set([...routes].map((r) => r.split("/")[1]).filter(Boolean));

/** Quoted or template-literal strings that look like an in-app path, cut at `?`, `#` or `${`. */
function pathLiterals(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/(["'`])(\/[a-z0-9][a-z0-9/_-]*)(?=[?#"'`$])/g)) {
    const path = m[2]!.replace(/\/$/, "");
    if (segments.has(path.split("/")[1]!)) found.push(path);
  }
  return found;
}

describe("in-app links", () => {
  it("finds the route map's screens in app/", () => {
    for (const r of ["/", "/lobby", "/play", "/strategies/blackjack", "/live/craps", "/drills"]) {
      expect(routes).toContain(r);
    }
  });

  it("every path the UI links to or navigates to has a route file", () => {
    const sources = [join(ROOT, "src"), join(ROOT, "app")]
      .flatMap(walk)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
    const broken: string[] = [];
    for (const file of sources) {
      for (const path of pathLiterals(readFileSync(file, "utf8"))) {
        if (!routes.has(path)) broken.push(`${relative(ROOT, file)}: ${path}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe("page titles", () => {
  it("every route has its own title, and only routes do", () => {
    expect([...TITLED_ROUTES].sort()).toEqual([...routes].sort());
  });

  it("reads '<Page> · Tableside'", () => {
    expect(pageTitle("/")).toBe("Tableside");
    expect(pageTitle("/games/baccarat")).toBe("Baccarat · Tableside");
    expect(pageTitle("/lobby/")).toBe("Lobby · Tableside");
    expect(pageTitle("/nope")).toBe("Not found · Tableside");
  });
});
