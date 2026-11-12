/**
 * SM-2 spaced repetition.
 *
 * The classic SuperMemo-2 algorithm, which is about forty lines and still the right
 * default: cards you get right stretch out, cards you miss come straight back.
 * Pure functions, no I/O — easy to test and easy to move off Next later.
 */

export type Grade = "again" | "hard" | "good" | "easy";

/** SM-2 expects a 0-5 quality. These are the four buttons a human can actually judge. */
const QUALITY: Record<Grade, number> = {
  again: 2,
  hard: 3,
  good: 4,
  easy: 5,
};

export interface CardState {
  id: string;
  /** Consecutive successful reviews. Resets to 0 on a lapse. */
  reps: number;
  /** SM-2 ease factor. Starts at 2.5, floors at 1.3. */
  ease: number;
  intervalDays: number;
  /** ISO date-time this card is next due. */
  due: string;
  lapses: number;
  lastGrade: Grade | null;
  lastReviewed: string | null;
}

export const MIN_EASE = 1.3;
const DAY_MS = 86_400_000;

export function newCardState(id: string): CardState {
  return {
    id,
    reps: 0,
    ease: 2.5,
    intervalDays: 0,
    // A brand-new card is due immediately.
    due: new Date(0).toISOString(),
    lapses: 0,
    lastGrade: null,
    lastReviewed: null,
  };
}

export function review(
  state: CardState,
  grade: Grade,
  now = new Date()
): CardState {
  const q = QUALITY[grade];

  // Ease moves on every review, including failures.
  const ease = Math.max(
    MIN_EASE,
    state.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  );

  let reps: number;
  let intervalDays: number;
  let lapses = state.lapses;

  if (q < 3) {
    // Lapse: back to the start of the ladder, due again today.
    reps = 0;
    intervalDays = 0;
    lapses += 1;
  } else {
    reps = state.reps + 1;
    intervalDays =
      reps === 1 ? 1 : reps === 2 ? 6 : Math.round(state.intervalDays * ease);
    // "Easy" on a mature card earns a bonus; "hard" is held back.
    if (grade === "easy" && reps > 2) intervalDays = Math.round(intervalDays * 1.3);
    if (grade === "hard" && reps > 2) intervalDays = Math.max(1, Math.round(intervalDays * 0.7));
  }

  return {
    ...state,
    reps,
    ease,
    intervalDays,
    lapses,
    lastGrade: grade,
    lastReviewed: now.toISOString(),
    due: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}

export function isDue(state: CardState, now = new Date()): boolean {
  return new Date(state.due).getTime() <= now.getTime();
}

/** Human-readable "when will I see this again". */
export function nextIntervalLabel(state: CardState): string {
  if (state.intervalDays <= 0) return "again today";
  if (state.intervalDays === 1) return "tomorrow";
  if (state.intervalDays < 30) return `in ${state.intervalDays} days`;
  const months = Math.round(state.intervalDays / 30);
  return months === 1 ? "in a month" : `in ${months} months`;
}

/** Preview each button's effect, so the UI can show it before you commit. */
export function gradePreview(state: CardState, now = new Date()): Record<Grade, string> {
  return {
    again: nextIntervalLabel(review(state, "again", now)),
    hard: nextIntervalLabel(review(state, "hard", now)),
    good: nextIntervalLabel(review(state, "good", now)),
    easy: nextIntervalLabel(review(state, "easy", now)),
  };
}
