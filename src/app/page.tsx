"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Send,
  RotateCcw,
  AlertCircle,
  Mic,
  Square,
  X,
  Volume2,
  BarChart3,
  PhoneCall,
  Layers,
  Sparkles,
  History,
  ChevronDown,
  Languages,
  BookMarked,
  GraduationCap,
} from "lucide-react";
import {
  SCENARIOS,
  getScenario,
  examplesFor,
  type Difficulty,
} from "@/core/scenarios";
import type { Coaching } from "@/core/schemas";
import type { TextMetrics } from "@/core/metrics";
import { CoachCard } from "@/components/CoachCard";
import { useRecorder, type Recording } from "@/hooks/useRecorder";
import { apiFetch } from "@/lib/api";
import { DemoBanner } from "@/components/DemoBanner";
import { ChatHistory } from "@/components/ChatHistory";
import { TranslationCard } from "@/components/TranslationCard";
import type { Translation } from "@/core/translate";

interface Msg {
  role: "user" | "assistant";
  content: string;
  spoken?: boolean;
  coaching?: Coaching;
  metrics?: TextMetrics;
  /** Set instead of coaching when the turn was spoken in Hindi. */
  translation?: Translation;
}

const DIFFICULTIES: Difficulty[] = ["gentle", "normal", "tough"];

/** Hard stop so a forgotten open mic cannot quietly run up a transcription bill. */
const MAX_RECORDING_MS = 180_000;

/** Short enough not to clip in a phone-width textarea. */
const PLACEHOLDER = "Speak with the mic, or type your answer.";
const PLACEHOLDER_HI =
  "Hindi mein likhiye ya boliye — jaise: maine kal kaam khatam kar diya";

/** Slow enough to copy, up to real meeting pace. */
const SPEECH_RATES = [
  { value: 0.7, label: "Slow" },
  { value: 0.85, label: "Easy" },
  { value: 1, label: "Normal" },
] as const;

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Hindi mode: say what you mean, get the English for it.
  const [hindiMode, setHindiMode] = useState(false);
  /**
   * How fast the coach speaks. 0.85 by default — real meeting speed is the thing you are
   * training for, but you cannot copy what you could not catch. Remembered per device;
   * it is a comfort setting, not practice data, so localStorage is the right home.
   */
  const [speechRate, setSpeechRate] = useState(0.85);

  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useRecorder();

  const scenario = getScenario(scenarioId);
  const busy = busyLabel !== null;

  /**
   * Start a blank thread. Deliberately NOT an effect on [scenarioId, difficulty]:
   * reopening a saved conversation also sets those, and an effect would race in and
   * wipe the thread it had just loaded.
   */
  const startFresh = useCallback((sid: string, d: Difficulty) => {
    setMessages([{ role: "assistant", content: getScenario(sid).opener }]);
    setConversationId(null);
    setError(null);
    setInput("");
    void d;
  }, []);

  // The opening line, once, on first load.
  useEffect(() => {
    setMessages([{ role: "assistant", content: getScenario(SCENARIOS[0].id).opener }]);
  }, []);

  // Restore the speaking speed. Wrapped because storage throws in a private window.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("coach_speech_rate"));
      if (saved >= 0.5 && saved <= 1.5) setSpeechRate(saved);
    } catch {
      // Blocked storage just means the default rate.
    }
  }, []);

  function changeSpeechRate(rate: number) {
    setSpeechRate(rate);
    try {
      localStorage.setItem("coach_speech_rate", String(rate));
    } catch {
      // Not worth telling anyone about; it just will not be remembered.
    }
    // Re-speak at the new speed so the change is audible immediately.
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setSpeakingIndex(null);
  }

  /**
   * Grow the box to fit what you typed, up to a ceiling. Height has to be reset to auto
   * first or scrollHeight only ever reports the current height and the box never shrinks
   * back after you delete a line.
   */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  /**
   * Collapse the header's pickers once the page moves. A hysteresis gap (collapse past
   * 48, restore under 12) stops it flickering open and shut when a scroll lands near
   * the threshold.
   */
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((was) => (was ? y > 12 : y > 48));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function changeScenario(id: string) {
    setScenarioId(id);
    startFresh(id, difficulty);
  }

  function changeDifficulty(d: Difficulty) {
    setDifficulty(d);
    startFresh(scenarioId, d);
  }

  /** Reopen a saved conversation exactly as it was. */
  const openConversation = useCallback(async (id: string) => {
    setError(null);
    setBusyLabel("Opening that conversation");
    try {
      const res = await apiFetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not open that conversation.");
        return;
      }
      const c = data.conversation;
      setScenarioId(c.scenarioId);
      setDifficulty(c.difficulty);
      setMessages(c.messages);
      setConversationId(c.id);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyLabel(null);
    }
  }, []);

  useEffect(() => {
    // Only chase the bottom once a conversation exists. Scrolling on first load just
    // tucks the scenario card up behind the sticky header for no reason.
    if (messages.length <= 1 && !busyLabel) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busyLabel]);

  // Stop playback and release the object URL when leaving the page.
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (el?.src) URL.revokeObjectURL(el.src);
      el?.pause();
    };
  }, []);

  const speak = useCallback(
    async (text: string, index: number) => {
      try {
        setSpeakingIndex(index);
        const res = await apiFetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, scenarioId, speed: speechRate }),
        });
        if (!res.ok) {
          setSpeakingIndex(null);
          return;
        }

        // The server says it has no speech model — offline, or a provider that does
        // not implement /audio/speech. Use the browser's own voice instead.
        if (res.headers.get("content-type")?.includes("application/json")) {
          const data = await res.json();
          if (data.useBrowserVoice && typeof speechSynthesis !== "undefined") {
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "en-GB";
            // Was hardcoded at 1.05 — faster than normal speech, which is the wrong
            // default for someone still catching the words. Now it is your choice.
            utterance.rate = speechRate;
            utterance.onend = () => setSpeakingIndex(null);
            utterance.onerror = () => setSpeakingIndex(null);
            speechSynthesis.speak(utterance);
            return;
          }
          setSpeakingIndex(null);
          return;
        }

        const url = URL.createObjectURL(await res.blob());
        const el = audioRef.current ?? new Audio();
        if (el.src) URL.revokeObjectURL(el.src);
        el.src = url;
        el.onended = () => setSpeakingIndex(null);
        audioRef.current = el;
        await el.play();
      } catch {
        setSpeakingIndex(null);
      }
    },
    [scenarioId, speechRate]
  );

  const historyFor = useCallback(
    (msgs: Msg[]) => msgs.map((m) => ({ role: m.role, content: m.content })),
    []
  );

  /**
   * Hindi in, English back. Not coached and not recorded as practice — saying it in
   * Hindi is not an attempt at English, so scoring it would be meaningless and counting
   * it would skew the charts. The card's "practice this" button sends it back through
   * the normal English path, which is where the learning happens.
   */
  async function translateTyped(text: string) {
    setInput("");
    setError(null);
    setBusyLabel("Finding the English for that");

    const history = historyFor(messages);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await apiFetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, history, text }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], translation: data };
        return [...next, { role: "assistant", content: data.reply }];
      });
    } catch {
      setError("Could not reach the server. Is the dev server still running?");
    } finally {
      setBusyLabel(null);
    }
  }

  /** Drops an English sentence into the box so it can be said and coached properly. */
  function practiceThis(english: string) {
    setHindiMode(false);
    setInput(english);
    inputRef.current?.focus();
  }

  async function sendTyped() {
    const message = input.trim();
    if (!message || busy) return;

    if (hindiMode) {
      void translateTyped(message);
      return;
    }

    setInput("");
    setError(null);
    setBusyLabel("Marking your answer");

    const history = historyFor(messages);
    setMessages((prev) => [...prev, { role: "user", content: message }]);

    try {
      const res = await apiFetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, difficulty, history, message, conversationId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }

      if (data.conversationId) setConversationId(data.conversationId);

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          coaching: data.coaching,
          metrics: data.metrics,
        };
        return [...next, { role: "assistant", content: data.reply }];
      });
    } catch {
      setError("Could not reach the server. Is the dev server still running?");
    } finally {
      setBusyLabel(null);
    }
  }

  const sendRecording = useCallback(
    async (rec: Recording) => {
      setError(null);

      // Hindi mode: transcribe as Hindi and translate instead of coaching.
      if (hindiMode) {
        setBusyLabel("Listening in Hindi");
        const form = new FormData();
        form.append(
          "audio",
          new File([rec.blob], `answer.${rec.extension}`, { type: rec.blob.type })
        );
        form.append("scenarioId", scenarioId);
        form.append("history", JSON.stringify(historyFor(messages)));

        try {
          const res = await apiFetch("/api/translate", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error ?? `Request failed (${res.status})`);
            return;
          }
          setMessages((prev) => [
            ...prev,
            { role: "user", content: data.hindi, spoken: true, translation: data },
            { role: "assistant", content: data.reply },
          ]);
        } catch {
          setError("Could not reach the server.");
        } finally {
          setBusyLabel(null);
        }
        return;
      }

      setBusyLabel("Transcribing and marking what you said");

      const history = historyFor(messages);
      const form = new FormData();
      form.append(
        "audio",
        new File([rec.blob], `answer.${rec.extension}`, { type: rec.blob.type })
      );
      form.append("scenarioId", scenarioId);
      form.append("difficulty", difficulty);
      form.append("durationMs", String(rec.durationMs));
      form.append("history", JSON.stringify(history));
      if (conversationId) form.append("conversationId", conversationId);

      try {
        const res = await apiFetch("/api/speak", { method: "POST", body: form });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? `Request failed (${res.status})`);
          return;
        }

        if (data.conversationId) setConversationId(data.conversationId);

        let replyIndex = 0;
        setMessages((prev) => {
          const next: Msg[] = [
            ...prev,
            {
              role: "user",
              content: data.transcript,
              spoken: true,
              coaching: data.coaching,
              metrics: data.metrics,
            },
            { role: "assistant", content: data.reply },
          ];
          replyIndex = next.length - 1;
          return next;
        });

        // They spoke, so answer out loud.
        void speak(data.reply, replyIndex);
      } catch {
        setError("Could not reach the server. Is the dev server still running?");
      } finally {
        setBusyLabel(null);
      }
    },
    [messages, scenarioId, difficulty, historyFor, speak, hindiMode]
  );

  const stopAndSend = useCallback(async () => {
    const rec = await recorder.stop();
    if (rec) await sendRecording(rec);
  }, [recorder, sendRecording]);

  // Auto-stop at the cap rather than recording forever.
  useEffect(() => {
    if (recorder.state === "recording" && recorder.elapsedMs >= MAX_RECORDING_MS) {
      void stopAndSend();
    }
  }, [recorder.state, recorder.elapsedMs, stopAndSend]);

  /** Restart = a new thread. The one you were in stays saved in history. */
  function reset() {
    recorder.cancel();
    audioRef.current?.pause();
    setSpeakingIndex(null);
    startFresh(scenarioId, difficulty);
  }

  const recording = recorder.state === "recording";
  const requesting = recorder.state === "requesting";

  return (
    <div className="flex min-h-screen flex-col text-ink">
      {/*
        Always visible, never collapsing. The old version folded its controls away on
        scroll because it was 171px tall; the better answer was to stop being 171px tall.
        Seven scenario pills over two rows became one select, which is also less to aim
        at on a phone.
      */}
      <header
        className={`safe-top glass sticky top-0 z-20 ${scrolled ? "is-scrolled" : ""}`}
      >
        <div className="mx-auto max-w-3xl px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight">
              <span
                className="grid h-6 w-6 place-items-center rounded-lg text-[11px] font-bold text-white"
                style={{ background: "var(--brand-gradient)" }}
                aria-hidden="true"
              >
                C
              </span>
              <span className="hidden sm:inline">Meeting English Coach</span>
            </h1>

            {/* Labels are dead weight on a phone — the icons carry it. */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setHistoryOpen(true)}
                title="Past conversations"
                className="btn-ghost flex items-center gap-1.5 px-2 py-1.5 text-xs"
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden md:inline">History</span>
              </button>
              <Link
                href="/live"
                title="Live spoken call"
                className="btn-ghost flex items-center gap-1.5 px-2 py-1.5 text-xs"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Live</span>
              </Link>
              <Link
                href="/library"
                title="My library"
                className="btn-ghost flex items-center gap-1.5 px-2 py-1.5 text-xs"
              >
                <BookMarked className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Library</span>
              </Link>
              <Link
                href="/review"
                title="Review deck"
                className="btn-ghost flex items-center gap-1.5 px-2 py-1.5 text-xs"
              >
                <Layers className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Review</span>
              </Link>
              <Link
                href="/test"
                title="Weekly test"
                className="btn-ghost flex items-center gap-1.5 px-2 py-1.5 text-xs"
              >
                <GraduationCap className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Test</span>
              </Link>
              <Link
                href="/dashboard"
                title="Progress"
                className="btn-ghost flex items-center gap-1.5 px-2 py-1.5 text-xs"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Progress</span>
              </Link>
              <button
                onClick={reset}
                title="Start a new conversation"
                className="btn-ghost flex items-center gap-1.5 px-2 py-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden md:inline">New</span>
              </button>
            </div>
          </div>

          {/* Scenario and pressure share one row. Both are set before you start, so they
              belong together and neither deserves a row of its own. */}
          <div className="mt-2 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <select
                value={scenarioId}
                onChange={(e) => changeScenario(e.target.value)}
                disabled={recording}
                aria-label="Scenario"
                className="field w-full appearance-none py-1.5 pl-3 pr-8 text-xs font-medium text-ink disabled:opacity-40"
              >
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {s.blurb}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            </div>

            <div className="flex shrink-0 gap-0.5 rounded-lg border border-line bg-raised p-0.5">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  onClick={() => changeDifficulty(d)}
                  disabled={recording}
                  title={`Pressure: ${d}`}
                  className={`rounded-[7px] px-2 py-1 text-[11px] capitalize transition disabled:opacity-40 ${
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
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <div className="mb-4">
          <DemoBanner />
        </div>
        <p className="card mb-4 px-3.5 py-2.5 text-xs text-ink-2">
          <span className="font-medium text-ink">{scenario.label}</span>
          {" — "}
          {scenario.focus}
        </p>

        <div className="space-y-4">
          {messages.map((m, i) => (
            <div key={i}>
              <div
                className={`flex items-end gap-1.5 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bubble-user"
                      : "bubble-ai text-ink"
                  }`}
                >
                  {m.spoken && (
                    <span className="mr-1.5 align-middle text-[10px] uppercase tracking-wide text-sky-100">
                      spoken
                    </span>
                  )}
                  {m.content}
                </div>
                {m.role === "assistant" && (
                  <button
                    onClick={() => void speak(m.content, i)}
                    title="Hear this"
                    className={`mb-1 rounded p-1 transition hover:bg-raised ${
                      speakingIndex === i ? "text-sky-700" : "text-muted"
                    }`}
                  >
                    <Volume2
                      className={`h-3.5 w-3.5 ${speakingIndex === i ? "animate-pulse" : ""}`}
                    />
                  </button>
                )}
              </div>
              {m.coaching && <CoachCard coaching={m.coaching} metrics={m.metrics} />}
              {m.translation && (
                <TranslationCard
                  translation={m.translation}
                  onPractice={practiceThis}
                />
              )}
            </div>
          ))}

          {/* Before the first answer, a blank box is the worst thing to face. Two ready
              answers — one full of the mistakes this app catches, one clean — let you see
              what the coaching does before inventing your own material. */}
          {messages.length <= 1 && !busy && (
            <div className="card rise mb-4 p-4">
              <h2 className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                Not sure what to say? Try one of these
              </h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {examplesFor(scenarioId).map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => setInput(ex.text)}
                    className="group rounded-xl border border-line bg-raised p-3 text-left transition hover:border-brand hover:bg-brand-soft"
                  >
                    <span className="chip inline-block px-2 py-0.5 text-[10px] uppercase">
                      {ex.label}
                    </span>
                    <span className="mt-1.5 block text-xs leading-relaxed text-ink-2">
                      &ldquo;{ex.text}&rdquo;
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-muted">
                Tap one to drop it in the box, then press Send. Or say it out loud with the
                mic.
              </p>
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
              {busyLabel}...
            </div>
          )}

          {(error || recorder.error) && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error ?? recorder.error}</span>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </main>

      <footer className="safe-bottom glass-top sticky bottom-0">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {recording ? (
            <div className="flex items-center gap-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
              <span className="font-mono text-sm text-rose-800">
                {clock(recorder.elapsedMs)}
              </span>
              <span className="hidden text-xs text-ink-2 sm:inline">
                Speak your answer out loud, then stop.
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => recorder.cancel()}
                  title="Discard"
                  className="btn-ghost p-2"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void stopAndSend()}
                  className="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop
                </button>
              </div>
            </div>
          ) : (
            <>
            {/* The language switch sits above the box, not inside it: it changes what
                the whole control does, so it should not look like another button in a
                row of buttons. */}
            <div className="mb-2 flex items-center gap-2">
              <div className="flex gap-0.5 rounded-lg border border-line bg-raised p-0.5">
                <button
                  onClick={() => setHindiMode(false)}
                  className={`rounded-[7px] px-2.5 py-1 text-[11px] transition ${
                    !hindiMode
                      ? "bg-surface font-medium text-brand shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => setHindiMode(true)}
                  className={`flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-[11px] transition ${
                    hindiMode
                      ? "bg-surface font-medium text-brand shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Languages className="h-3 w-3" />
                  Hinglish
                </button>
              </div>
              {hindiMode && (
                <span className="hidden text-[11px] text-muted sm:inline">
                  Write it the way you speak — English letters are fine.
                </span>
              )}

              {/* How fast the coach talks back. Slow to catch the words, 1x when you
                  are ready for meeting pace. */}
              <div className="ml-auto flex items-center gap-1.5">
                <Volume2 className="h-3 w-3 text-muted" />
                <div className="flex gap-0.5 rounded-lg border border-line bg-raised p-0.5">
                  {SPEECH_RATES.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => changeSpeechRate(r.value)}
                      title={`Coach speaks at ${r.label}`}
                      className={`rounded-[7px] px-2 py-1 text-[11px] transition ${
                        speechRate === r.value
                          ? "bg-surface font-medium text-brand shadow-sm"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* One bordered field holding all three controls, rather than three boxes in
               a row. The textarea grows with what you type, so an empty box is one line
               tall instead of permanently two. */}
            <div className="field flex items-end gap-2 p-1.5">
              <button
                onClick={() => void recorder.start()}
                disabled={busy || requesting}
                title="Answer out loud"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 transition hover:bg-raised hover:text-brand disabled:opacity-40"
              >
                <Mic className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendTyped();
                  }
                }}
                rows={1}
                placeholder={hindiMode ? PLACEHOLDER_HI : PLACEHOLDER}
                // 16px on mobile: anything smaller makes iOS Safari zoom the page on focus.
                className="max-h-40 flex-1 resize-none self-center border-0 bg-transparent py-2 text-base text-ink outline-none placeholder:text-muted sm:text-sm"
              />
              <button
                onClick={() => void sendTyped()}
                disabled={busy || !input.trim()}
                title="Send"
                className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 text-sm sm:w-auto sm:px-3.5"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
            </>
          )}
          <p className="mt-2 hidden text-center text-[11px] text-muted sm:block">
            Talk the way you really would in the meeting — mistakes and all. That is what
            gets corrected.
          </p>
        </div>
      </footer>

      <ChatHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currentId={conversationId}
        onOpenConversation={(id) => void openConversation(id)}
        onDeletedCurrent={() => startFresh(scenarioId, difficulty)}
      />
    </div>
  );
}
