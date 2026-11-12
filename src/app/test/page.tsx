"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  GraduationCap,
  Loader2,
  Mic,
  Square,
  ArrowRight,
  Check,
  X,
  Minus,
  Target,
  RotateCcw,
} from "lucide-react";
import type { GradedTest, TestAttempt, TestQuestion } from "@/core/test";
import { useRecorder } from "@/hooks/useRecorder";
import { apiFetch } from "@/lib/api";

const TYPE_LABEL: Record<TestQuestion["type"], string> = {
  fix: "Fix the mistake",
  improve: "Say it better",
  use_word: "Use the word",
  meaning: "What does it mean",
};

/** Ring colour follows the score — green when it is going well, amber, then red. */
function bandColor(percentage: number): string {
  if (percentage >= 75) return "#0ca30c";
  if (percentage >= 50) return "#fab219";
  return "#d03b3b";
}

function ScoreRing({ percentage }: { percentage: number }) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const filled = (percentage / 100) * circumference;

  return (
    <div className="relative grid h-36 w-36 place-items-center">
      <svg className="absolute -rotate-90" width="136" height="136">
        <circle cx="68" cy="68" r={r} fill="none" stroke="#e6e6f0" strokeWidth="10" />
        <circle
          cx="68"
          cy="68"
          r={r}
          fill="none"
          stroke={bandColor(percentage)}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="text-center">
        <div className="text-4xl font-bold leading-none text-ink">{percentage}%</div>
      </div>
    </div>
  );
}

export default function WeeklyTest() {
  const [questions, setQuestions] = useState<TestQuestion[] | null>(null);
  const [drawnFrom, setDrawnFrom] = useState<{
    mistakes: number;
    words: number;
    days: number;
  } | null>(null);
  const [past, setPast] = useState<TestAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [transcribing, setTranscribing] = useState(false);

  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState<GradedTest | null>(null);

  const recorder = useRecorder();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadPast = useCallback(async () => {
    try {
      const res = await apiFetch("/api/test");
      const data = await res.json();
      if (res.ok) setPast(data.past ?? []);
    } catch {
      // The start screen works without past scores.
    }
  }, []);

  useEffect(() => {
    void loadPast();
  }, [loadPast]);

  async function begin() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/test");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not build your test.");
        return;
      }
      setQuestions(data.questions);
      setDrawnFrom(data.drawnFrom);
      setPast(data.past ?? []);
      setAnswers({});
      setDraft("");
      setIndex(0);
      setResult(null);
      setStarted(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  const current = questions && started ? questions[index] : null;
  const isLast = questions ? index === questions.length - 1 : false;

  async function speakAnswer() {
    const rec = await recorder.stop();
    if (!rec) return;
    setTranscribing(true);
    const form = new FormData();
    form.append(
      "audio",
      new File([rec.blob], `answer.${rec.extension}`, { type: rec.blob.type })
    );
    try {
      const res = await apiFetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not hear that.");
        return;
      }
      setDraft((prev) => (prev ? `${prev} ${data.text}` : data.text));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setTranscribing(false);
    }
  }

  /**
   * Move between questions, keeping what was typed.
   *
   * Both directions go through here so the draft is always saved first and the answer
   * for wherever you land is loaded back. Going back and finding the box empty would
   * make the Back button worse than not having one.
   */
  function go(delta: number) {
    if (!current || !questions) return;
    const saved = { ...answers, [current.id]: draft };
    setAnswers(saved);

    const target = index + delta;
    if (target >= questions.length) {
      void submit(saved);
      return;
    }
    if (target < 0) return;

    setIndex(target);
    setDraft(saved[questions[target].id] ?? "");
  }

  async function submit(saved: Record<string, string>) {
    if (!questions) return;
    setMarking(true);
    setError(null);
    try {
      const res = await apiFetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: questions.map((q) => ({
            id: q.id,
            question: q,
            answer: saved[q.id] ?? "",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not mark your test.");
        return;
      }
      setResult(data);
      setStarted(false);
      void loadPast();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setMarking(false);
    }
  }

  const recording = recorder.state === "recording";

  return (
    <div className="min-h-screen text-ink">
      <header className="safe-top glass sticky top-0 z-20">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
          <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <GraduationCap className="h-4 w-4 text-brand" />
            Weekly test
          </h1>
          <Link href="/" className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Practice
          </Link>
        </div>
        {started && questions && (
          <div className="h-1 w-full bg-raised">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${((index + 1) / questions.length) * 100}%`,
                background: "var(--brand-gradient)",
              }}
            />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ---- Marking ---- */}
        {marking && (
          <div className="card px-4 py-16 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand" />
            <p className="mt-3 text-sm text-ink-2">Marking your answers...</p>
            <p className="mt-1 text-xs text-muted">
              Every answer is read properly, so this takes a few seconds.
            </p>
          </div>
        )}

        {/* ---- Start ---- */}
        {!started && !result && !marking && (
          <>
            <div className="card card-lift p-5">
              <h2 className="text-lg font-semibold">This week&apos;s test</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                Built only from your own last 6 days — the mistakes you actually made and
                the words you saved. Nothing generic, nothing from a textbook.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Answer by typing or by speaking. You get a score at the end, with what to
                work on next.
              </p>
              <button
                onClick={() => void begin()}
                disabled={loading}
                className="btn-primary mt-4 flex w-full items-center justify-center gap-2 px-4 py-3 text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building your test...
                  </>
                ) : (
                  <>
                    <GraduationCap className="h-4 w-4" />
                    Start the test
                  </>
                )}
              </button>
            </div>

            {past.length > 0 && (
              <section className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Past attempts
                </h3>
                <ul className="space-y-2">
                  {past.map((a) => (
                    <li key={a.id} className="card flex items-center gap-3 p-3">
                      <span
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                        style={{ background: bandColor(a.percentage) }}
                      >
                        {a.percentage}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">
                          {a.band}
                          <span className="ml-1.5 font-normal text-muted">
                            {a.scored}/{a.outOf}
                          </span>
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {new Date(a.takenAt).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · {a.focus}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* ---- A question ---- */}
        {current && started && !marking && (
          <div className="card card-lift rise p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="chip px-2 py-0.5 text-[10px] uppercase">
                {TYPE_LABEL[current.type]}
              </span>
              <span className="text-[11px] text-muted">
                {index + 1} of {questions?.length}
              </span>
            </div>

            <p className="mt-3 text-sm text-ink-2">{current.prompt}</p>
            <p className="mt-2 rounded-xl border border-line bg-raised px-3.5 py-3 text-base font-medium leading-relaxed text-ink">
              {current.material}
            </p>

            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Type your answer, or press the mic and say it."
              className="field mt-3 w-full resize-none px-3.5 py-2.5 text-base text-ink placeholder:text-muted sm:text-sm"
            />

            <div className="mt-3 flex items-center gap-2">
              {recording ? (
                <button
                  onClick={() => void speakAnswer()}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => void recorder.start()}
                  disabled={transcribing}
                  className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-40"
                >
                  {transcribing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                  {transcribing ? "Writing it down..." : "Say it"}
                </button>
              )}

              {index > 0 && (
                <button
                  onClick={() => go(-1)}
                  className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              )}

              <button
                onClick={() => go(1)}
                className="btn-primary ml-auto flex items-center gap-1.5 px-4 py-2 text-sm"
              >
                {isLast ? "Finish and see score" : "Next"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {recorder.error && (
              <p className="mt-2 text-xs text-rose-700">{recorder.error}</p>
            )}
            <p className="mt-2 text-[11px] text-muted">
              Leave it blank to skip — a skipped question scores zero.
            </p>
          </div>
        )}

        {/* ---- Result ---- */}
        {result && !marking && (
          <div className="space-y-4">
            <div className="card card-lift rise flex flex-col items-center p-6 text-center">
              <ScoreRing percentage={result.percentage} />
              <p
                className="mt-3 text-lg font-semibold"
                style={{ color: bandColor(result.percentage) }}
              >
                {result.band}
              </p>
              <p className="text-xs text-muted">
                {result.scored} out of {result.outOf} marks
              </p>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">
                {result.summary}
              </p>
            </div>

            <div className="card border-brand bg-brand-soft p-4">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-ink">
                <Target className="h-3.5 w-3.5" />
                Work on this next week
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{result.focus}</p>
            </div>

            <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Question by question
            </h3>
            <ul className="space-y-2">
              {result.results.map((r, i) => {
                const q = questions?.find((x) => x.id === r.id);
                const Icon =
                  r.verdict === "correct" ? Check : r.verdict === "partly" ? Minus : X;
                const tone =
                  r.verdict === "correct"
                    ? "text-emerald-700"
                    : r.verdict === "partly"
                      ? "text-amber-700"
                      : "text-rose-700";

                return (
                  <li key={r.id} className="card p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-ink">
                        {i + 1}. {q?.prompt ?? r.id}
                      </p>
                      <span
                        className={`flex shrink-0 items-center gap-1 text-xs font-medium ${tone}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {r.score}/10
                      </span>
                    </div>

                    {q && (
                      <p className="mt-1 text-xs italic text-muted">{q.material}</p>
                    )}

                    {/* Your own words first. Without them the feedback is about an
                        answer you can no longer see, which is useless for learning. */}
                    <div className="mt-2.5 border-l-2 border-line-strong pl-2.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        You wrote
                      </span>
                      <p
                        className={`text-sm leading-relaxed ${
                          answers[r.id]?.trim() ? "text-ink" : "italic text-muted"
                        }`}
                      >
                        {answers[r.id]?.trim() || "(left blank)"}
                      </p>
                    </div>

                    <div className="mt-2 border-l-2 border-emerald-600/50 pl-2.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        Correct answer
                      </span>
                      <p className="text-sm leading-relaxed text-ink">
                        {r.model_answer}
                      </p>
                    </div>

                    <p className="mt-2.5 text-sm leading-relaxed text-ink-2">
                      {r.feedback}
                    </p>

                    {q?.because && (
                      <p className="mt-2 text-[11px] text-muted">{q.because}</p>
                    )}
                  </li>
                );
              })}
            </ul>

            <button
              onClick={() => {
                setResult(null);
                setQuestions(null);
              }}
              className="btn-ghost flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-sm"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Back to the start
            </button>
          </div>
        )}

        {drawnFrom && started && (
          <p className="mt-4 text-center text-[11px] text-muted">
            Drawn from {drawnFrom.mistakes}{" "}
            {drawnFrom.mistakes === 1 ? "mistake" : "mistakes"} and {drawnFrom.words}{" "}
            {drawnFrom.words === 1 ? "saved word" : "saved words"} over your last{" "}
            {drawnFrom.days} days.
          </p>
        )}
      </main>
    </div>
  );
}
