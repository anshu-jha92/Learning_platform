import { z } from "zod";
import { CoachError } from "./coach";
import { getScenario, type Difficulty } from "./scenarios";
import {
  COACH_TURN_JSON_SCHEMA,
  coachingSchema,
  scoresSchema,
  type Coaching,
  type Scores,
} from "./schemas";
import type { LearnerProfile } from "./profile";
import { topPatterns } from "./profile";
import { isMockMode, mockDebrief } from "./mock";
import { getTextClient } from "./openai-client";
import { requestStructured } from "./structured";
import { chatModel } from "./models";

/**
 * Post-call debrief.
 *
 * A live call is not coached while it happens — interrupting someone mid-sentence to
 * correct an article would destroy the thing being practised. So the whole transcript is
 * marked afterwards, in ONE model call that returns per-utterance coaching plus a session
 * summary. One call rather than one per utterance keeps it fast and cheap, and the
 * per-utterance half deliberately reuses the existing coaching contract so the profile,
 * the review deck and the dashboard all consume it with no special cases.
 */


/** The coaching object's schema, reused verbatim from the typed/spoken turn contract. */
const COACHING_JSON_SCHEMA = COACH_TURN_JSON_SCHEMA.properties.coaching;

export const debriefSchema = z.object({
  summary: z.object({
    what_went_well: z.string(),
    biggest_issue: z.string(),
    one_thing_to_fix: z.string(),
    overall: scoresSchema,
  }),
  turns: z.array(
    z.object({
      original: z.string(),
      coaching: coachingSchema,
    })
  ),
});

export interface DebriefSummary {
  what_went_well: string;
  biggest_issue: string;
  one_thing_to_fix: string;
  overall: Scores;
}

export interface DebriefTurn {
  original: string;
  coaching: Coaching;
}

export interface Debrief {
  summary: DebriefSummary;
  turns: DebriefTurn[];
}

const DEBRIEF_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "turns"],
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      required: [
        "what_went_well",
        "biggest_issue",
        "one_thing_to_fix",
        "overall",
      ],
      properties: {
        what_went_well: {
          type: "string",
          description:
            "One or two sentences naming something specific they actually did well. Never generic praise.",
        },
        biggest_issue: {
          type: "string",
          description:
            "The single thing that most got in the way of being understood or taken seriously.",
        },
        one_thing_to_fix: {
          type: "string",
          description:
            "One concrete, practisable instruction for the next call. Not a list.",
        },
        overall: COACHING_JSON_SCHEMA.properties.scores,
      },
    },
    turns: {
      type: "array",
      description:
        "One entry per substantive thing the learner said, in order. Skip pure filler like 'yeah' or 'okay'.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["original", "coaching"],
        properties: {
          original: {
            type: "string",
            description: "The learner's utterance, exactly as transcribed.",
          },
          coaching: COACHING_JSON_SCHEMA,
        },
      },
    },
  },
} as const;

export interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
}

export async function debriefSession(
  scenarioId: string,
  difficulty: Difficulty,
  transcript: TranscriptLine[],
  profile: LearnerProfile
): Promise<Debrief> {
  if (isMockMode()) return mockDebrief(scenarioId, transcript);

  const scenario = getScenario(scenarioId);
  const userLines = transcript.filter((l) => l.role === "user" && l.text.trim());

  if (userLines.length === 0) {
    throw new CoachError("There was nothing to review — no speech was transcribed.");
  }

  const patterns = topPatterns(profile);
  const patternBlock = patterns.length
    ? `This learner's known recurring patterns — say so explicitly when one appears again, and acknowledge it when one is avoided:\n${patterns
        .map((p) => `  - ${p.pattern} (seen ${p.count}x)`)
        .join("\n")}`
    : "No pattern history yet for this learner.";

  const system = `You are an English communication coach reviewing a recording of a practice meeting.

The scenario was: ${scenario.label} — ${scenario.focus}
Difficulty: ${difficulty}
Goals: ${profile.goals.join("; ")}
${patternBlock}

This was SPOKEN, not written. Judge it as speech:
- Ignore transcription artefacts, missing punctuation and capitalisation. Never report those as errors.
- Do flag real spoken problems: wrong grammar, wrong word, wrong register, rambling, vagueness.
- Self-corrections mid-sentence are normal speech, not errors, unless the final version is still wrong.

For every substantive thing the learner said, return a coaching object using the same rules as always:
- Flag only real errors. An utterance that was fine gets an empty errors array.
- "corrected" preserves their meaning and voice; if nothing is wrong, repeat it unchanged.
- better_phrasings: 2-3 things a confident native professional would say here.
- Score 1-5 against a competent professional in an English-language meeting, not against a beginner.

Then write the session summary. Be specific and honest — name what actually happened in this call. The "one thing to fix" must be something they can practise on the next call, not a list.`;

  const dialogue = transcript
    .map((l) => `${l.role === "user" ? "LEARNER" : scenario.label.toUpperCase()}: ${l.text}`)
    .join("\n");

  return (await requestStructured({
    client: getTextClient(),
    model: chatModel(),
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Here is the full call transcript:\n\n${dialogue}` },
    ],
    schemaName: "session_debrief",
    jsonSchema: DEBRIEF_JSON_SCHEMA as unknown as Record<string, unknown>,
    validator: debriefSchema,
  })) as Debrief;
}
