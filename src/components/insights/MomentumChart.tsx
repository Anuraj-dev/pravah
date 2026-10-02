import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { anchoredMorph, areaPath, monotoneLinePath, nearestIndex, type Pt } from "../../lib/chartGeometry";

// Web port of the mobile Progress hero chart: monotone-cubic accent line with
// a fading area fill, dotted baseline, a 28px y gutter, and a hover scrub with
// crosshair + readout pill. Switching range morphs the path between windows
// (anchored at today) instead of erasing and redrawing.

const HEIGHT = 168;
const PAD_TOP = 10;
const PAD_BOTTOM = 6;
const GUTTER = 28;

function tickLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getDate()} ${date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}`;
}

function readoutLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function MomentumChart({ series, days, now }: { series: number[]; days: number; now: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  const plotW = Math.max(0, width - GUTTER);
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // The observer's initial callback provides the first width measurement.
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const dates = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    return series.map((_, index) => start.getTime() + index * 86_400_000);
  }, [days, now, series]);

  // Static layout for the current window, derived in render.
  const staticPath = useMemo(() => {
    let max = 1;
    for (const v of series) max = Math.max(max, v);
    const pts: Pt[] = series.map((v, i) => ({
      x: series.length > 1 ? (i / (series.length - 1)) * plotW : plotW / 2,
      y: PAD_TOP + innerH - (v / max) * (innerH - 2),
    }));
    return monotoneLinePath(pts);
  }, [innerH, plotW, series]);

  // Range-switch morph: interpolate the laid-out points from the previous
  // window to the new one (anchored at today). The morph's path lives in
  // state only while the animation runs; outside it the static path renders.
  const [morphD, setMorphD] = useState<string | null>(null);
  const prevSeriesRef = useRef<number[] | null>(null);
  useEffect(() => {
    const prev = prevSeriesRef.current;
    prevSeriesRef.current = series;
    if (!prev || prev === series || plotW <= 0 || reduceMotion) return;
    const morph = anchoredMorph(prev, series, { width: plotW, padTop: PAD_TOP, innerH });
    const controls = animate(0, 1, {
      duration: 0.36,
      ease: [0.45, 0, 0.55, 1],
      onUpdate: (t) => {
        const pts: Pt[] = morph.toXs.map((x, i) => ({
          x: morph.fromXs[i] + (x - morph.fromXs[i]) * t,
          y: morph.fromYs[i] + (morph.toYs[i] - morph.fromYs[i]) * t,
        }));
        setMorphD(monotoneLinePath(pts));
      },
      onComplete: () => setMorphD(null),
    });
    return () => controls.stop();
  }, [series, plotW, innerH, reduceMotion]);

  const pathD = morphD ?? staticPath;

  const { maxY, areaD } = useMemo(() => {
    let max = 1;
    for (const v of series) max = Math.max(max, v);
    const baseline = PAD_TOP + innerH;
    const firstX = series.length > 1 ? 0 : plotW / 2;
    const lastX = series.length > 1 ? plotW : plotW / 2;
    return { maxY: max, areaD: areaPath(pathD, firstX, lastX, baseline) };
  }, [pathD, plotW, series, innerH]);

  const baselineY = PAD_TOP + innerH;
  const dayTotal = series.reduce((sum, count) => sum + count, 0);

  const scrubXs = useMemo(
    () => series.map((_, i) => (series.length > 1 ? (i / (series.length - 1)) * plotW : plotW / 2)),
    [plotW, series]
  );

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (plotW <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - GUTTER;
    setHoverIdx(nearestIndex(scrubXs, x));
  };

  const hoverX = hoverIdx !== null ? scrubXs[hoverIdx] ?? null : null;
  const hoverCount = hoverIdx !== null ? series[hoverIdx] ?? 0 : 0;
  const hoverDate = hoverIdx !== null ? dates[hoverIdx] : undefined;

  return (
    <div
      ref={wrapRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverIdx(null)}
      style={{ position: "relative", display: "flex", gap: 4, marginTop: 18, touchAction: "none" }}
    >
      {/* Y gutter */}
      <div
        aria-hidden
        style={{
          width: GUTTER - 4,
          position: "relative",
          height: HEIGHT,
          flexShrink: 0,
        }}
      >
        {[
          { label: String(maxY), top: PAD_TOP - 5 },
          { label: String(Math.round(maxY / 2)), top: PAD_TOP + innerH / 2 - 5 },
          { label: "0", top: baselineY - 5 },
        ].map((tick) => (
          <span
            key={tick.label}
            className="tabular"
            style={{
              position: "absolute",
              right: 2,
              top: tick.top,
              fontSize: 8.5,
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-dim)",
              lineHeight: 1,
            }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        {plotW > 0 && (
          <svg width="100%" height={HEIGHT} viewBox={`0 0 ${plotW} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${dayTotal} tasks completed in the last ${days} days`}>
            <defs>
              <linearGradient id="momentum-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent-primary)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--color-accent-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaD && <path d={areaD} fill="url(#momentum-area)" />}
            <line
              x1={0}
              x2={plotW}
              y1={baselineY}
              y2={baselineY}
              stroke="var(--color-line)"
              strokeWidth={1.5}
              strokeDasharray="1 6"
              strokeLinecap="round"
              opacity={0.7}
            />
            {pathD && <path d={pathD} fill="none" stroke="var(--color-accent-primary)" strokeWidth={2} strokeLinecap="round" />}
            {hoverX !== null && (
              <g>
                <line
                  x1={hoverX}
                  x2={hoverX}
                  y1={PAD_TOP - 4}
                  y2={baselineY}
                  stroke="var(--color-accent-primary)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.7}
                />
                <circle
                  cx={hoverX}
                  cy={Math.min(Math.max(PAD_TOP, pathYAt(pathD, hoverX)), baselineY)}
                  r={4.5}
                  fill="var(--color-accent-primary)"
                  stroke="var(--color-bg-elevated)"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
        )}

        {/* X ticks: start / middle / end of the window */}
        {dates.length > 1 && (
          <div aria-hidden style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {[0, Math.floor((dates.length - 1) / 2), dates.length - 1].map((idx, position) => (
              <span
                key={position}
                className="tabular"
                style={{
                  fontSize: 8.5,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: 0.6,
                  color: "var(--color-text-dim)",
                }}
              >
                {tickLabel(dates[idx])}
              </span>
            ))}
          </div>
        )}

        {/* Scrub readout */}
        {hoverX !== null && hoverDate !== undefined && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: `clamp(52px, ${GUTTER + hoverX}px, calc(100% - 52px))`,
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              padding: "5px 10px",
              borderRadius: 6,
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-subtle)",
              boxShadow: "0 2px 8px rgba(44,33,24,0.1)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span className="tabular" style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", lineHeight: 1.2 }}>
              {hoverCount} done
            </span>
            <span className="tabular" style={{ fontSize: 8.5, fontFamily: "var(--font-mono)", letterSpacing: 0.6, color: "var(--color-text-dim)", textTransform: "uppercase" }}>
              {readoutLabel(hoverDate)}
            </span>
          </div>
        )}

        {dayTotal === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              margin: 0,
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            Momentum takes shape here.
          </motion.p>
        )}
      </div>
    </div>
  );
}

/** Y coordinate on the drawn path at a given x, via cubic Bezier inversion per segment. */
function pathYAt(d: string, x: number): number {
  const numbers = d.match(/-?\d+(\.\d+)?/g);
  if (!numbers) return PAD_TOP;
  const values = numbers.map(Number);
  // Walk M/C segments; each curve is [c1x c1y c2x c2y x y] after its start point.
  let startX = values[0];
  let startY = values[1];
  let i = 2;
  while (i + 5 < values.length) {
    const c1y = values[i + 1];
    const c2y = values[i + 3];
    const endX = values[i + 4];
    const endY = values[i + 5];
    if (x <= endX || i + 6 >= values.length) {
      const span = endX - startX;
      const t = span === 0 ? 0 : Math.min(1, Math.max(0, (x - startX) / span));
      const mt = 1 - t;
      const y =
        mt * mt * mt * startY +
        3 * mt * mt * t * c1y +
        3 * mt * t * t * c2y +
        t * t * t * endY;
      return y;
    }
    startX = endX;
    startY = endY;
    i += 6;
  }
  return startY;
}
