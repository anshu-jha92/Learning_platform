import { runCoachTurn, type ChatTurn } from "./coach";
import { analyseText, type TextMetrics } from "./metrics";
import { applyTurnToProfile } from "./profile";
import {
  appendTurn,
  getConversation,
  getProfile,
  saveConversation,
  saveProfile,
} from "./store";
import { getScenario, type Difficulty } from "./scenarios";
import type { CoachTurn } from "./schemas";
import type { Translation } from "./translate";
import {
  newConversationId,
  type Conversation,
  type StoredMessage,
} from "./conversations";

export interface ProcessTurnInput {
  scenarioId: string;
  difficulty: Difficulty;
  /** Prior conversation, oldest first. The new user message is NOT included here. */
  history: ChatTurn[];
  userMessage: string;
  /** Only set for spoken turns; unlocks words-per-minute. */
  durationMs?: number;
  spoken?: boolean;
  /** Omit on the first turn — a new conversation is created and its id returned. */
  conversationId?: string;
}

export interface ProcessedTurn extends CoachTurn {
  metrics: TextMetrics;
  conversationId: string;
}

/**
 * The page makes the id itself before the first answer, so a chat it was in the middle
 * of can be found again after a refresh. Only the shape newConversationId produces is
 * accepted — anything else (an object smuggled in as a query, say) starts a new thread.
 */
function cleanId(id: unknown): string | undefined {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : undefined;
}

/**
 * Reopen the conversation, or start one under the id asked for. The opener comes from the
 * scenario rather than the client, so a saved thread always begins the way the app
 * actually began it.
 */
async function conversationFor(
  input: { conversationId?: string; scenarioId: string; difficulty: Difficulty },
  now: string
): Promise<Conversation> {
  const id = cleanId(input.conversationId);
  const existing = id ? await getConversation(id) : null;
  return (
    existing ?? {
      id: id ?? newConversationId(),
      scenarioId: input.scenarioId,
      difficulty: input.difficulty,
      startedAt: now,
      updatedAt: now,
      messages: [{ role: "assistant", content: getScenario(input.scenarioId).opener }],
    }
  );
}

/**
 * A Hinglish turn, kept in the conversation so the thread reads back whole — and kept
 * ONLY there. Saying something in Hindi is not an attempt at English, so it never
 * reaches the turn records, the profile or the charts.
 */
export async function recordTranslation(input: {
  conversationId?: string;
  scenarioId: string;
  difficulty: Difficulty;
  said: string;
  spoken?: boolean;
  translation: Translation;
}): Promise<string> {
  const now = new Date().toISOString();
  const conversation = await conversationFor(input, now);

  conversation.messages.push(
    {
      role: "user",
      content: input.said,
      translation: input.translation,
      ...(input.spoken ? { spoken: true } : {}),
    },
    { role: "assistant", content: input.translation.reply }
  );
  conversation.updatedAt = now;

  await saveConversation(conversation);
  return conversation.id;
}

/**
 * The full pipeline for one learner turn, shared by the typed and spoken routes:
 * coach the message, measure it, fold it into the learner profile, append it to the
 * saved conversation, persist, return.
 */
export async function processTurn(
  input: ProcessTurnInput
): Promise<ProcessedTurn> {
  const profile = await getProfile();

  const turn = await runCoachTurn({
    scenarioId: input.scenarioId,
    difficulty: input.difficulty,
    history: input.history,
    userMessage: input.userMessage,
    profile,
  });

  const metrics = analyseText(input.userMessage, input.durationMs);
  const now = new Date().toISOString();
  const conversation = await conversationFor(input, now);

  const userMessage: StoredMessage = {
    role: "user",
    content: input.userMessage,
    coaching: turn.coaching,
    metrics,
    ...(input.spoken ? { spoken: true } : {}),
  };

  conversation.messages.push(userMessage, {
    role: "assistant",
    content: turn.reply,
  });
  conversation.updatedAt = now;

  // Persist before responding so a refresh never loses a turn.
  const updated = applyTurnToProfile(profile, {
    scenarioId: input.scenarioId,
    errors: turn.coaching.errors,
    fillers: metrics.fillers,
  });

  await Promise.all([
    saveProfile(updated),
    saveConversation(conversation),
    appendTurn({
      at: now,
      conversationId: conversation.id,
      scenarioId: input.scenarioId,
      difficulty: input.difficulty,
      userMessage: input.userMessage,
      reply: turn.reply,
      coaching: turn.coaching,
      metrics,
    }),
  ]);

  return { ...turn, metrics, conversationId: conversation.id };
}
