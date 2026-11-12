import { z } from "zod";
import { CoachError } from "./coach";
import { getScenario } from "./scenarios";
import { getTextClient } from "./openai-client";
import { requestStructured } from "./structured";
import { chatModel } from "./models";

/**
 * "I know what I want to say, I just cannot say it in English."
 *
 * Say it in Hindi and get the English back. Deliberately NOT coaching: there is nothing
 * to correct in a Hindi sentence, so this returns the English you should have said plus
 * the phrases worth stealing from it — and then hands it to you to say yourself, which
 * is the part that actually teaches. A translation you read and move on from teaches
 * nothing.
 *
 * Translations are not recorded as practice. They are help, not a measured answer, and
 * mixing them into the error rate would make the progress charts lie.
 */

export const translationSchema = z.object({
  english: z.string(),
  alternatives: z.array(z.string()),
  phrases: z.array(
    z.object({
      hindi: z.string(),
      english: z.string(),
      note: z.string(),
    })
  ),
  reply: z.string(),
});

export type Translation = z.infer<typeof translationSchema>;

const TRANSLATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["english", "alternatives", "phrases", "reply"],
  properties: {
    english: {
      type: "string",
      description:
        "What they meant, said the way a confident professional would say it in this meeting. Natural spoken English, not a literal word-for-word translation.",
    },
    alternatives: {
      type: "array",
      description:
        "Two other ways to say the same thing, varying in directness or formality.",
      items: { type: "string" },
    },
    phrases: {
      type: "array",
      description:
        "The 2-4 pieces of this sentence most worth learning: the bits they will need again in other meetings. Skip anything obvious.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hindi", "english", "note"],
        properties: {
          hindi: {
            type: "string",
            description:
              "The Hindi fragment, written back in the SAME script they used — Roman if they typed Roman. Do not convert it to Devanagari.",
          },
          english: { type: "string", description: "The English they should use." },
          note: {
            type: "string",
            description: "One short line on when to use it. Plain language.",
          },
        },
      },
    },
    reply: {
      type: "string",
      description:
        "Your in-character reply to what they said, as if they had said it in English. One or two sentences, keeps the meeting moving.",
    },
  },
} as const;


export async function translateToEnglish(
  scenarioId: string,
  hindiText: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<Translation> {
  if (!hindiText.trim()) {
    throw new CoachError("There was nothing to translate.");
  }

  const scenario = getScenario(scenarioId);

  const system = `You help an Indian professional say things in English during workplace meetings.

They will give you a sentence in Hindi. Expect it in ROMAN LETTERS, not Devanagari — they type on an English keyboard, so "maine kal kaam khatam kar diya" is the normal input, not "मैंने कल काम खत्म कर दिया". Handle either, and handle Hinglish (Hindi grammar with English words mixed in: "mujhe testing karna hai aaj") which is how people actually speak in Indian offices.

Your job is to give them the English they should have used.

The meeting: ${scenario.label}. ${scenario.focus}
You are playing: ${scenario.persona}

Rules:
- Translate the MEANING, not the words. A literal translation of Hindi word order produces English nobody speaks.
- Give spoken English for a meeting, not written English. Contractions are good. Short sentences are good.
- Keep their intent and their level of directness. If they were being polite, stay polite; if they were pushing back, push back.
- "phrases" is the teaching part: pull out the 2-4 pieces they will need again in other meetings. A phrase they can reuse beats a whole sentence they will forget. Skip anything obvious like "yesterday" or "I think".
- "reply" stays in character, as if they had said the English version out loud to you.
- Never correct their Hindi. There is nothing wrong with it.`;

  const dialogue = history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "THEM" : "YOU"}: ${m.content}`)
    .join("\n");

  return requestStructured({
    client: getTextClient(),
    model: chatModel(),
    temperature: 0.5,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: dialogue
          ? `The conversation so far:\n${dialogue}\n\nThey just said, in Hindi:\n"${hindiText}"`
          : `They said, in Hindi:\n"${hindiText}"`,
      },
    ],
    schemaName: "translation",
    jsonSchema: TRANSLATION_JSON_SCHEMA as unknown as Record<string, unknown>,
    validator: translationSchema,
  });
}
