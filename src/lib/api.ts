/**
 * Where the API lives, and how requests to it are authenticated.
 *
 * On the web this is empty, so every call is same-origin and nothing changes. In the
 * bundled native app the page is served from the device, so it must be pointed at a real
 * host — set NEXT_PUBLIC_API_BASE_URL at build time.
 *
 * Every client fetch goes through apiFetch. Never call fetch("/api/...") directly, or the
 * mobile build will call a server that is not there, without a session.
 */
const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/** True when the app is talking to a different origin than it was served from. */
export const IS_REMOTE_API = BASE.length > 0;

const TOKEN_KEY = "coach_token";

/**
 * The web app and PWA ride an HttpOnly cookie, which JavaScript cannot read — the right
 * default. The bundled native app is a different origin, where that cookie will not be
 * sent, so it needs the token in a header instead. We keep a copy for that case, and as a
 * fallback wherever cookies get blocked.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode or blocked storage: the cookie still carries same-origin sessions.
  }
}

/**
 * Adds the session to a request, and on a 401 sends the browser to the login screen.
 *
 * It still returns the response rather than throwing, so callers need no special case:
 * their existing `if (!res.ok)` branch shows the server's "Not signed in." for the
 * moment before the navigation lands.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    setToken(null);
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      const next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      window.location.href = `/login?next=${next}`;
    }
  }

  return response;
}
