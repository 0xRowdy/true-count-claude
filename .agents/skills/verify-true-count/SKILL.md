---
name: verify-true-count
description: Drive the True Count app (Expo web export) in a real headless browser and capture evidence — launch, doctor, run feature flows, clean up. Use before calling any UI/behavior change done, when reproducing a bug report, or when a PR needs proof that a screen still works. Covers Play, the drills, Rules, Shoe Integrity, Session.
---

# verify-true-count

Proves behavior by driving the **web build** of this app the way a user does: real routes, real buttons, screenshots and logs as evidence. Unit tests (`pnpm test`) prove the engine; this proves the screens. Native iOS/Android are out of scope here (EAS, issue #13).

Everything runs from any worktree of this repo. One command does all of it:

```bash
V=.agents/skills/verify-true-count/scripts/verify.sh
$V launch            # build web export (pnpm build:web) and serve it on a free port 4310-4399 → prints URL
$V doctor            # is the instance this worktree launched alive, ours, and built from the current tree?
$V drive play-round true-count-drill    # run flows/*.mjs headless; non-zero exit = a flow FAILED
$V stop              # stop the server this worktree started (evidence is kept)
```

## Launch
- `launch` runs `pnpm build:web` (~25 s, CI does the same) then serves `dist/` with `scripts/serve.mjs` (clean URLs: `/play` → `play.html`). Ready when it prints `ready: http://127.0.0.1:<port>`.
- `--no-build` reuses an existing `dist/` (only when you know it matches the tree; `doctor` warns if not).
- `--tailnet` binds the box's Tailscale IP instead of localhost, so a human can open the exact build from another machine. Use it when handing a change over for a look; say the URL in your message.
- Isolation: state lives in `<worktree>/.verify/` (gitignored), each worktree gets its own port and `dist/`, so parallel worktrees never share an instance. No accounts, no backend, no network: the app is fully local.

## Doctor
Run first, and again whenever anything looks off. All lines must be `ok` (a `WARN` about a stale build means relaunch):
server pid is ours · URL serves the Expo export · build stamp matches `git HEAD`(+dirty) · Playwright present.

## Drive
- Flows are small Playwright scripts in `flows/<name>.mjs`: `export default async ({ page, url, shot, log, check }) => { … }`. `url("/play")` resolves a route, `shot(name)` screenshots, `check(cond, msg)` asserts (throw = FAIL), `log()` notes.
- Playwright + Chromium come from the fleet toolchain (`mise where npm:playwright`), not this repo's dependencies. If `doctor` says Playwright is missing: `playwright install chromium`.
- **Selectors:** use ARIA roles and names; React Native maps `accessibilityLabel`/`accessibilityRole` to them. Buttons: `getByRole("button", { name: "Deal" })`. Cards: `getByRole("img", { name: /of/ })`. Drill links: `getByRole("link", { name: "True Count drill" })`.
- **Gotcha — always filter to visible:** React Native Web keeps hidden copies of views mounted (the drills hub stays under a drill). Use `loc.filter({ visible: true }).first()`; plain `getByText` will hit strict-mode violations.
- New behavior → write or extend a flow for it, and add/update its page in `features/`. One-off exploration can be a flow file anywhere: `$V drive path/to/flow.mjs`.

## Evidence
- Every drive writes `.verify/evidence/<timestamp>-<flow>/`: numbered screenshots, `log.txt` (every check), `result.json` (PASS/FAIL + **browser console errors**). A FAIL always adds a `failure.png`.
- Proof standard: drive the real user path (buttons, keyboard), capture the action **and** the resulting state, and read `consoleErrors` — a PASS with new console errors is not clean.
- In a PR, attach the relevant screenshots and quote the `ok:` lines; say which flows ran.

## Cleanup
`$V stop` kills only the PID this worktree launched (never by name) and keeps `.verify/evidence/`. Delete old evidence by hand if it piles up.

## Known state (2026-10-08)
- Both flows PASS on `main` (13e21e6).
- Every page load logs **React error #418** (hydration text mismatch between the static HTML and the client render). Pre-existing; tracked as an issue — don't mistake it for your regression, but don't add new ones.
