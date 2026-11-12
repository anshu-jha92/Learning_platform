/**
 * Chart tokens.
 *
 * Light theme. Every chart in this dashboard plots a SINGLE series, so the categorical
 * palette is one slot — validated against the card surface the charts actually sit on:
 *
 *   validate_palette.js "#4f46e5" --mode light --surface "#ffffff"  -> ALL CHECKS PASS
 *
 * Brand indigo, the same value globals.css uses. These mirror the semantic CSS tokens, so the chart chrome and the UI
 * chrome are the same colours rather than two sets that nearly match.
 */

export const VIZ = {
  surface: "#ffffff",
  textPrimary: "#14141f",
  textSecondary: "#4a4a5e",
  textMuted: "#8787a0",
  grid: "#e6e6f0",
  baseline: "#c9c9da",
  border: "rgba(20,20,31,0.10)",

  /** Categorical slot 1 — the only series hue used. */
  series1: "#4f46e5",

  /**
   * Status palette, fixed and never themed. On a light surface `warning` sits below 3:1
   * by design; the icon-plus-label pairing is the documented mitigation, which is why
   * these are used for MARKS and glyphs only — never for the label text itself.
   */
  status: {
    good: "#0ca30c",
    warning: "#fab219",
    critical: "#d03b3b",
  },

  /** Delta text, where a colour genuinely reads as direction. Both clear 3:1 on white. */
  deltaGood: "#006300",
  deltaBad: "#d03b3b",
} as const;

export type Tone = "neutral" | "good" | "warning" | "critical" | "muted";

export function toneColor(tone: Tone = "neutral"): string {
  switch (tone) {
    case "good":
      return VIZ.status.good;
    case "warning":
      return VIZ.status.warning;
    case "critical":
      return VIZ.status.critical;
    case "muted":
      return VIZ.baseline;
    default:
      return VIZ.series1;
  }
}

/** Status marks pair an icon with the label so colour never carries meaning alone. */
export function toneGlyph(tone: Tone = "neutral"): string {
  switch (tone) {
    case "good":
      return "✓";
    case "warning":
      return "●";
    case "critical":
      return "▲";
    default:
      return "○";
  }
}
