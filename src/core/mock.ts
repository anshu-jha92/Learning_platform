import type { CoachRequest } from "./coach";
import type { CoachTurn, Coaching, CoachError as CoachErrorShape } from "./schemas";
import type { Debrief } from "./debrief";
import { getScenario } from "./scenarios";
import { analyseText } from "./metrics";

/**
 * Offline coach — the app with no API key and no bill.
 *
 * This is NOT a language model. It is a rule table plus some arithmetic, so it only
 * catches the specific mistakes listed below and scores by heuristic. That is enough to
 * click through every screen, prove the whole pipeline works, and see what real feedback
 * will look like — and it is honest about being a stand-in, which is why the UI labels it
 * rather than letting it pass for the real thing.
 *
 * Switch it on with MOCK_AI=1, or just leave OPENAI_API_KEY unset in development.
 */

export function isMockMode(): boolean {
  if (process.env.MOCK_AI === "1") return true;
  if (process.env.MOCK_AI === "0") return false;
  // No key in development: fall back rather than fail, so the app is always clickable.
  return !process.env.OPENAI_API_KEY && process.env.NODE_ENV === "development";
}

interface Rule {
  pattern: RegExp;
  type: CoachErrorShape["type"];
  replace: string;
  why: string;
}

/** Common patterns for a learner whose first language is not English. */
const RULES: Rule[] = [
  {
    pattern: /\bhave (finish|complete|start|do|make|write|send)\b/gi,
    type: "tense",
    replace: "$1ed",
    why: "After 'have', use the past participle: 'have finished', not 'have finish'.",
  },
  {
    pattern: /\bwill (working|doing|going|making|sending|writing)\b/gi,
    type: "agreement",
    replace: "will work",
    why: "After 'will', use the base verb: 'will work', not 'will working'.",
  },
  {
    pattern: /\bsince (\w+) (day|week|month|year|hour)s?\b/gi,
    type: "preposition",
    replace: "for $1 $2s",
    why: "'Since' marks a point in time; 'for' marks a length of time.",
  },
  {
    pattern: /\b(two|three|four|five|six|several|many) (day|week|month|year|hour|ticket|issue|time)\b/gi,
    type: "plural",
    replace: "$1 $2s",
    why: "Countable nouns take a plural -s after a number above one.",
  },
  {
    pattern: /\binformations\b/gi,
    type: "plural",
    replace: "information",
    why: "'Information' is uncountable — it has no plural form.",
  },
  {
    pattern: /\bdiscuss about\b/gi,
    type: "preposition",
    replace: "discuss",
    why: "'Discuss' takes a direct object: 'discuss the plan', not 'discuss about'.",
  },
  {
    pattern: /\bexplain me\b/gi,
    type: "preposition",
    replace: "explain to me",
    why: "'Explain' needs 'to' before the person: 'explain it to me'.",
  },
  {
    pattern: /\b(i am|i'm) agree\b/gi,
    type: "grammar",
    replace: "I agree",
    why: "'Agree' is a verb, so it does not take 'am': 'I agree'.",
  },
  {
    pattern: /\bmore (better|easier|faster|simpler|clearer)\b/gi,
    type: "grammar",
    replace: "$1",
    why: "'Better' is already comparative — 'more better' doubles it.",
  },
  {
    pattern: /\bdidn't (went|came|made|took|saw)\b/gi,
    type: "tense",
    replace: "didn't go",
    why: "After 'didn't', use the base verb: 'didn't go', not 'didn't went'.",
  },
  {
    pattern: /\bi\b/g, // lowercase standalone "i"
    type: "grammar",
    replace: "I",
    why: "'I' is always capitalised in English.",
  },
];

/** Vague words a meeting rewards you for replacing. */
const VOCAB: { from: RegExp; to: string; note: string }[] = [
  { from: /\bdid\b/i, to: "completed", note: "More precise in a status update." },
  { from: /\bthing\b/i, to: "item", note: "'Thing' tells the listener nothing." },
  { from: /\bgot\b/i, to: "received", note: "Sounds more professional." },
  { from: /\bbig\b/i, to: "significant", note: "Specific beats vague." },
  { from: /\bstuff\b/i, to: "the details", note: "'Stuff' is too casual for a meeting." },
  { from: /\bgood\b/i, to: "solid", note: "'Good' is the weakest possible praise." },
];

interface Found extends CoachErrorShape {
  start: number;
  end: number;
}

function applyRules(text: string): { corrected: string; errors: CoachErrorShape[] } {
  let corrected = text;
  const found: Found[] = [];

  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const original = match[0];
      const fix = original.replace(
        new RegExp(rule.pattern.source, rule.pattern.flags.replace("g", "")),
        rule.replace
      );
      if (fix === original) continue;

      const start = match.index ?? 0;
      const end = start + original.length;
      // Same span already reported by an earlier rule.
      if (found.some((f) => f.start === start && f.end === end)) continue;

      found.push({ type: rule.type, original, fix, why: rule.why, start, end });
    }
    corrected = corrected.replace(rule.pattern, rule.replace);
  }

  // Capitalise the opening letter, which the lowercase-"i" rule does not cover.
  corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);

  // Rules overlap: "since two day" and "two day" cover the same words. Keep the wider
  // correction and drop any whose SPAN sits inside it, so one mistake is reported once.
  // Comparing positions rather than text matters — a one-letter fix like "i" would
  // otherwise be swallowed by any longer match that happens to contain that letter.
  const deduped = found
    .filter(
      (e) =>
        !found.some(
          (other) =>
            other !== e &&
            other.start <= e.start &&
            other.end >= e.end &&
            other.end - other.start > e.end - e.start
        )
    )
    .sort((a, b) => a.start - b.start)
    .map(({ type, original, fix, why }) => ({ type, original, fix, why }));

  // The same mistake made three times is one thing to learn, not three. Collapse
  // identical corrections and keep the first occurrence's position in the list.
  const seen = new Set<string>();
  const collapsed = deduped.filter((e) => {
    const key = `${e.original.toLowerCase()}|${e.fix}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { corrected, errors: collapsed };
}

function scoreFor(
  text: string,
  errorCount: number
): Coaching["scores"] {
  const m = analyseText(text);
  const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

  const errorRate = m.words > 0 ? (errorCount / m.words) * 100 : 0;
  const fillerRate = m.words > 0 ? (m.fillerCount / m.words) * 100 : 0;

  return {
    grammar: clamp(5 - errorRate * 1.2),
    clarity: clamp(5 - fillerRate * 0.6 - (m.longestSentenceWords > 28 ? 1 : 0)),
    conciseness: clamp(
      5 - (m.avgSentenceWords > 22 ? 2 : m.avgSentenceWords > 16 ? 1 : 0) - (m.words > 90 ? 1 : 0)
    ),
    professionalism: clamp(5 - fillerRate * 0.5 - (errorCount > 2 ? 1 : 0)),
  };
}

const OPENERS: Record<string, string> = {
  standup: "Quick update — ",
  disagree: "I see it differently: ",
  clarify: "Just so I have this right — ",
  "bad-news": "I want to flag this early: ",
  "on-the-spot": "My initial read: ",
  "small-talk": "",
  deadline: "Realistically, ",
};

/**
 * Alternative phrasings, without a model.
 *
 * There is no way to genuinely rewrite a sentence from a rule table, so this does the one
 * honest thing it can: offer the corrected sentence, and a trimmed version that keeps only
 * the first clause. Two real options beat three mangled ones — and it never lowercases a
 * leading "I", which is a correction the engine just finished making.
 */
function phrasings(corrected: string, scenarioId: string): string[] {
  const full = corrected.replace(/\s+/g, " ").trim().replace(/[,;]\s*$/, "");

  // First clause: a sentence break if there is one, otherwise the first comma.
  const firstSentence = full.split(/[.!?]/)[0]?.trim() || full;
  const firstClause = firstSentence.split(/,/)[0]?.trim() || firstSentence;

  const out = [full.endsWith(".") ? full : `${full}.`];

  // Only worth offering if it is genuinely shorter.
  if (firstClause.length > 10 && firstClause.length < full.length * 0.7) {
    const opener = OPENERS[scenarioId] ?? "";
    // Never lowercase a leading "I" — the engine just corrected that.
    const body = /^I\b/.test(firstClause)
      ? firstClause
      : opener
        ? firstClause.charAt(0).toLowerCase() + firstClause.slice(1)
        : firstClause;
    out.push(`${opener}${body}.`);
  }

  return [...new Set(out)];
}

const REPLIES: Record<string, string[]> = {
  standup: [
    "Got it. Who owns the staging server — can you chase them right after this?",
    "Thanks. Is that blocker going to move your delivery date?",
    "Okay. Anything you need from anyone else in the room?",
  ],
  disagree: [
    "I hear you, but the client has already seen the date. What would you cut?",
    "That's fair. Give me a number — how much longer do you actually need?",
    "Okay, convince me. What breaks if we ship on time?",
  ],
  clarify: [
    "Right, so the backfill ordering is the issue. Still with me?",
    "Yeah — the dims need re-keying before the marts refresh. Make sense?",
    "Exactly. So can you take the re-key, or should I?",
  ],
  "bad-news": [
    "I appreciate the honesty. What does this do to our launch?",
    "Okay. When will you know the new date for certain?",
    "And what are you doing to stop it slipping again?",
  ],
  "on-the-spot": [
    "Interesting. What would change your mind?",
    "Say more — what's the risk if we go the other way?",
    "Okay. If you had to decide today, which would it be?",
  ],
  "small-talk": [
    "Ha, same here. Doing anything good at the weekend?",
    "Nice. How long have you been on this team now?",
    "Oh really? How's that been going?",
  ],
  deadline: [
    "Thursday works for me. Can you commit to that?",
    "I need a date I can put in the plan. What is it?",
    "Okay — and what do you need from me to hit it?",
  ],
};

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

export function mockCoachTurn(req: CoachRequest): CoachTurn {
  const { corrected, errors } = applyRules(req.userMessage);
  const metrics = analyseText(req.userMessage);

  const vocab = VOCAB.filter((v) => v.from.test(req.userMessage))
    .slice(0, 2)
    .map((v) => ({
      you_said: req.userMessage.match(v.from)?.[0] ?? "",
      try: v.to,
      note: v.note,
    }));

  const registerNote =
    metrics.fillerCount > 2
      ? `You used ${metrics.fillerCount} filler words. In a meeting that reads as unsure.`
      : metrics.avgSentenceWords > 22
        ? "Sentences are long. Shorter ones land better when people are listening, not reading."
        : errors.length === 0
          ? "Tone is appropriate for this meeting."
          : "Tone is fine; the grammar is what is getting in the way.";

  const replies = REPLIES[req.scenarioId] ?? REPLIES.standup;

  return {
    reply: pick(replies, req.history.length),
    coaching: {
      corrected,
      errors,
      better_phrasings: phrasings(corrected, req.scenarioId),
      vocab_upgrades: vocab,
      register_note: registerNote,
      scores: scoreFor(req.userMessage, errors.length),
    },
  };
}

/**
 * The offline coach cannot hear. There is no speech model behind it, so a spoken turn
 * returns one of these instead — deliberately error-laden, so the coaching has something
 * to find and the pipeline can be seen working end to end.
 */
const CANNED_TRANSCRIPTS = [
  "yesterday i have finish the api integration and today i will working on the bug fix, i am blocked because the staging server is down since two day",
  "um so basically i think we should discuss about the timeline, i am agree that it is more better to wait",
  "i didn't went to the meeting because i got some informations that it was cancelled",
  "actually the thing is, you know, i have complete most of the stuff but there is like two issue remaining",
];

export function mockTranscribe(seed = Date.now()): {
  text: string;
  durationSec: number;
} {
  const text = pick(CANNED_TRANSCRIPTS, Math.floor(seed / 1000));
  // A plausible speaking rate, so words-per-minute is in a believable range.
  return { text, durationSec: (text.split(/\s+/).length / 150) * 60 };
}

export function mockDebrief(
  scenarioId: string,
  transcript: { role: "user" | "assistant"; text: string }[]
): Debrief {
  const userLines = transcript.filter((l) => l.role === "user" && l.text.trim());

  const turns = userLines.map((line) => {
    const { corrected, errors } = applyRules(line.text);
    return {
      original: line.text,
      coaching: {
        corrected,
        errors,
        better_phrasings: phrasings(corrected, scenarioId),
        vocab_upgrades: [],
        register_note:
          errors.length === 0
            ? "Tone was appropriate."
            : "Grammar slips are what stood out here, not tone.",
        scores: scoreFor(line.text, errors.length),
      } satisfies Coaching,
    };
  });

  const totalErrors = turns.reduce((n, t) => n + t.coaching.errors.length, 0);
  const avg = (key: keyof Coaching["scores"]) =>
    Math.round(
      turns.reduce((n, t) => n + t.coaching.scores[key], 0) / Math.max(turns.length, 1)
    ) || 3;

  const commonest = turns
    .flatMap((t) => t.coaching.errors)
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.why] = (acc[e.why] ?? 0) + 1;
      return acc;
    }, {});
  const topIssue =
    Object.entries(commonest).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "Nothing stood out as a repeated grammar problem.";

  return {
    summary: {
      what_went_well: `You kept going for ${userLines.length} turns without stalling, which is the hard part.`,
      biggest_issue:
        totalErrors > 0
          ? topIssue
          : "No recurring grammar problem — work on being more concise next.",
      one_thing_to_fix:
        totalErrors > 0
          ? "Before you speak, decide the one sentence you need to land, and say that first."
          : "Cut one sentence from every answer. Say the point, then stop.",
      overall: {
        clarity: avg("clarity"),
        grammar: avg("grammar"),
        professionalism: avg("professionalism"),
        conciseness: avg("conciseness"),
      },
    },
    turns,
  };
}
