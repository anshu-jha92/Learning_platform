import type { TurnRecord } from "./store";
import { patternKey } from "./profile";
import { SCENARIOS } from "./scenarios";
import type { Scores } from "./schemas";

/**
 * Pure aggregation: turn history in, chart-ready view model out.
 *
 * Everything is derived from the turn records rather than the stored profile, because the
 * records carry timestamps — which is what makes trend and "is this improving?" possible.
 */

export type Range = "7d" | "30d" | "all";
export type Tone = "neutral" | "good" | "warning" | "critical" | "muted";

export const SCORE_KEYS = [
  "clarity",
  "grammar",
  "professionalism",
  "conciseness",
] as const;

export const SCORE_LABELS: Record<keyof Scores, string> = {
  clarity: "Clarity",
  grammar: "Grammar",
  professionalism: "Professional",
  conciseness: "Concise",
};

export interface Point {
  x: number;
  y: number;
  label: string;
}

export interface BarDatum {
  label: string;
  value: number;
  sublabel?: string;
  tone?: Tone;
}

export interface PatternRow extends BarDatum {
  status: string;
  example: string;
}

export interface DashboardData {
  empty: boolean;
  totalTurns: number;
  spokenTurns: number;
  firstAt: string | null;
  lastAt: string | null;

  avgScores: Record<keyof Scores, number | null>;
  scoreSeries: Record<keyof Scores, Point[]>;
  scoreDelta: Record<keyof Scores, number | null>;

  wpmSeries: Point[];
  avgWpm: number | null;

  errorsPer100: number | null;
  errorsSeries: Point[];
  fillersPer100: number | null;

  topFillers: BarDatum[];
  patterns: PatternRow[];
  scenarioCoverage: BarDatum[];
}

const DAY_MS = 86_400_000;

export function withinRange(turns: TurnRecord[], range: Range): TurnRecord[] {
  if (range === "all") return turns;
  const cutoff = Date.now() - (range === "7d" ? 7 : 30) * DAY_MS;
  return turns.filter((t) => new Date(t.at).getTime() >= cutoff);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(value: number | null, places = 1): number | null {
  if (value === null) return null;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Is a pattern getting better? Compare how often it appeared in the older half of the
 * window against the newer half, as a rate rather than a raw count, so an uneven split
 * does not fake an improvement.
 */
function trendFor(
  olderHits: number,
  olderTurns: number,
  recentHits: number,
  recentTurns: number,
  total: number
): { status: string; tone: Tone } {
  if (total < 2) return { status: "new", tone: "muted" };
  if (!olderTurns || !recentTurns) return { status: "tracking", tone: "muted" };

  const olderRate = olderHits / olderTurns;
  const recentRate = recentHits / recentTurns;

  if (recentRate === 0) return { status: "not seen lately", tone: "good" };
  if (olderRate === 0) return { status: "new habit", tone: "critical" };
  if (recentRate < olderRate * 0.6) return { status: "improving", tone: "good" };
  if (recentRate > olderRate * 1.25) return { status: "getting worse", tone: "critical" };
  return { status: "persistent", tone: "warning" };
}

export function buildDashboard(all: TurnRecord[], range: Range): DashboardData {
  const turns = withinRange(all, range).slice().sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );

  const empty = turns.length === 0;

  const avgScores = {} as Record<keyof Scores, number | null>;
  const scoreSeries = {} as Record<keyof Scores, Point[]>;
  const scoreDelta = {} as Record<keyof Scores, number | null>;

  for (const key of SCORE_KEYS) {
    const series = turns.map((t, i) => ({
      x: i,
      y: t.coaching.scores[key],
      label: shortDate(t.at),
    }));
    scoreSeries[key] = series;
    avgScores[key] = round(mean(series.map((p) => p.y)));

    // Trend: mean of the most recent third against the oldest third.
    if (series.length >= 6) {
      const third = Math.floor(series.length / 3);
      const older = mean(series.slice(0, third).map((p) => p.y));
      const recent = mean(series.slice(-third).map((p) => p.y));
      scoreDelta[key] =
        older !== null && recent !== null ? round(recent - older) : null;
    } else {
      scoreDelta[key] = null;
    }
  }

  const spoken = turns.filter((t) => typeof t.metrics.wpm === "number");
  const wpmSeries = spoken.map((t, i) => ({
    x: i,
    y: t.metrics.wpm as number,
    label: shortDate(t.at),
  }));

  const totalWords = turns.reduce((n, t) => n + t.metrics.words, 0);
  const totalErrors = turns.reduce((n, t) => n + t.coaching.errors.length, 0);
  const totalFillers = turns.reduce((n, t) => n + t.metrics.fillerCount, 0);

  // Errors per 100 words, as a running figure per turn — the single best "am I
  // getting better?" line, because it is normalised for answer length.
  const errorsSeries = turns.map((t, i) => ({
    x: i,
    y: t.metrics.words > 0 ? (t.coaching.errors.length / t.metrics.words) * 100 : 0,
    label: shortDate(t.at),
  }));

  const fillerTotals = new Map<string, number>();
  for (const t of turns) {
    for (const f of t.metrics.fillers) {
      fillerTotals.set(f.term, (fillerTotals.get(f.term) ?? 0) + f.count);
    }
  }
  const topFillers: BarDatum[] = [...fillerTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));

  // Patterns, with a trend computed from the two halves of the window.
  const mid = Math.floor(turns.length / 2);
  const olderTurns = turns.slice(0, mid);
  const recentTurns = turns.slice(mid);

  const patternAgg = new Map<
    string,
    { total: number; older: number; recent: number; example: string; type: string }
  >();

  const tally = (bucket: TurnRecord[], field: "older" | "recent") => {
    for (const t of bucket) {
      for (const err of t.coaching.errors) {
        const key = patternKey(err.type, err.why);
        const entry = patternAgg.get(key) ?? {
          total: 0,
          older: 0,
          recent: 0,
          example: `${err.original} → ${err.fix}`,
          type: err.type,
        };
        entry.total += 1;
        entry[field] += 1;
        patternAgg.set(key, entry);
      }
    }
  };
  tally(olderTurns, "older");
  tally(recentTurns, "recent");

  const patterns: PatternRow[] = [...patternAgg.entries()]
    .map(([key, agg]) => {
      const { status, tone } = trendFor(
        agg.older,
        olderTurns.length,
        agg.recent,
        recentTurns.length,
        agg.total
      );
      // The stored key is "type: why" — show the explanation, badge the type separately.
      const why = key.slice(key.indexOf(":") + 1).trim();
      return {
        label: why,
        sublabel: agg.type.replace(/_/g, " "),
        value: agg.total,
        tone,
        status,
        example: agg.example,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const scenarioHits = new Map<string, number>();
  for (const t of turns) {
    scenarioHits.set(t.scenarioId, (scenarioHits.get(t.scenarioId) ?? 0) + 1);
  }
  const scenarioCoverage: BarDatum[] = SCENARIOS.map((s) => {
    const value = scenarioHits.get(s.id) ?? 0;
    const tone: Tone = value === 0 ? "muted" : "neutral";
    return {
      label: s.label,
      value,
      tone,
      sublabel: value === 0 ? "never practised" : undefined,
    };
  }).sort((a, b) => b.value - a.value);

  return {
    empty,
    totalTurns: turns.length,
    spokenTurns: spoken.length,
    firstAt: turns[0]?.at ?? null,
    lastAt: turns[turns.length - 1]?.at ?? null,
    avgScores,
    scoreSeries,
    scoreDelta,
    wpmSeries,
    avgWpm: round(mean(wpmSeries.map((p) => p.y)), 0),
    errorsPer100: totalWords > 0 ? round((totalErrors / totalWords) * 100) : null,
    errorsSeries,
    fillersPer100: totalWords > 0 ? round((totalFillers / totalWords) * 100) : null,
    topFillers,
    patterns,
    scenarioCoverage,
  };
}
