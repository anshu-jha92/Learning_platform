import OpenAI from "openai";
import { CoachError } from "./coach";

/**
 * The model providers.
 *
 * Everything here speaks the OpenAI wire format, so pointing the SDK at a different
 * baseURL is enough to run the whole app on Gemini, Groq, OpenRouter, a local Ollama, or
 * anything else OpenAI-compatible. Nothing above this file knows or cares which.
 *
 * Text and speech are deliberately separate clients. The useful free setup is Gemini for
 * the coaching (generous limits) and Groq for transcription (free Whisper) — two
 * providers at once, which a single client could not do.
 */

function makeClient(apiKey: string, baseURL?: string): OpenAI {
  return new OpenAI({
    apiKey,
    // Undefined means the SDK's default, api.openai.com.
    ...(baseURL ? { baseURL } : {}),
  });
}

let textClient: OpenAI | null = null;
let speechClient: OpenAI | null = null;

/** The client for coaching and debriefs. */
export function getTextClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new CoachError(
      "OPENAI_API_KEY is not set. Add it to .env.local and restart the server."
    );
  }
  textClient ??= makeClient(apiKey, process.env.OPENAI_BASE_URL?.trim() || undefined);
  return textClient;
}

/**
 * The client for transcription and speech. Falls back to the text provider when no
 * separate one is configured, which is the right default for plain OpenAI.
 */
export function getSpeechClient(): OpenAI {
  const apiKey =
    process.env.OPENAI_SPEECH_API_KEY?.trim() || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new CoachError(
      "No API key for speech. Set OPENAI_API_KEY, or OPENAI_SPEECH_API_KEY for a separate speech provider."
    );
  }
  const baseURL =
    process.env.OPENAI_SPEECH_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    undefined;
  speechClient ??= makeClient(apiKey, baseURL);
  return speechClient;
}

/** True when text is going somewhere other than OpenAI — affects what we can rely on. */
export function usingCustomProvider(): boolean {
  return Boolean(process.env.OPENAI_BASE_URL?.trim());
}

/** Whether a separate provider handles audio. */
export function hasSpeechProvider(): boolean {
  return Boolean(
    process.env.OPENAI_SPEECH_BASE_URL?.trim() ||
      process.env.OPENAI_SPEECH_API_KEY?.trim()
  );
}
