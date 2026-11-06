#!/usr/bin/env node
// Signs the client secret Sign in with Apple needs for the web and Android flow: an ES256 JWT
// from the team's Sign in with Apple key (.p8). Apple caps its life at six months, so this is
// re-run before it lapses (docs/accounts-and-billing.md). Node built-ins only.
//
//   node scripts/apple-client-secret.mjs --team <TEAM_ID> --key-id <KEY_ID> \
//     --client-id <SERVICES_ID> --key AuthKey_<KEY_ID>.p8
//
// Prints the JWT on stdout and its expiry date on stderr, so it can be piped straight into
// `npx convex env set APPLE_CLIENT_SECRET=…`.

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    team: { type: "string" },
    "key-id": { type: "string" },
    "client-id": { type: "string" },
    key: { type: "string" },
  },
});

const missing = ["team", "key-id", "client-id", "key"].filter((k) => !values[k]);
if (missing.length) {
  console.error(`missing --${missing.join(", --")}; see the comment at the top of this file`);
  process.exit(1);
}

const b64url = (data) => Buffer.from(data).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const exp = now + 180 * 86_400; // Apple's maximum: six months.

const header = b64url(JSON.stringify({ alg: "ES256", kid: values["key-id"] }));
const payload = b64url(
  JSON.stringify({
    iss: values.team,
    iat: now,
    exp,
    aud: "https://appleid.apple.com",
    sub: values["client-id"],
  }),
);
const key = createPrivateKey(readFileSync(values.key));
// JWS wants the raw r||s signature, not DER.
const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
  key,
  dsaEncoding: "ieee-p1363",
});

process.stdout.write(`${header}.${payload}.${b64url(signature)}\n`);
console.error(`expires ${new Date(exp * 1000).toISOString().slice(0, 10)}; renew before then`);
