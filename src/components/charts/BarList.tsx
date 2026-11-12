"use client";

import { useState } from "react";
import { VIZ, toneColor, toneGlyph, type Tone } from "./tokens";

export interface BarRow {
  label: string;
  value: number;
  sublabel?: string;
  tone?: Tone;
  /** Extra line revealed on hover — never the only way to read the value. */
  detail?: string;
  /** Short state word shown beside the label, paired with an icon. */
  status?: string;
}

interface Props {
  rows: BarRow[];
  format?: (n: number) => string;
  emptyLabel?: string;
}

/**
 * Horizontal bars as plain elements rather than SVG: responsive for free, and the value
 * is always directly labeled so the hover detail stays an enhancement, never a gate.
 */
export function BarList({
  rows,
  format = (n) => String(n),
  emptyLabel = "Nothing recorded yet",
}: Props) {
  const [hover, setHover] = useState<number | null>(null);

  if (!rows.length) {
    return (
      <p className="py-6 text-center text-xs" style={{ color: VIZ.textMuted }}>
        {emptyLabel}
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row, i) => {
        const color = toneColor(row.tone);
        const pct = row.value > 0 ? Math.max((row.value / max) * 100, 1.5) : 0;

        return (
          <li
            key={`${row.label}-${i}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="rounded px-1 py-0.5 transition-colors"
            style={{ background: hover === i ? "rgba(20,20,31,0.04)" : "transparent" }}
          >
            <div className="flex items-baseline gap-2">
              {row.status && (
                <span
                  className="shrink-0 text-[10px]"
                  style={{ color }}
                  aria-hidden="true"
                >
                  {toneGlyph(row.tone)}
                </span>
              )}
              <span
                className="min-w-0 flex-1 truncate text-xs"
                style={{ color: VIZ.textPrimary }}
                title={row.label}
              >
                {row.label}
              </span>
              {row.status && (
                // Text wears a text token; the coloured glyph beside it carries the
                // state. On a light surface the warning amber is sub-3:1 as text.
                <span
                  className="shrink-0 text-[10px]"
                  style={{ color: VIZ.textSecondary }}
                >
                  {row.status}
                </span>
              )}
              <span
                className="shrink-0 text-xs"
                style={{ color: VIZ.textSecondary, fontVariantNumeric: "tabular-nums" }}
              >
                {format(row.value)}
              </span>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <div
                className="h-2 flex-1 overflow-hidden rounded-sm"
                style={{ background: "rgba(20,20,31,0.06)" }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${pct}%`,
                    background: color,
                    borderRadius: "0 4px 4px 0",
                  }}
                />
              </div>
            </div>

            {row.sublabel && (
              <p className="mt-0.5 text-[10px]" style={{ color: VIZ.textMuted }}>
                {row.sublabel}
              </p>
            )}
            {hover === i && row.detail && (
              <p className="mt-0.5 text-[10px]" style={{ color: VIZ.textSecondary }}>
                {row.detail}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
