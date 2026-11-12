import { z } from "zod";
import { CoachError } from "./coach";
import { getTextClient } from "./openai-client";
import { requestStructured } from "./structured";
import { hashId } from "./text";
import { chatModel } from "./models";

/**
 * My Library — the words and phrases you decided were worth keeping.
 *
 * Deliberately opt-in. The app already collects every correction automatically into the
 * review deck; a library that filled itself the same way would just be a second copy of
 * that. This one only holds what you pressed Add on, which is what makes "what did I
 * learn today" a real answer rather than a dump.
 *
 * Each entry carries a plain-language meaning and a sentence showing WHERE to use it.
 * A word without a use is a word you will not reach for in a meeting.
 */

export interface LibraryEntry {
  id: string;
  /** The English word or phrase. */
  word: string;
  /** Plain meaning, written for someone still learning. */
  meaning: string;
  /** A short sentence showing it in a workplace situation. */
  example: string;
  /** Set when it came from Hinglish mode — what you had said in Hindi. */
  hindi?: string;
  /** The sentence of yours it came out of. */
  context?: string;
  source: "coaching" | "translation" | "manual";
  addedAt: string;
}

export function entryId(word: string): string {
  return `w${hashId(word.trim().toLowerCase())}`;
}

/* ---- Enrichment ----------------------------------------------------------- */

const enrichedSchema = z.object({
  meaning: z.string(),
  example: z.string(),
});

const ENRICH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meaning", "example"],
  properties: {
    meaning: {
      type: "string",
      description:
        "What it means, in one short sentence of simple English. Written for someone still learning — no dictionary jargon, no restating the word with harder words.",
    },
    example: {
      type: "string",
      description:
        "One short sentence using it in a real workplace or meeting situation, so it is obvious WHERE this belongs. Not a definition repeated as a sentence.",
    },
  },
} as const;


/**
 * Ask the model for a meaning and a usage example.
 *
 * Done when you add the word, not when the coaching is generated: asking for this on
 * every correction would make every single turn bigger and slower to pay for a thing
 * you mostly will not save.
 */
export async function enrich(
  word: string,
  context?: string
): Promise<{ meaning: string; example: string }> {
  if (!word.trim()) throw new CoachError("There is no word to add.");

  const system = `You write dictionary entries for an Indian professional learning English for workplace meetings.

Give two things for the word or phrase you are sent:
- meaning: one short sentence of simple English. Imagine explaining it to a colleague whose English is still improving. Never explain a word using harder words.
- example: one short sentence putting it in a real office or meeting situation, so they can see where it belongs.

Keep both tight. A long entry does not get read.`;

  return requestStructured({
    client: getTextClient(),
    model: chatModel(),
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: context
          ? `Word or phrase: "${word}"\nThey met it in this sentence: "${context}"`
          : `Word or phrase: "${word}"`,
      },
    ],
    schemaName: "library_entry",
    jsonSchema: ENRICH_JSON_SCHEMA as unknown as Record<string, unknown>,
    validator: enrichedSchema,
  });
}

/* ---- Grouping for the page ------------------------------------------------ */

export interface LibraryDay {
  /** ISO date, e.g. 2026-11-12. */
  date: string;
  label: string;
  entries: LibraryEntry[];
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const yesterday = new Date(Date.parse(today) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (date === yesterday) return "Yesterday";
  return new Date(date).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

/** Newest day first — "what did I learn today" should be the first thing you see. */
export function groupByDay(entries: LibraryEntry[]): LibraryDay[] {
  const today = new Date().toISOString().slice(0, 10);
  const byDate = new Map<string, LibraryEntry[]>();

  for (const entry of entries) {
    const date = entry.addedAt.slice(0, 10);
    const list = byDate.get(date);
    if (list) list.push(entry);
    else byDate.set(date, [entry]);
  }

  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      label: dayLabel(date, today),
      entries: list.sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    }));
}
