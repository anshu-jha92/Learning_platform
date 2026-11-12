import { CoachError } from "./coach";
import { buildSystemPrompt } from "./prompts";
import { getScenario, voiceFor, type Difficulty } from "./scenarios";
import type { LearnerProfile } from "./profile";
import { isMockMode } from "./mock";

/**
 * Live speech-to-speech role-play.
 *
 * The browser talks WebRTC directly to OpenAI — the audio never passes through this
 * server, which is what keeps the latency conversational. The API key must never reach
 * the browser, so this mints a short-lived EPHEMERAL token instead and hands that over.
 *
 * The Realtime API's endpoints and model names have moved more than once. Everything here
 * is env-overridable for that reason, and failures surface OpenAI's own error text rather
 * than a generic message, so a rename is diagnosable rather than mysterious:
 *
 *   OPENAI_REALTIME_MODEL         the realtime model
 *   OPENAI_REALTIME_SESSIONS_URL  where ephemeral tokens are minted
 *   OPENAI_REALTIME_URL           where the browser POSTs its SDP offer
 *
 * Check the current OpenAI docs if a session fails to start.
 */

const REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview";

const SESSIONS_URL =
  process.env.OPENAI_REALTIME_SESSIONS_URL ??
  "https://api.openai.com/v1/realtime/sessions";

const CALLS_URL =
  process.env.OPENAI_REALTIME_URL ?? "https://api.openai.com/v1/realtime";

/**
 * Difficulty becomes real behaviour here rather than just prompt wording: how long the
 * model waits through your silence before it starts talking. A tough interviewer jumps
 * in while you are still groping for the word; a gentle one lets you finish.
 */
const SILENCE_MS: Record<Difficulty, number> = {
  gentle: 1200,
  normal: 700,
  tough: 400,
};

export interface RealtimeSession {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
  callsUrl: string;
}

export async function createRealtimeSession(
  scenarioId: string,
  difficulty: Difficulty,
  profile: LearnerProfile
): Promise<RealtimeSession> {
  if (isMockMode()) {
    throw new CoachError(
      "Live calls cannot run offline — they are a real speech-to-speech connection to OpenAI, so there is nothing to simulate. Everything else works without a key. Add OPENAI_API_KEY to try this."
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new CoachError(
      "OPENAI_API_KEY is not set. Add it to .env.local and restart the server."
    );
  }

  const scenario = getScenario(scenarioId);

  // The same prompt builder the typed and spoken turns use, minus the coaching half:
  // in a live call the model only plays the character. Coaching happens in the debrief.
  const instructions = `${buildSystemPrompt(scenario, difficulty, profile)}

== THIS IS A LIVE SPOKEN CALL ==
You are ONLY the character now. Do not coach, correct, or mention mistakes — that happens
after the call. Speak naturally and briefly, the way people actually talk in meetings:
one or two sentences, then hand back. Never deliver a monologue. If the learner stalls,
prompt them rather than filling the silence yourself.`;

  const response = await fetch(SESSIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REALTIME_MODEL,
      voice: voiceFor(scenarioId),
      instructions,
      modalities: ["audio", "text"],
      // Transcribing the learner's own audio is what makes the debrief possible.
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: SILENCE_MS[difficulty],
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new CoachError(
      `Could not start a live session (${response.status}). OpenAI said: ${detail.slice(0, 400)}`
    );
  }

  const json = await response.json();

  // Tolerate both shapes the API has used: {client_secret:{value}} and a flat {value}.
  const clientSecret: string | undefined =
    json?.client_secret?.value ?? json?.value;

  if (!clientSecret) {
    throw new CoachError(
      "The session response did not contain a client secret. The Realtime API shape may have changed — check OPENAI_REALTIME_SESSIONS_URL."
    );
  }

  const expiresAtRaw = json?.client_secret?.expires_at ?? json?.expires_at;

  return {
    clientSecret,
    // The API reports seconds since epoch; the client works in milliseconds.
    expiresAt: typeof expiresAtRaw === "number" ? expiresAtRaw * 1000 : null,
    model: json?.model ?? REALTIME_MODEL,
    callsUrl: CALLS_URL,
  };
}
