import { z } from "zod";

/**
 * The coaching contract.
 *
 * Kept as a hand-written JSON Schema (for OpenAI strict structured outputs) plus a
 * matching zod validator (to verify what actually comes back). Hand-written on purpose:
 * the SDK's zod helpers target zod v3 and we are on v4, and this way the contract the
 * model sees is explicit and editable.
 *
 * Strict-mode rules: every object sets additionalProperties:false and lists every
 * property in `required`. minItems/maximum are NOT supported, so counts and ranges are
 * enforced in the prompt and by the enums below.
 */

export const ERROR_TYPES = [
  "grammar",
  "tense",
  "article",
  "preposition",
  "word_choice",
  "word_order",
  "plural",
  "agreement",
  "register",
] as const;

export const coachErrorSchema = z.object({
  type: z.enum(ERROR_TYPES),
  original: z.string(),
  fix: z.string(),
  why: z.string(),
});

export const vocabUpgradeSchema = z.object({
  you_said: z.string(),
  try: z.string(),
  note: z.string(),
});

export const scoresSchema = z.object({
  clarity: z.number().int().min(1).max(5),
  grammar: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5),
  conciseness: z.number().int().min(1).max(5),
});

export const coachingSchema = z.object({
  corrected: z.string(),
  errors: z.array(coachErrorSchema),
  better_phrasings: z.array(z.string()),
  vocab_upgrades: z.array(vocabUpgradeSchema),
  register_note: z.string(),
  scores: scoresSchema,
});

export const coachTurnSchema = z.object({
  reply: z.string(),
  coaching: coachingSchema,
});

export type CoachError = z.infer<typeof coachErrorSchema>;
export type VocabUpgrade = z.infer<typeof vocabUpgradeSchema>;
export type Scores = z.infer<typeof scoresSchema>;
export type Coaching = z.infer<typeof coachingSchema>;
export type CoachTurn = z.infer<typeof coachTurnSchema>;

const str = (description: string) => ({ type: "string", description });

/** The same shape, as a strict JSON Schema for the OpenAI response_format. */
export const COACH_TURN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "coaching"],
  properties: {
    reply: str(
      "Your in-character conversational reply. Never mention the coaching here."
    ),
    coaching: {
      type: "object",
      additionalProperties: false,
      required: [
        "corrected",
        "errors",
        "better_phrasings",
        "vocab_upgrades",
        "register_note",
        "scores",
      ],
      properties: {
        corrected: str(
          "The learner's message with only real errors fixed, meaning and voice preserved. If nothing is wrong, repeat it unchanged."
        ),
        errors: {
          type: "array",
          description:
            "Real errors only. Empty array if the message was already correct. Never invent errors.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "original", "fix", "why"],
            properties: {
              type: { type: "string", enum: [...ERROR_TYPES] },
              original: str("The exact wrong fragment from the learner."),
              fix: str("The corrected fragment."),
              why: str("One short sentence explaining the rule, in plain language."),
            },
          },
        },
        better_phrasings: {
          type: "array",
          description:
            "2-3 ways a confident native professional would actually say this in a meeting, varying in directness.",
          items: { type: "string" },
        },
        vocab_upgrades: {
          type: "array",
          description:
            "Vague or basic words swapped for precise professional ones. Empty array if nothing is worth upgrading.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["you_said", "try", "note"],
            properties: {
              you_said: str("The weak word or phrase they used."),
              try: str("The stronger professional alternative."),
              note: str("Very short reason this lands better."),
            },
          },
        },
        register_note: str(
          "One sentence on workplace tone: too casual, too blunt, too apologetic, too wordy, or appropriate."
        ),
        scores: {
          type: "object",
          additionalProperties: false,
          required: ["clarity", "grammar", "professionalism", "conciseness"],
          properties: {
            clarity: { type: "integer", enum: [1, 2, 3, 4, 5] },
            grammar: { type: "integer", enum: [1, 2, 3, 4, 5] },
            professionalism: { type: "integer", enum: [1, 2, 3, 4, 5] },
            conciseness: { type: "integer", enum: [1, 2, 3, 4, 5] },
          },
        },
      },
    },
  },
} as const;
