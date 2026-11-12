"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Lock } from "lucide-react";
import { apiUrl, setToken } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const unconfigured = params.get("reason") === "unconfigured";

  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the server is running without a gate, there is nothing to sign in to.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/auth"));
        const data = await res.json();
        if (!cancelled && data.openAccess) router.replace(next);
      } catch {
        // Offline or no server: leave the form up.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !passcode) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/auth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not sign in.");
        setPasscode("");
        return;
      }

      // The cookie covers same-origin; the token covers the bundled native app.
      if (data.token) setToken(data.token);
      router.replace(next);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted" />
          <h1 className="text-sm font-semibold tracking-tight">
            Meeting English Coach
          </h1>
        </div>

        {unconfigured ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="font-medium">This server has no passcode set.</p>
            <p className="mt-1 text-xs text-amber-800">
              The app is locked until <code>APP_PASSCODE</code> is set in the
              environment and the server is restarted. It fails closed on purpose — an
              open deployment would let anyone spend your API credit and read your
              practice history.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label
              htmlFor="passcode"
              className="block text-xs text-ink-2"
            >
              Passcode
            </label>
            <input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="field mt-2 w-full px-3.5 py-2.5 text-base text-ink placeholder:text-muted sm:text-sm"
              placeholder="Enter your passcode"
            />

            <button
              type="submit"
              disabled={busy || !passcode}
              className="mt-3 btn-primary w-full px-3 py-2.5 text-sm"
            >
              {busy ? "Checking..." : "Unlock"}
            </button>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              One shared passcode, set as <code>APP_PASSCODE</code> on the server. It
              stays signed in for 30 days on this device.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-page" aria-hidden="true" />
      }
    >
      <LoginForm />
    </Suspense>
  );
}
