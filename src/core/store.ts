import { promises as fs } from "node:fs";
import path from "node:path";
import { EMPTY_PROFILE, applyTurnToProfile, type LearnerProfile } from "./profile";
import type { Coaching } from "./schemas";
import type { TextMetrics } from "./metrics";
import type { CardState } from "./srs";
import type { Conversation } from "./conversations";
import type { LibraryEntry } from "./library";
import type { TestAttempt } from "./test";

/**
 * Single-user JSON store.
 *
 * Deliberately tiny and behind one interface. When this goes multi-device (mobile), swap
 * the four functions below for Postgres queries — nothing else in the app touches storage.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const PROFILE_FILE = path.join(DATA_DIR, "profile.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

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

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  await ensureDir();
  // Write-then-rename so a crash mid-write cannot leave a truncated file.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export async function getProfile(): Promise<LearnerProfile> {
  return readJson<LearnerProfile>(PROFILE_FILE, EMPTY_PROFILE);
}

export async function saveProfile(profile: LearnerProfile): Promise<void> {
  await writeJson(PROFILE_FILE, profile);
}

export async function listTurns(limit = 200): Promise<TurnRecord[]> {
  const all = await readJson<TurnRecord[]>(SESSIONS_FILE, []);
  return all.slice(-limit);
}

export async function appendTurn(turn: TurnRecord): Promise<void> {
  const all = await readJson<TurnRecord[]>(SESSIONS_FILE, []);
  all.push(turn);
  await writeJson(SESSIONS_FILE, all);
}

/** Batch append. A live call produces many turns at once; one read/write beats N. */
export async function appendTurns(turns: TurnRecord[]): Promise<void> {
  if (turns.length === 0) return;
  const all = await readJson<TurnRecord[]>(SESSIONS_FILE, []);
  all.push(...turns);
  await writeJson(SESSIONS_FILE, all);
}

/* ---- Review deck ---------------------------------------------------------- */

const CARDS_FILE = path.join(DATA_DIR, "cards.json");

/** Review schedules, keyed by card id. Card *content* is derived from turn history. */
export async function getCardStates(): Promise<Record<string, CardState>> {
  return readJson<Record<string, CardState>>(CARDS_FILE, {});
}

export async function saveCardState(state: CardState): Promise<void> {
  const all = await getCardStates();
  all[state.id] = state;
  await writeJson(CARDS_FILE, all);
}

/* ---- Conversations -------------------------------------------------------- */

const CONVERSATIONS_FILE = path.join(DATA_DIR, "conversations.json");

export async function listConversations(): Promise<Conversation[]> {
  return readJson<Conversation[]>(CONVERSATIONS_FILE, []);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const all = await listConversations();
  return all.find((c) => c.id === id) ?? null;
}

/** Create or replace one conversation, keeping the rest untouched. */
export async function saveConversation(conversation: Conversation): Promise<void> {
  const all = await listConversations();
  const index = all.findIndex((c) => c.id === conversation.id);
  if (index >= 0) all[index] = conversation;
  else all.push(conversation);
  await writeJson(CONVERSATIONS_FILE, all);
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
  const all = await listConversations();
  const target = all.find((c) => c.id === id);
  if (!target) return { removedMessages: 0, removedTurns: 0 };

  await writeJson(
    CONVERSATIONS_FILE,
    all.filter((c) => c.id !== id)
  );

  const turns = await readJson<TurnRecord[]>(SESSIONS_FILE, []);
  const kept = turns.filter((t) => t.conversationId !== id);
  const removedTurns = turns.length - kept.length;

  if (removedTurns > 0) {
    await writeJson(SESSIONS_FILE, kept);
    await saveProfile(rebuildProfile(kept));
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

const LIBRARY_FILE = path.join(DATA_DIR, "library.json");

export async function getLibrary(): Promise<LibraryEntry[]> {
  return readJson<LibraryEntry[]>(LIBRARY_FILE, []);
}

/** Adding the same word twice keeps the first entry rather than duplicating it. */
export async function addLibraryEntry(
  entry: LibraryEntry
): Promise<{ added: boolean; entry: LibraryEntry }> {
  const all = await getLibrary();
  const existing = all.find((e) => e.id === entry.id);
  if (existing) return { added: false, entry: existing };

  all.push(entry);
  await writeJson(LIBRARY_FILE, all);
  return { added: true, entry };
}

export async function removeLibraryEntry(id: string): Promise<boolean> {
  const all = await getLibrary();
  const kept = all.filter((e) => e.id !== id);
  if (kept.length === all.length) return false;
  await writeJson(LIBRARY_FILE, kept);
  return true;
}

/* ---- Test attempts -------------------------------------------------------- */

const TESTS_FILE = path.join(DATA_DIR, "tests.json");

export async function listTestAttempts(): Promise<TestAttempt[]> {
  const all = await readJson<TestAttempt[]>(TESTS_FILE, []);
  return all.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

export async function saveTestAttempt(attempt: TestAttempt): Promise<void> {
  const all = await readJson<TestAttempt[]>(TESTS_FILE, []);
  all.push(attempt);
  await writeJson(TESTS_FILE, all);
}
