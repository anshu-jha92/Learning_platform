/**
 * The learner profile is the whole point of this app.
 *
 * A generic chatbot forgets you every session. This record accumulates your recurring
 * patterns and gets injected into every system prompt, so the coach can say
 * "you dropped the article again — that's your number one pattern".
 */

export interface RecurringError {
  /** A short named pattern, e.g. "missing article before singular countable nouns". */
  pattern: string;
  type: string;
  count: number;
  lastSeen: string;
  examples: string[];
}

export interface LearnerProfile {
  goals: string[];
  recurringErrors: RecurringError[];
  fillerHabits: Record<string, number>;
  /** Scenario id -> number of sessions, so weak areas can be surfaced. */
  scenarioCounts: Record<string, number>;
  totalTurns: number;
  updatedAt: string;
}

export const EMPTY_PROFILE: LearnerProfile = {
  goals: [
    "Sound confident and concise in meetings",
    "Stop freezing when put on the spot",
  ],
  recurringErrors: [],
  fillerHabits: {},
  scenarioCounts: {},
  totalTurns: 0,
  updatedAt: new Date(0).toISOString(),
};

/** Normalise an error into a stable pattern key so repeats can be counted. */
export function patternKey(type: string, why: string): string {
  return `${type}: ${why.replace(/\s+/g, " ").trim().slice(0, 90)}`;
}

export interface ProfileUpdateInput {
  scenarioId: string;
  errors: { type: string; original: string; fix: string; why: string }[];
  fillers: { term: string; count: number }[];
}

/** Pure reducer — easy to unit test, and keeps the store dumb. */
export function applyTurnToProfile(
  profile: LearnerProfile,
  input: ProfileUpdateInput
): LearnerProfile {
  const now = new Date().toISOString();
  const recurringErrors = profile.recurringErrors.map((e) => ({
    ...e,
    examples: [...e.examples],
  }));

  for (const err of input.errors) {
    const key = patternKey(err.type, err.why);
    const existing = recurringErrors.find((e) => e.pattern === key);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
      if (existing.examples.length < 5) {
        existing.examples.push(`${err.original} -> ${err.fix}`);
      }
    } else {
      recurringErrors.push({
        pattern: key,
        type: err.type,
        count: 1,
        lastSeen: now,
        examples: [`${err.original} -> ${err.fix}`],
      });
    }
  }

  const fillerHabits = { ...profile.fillerHabits };
  for (const f of input.fillers) {
    fillerHabits[f.term] = (fillerHabits[f.term] ?? 0) + f.count;
  }

  const scenarioCounts = { ...profile.scenarioCounts };
  scenarioCounts[input.scenarioId] = (scenarioCounts[input.scenarioId] ?? 0) + 1;

  return {
    ...profile,
    recurringErrors: recurringErrors.sort((a, b) => b.count - a.count),
    fillerHabits,
    scenarioCounts,
    totalTurns: profile.totalTurns + 1,
    updatedAt: now,
  };
}

/** The top patterns worth nagging about. */
export function topPatterns(profile: LearnerProfile, n = 5): RecurringError[] {
  return profile.recurringErrors.filter((e) => e.count >= 2).slice(0, n);
}
