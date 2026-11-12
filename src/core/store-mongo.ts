import { MongoClient, MongoServerError, type Db } from "mongodb";
import type { LearnerProfile } from "./profile";
import type { CardState } from "./srs";
import type { Conversation } from "./conversations";
import type { LibraryEntry } from "./library";
import type { TestAttempt } from "./test";
import type { StoreBackend, TurnRecord } from "./store";

/**
 * MongoDB, used whenever MONGODB_URI is set.
 *
 * One collection per kind of record. Records that already have an id (conversations,
 * cards, library entries, test attempts) use it as _id — an upsert takes the _id from its
 * filter, so the replacement document never needs one — so saving is an upsert by key and
 * a document reads back as exactly the shape the rest of the app expects once _id is
 * projected away. Turns have no id of their own and get Mongo's.
 *
 *   profile        one document, _id "learner"
 *   turns          one per coached answer — the old sessions.json
 *   conversations  the readable threads
 *   cards          review schedules
 *   library        saved words
 *   tests          weekly test attempts
 */

const DEFAULT_DB = "english_coach";
const PROFILE_ID = "learner";

type Keyed<T> = T & { _id: string };

/** Drops Mongo's _id so a document reads back as the app's own type. */
const NO_ID = { projection: { _id: 0 } } as const;

/**
 * Every key that reaches a query must be a plain string. An object that slipped through
 * from a request body ({"$gt": ""}) would otherwise be read as a query operator and match
 * — or overwrite — some other record.
 */
function key(id: unknown): string {
  if (typeof id !== "string" || id.length === 0) throw new Error("Invalid record id.");
  return id;
}

/**
 * One client per process. Next dev re-evaluates modules on every edit, and a fresh
 * MongoClient each time would leak a connection pool per save — so it lives on globalThis.
 */
const cache = globalThis as unknown as { __englishCoachDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is not set.");

  // ignoreUndefined: an optional field left undefined is omitted, not stored as null —
  // otherwise it would read back as null and break `title?: string` and friends.
  const client = new MongoClient(uri, {
    appName: "english-coach",
    ignoreUndefined: true,
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    await client.connect();
  } catch (error) {
    await client.close().catch(() => {});
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not connect to MongoDB: ${detail}. Check MONGODB_URI, and that Atlas → Network Access allows this machine's IP address.`
    );
  }

  const db = client.db(process.env.MONGODB_DB?.trim() || DEFAULT_DB);
  const turns = db.collection("turns");
  await Promise.all([
    turns.createIndex({ at: 1 }),
    turns.createIndex({ conversationId: 1 }),
    db.collection("tests").createIndex({ takenAt: -1 }),
  ]);
  return db;
}

function db(): Promise<Db> {
  // A failed connection is not cached, so the next request tries again.
  cache.__englishCoachDb ??= connect().catch((error) => {
    cache.__englishCoachDb = undefined;
    throw error;
  });
  return cache.__englishCoachDb;
}

const profiles = async () => (await db()).collection<Keyed<LearnerProfile>>("profile");
const turnsCol = async () => (await db()).collection<TurnRecord>("turns");
const cardsCol = async () => (await db()).collection<Keyed<CardState>>("cards");
const conversationsCol = async () =>
  (await db()).collection<Keyed<Conversation>>("conversations");
const libraryCol = async () => (await db()).collection<Keyed<LibraryEntry>>("library");
const testsCol = async () => (await db()).collection<Keyed<TestAttempt>>("tests");

export const mongoStore: StoreBackend = {
  async getProfile() {
    const doc = await (await profiles()).findOne({ _id: PROFILE_ID }, NO_ID);
    return (doc as LearnerProfile | null) ?? null;
  },

  async saveProfile(profile) {
    await (await profiles()).replaceOne({ _id: PROFILE_ID }, profile, { upsert: true });
  },

  async listTurns(limit) {
    const col = await turnsCol();
    // _id breaks ties in `at`, so turns written in one batch (a live call) keep their order.
    if (limit === undefined) {
      return (await col.find({}, NO_ID).sort({ at: 1, _id: 1 }).toArray()) as TurnRecord[];
    }
    const newest = await col.find({}, NO_ID).sort({ at: -1, _id: -1 }).limit(limit).toArray();
    return (newest as TurnRecord[]).reverse();
  },

  async appendTurns(turns) {
    if (turns.length === 0) return;
    // Copies, because insertMany writes an _id onto the objects it is handed.
    await (await turnsCol()).insertMany(turns.map((t) => ({ ...t })));
  },

  async removeTurnsOf(conversationId) {
    const result = await (await turnsCol()).deleteMany({ conversationId: key(conversationId) });
    return result.deletedCount;
  },

  async getCardStates() {
    const docs = (await (await cardsCol()).find({}, NO_ID).toArray()) as CardState[];
    return Object.fromEntries(docs.map((d) => [d.id, d]));
  },

  async saveCardState(state) {
    await (await cardsCol()).replaceOne({ _id: key(state.id) }, state, { upsert: true });
  },

  async listConversations() {
    const docs = await (await conversationsCol()).find({}, NO_ID).sort({ startedAt: 1 }).toArray();
    return docs as Conversation[];
  },

  async getConversation(id) {
    const doc = await (await conversationsCol()).findOne({ _id: key(id) }, NO_ID);
    return (doc as Conversation | null) ?? null;
  },

  async saveConversation(conversation) {
    await (await conversationsCol()).replaceOne({ _id: key(conversation.id) }, conversation, {
      upsert: true,
    });
  },

  async removeConversation(id) {
    const doc = await (await conversationsCol()).findOneAndDelete({ _id: key(id) }, NO_ID);
    return (doc as Conversation | null) ?? null;
  },

  async getLibrary() {
    return (await (await libraryCol()).find({}, NO_ID).toArray()) as LibraryEntry[];
  },

  async addLibraryEntry(entry) {
    const col = await libraryCol();
    try {
      await col.insertOne({ ...entry, _id: key(entry.id) });
      return { added: true, entry };
    } catch (error) {
      // 11000 = duplicate key: already saved, so keep the first one, as before.
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      const existing = (await col.findOne({ _id: entry.id }, NO_ID)) as LibraryEntry | null;
      return { added: false, entry: existing ?? entry };
    }
  },

  async removeLibraryEntry(id) {
    const result = await (await libraryCol()).deleteOne({ _id: key(id) });
    return result.deletedCount > 0;
  },

  async listTestAttempts() {
    return (await (await testsCol()).find({}, NO_ID).toArray()) as TestAttempt[];
  },

  async saveTestAttempt(attempt) {
    await (await testsCol()).replaceOne({ _id: key(attempt.id) }, attempt, { upsert: true });
  },
};
