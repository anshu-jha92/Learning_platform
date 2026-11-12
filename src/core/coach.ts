import { buildSystemPrompt } from "./prompts";
import { getScenario, type Difficulty } from "./scenarios";
import { coachTurnSchema, COACH_TURN_JSON_SCHEMA, type CoachTurn } from "./schemas";
import type { LearnerProfile } from "./profile";
import { isMockMode, mockCoachTurn } from "./mock";
import { getTextClient } from "./openai-client";
import { requestStructured } from "./structured";
import { chatModel } from "./models";
import { looksLikeCode, normalise } from "./text";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CoachRequest {
  scenarioId: string;
  difficulty: Difficulty;
  /** Prior conversation, oldest first. The new user message is NOT included here. */
  history: ChatTurn[];
  userMessage: string;
  profile: LearnerProfile;
}

export class CoachError extends Error {}

/**
 * Said in place of a reply that tried to answer the learner's request (code, mostly).
 * The persona is a colleague in a meeting, not an assistant, so it never hands that over.
 */
export const OFF_TOPIC_REPLY = "Let's keep this to the meeting. Where were we?";

/**
 * The safety net under the prompt. Whatever the learner typed, the output only ever
 * corrects it — so code in the reply or the suggestions means the model answered the
 * request instead, and a "vocab upgrade" to the same word teaches nothing.
 */
function keepToCoaching(turn: CoachTurn): CoachTurn {
  const { coaching } = turn;
  return {
    reply: looksLikeCode(turn.reply) ? OFF_TOPIC_REPLY : turn.reply,
    coaching: {
      ...coaching,
      better_phrasings: coaching.better_phrasings.filter((p) => !looksLikeCode(p)),
      vocab_upgrades: coaching.vocab_upgrades.filter(
        (v) => normalise(v.you_said) !== normalise(v.try) && !looksLikeCode(v.try)
      ),
    },
  };
}

/**
 * One model call returns both the in-character reply and the coaching, which halves
 * latency and cost versus asking twice.
 */
export async function runCoachTurn(req: CoachRequest): Promise<CoachTurn> {
  // No key configured: answer from the offline rule engine instead of failing.
  if (isMockMode()) return mockCoachTurn(req);

  const scenario = getScenario(req.scenarioId);
  const system = buildSystemPrompt(scenario, req.difficulty, req.profile);

  // requestStructured steps down from a guaranteed schema to prompted JSON if the
  // provider cannot do strict mode, so this works on Gemini and Groq as well as OpenAI.
  const turn = await requestStructured({
    client: getTextClient(),
    model: chatModel(),
    temperature: 0.7,
    messages: [
      { role: "system", content: system },
      ...req.history.map((t) => ({ role: t.role, content: t.content }) as const),
      { role: "user", content: req.userMessage },
    ],
    schemaName: "coach_turn",
    jsonSchema: COACH_TURN_JSON_SCHEMA as unknown as Record<string, unknown>,
    validator: coachTurnSchema,
  });

  return keepToCoaching(turn);
}
