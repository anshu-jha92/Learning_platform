import { z } from "zod";
import { CoachError } from "./coach";
import { getTextClient } from "./openai-client";
import { requestStructured } from "./structured";
import type { TurnRecord } from "./store";
import type { LibraryEntry } from "./library";
import { chatModel } from "./models";

/**
 * The weekly test.
 *
 * Built only from the last six days of YOUR practice — your mistakes, your saved words.
 * A generic quiz would be easier to produce and worth far less: the point is to find out
 * whether the things you actually got wrong this week have stuck.
 *
 * Answers are free text (typed or spoken), so grading needs a model. Everything is
 * graded in one call at the end: cheaper than grading per question, and it stops the app
 * leaking the answer to question three while you are still on question two.
 */

export const DAYS_COVERED = 6;
const MAX_QUESTIONS = 8;

export type QuestionType = "fix" | "improve" | "use_word" | "meaning";

export interface TestQuestion {
  id: string;
  type: QuestionType;
  /** What to do. */
  prompt: string;
  /** The sentence or word being asked about. */
  material: string;
  /** Why this is in your test — shown after you answer. */
  because: string;
}

export interface GeneratedTest {
  questions: TestQuestion[];
  /** How much of your own material it had to work with. */
  drawnFrom: { mistakes: number; words: number; days: number };
}

const questionsSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(["fix", "improve", "use_word", "meaning"]),
      prompt: z.string(),
      material: z.string(),
      because: z.string(),
    })
  ),
});

const QUESTIONS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      description: `Between 5 and ${MAX_QUESTIONS} questions, mixed across the types, ordered easiest first.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "prompt", "material", "because"],
        properties: {
          type: {
            type: "string",
            enum: ["fix", "improve", "use_word", "meaning"],
            description:
              "fix = a sentence with a mistake they actually made, they correct it. improve = a weak but correct sentence, they say it better. use_word = they write a sentence using one of their saved words. meaning = they explain what one of their saved words means.",
          },
          prompt: {
            type: "string",
            description:
              "The instruction, one short line, second person. Do not give the answer away in it.",
          },
          material: {
            type: "string",
            description:
              "The sentence or the word being asked about. For 'fix', the sentence must contain the mistake, not the correction.",
          },
          because: {
            type: "string",
            description:
              "One short line on why this is in their test — which mistake or word it came from. Shown after they answer.",
          },
        },
      },
    },
  },
} as const;


/** Turns and words from the last N days — the only material the test is allowed. */
export function recentMaterial(
  turns: TurnRecord[],
  library: LibraryEntry[],
  days = DAYS_COVERED
) {
  const cutoff = Date.now() - days * 86_400_000;
  const recentTurns = turns.filter((t) => new Date(t.at).getTime() >= cutoff);
  const recentWords = library.filter(
    (w) => new Date(w.addedAt).getTime() >= cutoff
  );

  const mistakes = recentTurns.flatMap((t) =>
    t.coaching.errors.map((e) => ({
      original: e.original,
      fix: e.fix,
      why: e.why,
      sentence: t.userMessage,
    }))
  );

  const weak = recentTurns
    .filter((t) => t.coaching.errors.length === 0 && t.coaching.better_phrasings.length)
    .map((t) => ({ said: t.userMessage, better: t.coaching.better_phrasings[0] }));

  return { mistakes, weak, words: recentWords };
}

export async function generateTest(
  turns: TurnRecord[],
  library: LibraryEntry[]
): Promise<GeneratedTest> {
  const { mistakes, weak, words } = recentMaterial(turns, library);

  if (mistakes.length === 0 && words.length === 0) {
    throw new CoachError(
      `There is nothing to test yet. Practise a few answers, save a word or two, and come back — the test is built from your own last ${DAYS_COVERED} days.`
    );
  }

  const system = `You are setting a short weekly test for an Indian professional learning English for workplace meetings.

Build it ONLY from the material below — their own mistakes and their own saved words from the last ${DAYS_COVERED} days. Do not invent generic grammar questions; the whole point is that this is their week, not a textbook's.

Rules:
- 5 to ${MAX_QUESTIONS} questions. Fewer is fine if the material is thin. Never repeat the same mistake twice.
- Mix the types. Lead with the mistakes they made most often.
- For "fix", the material must still CONTAIN the mistake. Do not accidentally write the corrected version.
- Keep every prompt to one short line, and never reveal the answer inside it.
- Order them easiest first, so they do not stall on question one.`;

  const material = [
    mistakes.length
      ? `MISTAKES THEY MADE (wrong -> right, and why):\n${mistakes
          .slice(0, 25)
          .map((m) => `- "${m.original}" -> "${m.fix}" (${m.why})`)
          .join("\n")}`
      : "",
    weak.length
      ? `ANSWERS THAT WERE CORRECT BUT WEAK:\n${weak
          .slice(0, 6)
          .map((w) => `- they said: "${w.said}"\n  better: "${w.better}"`)
          .join("\n")}`
      : "",
    words.length
      ? `WORDS THEY SAVED TO THEIR LIBRARY:\n${words
          .slice(0, 15)
          .map((w) => `- ${w.word} — ${w.meaning}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await requestStructured({
    client: getTextClient(),
    model: chatModel(),
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: material },
    ],
    schemaName: "weekly_test",
    jsonSchema: QUESTIONS_JSON_SCHEMA as unknown as Record<string, unknown>,
    validator: questionsSchema,
  });

  return {
    questions: result.questions.slice(0, MAX_QUESTIONS).map((q, i) => ({
      ...q,
      id: `q${i + 1}`,
    })),
    drawnFrom: {
      mistakes: mistakes.length,
      words: words.length,
      days: DAYS_COVERED,
    },
  };
}

/* ---- Grading -------------------------------------------------------------- */

export interface TestAnswer {
  id: string;
  question: TestQuestion;
  answer: string;
}

const gradeSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      score: z.number().int().min(0).max(10),
      verdict: z.enum(["correct", "partly", "wrong", "skipped"]),
      feedback: z.string(),
      model_answer: z.string(),
    })
  ),
  summary: z.string(),
  focus: z.string(),
});

export type GradedTest = z.infer<typeof gradeSchema> & {
  percentage: number;
  band: string;
  scored: number;
  outOf: number;
};

const GRADE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results", "summary", "focus"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "score", "verdict", "feedback", "model_answer"],
        properties: {
          id: { type: "string", description: "The question id, copied exactly." },
          score: {
            type: "integer",
            enum: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            description:
              "0-10. Judge whether they fixed or used it correctly, not whether they matched your wording. A different but correct answer scores full marks. An empty answer is 0.",
          },
          verdict: {
            type: "string",
            enum: ["correct", "partly", "wrong", "skipped"],
          },
          feedback: {
            type: "string",
            description:
              "One or two short sentences. Say what was right before what was wrong. Plain language, no grammar jargon without explaining it.",
          },
          model_answer: {
            type: "string",
            description: "A good answer, for them to compare against.",
          },
        },
      },
    },
    summary: {
      type: "string",
      description:
        "Two sentences on how the week went overall. Specific and honest — name what actually improved and what did not.",
    },
    focus: {
      type: "string",
      description:
        "The one thing to work on next week. One concrete, practisable instruction, not a list.",
    },
  },
} as const;

function bandFor(percentage: number): string {
  if (percentage >= 90) return "Excellent";
  if (percentage >= 75) return "Strong";
  if (percentage >= 60) return "Getting there";
  if (percentage >= 40) return "Needs work";
  return "Start again here";
}

export async function gradeTest(answers: TestAnswer[]): Promise<GradedTest> {
  if (answers.length === 0) throw new CoachError("There are no answers to mark.");

  const system = `You are marking a weekly English test for a professional learning English for meetings.

Mark fairly and usefully:
- Judge the ENGLISH and whether they did what was asked. A correct answer worded differently from yours is still correct — do not mark down for not matching your phrasing.
- Spelling slips and missing capitals on an otherwise correct answer cost at most a point. They were likely typing fast or speaking.
- An empty or nonsense answer is 0 and "skipped".
- Feedback is one or two short sentences, says what was right first, and never uses grammar jargon without explaining it.
- "focus" is ONE thing for next week. A list is not a focus.`;

  const body = answers
    .map(
      (a, i) =>
        `${i + 1}. [id: ${a.id}] (${a.question.type})\n   Asked: ${a.question.prompt}\n   Material: ${a.question.material}\n   Their answer: ${a.answer.trim() || "(left blank)"}`
    )
    .join("\n\n");

  const graded = await requestStructured({
    client: getTextClient(),
    model: chatModel(),
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: body },
    ],
    schemaName: "test_results",
    jsonSchema: GRADE_JSON_SCHEMA as unknown as Record<string, unknown>,
    validator: gradeSchema,
  });

  const outOf = answers.length * 10;
  const scored = graded.results.reduce((n, r) => n + r.score, 0);
  const percentage = outOf > 0 ? Math.round((scored / outOf) * 100) : 0;

  return { ...graded, percentage, band: bandFor(percentage), scored, outOf };
}

/* ---- Stored attempts ------------------------------------------------------ */

export interface TestAttempt {
  id: string;
  takenAt: string;
  percentage: number;
  band: string;
  scored: number;
  outOf: number;
  summary: string;
  focus: string;
}
