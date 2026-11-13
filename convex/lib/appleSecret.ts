import { p256 } from "@noble/curves/nist.js";

/**
 * Sign in with Apple's client secret: an ES256 JWT signed with the team's Sign in with Apple
 * key (the `.p8` file). Synchronous, because Better Auth takes its client secret as a plain
 * string when the auth instance is built; WebCrypto's signing is async only.
 */
export function appleClientSecret(p: {
  teamId: string;
  keyId: string;
  /** The `.p8` file's PEM text; newlines may be written as `\n`, as in a one-line env var. */
  privateKey: string;
  /** The app's bundle id (native iOS) or the Services ID (web and Android). */
  clientId: string;
  now: number;
  ttlSeconds: number;
}): string {
  const iat = Math.floor(p.now / 1000);
  const signed = `${json64({ alg: "ES256", kid: p.keyId })}.${json64({
    iss: p.teamId,
    iat,
    exp: iat + p.ttlSeconds,
    aud: "https://appleid.apple.com",
    sub: p.clientId,
  })}`;
  // sha256 of the message, signed; compact form is the raw r||s that JWS wants.
  const signature = p256.sign(new TextEncoder().encode(signed), p256Key(p.privateKey));
  return `${signed}.${b64url(signature)}`;
}

/** The 32-byte private key in a PKCS#8 PEM: an RFC 5915 ECPrivateKey, version 1. */
function p256Key(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----[A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  let der: Uint8Array;
  try {
    der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  } catch {
    der = new Uint8Array();
  }
  // INTEGER 1, then an OCTET STRING of 32 bytes.
  for (let i = 0; i + 37 <= der.length; i++) {
    if (der[i] === 2 && der[i + 1] === 1 && der[i + 2] === 1 && der[i + 3] === 4) {
      if (der[i + 4] === 32) return der.slice(i + 5, i + 37);
    }
  }
  throw new Error("APPLE_PRIVATE_KEY isn't a P-256 private key in PEM form (the .p8 file)");
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const json64 = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/**
 * Whether a token on Better Auth's `account` row is one it encrypted (`encryptOAuthTokens`):
 * Better Auth's own test, since rows written before encryption was on hold plain tokens.
 */
export function isStoredEncrypted(token: string): boolean {
  return token.startsWith("$ba$") || (token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token));
}
