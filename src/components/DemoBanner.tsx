"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { apiFetch } from "@/lib/api";

/**
 * Says plainly when answers are coming from the offline rule engine rather than a model.
 *
 * Worth the screen space: without it, weak feedback looks like a bad product instead of a
 * missing API key, and someone could easily believe they were seeing real coaching.
 */
export function DemoBanner() {
  const [mock, setMock] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/status");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMock(Boolean(data.mock));
      } catch {
        // Status is cosmetic — never block the page on it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mock) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium">Offline mode.</span> No{" "}
        <code>OPENAI_API_KEY</code> is set, so replies and corrections come from a small
        built-in rule engine, not a language model. It catches a fixed list of common
        mistakes and scores by heuristic — enough to try every screen, but not real
        coaching.
      </span>
    </div>
  );
}
