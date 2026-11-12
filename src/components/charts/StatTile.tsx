"use client";

import { VIZ } from "./tokens";

interface Props {
  label: string;
  value: string;
  unit?: string;
  /** Signed change. Pass lowerIsBetter when a fall is the good direction. */
  delta?: number | null;
  lowerIsBetter?: boolean;
  deltaSuffix?: string;
  hint?: string;
}

/**
 * When the story is one number, a tile beats a chart. Proportional figures on purpose —
 * tabular-nums makes large standalone numbers look loose.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  lowerIsBetter = false,
  deltaSuffix = "",
  hint,
}: Props) {
  const hasDelta = typeof delta === "number" && delta !== 0;
  const improving = hasDelta && (lowerIsBetter ? delta < 0 : delta > 0);

  return (
    <div
      className="rounded-lg border p-3"
      style={{ background: VIZ.surface, borderColor: VIZ.border }}
    >
      <p
        className="text-[10px] uppercase tracking-wide"
        style={{ color: VIZ.textMuted }}
      >
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span
          className="text-2xl font-semibold leading-none"
          style={{ color: VIZ.textPrimary }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs" style={{ color: VIZ.textMuted }}>
            {unit}
          </span>
        )}
      </p>
      {hasDelta && (
        <p
          className="mt-1.5 flex items-center gap-1 text-[11px]"
          style={{ color: improving ? VIZ.deltaGood : VIZ.deltaBad }}
        >
          <span aria-hidden="true">{delta > 0 ? "▲" : "▼"}</span>
          <span>
            {delta > 0 ? "+" : ""}
            {delta}
            {deltaSuffix} {improving ? "better" : "worse"}
          </span>
        </p>
      )}
      {hint && !hasDelta && (
        <p className="mt-1.5 text-[11px]" style={{ color: VIZ.textMuted }}>
          {hint}
        </p>
      )}
    </div>
  );
}
