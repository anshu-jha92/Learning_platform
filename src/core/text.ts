/** Small text helpers shared by the deck. No dependencies, no I/O. */

/** Lowercase, strip punctuation, collapse whitespace — for comparison, not display. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function words(text: string): string[] {
  const n = normalise(text);
  return n ? n.split(" ") : [];
}

/** Word-level edit distance. Operates on tokens, not characters, so word order counts. */
function editDistance(a: string[], b: string[]): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1, // deletion
        row[j - 1] + 1, // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
    }
    prev = row;
  }

  return prev[b.length];
}

/**
 * How close two utterances are, 0 to 1.
 *
 * Deliberately rough. It is a recall check — did you produce roughly the target sentence —
 * not a pronunciation score. Transcription already normalises a lot of what a learner
 * actually said, so treat a high number as "close enough", never as "pronounced correctly".
 */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length && !wb.length) return 1;
  if (!wa.length || !wb.length) return 0;

  const distance = editDistance(wa, wb);
  return Math.max(0, 1 - distance / Math.max(wa.length, wb.length));
}

/** Stable, dependency-free id. djb2, hex-encoded. */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
