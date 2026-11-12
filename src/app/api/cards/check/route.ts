import { NextResponse } from "next/server";
import { CoachError } from "@/core/coach";
import { transcribe } from "@/core/speech";
import { similarity } from "@/core/text";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * Spoken attempt at a card: audio in, transcript and a closeness score out.
 *
 * This is a RECALL check, not a pronunciation score — transcription normalises a lot of
 * what was actually said. The UI says so too; do not let it imply otherwise.
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
  const target = String(form.get("target") ?? "").trim();

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No audio was received." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "That recording is too long for a flashcard." },
      { status: 413 }
    );
  }
  if (!target) {
    return NextResponse.json({ error: "target is required." }, { status: 400 });
  }

  try {
    const { text } = await transcribe(audio);
    const score = similarity(text, target);
    return NextResponse.json({
      transcript: text,
      similarity: Math.round(score * 100),
    });
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/cards/check]", error);
    return NextResponse.json(
      { error: `Could not check that recording: ${detail}` },
      { status: 500 }
    );
  }
}
