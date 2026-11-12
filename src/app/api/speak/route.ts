import { NextResponse } from "next/server";
import { CoachError, type ChatTurn } from "@/core/coach";
import { transcribe } from "@/core/speech";
import { processTurn } from "@/core/session";
import type { Difficulty } from "@/core/scenarios";

/** Generous ceiling for a spoken meeting answer. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Spoken turn: audio in, transcript + coaching out.
 *
 * The reply audio is NOT generated here. The client fetches it from /api/tts separately so
 * the written feedback appears immediately instead of waiting on speech synthesis.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 }
    );
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No audio was received." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "That recording is too long. Keep answers under a few minutes." },
      { status: 413 }
    );
  }

  const scenarioId = String(form.get("scenarioId") ?? "standup");
  const difficulty = String(form.get("difficulty") ?? "normal") as Difficulty;
  const clientDurationMs = Number(form.get("durationMs") ?? 0);
  const conversationId = (form.get("conversationId") as string) || undefined;

  let history: ChatTurn[] = [];
  try {
    const raw = form.get("history");
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) history = parsed.slice(-12);
    }
  } catch {
    // A malformed history is not worth failing the turn over.
  }

  try {
    const { text, durationSec } = await transcribe(audio);

    // Prefer the duration the model reports for the audio itself; fall back to the
    // client's stopwatch when the model does not return one.
    const durationMs =
      durationSec && durationSec > 0
        ? Math.round(durationSec * 1000)
        : clientDurationMs > 0
          ? clientDurationMs
          : undefined;

    const result = await processTurn({
      scenarioId,
      difficulty,
      history,
      userMessage: text,
      durationMs,
      spoken: true,
      conversationId,
    });

    return NextResponse.json({ ...result, transcript: text });
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/speak]", error);
    return NextResponse.json(
      { error: `Could not process that recording: ${detail}` },
      { status: 500 }
    );
  }
}
