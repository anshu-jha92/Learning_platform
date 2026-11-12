"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Mic, Square, Check } from "lucide-react";
import { KIND_LABEL, KIND_PROMPT, type DeckCard } from "@/core/cards";
import { gradePreview, type Grade } from "@/core/srs";
import { useRecorder } from "@/hooks/useRecorder";
import { apiFetch } from "@/lib/api";

interface Summary {
  dueCount: number;
  newCount: number;
  totalCount: number;
}

interface Attempt {
  transcript: string;
  similarity: number;
}

const GRADES: { id: Grade; label: string; className: string }[] = [
  { id: "again", label: "Again", className: "bg-rose-600 hover:bg-rose-700" },
  { id: "hard", label: "Hard", className: "bg-amber-600 hover:bg-amber-700" },
  { id: "good", label: "Good", className: "bg-sky-600 hover:bg-sky-700" },
  { id: "easy", label: "Easy", className: "bg-emerald-600 hover:bg-emerald-700" },
];

export default function Review() {
  const [queue, setQueue] = useState<DeckCard[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const recorder = useRecorder();
  const card = queue && index < queue.length ? queue[index] : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/cards");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load your deck.");
          return;
        }
        setQueue(data.queue ?? []);
        setSummary(data.summary ?? null);
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const previews = useMemo(
    () => (card ? gradePreview(card.state) : null),
    [card]
  );

  function next(requeue: DeckCard | null) {
    setRevealed(false);
    setAttempt(null);
    setError(null);
    recorder.cancel();
    setQueue((prev) => (requeue && prev ? [...prev, requeue] : prev));
    setIndex((i) => i + 1);
    setDone((n) => n + 1);
  }

  async function grade(g: Grade) {
    if (!card) return;
    try {
      const res = await apiFetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, grade: g }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not save that review.");
        return;
      }
      // "Again" means you did not know it — see it once more before the session ends.
      next(g === "again" ? card : null);
    } catch {
      setError("Could not reach the server.");
    }
  }

  const checkSpoken = useCallback(async () => {
    const rec = await recorder.stop();
    if (!rec || !card) return;

    setChecking(true);
    setError(null);
    const form = new FormData();
    form.append(
      "audio",
      new File([rec.blob], `attempt.${rec.extension}`, { type: rec.blob.type })
    );
    form.append("target", card.target);

    try {
      const res = await apiFetch("/api/cards/check", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not check that recording.");
        return;
      }
      setAttempt({ transcript: data.transcript, similarity: data.similarity });
      setRevealed(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setChecking(false);
    }
  }, [recorder, card]);

  const recording = recorder.state === "recording";
  const total = queue?.length ?? 0;
  const finished = queue !== null && index >= total;

  return (
    <div className="min-h-screen text-ink">
      <header className="safe-top glass sticky top-0 z-20">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Review</h1>
            {summary && (
              <p className="text-[11px] text-muted">
                {summary.dueCount} due · {summary.newCount} new ·{" "}
                {summary.totalCount} cards total
              </p>
            )}
          </div>
          <Link
            href="/"
            className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            <ArrowLeft className="h-3 w-3" />
            Practice
          </Link>
        </div>
        {total > 0 && !finished && (
          <div className="h-0.5 w-full bg-surface">
            <div
              className="h-full bg-sky-600 transition-all"
              style={{ width: `${(done / (done + (total - index))) * 100}%` }}
            />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!queue && !error && (
          <p className="py-16 text-center text-sm text-muted">
            Loading your deck...
          </p>
        )}

        {queue && total === 0 && (
          <div className="card px-4 py-14 text-center">
            <p className="text-sm text-ink-2">No cards yet.</p>
            <p className="mt-1 text-xs text-muted">
              Cards are built from your own mistakes. Practise a few answers and every
              correction you get becomes a card here.
            </p>
            <Link
              href="/"
              className="btn-primary mt-4 inline-block px-4 py-2 text-sm"
            >
              Start practising
            </Link>
          </div>
        )}

        {finished && total > 0 && (
          <div className="card px-4 py-14 text-center">
            <Check className="mx-auto h-6 w-6 text-emerald-700" />
            <p className="mt-2 text-sm text-ink">
              Done — {done} {done === 1 ? "card" : "cards"} reviewed.
            </p>
            <p className="mt-1 text-xs text-muted">
              Come back tomorrow. The ones you found hard will be waiting.
            </p>
            <Link
              href="/"
              className="btn-primary mt-4 inline-block px-4 py-2 text-sm"
            >
              Back to practice
            </Link>
          </div>
        )}

        {card && (
          <div className="card card-lift p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="chip px-2 py-0.5 text-[10px] uppercase">
                {KIND_LABEL[card.kind]}
              </span>
              <span className="text-[11px] text-muted">
                {/* How often you made the mistake matters more than whether the card is
                    new — seeing "35x" is the thing that makes you pay attention. */}
                {[
                  card.isNew ? "new" : null,
                  card.seenCount > 1
                    ? `you have made this ${card.seenCount}x`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "seen once"}
              </span>
            </div>

            <p className="mt-3 text-xs text-muted">{KIND_PROMPT[card.kind]}</p>
            <p className="mt-2 text-lg leading-relaxed text-ink">
              {card.front}
            </p>

            {!revealed && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setRevealed(true)}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  Show answer
                </button>

                {recording ? (
                  <button
                    onClick={() => void checkSpoken()}
                    className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Stop and check
                  </button>
                ) : (
                  <button
                    onClick={() => void recorder.start()}
                    disabled={checking}
                    className="btn-ghost flex items-center gap-1.5 px-3.5 py-2 text-sm disabled:opacity-40"
                  >
                    <Mic className="h-3.5 w-3.5" />
                    {checking ? "Checking..." : "Say it out loud"}
                  </button>
                )}
                {recorder.error && (
                  <span className="text-xs text-rose-700">{recorder.error}</span>
                )}
              </div>
            )}

            {revealed && (
              <div className="mt-5 space-y-4 border-t border-line pt-4">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Answer
                  </h3>
                  <p className="mt-1 text-lg leading-relaxed text-emerald-700">
                    {card.back}
                  </p>
                </div>

                {card.note && (
                  <p className="text-sm text-ink-2">{card.note}</p>
                )}

                {attempt && (
                  <div className="rounded-lg border border-line bg-page p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        What you said
                      </h3>
                      <span
                        className={`text-xs ${
                          attempt.similarity >= 80
                            ? "text-emerald-700"
                            : attempt.similarity >= 50
                              ? "text-amber-700"
                              : "text-rose-600"
                        }`}
                      >
                        {attempt.similarity}% match
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-2">
                      {attempt.transcript}
                    </p>
                    <p className="mt-1.5 text-[10px] text-muted">
                      A rough recall check, not a pronunciation score — transcription
                      tidies up some of what you say.
                    </p>
                  </div>
                )}

                {card.context && card.kind !== "rephrase" && (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      You said this in
                    </h3>
                    <p className="mt-1 text-xs italic text-muted">
                      &ldquo;{card.context}&rdquo;
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    How well did you know it?
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {GRADES.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => void grade(g.id)}
                        className={`rounded-lg px-2 py-2 text-sm font-medium text-white transition ${g.className}`}
                      >
                        {g.label}
                        {previews && (
                          <span className="mt-0.5 block text-[10px] font-normal opacity-80">
                            {previews[g.id]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
