"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VIZ } from "./tokens";
import type { Point } from "@/core/analytics";

/** Measures the container so marks render in real pixels and never get stretched. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

export interface Band {
  from: number;
  to: number;
  label: string;
}

interface Props {
  points: Point[];
  /** Fixed y domain. Omit either end to derive it from the data. */
  yMin?: number;
  yMax?: number;
  /** A shaded "healthy range" behind the line, e.g. meeting pace. */
  band?: Band;
  height?: number;
  format?: (n: number) => string;
  /** Lower values are better (errors, fillers) — flips the trend wording. */
  lowerIsBetter?: boolean;
}

const PAD = { top: 10, right: 10, bottom: 18, left: 30 };

export function Sparkline({
  points,
  yMin,
  yMax,
  band,
  height = 120,
  format = (n) => String(Math.round(n * 10) / 10),
}: Props) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);

  const values = points.map((p) => p.y);
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 1;

  const lo = yMin ?? Math.min(dataMin, band ? band.from : dataMin);
  const hiRaw = yMax ?? Math.max(dataMax, band ? band.to : dataMax);
  const hi = hiRaw === lo ? lo + 1 : hiRaw;

  const xAt = useCallback(
    (i: number) =>
      PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW),
    [plotW, points.length]
  );
  const yAt = useCallback(
    (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH,
    [plotH, lo, hi]
  );

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (!points.length || plotW <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left - PAD.left;
    const ratio = Math.max(0, Math.min(1, rel / plotW));
    setHover(Math.round(ratio * (points.length - 1)));
  };

  if (!points.length) {
    return (
      <div
        ref={ref}
        style={{ height }}
        className="flex items-center justify-center text-xs"
      >
        <span style={{ color: VIZ.textMuted }}>No data yet</span>
      </div>
    );
  }

  const line = points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(" ");
  const last = points[points.length - 1];
  const active = hover !== null ? points[hover] : null;

  // Three recessive gridlines, solid hairlines one shade off the surface.
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img">
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke={i === 0 ? VIZ.baseline : VIZ.grid}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={yAt(t) + 3}
                textAnchor="end"
                fontSize={9}
                fill={VIZ.textMuted}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {format(t)}
              </text>
            </g>
          ))}

          {band && (
            <rect
              x={PAD.left}
              y={yAt(band.to)}
              width={plotW}
              height={Math.max(0, yAt(band.from) - yAt(band.to))}
              fill={VIZ.series1}
              opacity={0.08}
            />
          )}

          {points.length > 1 && (
            <polyline
              points={line}
              fill="none"
              stroke={VIZ.series1}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Endpoint only — never a number on every point. 2px surface ring. */}
          <circle
            cx={xAt(points.length - 1)}
            cy={yAt(last.y)}
            r={4}
            fill={VIZ.series1}
            stroke={VIZ.surface}
            strokeWidth={2}
          />

          {active && hover !== null && (
            <g>
              <line
                x1={xAt(hover)}
                x2={xAt(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke={VIZ.baseline}
                strokeWidth={1}
              />
              <circle
                cx={xAt(hover)}
                cy={yAt(active.y)}
                r={4}
                fill={VIZ.series1}
                stroke={VIZ.surface}
                strokeWidth={2}
              />
            </g>
          )}

          <text
            x={PAD.left}
            y={height - 5}
            fontSize={9}
            fill={VIZ.textMuted}
          >
            {points[0].label}
          </text>
          {points.length > 1 && (
            <text
              x={width - PAD.right}
              y={height - 5}
              textAnchor="end"
              fontSize={9}
              fill={VIZ.textMuted}
            >
              {last.label}
            </text>
          )}

          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}

      {active && hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded border px-2 py-1 text-[11px]"
          style={{
            left: Math.min(Math.max(xAt(hover) - 40, 0), Math.max(0, width - 92)),
            top: 0,
            background: VIZ.surface,
            borderColor: VIZ.border,
            color: VIZ.textPrimary,
          }}
        >
          <span style={{ color: VIZ.textSecondary }}>{active.label}</span>
          {"  "}
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {format(active.y)}
          </span>
        </div>
      )}
    </div>
  );
}
