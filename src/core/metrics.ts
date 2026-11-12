/**
 * Pure speech/text metrics. No AI, no network — cheap enough to run on every turn.
 * Written voice-ready: pass durationMs once push-to-talk lands and you get WPM too.
 */

/**
 * Conservative list. "like", "actually" and "basically" are legitimate words in plenty of
 * sentences, so these are reported as *discourse fillers to watch*, not as errors.
 */
const FILLERS = [
  "um",
  "uh",
  "erm",
  "er",
  "ah",
  "hmm",
  "like",
  "actually",
  "basically",
  "literally",
  "obviously",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "so yeah",
  "or whatever",
  "stuff like that",
];

export interface TextMetrics {
  words: number;
  sentences: number;
  avgSentenceWords: number;
  /** Longest sentence in words — long sentences are where listeners lose you. */
  longestSentenceWords: number;
  fillers: { term: string; count: number }[];
  fillerCount: number;
  /** Only present when a duration was supplied (voice turns). */
  wpm?: number;
}

export function analyseText(text: string, durationMs?: number): TextMetrics {
  const clean = text.trim();
  const words = clean ? clean.split(/\s+/).length : 0;

  const sentenceParts = clean
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sentenceWordCounts = sentenceParts.map((s) => s.split(/\s+/).length);
  const sentences = sentenceParts.length;

  const lower = ` ${clean.toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ")} `;
  const fillers = FILLERS.map((term) => {
    // Word-boundary-safe count for both single words and phrases.
    // \\s, not \s: inside a template literal a single backslash is dropped, which built
    // "(?<=s)um(?=s)" — letter s, not whitespace — and matched almost nothing. The filler
    // count silently read 0 on every real turn until this was fixed.
    const matches = lower.match(new RegExp(`(?<=\\s)${term}(?=\\s)`, "g"));
    return { term, count: matches ? matches.length : 0 };
  })
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count);

  const metrics: TextMetrics = {
    words,
    sentences,
    avgSentenceWords: sentences ? Math.round(words / sentences) : 0,
    longestSentenceWords: sentenceWordCounts.length
      ? Math.max(...sentenceWordCounts)
      : 0,
    fillers,
    fillerCount: fillers.reduce((n, f) => n + f.count, 0),
  };

  if (durationMs && durationMs > 0) {
    metrics.wpm = Math.round(words / (durationMs / 60000));
  }

  return metrics;
}

/** Meeting-appropriate pace. Too fast reads as nervous, too slow as unsure. */
export function paceVerdict(wpm: number): "too slow" | "good" | "too fast" {
  if (wpm < 110) return "too slow";
  if (wpm > 165) return "too fast";
  return "good";
}
