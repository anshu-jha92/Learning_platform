"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Lock } from "lucide-react";
import {
  buildDashboard,
  SCORE_KEYS,
  SCORE_LABELS,
  type Range,
} from "@/core/analytics";
import type { TurnRecord } from "@/core/store";
import { paceVerdict } from "@/core/metrics";
import { Sparkline } from "@/components/charts/Sparkline";
import { BarList } from "@/components/charts/BarList";
import { StatTile } from "@/components/charts/StatTile";
import { VIZ } from "@/components/charts/tokens";
import { apiFetch, setToken } from "@/lib/api";

const RANGES: { id: Range; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All time" },
];

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg border p-3"
      style={{ background: VIZ.surface, borderColor: VIZ.border }}
    >
      <h2 className="text-xs font-medium" style={{ color: VIZ.textPrimary }}>
        {title}
      </h2>
      {note && (
        <p className="mt-0.5 text-[11px]" style={{ color: VIZ.textMuted }}>
          {note}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

async function signOut() {
  // Clear both transports: the HttpOnly cookie server-side, the stored bearer locally.
  try {
    await apiFetch("/api/auth", { method: "DELETE" });
  } catch {
    // Even if the server is unreachable, still drop the local token.
  }
  setToken(null);
  window.location.href = "/login";
}

export default function Dashboard() {
  const [turns, setTurns] = useState<TurnRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/profile");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load your history.");
          return;
        }
        setTurns(data.turns ?? []);
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const d = useMemo(
    () => (turns ? buildDashboard(turns, range) : null),
    [turns, range]
  );

  return (
    <div className="min-h-screen text-ink">
      <header className="safe-top glass sticky top-0 z-20">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-sm font-semibold tracking-tight">Your progress</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void signOut()}
                title="Lock the app on this device"
                className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
              >
                <Lock className="h-3 w-3" />
                <span className="hidden sm:inline">Lock</span>
              </button>
              <Link
                href="/"
                className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
              >
                <ArrowLeft className="h-3 w-3" />
                Practice
              </Link>
            </div>
          </div>

          {/* One filter row above everything it scopes. */}
          <div className="mt-3 flex items-center gap-2">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`pill px-3 py-1.5 text-xs ${
                  r.id === range
                    ? "pill-active"
                    : ""
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!turns && !error && (
          <p className="py-16 text-center text-sm" style={{ color: VIZ.textMuted }}>
            Loading your history...
          </p>
        )}

        {d?.empty && (
          <div className="card px-4 py-14 text-center">
            <p className="text-sm text-ink-2">Nothing to show for this range yet.</p>
            <p className="mt-1 text-xs text-muted">
              Every answer you give in practice lands here — scores, pace, fillers, and the
              mistakes you keep repeating.
            </p>
            <Link
              href="/"
              className="btn-primary mt-4 inline-block px-4 py-2 text-sm"
            >
              Start practising
            </Link>
          </div>
        )}

        {d && !d.empty && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Answers practised"
                value={String(d.totalTurns)}
                hint={`${d.spokenTurns} spoken`}
              />
              <StatTile
                label="Errors"
                value={d.errorsPer100 === null ? "--" : String(d.errorsPer100)}
                unit="per 100 words"
              />
              <StatTile
                label="Speaking pace"
                value={d.avgWpm === null ? "--" : String(d.avgWpm)}
                unit="wpm"
                hint={d.avgWpm === null ? "Speak to measure" : paceVerdict(d.avgWpm)}
              />
              <StatTile
                label="Fillers"
                value={d.fillersPer100 === null ? "--" : String(d.fillersPer100)}
                unit="per 100 words"
              />
            </div>

            <Card
              title="Errors per 100 words"
              note="Normalised for answer length, so a long answer is not punished. Down is better."
            >
              <Sparkline points={d.errorsSeries} yMin={0} height={140} />
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              {SCORE_KEYS.map((key) => {
                const delta = d.scoreDelta[key];
                const avg = d.avgScores[key];
                return (
                  <Card
                    key={key}
                    title={SCORE_LABELS[key]}
                    note={
                      avg === null
                        ? undefined
                        : `average ${avg} of 5${
                            delta === null
                              ? ""
                              : delta === 0
                                ? " · flat"
                                : ` · ${delta > 0 ? "+" : ""}${delta} vs when you started`
                          }`
                    }
                  >
                    <Sparkline
                      points={d.scoreSeries[key]}
                      yMin={1}
                      yMax={5}
                      height={100}
                      format={(n) => String(Math.round(n))}
                    />
                  </Card>
                );
              })}
            </div>

            {d.wpmSeries.length > 0 && (
              <Card
                title="Speaking pace"
                note="The shaded band is 110-165 wpm, where meeting speech lands. Below reads as unsure, above as nervous."
              >
                <Sparkline
                  points={d.wpmSeries}
                  band={{ from: 110, to: 165, label: "meeting pace" }}
                  height={140}
                  format={(n) => String(Math.round(n))}
                />
              </Card>
            )}

            <Card
              title="Mistakes you keep repeating"
              note="Counted across this range, with whether each one is getting better. Hover a row for an example."
            >
              <BarList
                rows={d.patterns.map((p) => ({
                  label: p.label,
                  value: p.value,
                  tone: p.tone,
                  status: p.status,
                  sublabel: p.sublabel,
                  detail: p.example,
                }))}
                format={(n) => `${n}x`}
                emptyLabel="No repeated mistakes in this range."
              />
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card title="Filler words" note="Counted from what you actually said.">
                <BarList
                  rows={d.topFillers}
                  emptyLabel="No fillers detected yet."
                />
              </Card>

              <Card
                title="Scenario coverage"
                note="The ones you avoid are usually the ones worth practising."
              >
                <BarList rows={d.scenarioCoverage} />
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
