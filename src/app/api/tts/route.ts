import { NextResponse } from "next/server";
import { synthesize } from "@/core/speech";
import { voiceFor } from "@/core/scenarios";
import { isMockMode } from "@/core/mock";

/** Speaks a line in the scenario persona's voice. Returns raw mp3. */
export async function POST(request: Request) {
  let body: { text?: string; scenarioId?: string; speed?: number };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  // Offline: there is no speech model, so tell the client to use the browser's own
  // voice instead of returning silence.
  if (isMockMode()) {
    return NextResponse.json({ useBrowserVoice: true });
  }

  try {
    const mp3 = await synthesize(
      text,
      voiceFor(body.scenarioId ?? "standup"),
      typeof body.speed === "number" ? body.speed : 1
    );

    // A provider without a speech endpoint may answer 200 with JSON rather than an
    // error. Serving that as audio/mpeg gives a silent reply and no clue why, so check
    // it actually looks like audio: mp3 starts with an ID3 tag or a frame sync.
    const isMp3 =
      mp3.length > 2 &&
      ((mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33) ||
        (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0));

    if (!isMp3) {
      console.warn("[/api/tts] provider returned non-audio; using browser speech");
      return NextResponse.json({
        useBrowserVoice: true,
        reason: "The speech endpoint did not return audio.",
      });
    }

    return new Response(new Uint8Array(mp3), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Most OpenAI-compatible providers (Gemini, Groq, OpenRouter) implement chat but
    // not /audio/speech, so this is the normal path on a free setup rather than a
    // failure. Falling back to the browser's voice keeps practice working; returning
    // an error would just make the reply silent for no reason.
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.warn("[/api/tts] falling back to browser speech:", detail);
    return NextResponse.json({ useBrowserVoice: true, reason: detail });
  }
}
