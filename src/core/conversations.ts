import type { Coaching } from "./schemas";
import type { TextMetrics } from "./metrics";
import type { Difficulty } from "./scenarios";

/**
 * Saved conversations.
 *
 * Separate from the turn records in sessions.json on purpose: those are the LEARNING
 * data — what fuels the profile, the charts and the review deck. This is the readable
 * thread, so you can reopen a practice session and see how it actually went.
 *
 * A refresh still starts a new conversation, which is what you want from a practice
 * tool — but the old one is now kept rather than thrown away.
 */

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  spoken?: boolean;
  coaching?: Coaching;
  metrics?: TextMetrics;
}

export interface Conversation {
  id: string;
  /** A name you gave it. Falls back to the scenario label when unset. */
  title?: string;
  /** Pinned threads sort above everything else. */
  pinned?: boolean;
  scenarioId: string;
  difficulty: Difficulty;
  startedAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

/** What the history list needs — without dragging every message along. */
export interface ConversationSummary {
  id: string;
  title?: string;
  pinned?: boolean;
  scenarioId: string;
  difficulty: Difficulty;
  startedAt: string;
  updatedAt: string;
  turnCount: number;
  /** The first thing you said, for recognising the conversation at a glance. */
  preview: string;
}

export function newConversationId(): string {
  // Time-ordered prefix so the file stays roughly chronological, plus randomness.
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function summarise(conversation: Conversation): ConversationSummary {
  const firstUser = conversation.messages.find((m) => m.role === "user");
  return {
    id: conversation.id,
    ...(conversation.title ? { title: conversation.title } : {}),
    ...(conversation.pinned ? { pinned: true } : {}),
    scenarioId: conversation.scenarioId,
    difficulty: conversation.difficulty,
    startedAt: conversation.startedAt,
    updatedAt: conversation.updatedAt,
    turnCount: conversation.messages.filter((m) => m.role === "user").length,
    preview: firstUser?.content.slice(0, 120) ?? "",
  };
}

/**
 * Pinned first, then most recently used. Pinning is only worth having if a pinned
 * thread actually stays where you can see it, however old it gets.
 */
export function byRecency(a: ConversationSummary, b: ConversationSummary): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
