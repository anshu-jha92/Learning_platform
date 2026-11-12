import { CoachError } from "./coach";
import { isMockMode, mockTranscribe } from "./mock";
import { getSpeechClient } from "./openai-client";
import { sttModel, ttsModel } from "./models";

/**
 * Whisper is trained to produce *fluent* text, so by default it quietly repairs a learner's
 * grammar and drops their fillers — which would hand the coach a clean sentence and make it
 * report no errors. That defeats the entire app.
 *
 * This prompt biases it toward verbatim transcription by example: a disfluent, ungrammatical
 * sample makes the model treat disfluency as the expected style. It is a bias, not a
 * guarantee — Whisper still tidies some speech.
 */
const VERBATIM_BIAS =
  "Um, so, like, yesterday I have finish the report, uh, and today I will working on, you know, the bug fix. Basically I am blocked since two day.";

export interface Transcription {
  text: string;
  /** Seconds of audio, when the model reports it. */
  durationSec?: number;
}

export type SpeechLanguage = "en" | "hi";

export async function transcribe(
  file: File,
  language: SpeechLanguage = "en"
): Promise<Transcription> {
  // The offline engine cannot hear. It returns a canned learner sentence so the rest of
  // the pipeline still runs and can be seen working.
  if (isMockMode()) return mockTranscribe();

  // verbose_json carries the true audio duration, but only whisper-1 supports it.
  const model = sttModel();
  const verbose = model === "whisper-1";

  const result = await getSpeechClient().audio.transcriptions.create({
    file,
    model,
    language,
    temperature: 0,
    // The verbatim bias is an English sample — it exists to stop Whisper tidying up a
    // learner's English. Feeding it to a Hindi transcription would only pull the output
    // toward English, which is the opposite of what Hindi mode wants.
    ...(language === "en" ? { prompt: VERBATIM_BIAS } : {}),
    ...(verbose ? { response_format: "verbose_json" as const } : {}),
  });

  // Shape differs between json and verbose_json; both carry `text`.
  const payload = result as unknown as { text?: string; duration?: number };
  const text = payload.text?.trim() ?? "";

  if (!text) {
    throw new CoachError(
      "Nothing was transcribed. Check your microphone and try speaking a little longer."
    );
  }

  return { text, durationSec: payload.duration };
}

/** Max input accepted by the speech endpoint. Replies are short, but guard anyway. */
const TTS_MAX_CHARS = 4000;

export async function synthesize(
  text: string,
  voice: string,
  speed = 1
): Promise<Buffer> {
  const input = text.slice(0, TTS_MAX_CHARS);

  // Groq and Gemini have no speech endpoint worth calling, so there is no name to send.
  // Saying so here costs nothing; sending a guess costs a round trip that ends in a 404
  // before the browser's own voice takes over anyway.
  const model = ttsModel();
  if (!model) {
    throw new CoachError("This provider has no text-to-speech model configured.");
  }

  const response = await getSpeechClient().audio.speech.create({
    model,
    voice,
    input,
    // Same control as the browser voice, so the speed setting means one thing
    // whichever engine is actually speaking. Clamped to the range the API accepts.
    speed: Math.min(Math.max(speed, 0.25), 4),
    response_format: "mp3",
  });

  return Buffer.from(await response.arrayBuffer());
}
