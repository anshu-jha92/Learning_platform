"use client";

import { useState } from "react";
import { ChevronDown, Check, AlertCircle } from "lucide-react";
import type { Coaching, Scores } from "@/core/schemas";
import { AddToLibrary } from "@/components/AddToLibrary";
import type { TextMetrics } from "@/core/metrics";
import { paceVerdict } from "@/core/metrics";

const SCORE_LABELS: Record<keyof Scores, string> = {
  clarity: "Clarity",
  grammar: "Grammar",
  professionalism: "Professional",
  conciseness: "Concise",
};

function ScoreDots({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${
            n <= value
              ? value >= 4
                ? "bg-emerald-600"
                : value === 3
                  ? "bg-amber-500"
                  : "bg-rose-600"
              : "bg-line"
          }`}
        />
      ))}
    </span>
  );
}

export function CoachCard({
  coaching,
  metrics,
}: {
  coaching: Coaching;
  metrics?: TextMetrics;
}) {
  const [open, setOpen] = useState(true);
  const clean = coaching.errors.length === 0;

  return (
    <div className="mt-2 overflow-hidden card text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-raised/60"
      >
        {clean ? (
          <Check className="h-4 w-4 shrink-0 text-emerald-700" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
        )}
        <span className="font-medium text-ink">
          {clean
            ? "No errors"
            : `${coaching.errors.length} ${coaching.errors.length === 1 ? "fix" : "fixes"}`}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {(Object.keys(SCORE_LABELS) as (keyof Scores)[]).map((k) => (
            <span key={k} className="hidden items-center gap-1.5 sm:flex">
              <span className="text-[11px] uppercase tracking-wide text-muted">
                {SCORE_LABELS[k]}
              </span>
              <ScoreDots value={coaching.scores[k]} />
            </span>
          ))}
          <ChevronDown
            className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-3 py-3">
          {!clean && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Corrected
              </h4>
              <p className="text-ink">{coaching.corrected}</p>
            </div>
          )}

          {coaching.errors.length > 0 && (
            <ul className="space-y-2">
              {coaching.errors.map((err, i) => (
                <li key={i} className="rounded border border-line bg-page p-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="chip px-2 py-0.5 text-[10px] uppercase">
                      {err.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-rose-700 line-through decoration-rose-400">
                      {err.original}
                    </span>
                    <span className="text-muted">to</span>
                    <span className="text-emerald-700">{err.fix}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-2">{err.why}</p>
                </li>
              ))}
            </ul>
          )}

          {coaching.better_phrasings.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                A native professional would say
              </h4>
              <ul className="space-y-1">
                {coaching.better_phrasings.map((p, i) => (
                  <li key={i} className="flex gap-2 text-ink-2">
                    <span className="text-muted">&bull;</span>
                    <span>&ldquo;{p}&rdquo;</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coaching.vocab_upgrades.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Stronger words
              </h4>
              <ul className="space-y-1.5">
                {coaching.vocab_upgrades.map((v, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-1.5 text-ink-2">
                    <span className="text-muted">{v.you_said}</span>
                    <span className="text-muted">&rarr;</span>
                    <span className="font-medium text-brand">{v.try}</span>
                    <AddToLibrary
                      word={v.try}
                      context={coaching.corrected}
                      source="coaching"
                    />
                    {v.note && (
                      <span className="basis-full text-xs text-muted">{v.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coaching.register_note && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Tone
              </h4>
              <p className="text-ink-2">{coaching.register_note}</p>
            </div>
          )}

          {metrics && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2 text-xs text-muted">
              <span>{metrics.words} words</span>
              <span>avg sentence {metrics.avgSentenceWords}w</span>
              {metrics.longestSentenceWords > 25 && (
                <span className="text-amber-700">
                  longest sentence {metrics.longestSentenceWords}w &mdash; split it
                </span>
              )}
              {metrics.wpm !== undefined && (
                <span>
                  {metrics.wpm} wpm ({paceVerdict(metrics.wpm)})
                </span>
              )}
              {metrics.fillerCount > 0 && (
                <span className="text-amber-700">
                  fillers: {metrics.fillers.map((f) => `${f.term} x${f.count}`).join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
