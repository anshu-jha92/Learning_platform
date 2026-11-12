import { promises as fs } from "node:fs";
import path from "node:path";
import type { LearnerProfile } from "./profile";
import type { CardState } from "./srs";
import type { Conversation } from "./conversations";
import type { LibraryEntry } from "./library";
import type { TestAttempt } from "./test";
import type { StoreBackend, TurnRecord } from "./store";

/**
 * JSON files in data/, on this machine. The fallback when MONGODB_URI is not set, so the
 * app still runs with no database at all.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const PROFILE_FILE = path.join(DATA_DIR, "profile.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const CARDS_FILE = path.join(DATA_DIR, "cards.json");
const CONVERSATIONS_FILE = path.join(DATA_DIR, "conversations.json");
const LIBRARY_FILE = path.join(DATA_DIR, "library.json");
const TESTS_FILE = path.join(DATA_DIR, "tests.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Write-then-rename so a crash mid-write cannot leave a truncated file.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export const fileStore: StoreBackend = {
  async getProfile() {
    return readJson<LearnerProfile | null>(PROFILE_FILE, null);
  },

  async saveProfile(profile) {
    await writeJson(PROFILE_FILE, profile);
  },

  async listTurns(limit) {
    const all = await readJson<TurnRecord[]>(SESSIONS_FILE, []);
    return limit === undefined ? all : all.slice(-limit);
  },

  async appendTurns(turns) {
    const all = await readJson<TurnRecord[]>(SESSIONS_FILE, []);
    all.push(...turns);
    await writeJson(SESSIONS_FILE, all);
  },

  async removeTurnsOf(conversationId) {
    const turns = await readJson<TurnRecord[]>(SESSIONS_FILE, []);
    const kept = turns.filter((t) => t.conversationId !== conversationId);
    const removed = turns.length - kept.length;
    if (removed > 0) await writeJson(SESSIONS_FILE, kept);
    return removed;
  },

  async getCardStates() {
    return readJson<Record<string, CardState>>(CARDS_FILE, {});
  },

  async saveCardState(state) {
    const all = await readJson<Record<string, CardState>>(CARDS_FILE, {});
    all[state.id] = state;
    await writeJson(CARDS_FILE, all);
  },

  async listConversations() {
    return readJson<Conversation[]>(CONVERSATIONS_FILE, []);
  },

  async getConversation(id) {
    const all = await readJson<Conversation[]>(CONVERSATIONS_FILE, []);
    return all.find((c) => c.id === id) ?? null;
  },

  async saveConversation(conversation) {
    const all = await readJson<Conversation[]>(CONVERSATIONS_FILE, []);
    const index = all.findIndex((c) => c.id === conversation.id);
    if (index >= 0) all[index] = conversation;
    else all.push(conversation);
    await writeJson(CONVERSATIONS_FILE, all);
  },

  async removeConversation(id) {
    const all = await readJson<Conversation[]>(CONVERSATIONS_FILE, []);
    const target = all.find((c) => c.id === id);
    if (!target) return null;
    await writeJson(
      CONVERSATIONS_FILE,
      all.filter((c) => c.id !== id)
    );
    return target;
  },

  async getLibrary() {
    return readJson<LibraryEntry[]>(LIBRARY_FILE, []);
  },

  async addLibraryEntry(entry) {
    const all = await readJson<LibraryEntry[]>(LIBRARY_FILE, []);
    const existing = all.find((e) => e.id === entry.id);
    if (existing) return { added: false, entry: existing };
    all.push(entry);
    await writeJson(LIBRARY_FILE, all);
    return { added: true, entry };
  },

  async removeLibraryEntry(id) {
    const all = await readJson<LibraryEntry[]>(LIBRARY_FILE, []);
    const kept = all.filter((e) => e.id !== id);
    if (kept.length === all.length) return false;
    await writeJson(LIBRARY_FILE, kept);
    return true;
  },

  async listTestAttempts() {
    return readJson<TestAttempt[]>(TESTS_FILE, []);
  },

  async saveTestAttempt(attempt) {
    const all = await readJson<TestAttempt[]>(TESTS_FILE, []);
    all.push(attempt);
    await writeJson(TESTS_FILE, all);
  },
};
