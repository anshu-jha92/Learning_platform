import { EMPTY_PROFILE, applyTurnToProfile, type LearnerProfile } from "./profile";
import type { Coaching } from "./schemas";
import type { TextMetrics } from "./metrics";
import type { CardState } from "./srs";
import type { Conversation } from "./conversations";
import type { LibraryEntry } from "./library";
import type { TestAttempt } from "./test";
import { fileStore } from "./store-file";
import { mongoStore } from "./store-mongo";

/**
 * Persistence, behind one set of functions. Nothing else in the app touches storage.
 *
 *   MONGODB_URI set    → MongoDB (store-mongo.ts). Data survives deploys and is shared
 *                        by every device that talks to this server.
 *   MONGODB_URI unset  → JSON files in data/ (store-file.ts). Works with no setup.
 *
 * Moving existing files into MongoDB: npm run db:migrate
 */

export interface TurnRecord {
  at: string;
  /** Links the turn back to its conversation, so deleting one can remove both. */
  conversationId?: string;
  /** Seeded demo data. Never counted where invented mistakes would mislead. */
  demo?: boolean;
  scenarioId: string;
  difficulty: string;
  userMessage: string;
  reply: string;
  coaching: Coaching;
  metrics: TextMetrics;
}

/** What a storage backend provides. The public functions below are built on it. */
export interface StoreBackend {
  /** null when nothing has been saved yet. */
  getProfile(): Promise<LearnerProfile | null>;
  saveProfile(profile: LearnerProfile): Promise<void>;
  /** Oldest first. The newest `limit` turns, or every turn when limit is omitted. */
  listTurns(limit?: number): Promise<TurnRecord[]>;
  appendTurns(turns: TurnRecord[]): Promise<void>;
  /** Deletes every turn a conversation produced; returns how many went. */
  removeTurnsOf(conversationId: string): Promise<number>;
  getCardStates(): Promise<Record<string, CardState>>;
  saveCardState(state: CardState): Promise<void>;
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  saveConversation(conversation: Conversation): Promise<void>;
  /** Deletes the conversation and returns it, or null if there was none. */
  removeConversation(id: string): Promise<Conversation | null>;
  getLibrary(): Promise<LibraryEntry[]>;
  addLibraryEntry(entry: LibraryEntry): Promise<{ added: boolean; entry: LibraryEntry }>;
  removeLibraryEntry(id: string): Promise<boolean>;
  listTestAttempts(): Promise<TestAttempt[]>;
  saveTestAttempt(attempt: TestAttempt): Promise<void>;
}

/** Read per call rather than once, so a change to .env.local takes effect on reload. */
function backend(): StoreBackend {
  return process.env.MONGODB_URI?.trim() ? mongoStore : fileStore;
}

/** Which store is live — for logs and the status route. */
export function storageKind(): "mongodb" | "files" {
  return backend() === mongoStore ? "mongodb" : "files";
}

export async function getProfile(): Promise<LearnerProfile> {
  return (await backend().getProfile()) ?? EMPTY_PROFILE;
}

export async function saveProfile(profile: LearnerProfile): Promise<void> {
  await backend().saveProfile(profile);
}

export async function listTurns(limit = 200): Promise<TurnRecord[]> {
  return backend().listTurns(limit);
}

export async function appendTurn(turn: TurnRecord): Promise<void> {
  await backend().appendTurns([turn]);
}

/** Batch append. A live call produces many turns at once; one write beats N. */
export async function appendTurns(turns: TurnRecord[]): Promise<void> {
  if (turns.length === 0) return;
  await backend().appendTurns(turns);
}

/* ---- Review deck ---------------------------------------------------------- */

/** Review schedules, keyed by card id. Card *content* is derived from turn history. */
export async function getCardStates(): Promise<Record<string, CardState>> {
  return backend().getCardStates();
}

export async function saveCardState(state: CardState): Promise<void> {
  await backend().saveCardState(state);
}

/* ---- Conversations -------------------------------------------------------- */

export async function listConversations(): Promise<Conversation[]> {
  return backend().listConversations();
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return backend().getConversation(id);
}

/** Create or replace one conversation, keeping the rest untouched. */
export async function saveConversation(conversation: Conversation): Promise<void> {
  await backend().saveConversation(conversation);
}

/**
 * Delete a conversation AND the turns it produced, then rebuild the profile from what
 * is left. Deleting the chat but keeping its mistakes in your profile would mean the
 * coach kept nagging you about a session you asked to erase.
 */
export async function deleteConversation(id: string): Promise<{
  removedMessages: number;
  removedTurns: number;
}> {
  const store = backend();
  const target = await store.removeConversation(id);
  if (!target) return { removedMessages: 0, removedTurns: 0 };

  const removedTurns = await store.removeTurnsOf(id);
  if (removedTurns > 0) {
    await store.saveProfile(rebuildProfile(await store.listTurns()));
  }

  return { removedMessages: target.messages.length, removedTurns };
}

/** Replays every remaining turn through the same reducer the live app uses. */
function rebuildProfile(turns: TurnRecord[]): LearnerProfile {
  let profile: LearnerProfile = { ...EMPTY_PROFILE, updatedAt: new Date().toISOString() };
  for (const turn of turns) {
    profile = applyTurnToProfile(profile, {
      scenarioId: turn.scenarioId,
      errors: turn.coaching.errors,
      fillers: turn.metrics.fillers,
    });
  }
  return profile;
}

/* ---- Library -------------------------------------------------------------- */

export async function getLibrary(): Promise<LibraryEntry[]> {
  return backend().getLibrary();
}

/** Adding the same word twice keeps the first entry rather than duplicating it. */
export async function addLibraryEntry(
  entry: LibraryEntry
): Promise<{ added: boolean; entry: LibraryEntry }> {
  return backend().addLibraryEntry(entry);
}

export async function removeLibraryEntry(id: string): Promise<boolean> {
  return backend().removeLibraryEntry(id);
}

/* ---- Test attempts -------------------------------------------------------- */

/** Newest first. */
export async function listTestAttempts(): Promise<TestAttempt[]> {
  const all = await backend().listTestAttempts();
  return all.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

export async function saveTestAttempt(attempt: TestAttempt): Promise<void> {
  await backend().saveTestAttempt(attempt);
}
