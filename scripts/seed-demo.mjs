/**
 * Generates demo practice history so the dashboard can be looked at before you have
 * logged real sessions.
 *
 *   node scripts/seed-demo.mjs          add demo history
 *   node scripts/seed-demo.mjs --clear  remove the demo history again
 *
 * Writes wherever the app keeps its data: MongoDB when MONGODB_URI is set in .env.local,
 * otherwise data/. This is the SAME store your real practice writes to. Run --clear
 * before you start using the app for real, or your own numbers will be mixed in with
 * invented ones.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { openMongo } from "./lib/mongo.mjs";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS = path.join(DATA_DIR, "sessions.json");
const PROFILE = path.join(DATA_DIR, "profile.json");

const SCENARIOS = [
  "standup",
  "standup",
  "standup",
  "disagree",
  "disagree",
  "clarify",
  "bad-news",
  "on-the-spot",
  "on-the-spot",
  "small-talk",
];

const ERROR_POOL = [
  {
    type: "article",
    original: "I finished integration",
    fix: "I finished the integration",
    why: "A specific singular noun needs 'the' in front of it.",
  },
  {
    type: "tense",
    original: "I have finish yesterday",
    fix: "I finished yesterday",
    why: "Use past simple for a finished action with a past time marker.",
  },
  {
    type: "preposition",
    original: "down since two days",
    fix: "down for two days",
    why: "'Since' marks a point in time; 'for' marks a length of time.",
  },
  {
    type: "plural",
    original: "two day",
    fix: "two days",
    why: "Countable nouns take a plural -s after a number above one.",
  },
  {
    type: "agreement",
    original: "I will working",
    fix: "I will work",
    why: "After 'will', use the base verb, not the -ing form.",
  },
  {
    type: "word_choice",
    original: "I did the ticket",
    fix: "I resolved the ticket",
    why: "'Did' is vague here; a precise verb sounds more professional.",
  },
];

const FILLER_POOL = ["um", "basically", "actually", "like", "you know"];

const PHRASINGS = [
  "I wrapped up the integration yesterday and I am on the bug fix today.",
  "Yesterday was the integration; today is the bug fix. One blocker.",
  "Integration is done. Bug fix today. I am blocked on the staging server.",
];

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function patternKey(type, why) {
  return `${type}: ${why.replace(/\s+/g, " ").trim().slice(0, 90)}`;
}

function build() {
  const rand = rng(20260105);
  const turns = [];
  const TOTAL = 36;
  const now = Date.now();

  for (let i = 0; i < TOTAL; i++) {
    // progress runs 0 (first session) -> 1 (most recent)
    const progress = i / (TOTAL - 1);
    const daysAgo = Math.round(28 - progress * 28);
    const at = new Date(
      now - daysAgo * 86_400_000 + (i % 3) * 3_600_000
    ).toISOString();

    // Errors fall from roughly 3 down to roughly 0-1 as they improve.
    const errorBudget = Math.max(0, Math.round(3 - progress * 2.6 + (rand() - 0.5)));
    const errors = [];
    for (let e = 0; e < errorBudget; e++) {
      const pick = ERROR_POOL[Math.floor(rand() * ERROR_POOL.length)];
      if (!errors.some((x) => x.why === pick.why)) errors.push({ ...pick });
    }

    // Fillers fall too, but more slowly — habits are stubborn.
    const fillerBudget = Math.max(0, Math.round(5 - progress * 2.5 + (rand() - 0.5) * 2));
    const fillers = [];
    for (let f = 0; f < fillerBudget; f++) {
      const term = FILLER_POOL[Math.floor(rand() * FILLER_POOL.length)];
      const found = fillers.find((x) => x.term === term);
      if (found) found.count += 1;
      else fillers.push({ term, count: 1 });
    }
    fillers.sort((a, b) => b.count - a.count);
    const fillerCount = fillers.reduce((n, f) => n + f.count, 0);

    const words = 45 + Math.round(rand() * 40);
    const sentences = 3 + Math.round(rand() * 2);
    const spoken = i % 3 !== 0;

    // Pace drifts from too fast (nervous) toward the 110-165 band.
    const wpm = Math.round(182 - progress * 40 + (rand() - 0.5) * 18);

    const base = 2.3 + progress * 1.9;
    const score = (jitter) =>
      Math.max(1, Math.min(5, Math.round(base + (rand() - 0.5) * jitter)));

    turns.push({
      at,
      // Tagged so --clear can remove the invented turns and leave real practice alone.
      demo: true,
      scenarioId: SCENARIOS[Math.floor(rand() * SCENARIOS.length)],
      difficulty: progress > 0.6 ? "tough" : progress > 0.3 ? "normal" : "gentle",
      userMessage:
        "Yesterday i have finish the api integration and today i will working on the bug fix. I am blocked because the staging server is down since two day.",
      reply: "Got it. Who owns the staging server — can you chase them straight after this?",
      coaching: {
        corrected:
          "Yesterday I finished the API integration, and today I will work on the bug fix. I am blocked because the staging server has been down for two days.",
        errors,
        better_phrasings: PHRASINGS.slice(0, 2 + (i % 2)),
        vocab_upgrades:
          rand() > 0.5
            ? [{ you_said: "did", try: "resolved", note: "More precise." }]
            : [],
        register_note:
          progress > 0.5
            ? "Appropriate for a standup."
            : "A little informal for a client-facing update.",
        scores: {
          clarity: score(1.2),
          grammar: score(1.0),
          professionalism: score(1.4),
          conciseness: score(1.6),
        },
      },
      metrics: {
        words,
        sentences,
        avgSentenceWords: Math.round(words / sentences),
        longestSentenceWords: Math.round(words / sentences) + 8 + Math.round(rand() * 14),
        fillers,
        fillerCount,
        ...(spoken ? { wpm } : {}),
      },
    });
  }

  return turns;
}

/** Rebuild the learner profile from a set of turns, the same way the app does. */
function buildProfile(turns) {
  const profile = {
    goals: [
      "Sound confident and concise in meetings",
      "Stop freezing when put on the spot",
    ],
    recurringErrors: [],
    fillerHabits: {},
    scenarioCounts: {},
    totalTurns: 0,
    updatedAt: new Date().toISOString(),
  };

  for (const t of turns) {
    for (const err of t.coaching.errors) {
      const key = patternKey(err.type, err.why);
      const found = profile.recurringErrors.find((e) => e.pattern === key);
      if (found) {
        found.count += 1;
        found.lastSeen = t.at;
        if (found.examples.length < 5) found.examples.push(`${err.original} -> ${err.fix}`);
      } else {
        profile.recurringErrors.push({
          pattern: key,
          type: err.type,
          count: 1,
          lastSeen: t.at,
          examples: [`${err.original} -> ${err.fix}`],
        });
      }
    }
    for (const f of t.metrics.fillers) {
      profile.fillerHabits[f.term] = (profile.fillerHabits[f.term] ?? 0) + f.count;
    }
    profile.scenarioCounts[t.scenarioId] =
      (profile.scenarioCounts[t.scenarioId] ?? 0) + 1;
    profile.totalTurns += 1;
  }
  profile.recurringErrors.sort((a, b) => b.count - a.count);
  return profile;
}

async function readTurns() {
  try {
    const raw = await fs.readFile(SESSIONS, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function write(turns) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const sorted = turns.slice().sort(byTime);
  await fs.writeFile(SESSIONS, JSON.stringify(sorted, null, 2), "utf8");
  await fs.writeFile(PROFILE, JSON.stringify(buildProfile(sorted), null, 2), "utf8");
  return sorted;
}

const byTime = (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime();
const clearing = process.argv.includes("--clear");
const mongo = await openMongo();

if (mongo) {
  // Same rules as the files below: demo turns are replaced or removed, the turns you
  // actually practised are never touched, and the profile is rebuilt from what is left.
  const turnsCol = mongo.db.collection("turns");
  const profileCol = mongo.db.collection("profile");
  const saveProfile = (turns) =>
    profileCol.replaceOne(
      { _id: "learner" },
      { ...buildProfile(turns), _id: "learner" },
      { upsert: true }
    );

  try {
    await turnsCol.deleteMany({ demo: true });
    const real = await turnsCol
      .find({}, { projection: { _id: 0 } })
      .sort({ at: 1, _id: 1 })
      .toArray();

    if (clearing) {
      if (real.length === 0) await profileCol.deleteOne({ _id: "learner" });
      else await saveProfile(real);
      console.log(
        `Removed the demo data from MongoDB.${real.length ? ` Kept your ${real.length} real ${real.length === 1 ? "turn" : "turns"}.` : ""}`
      );
    } else {
      const demo = build();
      await turnsCol.insertMany(demo.map((t) => ({ ...t })));
      await saveProfile([...real, ...demo].sort(byTime));
      console.log(
        `Added ${demo.length} demo turns to MongoDB${real.length ? `, kept your ${real.length} real ${real.length === 1 ? "turn" : "turns"}` : ""}.\n` +
          "Remove just the demo data later with: node scripts/seed-demo.mjs --clear"
      );
    }
  } finally {
    await mongo.client.close();
  }
  process.exit(0);
}

const existing = await readTurns();
// Anything you actually practised. Never touched by this script.
const real = existing.filter((t) => !t.demo);

if (clearing) {
  if (real.length === 0) {
    await fs.rm(DATA_DIR, { recursive: true, force: true });
    console.log("Removed the demo data. Your history is empty.");
  } else {
    await write(real);
    console.log(
      `Removed the demo data. Kept your ${real.length} real ${real.length === 1 ? "turn" : "turns"}.`
    );
  }
} else {
  const demo = build();
  const all = await write([...real, ...demo]);
  console.log(
    `Added ${demo.length} demo turns${real.length ? `, kept your ${real.length} real ${real.length === 1 ? "turn" : "turns"}` : ""} — ${all.length} total.\n` +
      "Remove just the demo data later with: node scripts/seed-demo.mjs --clear"
  );
}
