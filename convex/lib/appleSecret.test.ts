import { beforeAll, describe, expect, it } from "vitest";
import { appleClientSecret, isStoredEncrypted } from "./appleSecret";

const NOW = Date.UTC(2026, 10, 6);
const ECDSA = { name: "ECDSA", namedCurve: "P-256" } as const;

let pem: string;
let publicKey: CryptoKey;

// A throwaway P-256 key in the PKCS#8 PEM form Apple's `.p8` files use.
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/.{64}/g, "$&\n");
  pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
  publicKey = pair.publicKey;
});

const params = (over = {}) => ({
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  privateKey: pem,
  clientId: "com.truecount.app",
  now: NOW,
  ttlSeconds: 86_400,
  ...over,
});

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const decode = (part: string) => JSON.parse(new TextDecoder().decode(fromB64url(part)));

/** Verifies the JWT's signature with WebCrypto, which takes the raw r||s form JWS uses. */
async function signedByKey(jwt: string): Promise<boolean> {
  const [header, payload, signature] = jwt.split(".");
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    fromB64url(signature!),
    new TextEncoder().encode(`${header}.${payload}`),
  );
}

describe("appleClientSecret", () => {
  it("is an ES256 JWT for the client id, from the team, to Apple", () => {
    const [header, payload] = appleClientSecret(params()).split(".");
    expect(decode(header!)).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(decode(payload!)).toEqual({
      iss: "TEAM123456",
      iat: NOW / 1000,
      exp: NOW / 1000 + 86_400,
      aud: "https://appleid.apple.com",
      sub: "com.truecount.app",
    });
  });

  it("is signed by the key", async () => {
    expect(await signedByKey(appleClientSecret(params()))).toBe(true);
  });

  it("reads a key pasted into an env var with its newlines as \\n", async () => {
    const oneLine = pem.trim().replace(/\n/g, "\\n");
    expect(await signedByKey(appleClientSecret(params({ privateKey: oneLine })))).toBe(true);
  });

  it("refuses something that isn't a P-256 key", () => {
    expect(() => appleClientSecret(params({ privateKey: "not a key" }))).toThrow(/P-256/);
  });
});

describe("isStoredEncrypted", () => {
  it("tells Better Auth's encrypted tokens (hex) from Apple's own (with dots)", () => {
    expect(isStoredEncrypted("a1b2c3d4e5f60718")).toBe(true);
    expect(isStoredEncrypted("$ba$1$abcdef")).toBe(true);
    expect(isStoredEncrypted("r1a2b3c4d5e6f7.0.mrsxv.AbCdEf123")).toBe(false);
  });
});
