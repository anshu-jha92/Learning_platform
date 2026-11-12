import { NextResponse } from "next/server";
import { CoachError, type ChatTurn } from "@/core/coach";
import { translateToEnglish } from "@/core/translate";
import { transcribe } from "@/core/speech";

/**
 * Hindi in, English out.
 *
 * Accepts either JSON (typed Hindi) or multipart form data (spoken Hindi). A spoken
 * request is transcribed with language "hi" first, then translated.
 *
 * Nothing here is written to the practice record. A translation is help, not a measured
 * answer — counting it would make the progress charts say something untrue.
 */
export async function POST(request: Request) {
  let scenarioId = "standup";
  let history: ChatTurn[] = [];
  let hindi = "";

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const audio = form.get("audio");
      if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json({ error: "No audio was received." }, { status: 400 });
      }
      scenarioId = String(form.get("scenarioId") ?? "standup");
      try {
        const raw = form.get("history");
        if (typeof raw === "string") {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) history = parsed;
        }
      } catch {
        // A malformed history is not worth failing the turn over.
      }
      const { text } = await transcribe(audio, "hi");
      hindi = text;
    } else {
      const body = await request.json();
      scenarioId = body.scenarioId ?? "standup";
      history = Array.isArray(body.history) ? body.history : [];
      hindi = String(body.text ?? "").trim();
    }
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  if (!hindi) {
    return NextResponse.json(
      { error: "There was nothing to translate." },
      { status: 400 }
    );
  }

  try {
    const translation = await translateToEnglish(scenarioId, hindi, history);
    return NextResponse.json({ ...translation, hindi });
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/translate]", error);
    return NextResponse.json(
      { error: `Could not translate that: ${detail}` },
      { status: 500 }
    );
  }
}
