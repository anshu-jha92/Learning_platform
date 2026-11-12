import { CoachError } from "./coach";

/**
 * Which model answers which kind of request.
 *
 * Three environment variables name three different kinds of model — chat, speech-to-text,
 * text-to-speech — and in a host's dashboard they are three identical-looking rows. Put a
 * value in the wrong row and the provider answers with a 404 naming a model you never
 * meant to chat with ("the model `tts-1` does not exist"), which points at nothing and
 * reads like an outage. So the names are checked here, where the mistake can be named.
 *
 * Resolved per call rather than at import, so the check runs on a live request and the
 * message reaches the screen instead of a cold-start log nobody reads.
 */

interface Provider {
  name: string;
  chat: string;
  stt: string;
  /** null = this provider has no usable speech endpoint; use the browser's voice. */
  tts: string | null;
}

const OPENAI: Provider = {
  name: "OpenAI",
  chat: "gpt-4o",
  stt: "whisper-1",
  tts: "tts-1",
};

const PROVIDERS: Array<{ host: string; provider: Provider }> = [
  {
    host: "groq.com",
    provider: {
      name: "Groq",
      chat: "openai/gpt-oss-120b",
      stt: "whisper-large-v3",
      // Groq's voices need their terms accepted in the console first, so there is no
      // name that works out of the box. The TTS route falls back to the browser voice.
      tts: null,
    },
  },
  {
    host: "generativelanguage.googleapis.com",
    provider: {
      name: "Gemini",
      chat: "gemini-flash-latest",
      stt: "whisper-1",
      tts: null,
    },
  },
];

/**
 * Who we are actually talking to. Defaults matter here: "gpt-4o" against Groq 404s just
 * as surely as "tts-1" does, so an unset variable should fall back to something that
 * works on the configured provider, not to OpenAI's catalogue.
 */
export function provider(): Provider {
  const base = process.env.OPENAI_BASE_URL?.trim().toLowerCase() ?? "";
  if (!base) return OPENAI;
  return PROVIDERS.find((p) => base.includes(p.host))?.provider ?? OPENAI;
}

function speechProvider(): Provider {
  const base =
    process.env.OPENAI_SPEECH_BASE_URL?.trim().toLowerCase() ||
    process.env.OPENAI_BASE_URL?.trim().toLowerCase() ||
    "";
  if (!base) return OPENAI;
  return PROVIDERS.find((p) => base.includes(p.host))?.provider ?? OPENAI;
}

/** The giveaways that a name belongs in one of the other two variables. */
const MISFILED: Array<{ match: RegExp; kind: string; belongsIn: string }> = [
  { match: /tts/i, kind: "a text-to-speech model", belongsIn: "OPENAI_TTS_MODEL" },
  { match: /whisper/i, kind: "a speech-to-text model", belongsIn: "OPENAI_STT_MODEL" },
  { match: /embedding/i, kind: "an embeddings model", belongsIn: "no variable here" },
];

/** The model that writes — coaching, debriefs, translation, the weekly test. */
export function chatModel(): string {
  const configured = process.env.OPENAI_MODEL?.trim();
  const { name, chat } = provider();

  if (!configured) return chat;

  const misfiled = MISFILED.find((m) => m.match.test(configured));
  if (misfiled) {
    throw new CoachError(
      `OPENAI_MODEL is set to "${configured}", which is ${misfiled.kind} — it cannot hold a conversation, so ${name} rejects it. ` +
        `Chat, speech-to-text and text-to-speech each take their own variable. ` +
        `Set OPENAI_MODEL to "${chat}" for ${name}; "${configured}" belongs in ${misfiled.belongsIn}.`
    );
  }

  return configured;
}

/** The model that listens. */
export function sttModel(): string {
  return process.env.OPENAI_STT_MODEL?.trim() || speechProvider().stt;
}

/**
 * The model that speaks, or null when this provider has none worth calling. Returning
 * null saves a round trip that was only ever going to 404 before the browser voice took
 * over anyway.
 */
export function ttsModel(): string | null {
  return process.env.OPENAI_TTS_MODEL?.trim() || speechProvider().tts;
}

/**
 * Rewrites a provider's "no such model" 404 into the sentence that fixes it.
 *
 * Returns null for every other error, so callers can leave those alone.
 */
export function explainModelError(error: unknown, variable: string): CoachError | null {
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : "";

  const notFound =
    code === "model_not_found" ||
    (status === 404 && /model/i.test(message) && /exist|not found|access/i.test(message));
  if (!notFound) return null;

  const { name, chat } = provider();
  const configured = process.env[variable]?.trim();

  return new CoachError(
    `${name} does not have the model${configured ? ` "${configured}"` : ""} that ${variable} asks for. ` +
      `Check the name against ${name}'s own model list` +
      (variable === "OPENAI_MODEL" ? ` — "${chat}" works` : "") +
      `. If this is a deployed app, the variable is set in the host's dashboard, not in .env.local.`
  );
}
