"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  PhoneCall,
  PhoneOff,
  Radio,
  Loader2,
} from "lucide-react";
import { SCENARIOS, getScenario, type Difficulty } from "@/core/scenarios";
import type { Coaching, Scores } from "@/core/schemas";
import { CoachCard } from "@/components/CoachCard";
import { useRealtime, type LiveLine } from "@/hooks/useRealtime";
import { apiFetch } from "@/lib/api";
import { DemoBanner } from "@/components/DemoBanner";

const DIFFICULTIES: Difficulty[] = ["gentle", "normal", "tough"];

/** Realtime audio is the expensive mode. Cap the call rather than trust a timer. */
const MAX_CALL_MS = 10 * 60 * 1000;

interface DebriefSummary {
  what_went_well: string;
  biggest_issue: string;
  one_thing_to_fix: string;
  overall: Scores;
}

interface DebriefTurn {
  original: string;
  coaching: Coaching;
}

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function Live() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [summary, setSummary] = useState<DebriefSummary | null>(null);
  const [turns, setTurns] = useState<DebriefTurn[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [debriefError, setDebriefError] = useState<string | null>(null);

  const live = useRealtime();
  const scenario = getScenario(scenarioId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [live.transcript]);

  const endCall = useCallback(async () => {
    const transcript: LiveLine[] = live.stop();
    const spoke = transcript.some((l) => l.role === "user" && l.text.trim());

    if (!spoke) {
      setDebriefError("Nothing was transcribed, so there is nothing to review.");
      return;
    }

    setReviewing(true);
    setDebriefError(null);

    try {
      const res = await apiFetch("/api/realtime/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, difficulty, transcript }),
      });
      const data = await res.json();

      if (!res.ok) {
        setDebriefError(data.error ?? "Could not review that call.");
        return;
      }

      setSummary(data.summary);
      setTurns(data.turns);
    } catch {
      setDebriefError("Could not reach the server.");
    } finally {
      setReviewing(false);
    }
  }, [live, scenarioId, difficulty]);

  // Stop at the cap rather than let an idle call keep billing.
  useEffect(() => {
    if (live.state === "live" && live.elapsedMs >= MAX_CALL_MS) {
      void endCall();
    }
  }, [live.state, live.elapsedMs, endCall]);

  function reset() {
    setSummary(null);
    setTurns(null);
    setDebriefError(null);
  }

  const idle = live.state === "idle" || live.state === "error";
  const connecting = live.state === "connecting";
  const onCall = live.state === "live";

  return (
    <div className="flex min-h-screen flex-col text-ink">
      <header className="safe-top glass sticky top-0 z-20">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-tight">Live call</h1>
          <Link
            href="/"
            className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            <ArrowLeft className="h-3 w-3" />
            Practice
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <div className="mb-4">
          <DemoBanner />
        </div>
        {/* ---- Setup ---- */}
        {idle && !summary && (
          <>
            <p className="mb-4 text-sm leading-relaxed text-ink-2">
              A real spoken conversation, in real time. They will talk over you if you
              ramble. Nothing is corrected during the call — you get the full debrief
              when you hang up.
            </p>

            <select
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              aria-label="Scenario"
              className="field w-full px-3 py-2.5 text-sm text-ink sm:hidden"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.blurb}
                </option>
              ))}
            </select>

            <div className="hidden flex-wrap gap-1.5 sm:flex">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setScenarioId(s.id)}
                  title={s.blurb}
                  className={`pill px-3 py-1.5 text-xs ${
                    s.id === scenarioId
                      ? "pill-active"
                      : ""
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted">
                Pressure
              </span>
              <div className="flex gap-0.5 rounded-lg border border-line bg-raised p-0.5">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`rounded-[7px] px-2.5 py-1 text-xs capitalize transition ${
                      d === difficulty
                        ? "bg-surface font-medium text-brand shadow-sm"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <p className="card mt-3 px-3.5 py-2.5 text-xs text-ink-2">
              <span className="font-medium text-ink-2">{scenario.label}</span>
              {" — "}
              {scenario.focus}
              <span className="mt-1 block text-muted">
                On <span className="text-ink-2">tough</span> they cut in after a
                much shorter pause, so hesitation gets punished the way it does in a real
                meeting.
              </span>
            </p>

            <button
              onClick={() => void live.start(scenarioId, difficulty)}
              className="btn-primary mt-5 flex w-full items-center justify-center gap-2 px-3 py-3.5 text-sm"
            >
              <PhoneCall className="h-4 w-4" />
              Start the call
            </button>

            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Live calls use the Realtime API, which costs considerably more per minute
              than typing or push-to-talk. Calls stop automatically after 10 minutes.
            </p>
          </>
        )}

        {/* ---- Connecting ---- */}
        {connecting && (
          <div className="flex items-center gap-2 py-10 text-sm text-ink-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting the call...
          </div>
        )}

        {/* ---- On the call ---- */}
        {onCall && (
          <>
            <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5">
              <Radio
                className={`h-4 w-4 ${
                  live.modelSpeaking
                    ? "animate-pulse text-emerald-700"
                    : live.userSpeaking
                      ? "animate-pulse text-sky-700"
                      : "text-muted"
                }`}
              />
              <span className="font-mono text-sm text-ink">
                {clock(live.elapsedMs)}
              </span>
              <span className="text-xs text-ink-2">
                {live.modelSpeaking
                  ? `${scenario.label} is speaking`
                  : live.userSpeaking
                    ? "Listening to you"
                    : "Your turn"}
              </span>
              <button
                onClick={() => void endCall()}
                className="ml-auto flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                End
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {live.transcript.length === 0 && (
                <p className="text-xs text-muted">
                  Say hello to get started. The transcript appears here as you both talk.
                </p>
              )}
              {live.transcript.map((line, i) => (
                <div
                  key={i}
                  className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed ${
                      line.role === "user"
                        ? "bubble-user"
                        : "bubble-ai text-ink"
                    }`}
                  >
                    {line.text}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </>
        )}

        {/* ---- Reviewing ---- */}
        {reviewing && (
          <div className="flex items-center gap-2 py-10 text-sm text-ink-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Marking the whole call...
          </div>
        )}

        {/* ---- Debrief ---- */}
        {summary && !reviewing && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Call debrief
              </h2>

              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    What worked
                  </h3>
                  <p className="mt-0.5 text-ink">{summary.what_went_well}</p>
                </div>
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Biggest problem
                  </h3>
                  <p className="mt-0.5 text-ink">{summary.biggest_issue}</p>
                </div>
                <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    Fix this one thing next call
                  </h3>
                  <p className="mt-0.5 text-ink">{summary.one_thing_to_fix}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-ink-2">
                {(
                  [
                    ["Clarity", summary.overall.clarity],
                    ["Grammar", summary.overall.grammar],
                    ["Professional", summary.overall.professionalism],
                    ["Concise", summary.overall.conciseness],
                  ] as const
                ).map(([label, value]) => (
                  <span key={label}>
                    {label}{" "}
                    <span className="font-medium text-ink">{value}</span>
                    <span className="text-muted">/5</span>
                  </span>
                ))}
              </div>
            </div>

            {turns && turns.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Everything you said
                </h2>
                {turns.map((turn, i) => (
                  <div key={i}>
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-sky-600 px-3.5 py-2 text-sm leading-relaxed text-white">
                        {turn.original}
                      </div>
                    </div>
                    <CoachCard coaching={turn.coaching} />
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted">
              This call is now part of your progress and your review deck.
            </p>

            <button
              onClick={reset}
              className="btn-ghost w-full px-3 py-2.5 text-sm"
            >
              Another call
            </button>
          </div>
        )}

        {(live.error || debriefError) && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{live.error ?? debriefError}</span>
          </div>
        )}
      </main>
    </div>
  );
}
