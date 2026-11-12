/**
 * Copies the practice data in data/*.json into MongoDB.
 *
 *   npm run db:migrate
 *
 * Reads MONGODB_URI and MONGODB_DB from .env.local. data/ itself is only read, never
 * changed, so the files stay as a backup.
 *
 * Safe to run more than once: every record is written under a fixed id, so a second run
 * overwrites what the first one wrote instead of duplicating it. Run it before practising
 * on MongoDB, though — a re-run puts the file's version of a conversation back over any
 * newer one.
 */

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { openMongo } from "./lib/mongo.mjs";

const DATA_DIR = path.join(process.cwd(), "data");

async function read(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return fallback;
  }
}

/** Upserts by a given key. Returns how many records it wrote. */
async function upsertAll(collection, docs, idOf) {
  if (docs.length === 0) return 0;
  const result = await collection.bulkWrite(
    docs.map((doc, index) => {
      const _id = idOf(doc, index);
      return { replaceOne: { filter: { _id }, replacement: { ...doc, _id }, upsert: true } };
    }),
    { ordered: false }
  );
  // New records are upserted; ones from an earlier run are matched (and replaced).
  return result.upsertedCount + result.matchedCount;
}

/**
 * Turns have no id of their own. Position plus a content hash gives each a fixed one, so
 * a re-run overwrites rather than duplicates, and the zero-padding keeps turns that share
 * a timestamp (a live call) in their original order.
 */
function turnId(turn, index) {
  const hash = createHash("sha1").update(JSON.stringify(turn)).digest("hex").slice(0, 12);
  return `file-${String(index).padStart(6, "0")}-${hash}`;
}

const mongo = await openMongo();
if (!mongo) {
  console.error("MONGODB_URI is not set. Add it to .env.local first.");
  process.exit(1);
}

const { client, db } = mongo;

try {
  const profile = await read("profile.json", null);
  const turns = await read("sessions.json", []);
  const cards = await read("cards.json", {});
  const conversations = await read("conversations.json", []);
  const library = await read("library.json", []);
  const tests = await read("tests.json", []);

  const counts = {
    profile: profile ? await upsertAll(db.collection("profile"), [profile], () => "learner") : 0,
    turns: await upsertAll(db.collection("turns"), turns, turnId),
    conversations: await upsertAll(db.collection("conversations"), conversations, (c) => c.id),
    cards: await upsertAll(db.collection("cards"), Object.values(cards), (c) => c.id),
    library: await upsertAll(db.collection("library"), library, (e) => e.id),
    tests: await upsertAll(db.collection("tests"), tests, (t) => t.id),
  };

  console.log(`Copied data/ into MongoDB database "${db.databaseName}":\n`);
  for (const [name, count] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(14)} ${count}`);
  }
  console.log("\ndata/ was not changed — keep it as a backup, or delete it once you are happy.");
} finally {
  await client.close();
}
