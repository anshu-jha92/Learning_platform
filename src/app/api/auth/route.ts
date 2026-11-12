import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  TOKEN_MAX_AGE_SECONDS,
  createToken,
  passcodeMatches,
  readAuthConfig,
} from "@/core/auth";

/**
 * Exchange the passcode for a session.
 *
 * Returns the token in the body AND sets it as an HttpOnly cookie, because the two
 * clients need different transports: the web app and PWA ride the cookie, while the
 * native shell in bundle mode is a different origin and must send a bearer header.
 */

/**
 * A passcode is one secret with no lockout behind it, so the only thing standing between
 * it and an offline-speed guessing loop is this. In-memory and per-instance: good enough
 * for a single-user app, and it resets on restart.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);

  // Keep the map from growing without bound on a long-running process.
  if (attempts.size > 500) {
    for (const [k, times] of attempts) {
      if (times.every((t) => now - t >= WINDOW_MS)) attempts.delete(k);
    }
  }

  return recent.length > MAX_ATTEMPTS;
}

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

export async function POST(request: Request) {
  const { passcode: expected, openAccess } = readAuthConfig();

  if (openAccess) {
    return NextResponse.json({ ok: true, openAccess: true });
  }

  if (!expected) {
    return NextResponse.json(
      {
        error:
          "APP_PASSCODE is not set on the server, so the app is locked. Set it and restart.",
      },
      { status: 503 }
    );
  }

  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { error: "Too many attempts. Wait 15 minutes and try again." },
      { status: 429 }
    );
  }

  let body: { passcode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const supplied = body.passcode ?? "";
  if (!passcodeMatches(supplied, expected)) {
    // Deliberately vague, and identical for empty and wrong.
    return NextResponse.json({ error: "That passcode is not right." }, { status: 401 });
  }

  const token = await createToken(expected);
  const response = NextResponse.json({ ok: true, token });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_MAX_AGE_SECONDS,
  });

  return response;
}

/** Sign out: clear the cookie. The client drops its own stored token. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

/** Lets the login screen tell "locked" from "no passcode configured" from "open". */
export async function GET() {
  const { passcode, openAccess } = readAuthConfig();
  return NextResponse.json({
    openAccess,
    configured: Boolean(passcode),
  });
}
