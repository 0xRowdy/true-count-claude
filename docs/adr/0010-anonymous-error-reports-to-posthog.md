# ADR-0010: Anonymous Error reports to PostHog, on by default

**Status:** Accepted · 2026-11-23 · A narrow exception to ADR-0003 ("no user data leaves the
device"). Practice data still stays on the device unless the player chooses Sync or sends a
Bug report.

## Context

Tableside has no telemetry. A crash nobody reports is invisible, and invariant 10's Bug report
only arrives when a player stops to send one. Today sending one needs a GitHub account. The
privacy policy promises "no analytics or tracking SDKs", and the App Store label says nothing
is collected. Convex backend errors reach only its dashboard, and Convex forwards exceptions to
an error tracker only on its Pro plan, tagged with the signed-in player's identity.

## Decision

- **Error reports are on by default, anonymous, and the player can turn them off.** An Error
  report carries the error, its stack, the build, the OS and the device model. It never carries
  an Account id, an IP address, Session data or hand data. The switch sits on the Privacy
  Policy page beside an example Error report shown in full, and it stays on the device; it
  does not sync. Only production builds send.
- **PostHog, exceptions only.** A Tableside project in EU Cloud, with IPs discarded and GeoIP
  off. Autocapture, screen views, session replay, surveys and feature flags are off. Person
  profiles are never created and `identify` is never called, even for a signed-in Plus player,
  so the reports stay "not linked to you".
- **Each new error group opens one GitHub issue** in this public repo, labelled
  `needs-triage`, through PostHog's "Issue created" alert. The code is already public, so
  stack frames reveal nothing new. If that alert needs a paid PostHog plan, we pay for it.
- **Backend errors come from our own job, not Convex Pro.** A long-running process tails
  `npx convex logs --prod --jsonl` with a production deploy key. It sends failed function runs
  and `console.error` lines to PostHog under one fixed id, `convex-backend`, after scrubbing
  emails and tokens. After a restart it catches up with `--history` and skips runs already
  sent. It sends a heartbeat, and a PostHog alert fires when the heartbeat stops. It will
  probably run on rodd-e, the Intel MacBook Pro that already hosts the Hermes agent.
- **The disclosures change in the same release as the SDK.** The policy says: no advertising,
  no tracking, no analytics of how you use the app, and anonymous Error reports to PostHog that
  you can turn off. Apple's label lists Crash Data and Other Diagnostic Data, not linked, not
  used for tracking. Google's data safety form lists App info and performance as collected,
  not shared and optional.

## Considered options

- **Opt-in Error reports.** Rejected: few players turn it on, so most crashes would stay
  unseen. The default is offset by anonymity and a visible switch with an example.
- **Sentry.** It has more mature native symbolication, but automatic GitHub issues need its
  \$89 a month Business plan, and it has no product analytics if we want them later.
- **EAS Observe.** Rejected: no web, no alerts and no GitHub integration.
- **Convex Pro exception reporting.** Rejected: a plan upgrade only for this, and it links
  errors to the signed-in player.

## Consequences

- The privacy story changes from "nothing leaves the device" to "nothing about you leaves the
  device unless you choose". The example Error report on the Privacy Policy page is what keeps
  that claim checkable rather than asserted.
- Whether PostHog captures native iOS crashes in an Expo build is unverified while CocoaPods
  goes read-only (2 Dec 2026). If it does not, iOS ships with JS errors only and a follow-up
  issue, rather than a change of vendor.
- Backend errors stop being reported while that one machine is down. The heartbeat alert is
  what makes that visible.
- Convex's JSONL log format is not documented as stable, so the job is tested against a
  recorded sample.
