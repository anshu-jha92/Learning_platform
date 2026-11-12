import { NextResponse, type NextRequest } from "next/server";
import { readAuthConfig, tokenFromRequest, verifyToken } from "@/core/auth";

/**
 * Two jobs: CORS for the native shell, and the auth gate.
 *
 * CORS is deliberately an ALLOWLIST, not `*`. The API spends your OpenAI credit and
 * returns your practice history, so a wildcard would let any page you happened to have
 * open call your server. Add deployed origins via ALLOWED_ORIGINS (comma-separated).
 */
const DEFAULT_ALLOWED = [
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
];

function allowedOrigins(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED, ...configured];
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigins().includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    // Authorization is how the bundled native app carries its session.
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Paths that must stay reachable while logged out, or the gate locks you out of itself. */
function isPublic(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icon-") ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/favicon.ico"
  );
}

export async function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  const { pathname } = request.nextUrl;

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const pass = (): NextResponse => {
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    return response;
  };

  if (isPublic(pathname)) return pass();

  const { passcode, openAccess } = readAuthConfig();

  // Local development with no passcode set: no gate, so nothing is in the way.
  if (openAccess) return pass();

  const isApi = pathname.startsWith("/api/");

  // Production with no passcode set fails CLOSED. Refusing loudly is the only way an
  // accidental deploy does not quietly become an open, billable API.
  if (!passcode) {
    if (isApi) {
      return NextResponse.json(
        { error: "APP_PASSCODE is not set on the server. The app is locked." },
        { status: 503, headers }
      );
    }
    return NextResponse.redirect(new URL("/login?reason=unconfigured", request.url));
  }

  if (await verifyToken(tokenFromRequest(request), passcode)) return pass();

  if (isApi) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401, headers }
    );
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own asset pipeline; isPublic() handles the rest.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
