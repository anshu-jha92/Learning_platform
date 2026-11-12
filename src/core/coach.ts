import { buildSystemPrompt } from "./prompts";
import { getScenario, type Difficulty } from "./scenarios";
import { coachTurnSchema, COACH_TURN_JSON_SCHEMA, type CoachTurn } from "./schemas";
import type { LearnerProfile } from "./profile";
import { isMockMode, mockCoachTurn } from "./mock";
import { getTextClient } from "./openai-client";
import { requestStructured } from "./structured";

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

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

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
  return requestStructured({
    client: getTextClient(),
    model: MODEL,
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
}
