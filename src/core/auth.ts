/**
 * Passcode auth for a single-user app.
 *
 * There are no accounts here, so there is nothing to model: one shared passcode unlocks
 * the app and issues a signed, stateless token. No session store, nothing to expire
 * server-side, nothing extra to deploy.
 *
 * Written against Web Crypto rather than node:crypto on purpose — this runs inside
 * src/proxy.ts, which executes on the Edge runtime where node:crypto does not exist.
 */

const TOKEN_TTL_DAYS = 30;
export const SESSION_COOKIE = "coach_session";

/* ---- base64url, without Buffer (not available on Edge) -------------------- */

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/* ---- configuration -------------------------------------------------------- */

export interface AuthConfig {
  /** The passcode that unlocks the app. */
  passcode: string | null;
  /** True when the app should run without a gate (local development only). */
  openAccess: boolean;
}

export function readAuthConfig(): AuthConfig {
  const passcode = process.env.APP_PASSCODE?.trim() || null;
  // Fail OPEN in development so local work needs no ceremony, but fail CLOSED
  // everywhere else — an unset passcode in production must not quietly publish
  // an API that spends money and hands out your practice history.
  return {
    passcode,
    openAccess: !passcode && process.env.NODE_ENV === "development",
  };
}

/**
 * The HMAC key. Derived from the passcode when no explicit secret is set, so there is
 * one thing to configure — and changing the passcode correctly invalidates old tokens.
 */
function signingSecret(passcode: string): string {
  return process.env.AUTH_SECRET?.trim() || `english-coach:v1:${passcode}`;
}

/* ---- tokens --------------------------------------------------------------- */

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(payload)
  );
  return toBase64Url(new Uint8Array(signature));
}

/** Length-independent constant-time compare. Web Crypto has no timingSafeEqual. */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Compare a fixed-size digest-ish accumulator so differing lengths do not short-circuit.
  let diff = ab.length ^ bb.length;
  const max = Math.max(ab.length, bb.length);
  for (let i = 0; i < max; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export function passcodeMatches(supplied: string, expected: string): boolean {
  return constantTimeEqual(supplied, expected);
}

export const TOKEN_MAX_AGE_SECONDS = TOKEN_TTL_DAYS * 24 * 60 * 60;

export async function createToken(passcode: string): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ exp: Date.now() + TOKEN_MAX_AGE_SECONDS * 1000 })
    )
  );
  return `${payload}.${await sign(payload, signingSecret(passcode))}`;
}

export async function verifyToken(
  token: string | undefined | null,
  passcode: string
): Promise<boolean> {
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = await sign(payload, signingSecret(passcode));
  if (!constantTimeEqual(signature, expected)) return false;

  try {
    const { exp } = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

/** Pulls the token from either transport: cookie (web, PWA) or bearer (native shell). */
export function tokenFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;

  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}
