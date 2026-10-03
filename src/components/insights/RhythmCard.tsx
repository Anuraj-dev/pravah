import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BarChartIcon, LineChartIcon } from "../ui/icons";
import { Segmented } from "../ui/Segmented";
import { monotoneLinePath, areaPath, type Pt } from "../../lib/chartGeometry";
import { useMotion } from "../../lib/motion";

// Web port of the mobile Rhythm card: weekday/hour completion distribution as
// bars (rounded at the data end only) or a monotone line, with the median
// cycle time in the footer. "A few more completions and this fills in." while
// the window is too thin to read.

const CHART_H = 148;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// getDay() order (Sun-first) rearranged to Mon-first for display.
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const HOUR_TICKS = ["12a", "6a", "12p", "6p", "11p"];

function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function RhythmCardBody({
  weekdayCounts,
  hourCounts,
  medianCycle,
  completionsInRange,
}: {
  weekdayCounts: number[];
  hourCounts: number[];
  medianCycle: number | null;
  completionsInRange: number;
}) {
  const [metric, setMetric] = useState<"weekday" | "hour">("weekday");
  const [shape, setShape] = useState<"bars" | "line">("bars");
  const transition = useMotion({ duration: 0.36, ease: [0.16, 1, 0.3, 1] });
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();

  const values = useMemo(() => {
    if (metric === "weekday") return MON_FIRST.map((dayIndex) => weekdayCounts[dayIndex] ?? 0);
    return hourCounts;
  }, [hourCounts, metric, weekdayCounts]);

  const max = Math.max(...values, 1);
  const peakIndex = values.indexOf(Math.max(...values));
  const lowData = completionsInRange < 3;

  const lineD = useMemo(() => {
    if (width <= 0 || values.length < 2) return "";
    const innerH = CHART_H - 6;
    const pts: Pt[] = values.map((v, i) => ({
      x: (i / (values.length - 1)) * width,
      y: innerH - (v / max) * (innerH - 8) - 4,
    }));
    return monotoneLinePath(pts);
  }, [max, values, width]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          ariaLabel="Rhythm metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "weekday", label: "When you finish" },
            { value: "hour", label: "Focus by hour" },
          ]}
        />
        <div
          role="group"
          aria-label="Chart shape"
          className="flex gap-1"
        >
          {([
            ["bars", BarChartIcon, "Bar chart"],
            ["line", LineChartIcon, "Line chart"],
          ] as const).map(([shapeValue, Icon, label]) => (
            <button
              key={shapeValue}
              type="button"
              aria-label={label}
              aria-pressed={shape === shapeValue}
              onClick={() => setShape(shapeValue)}
              className="grid place-items-center rounded-[8px]"
              style={{
                width: 32,
                height: 32,
                border: `1px solid ${shape === shapeValue ? "rgba(var(--color-accent-primary-rgb), 0.4)" : "var(--color-border-subtle)"}`,
                background: shape === shapeValue ? "var(--color-accent-dim)" : "var(--color-bg-surface)",
                color: shape === shapeValue ? "var(--color-accent-primary)" : "var(--color-text-muted)",
                cursor: "pointer",
                transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <Icon size={15} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </div>

      {lowData ? (
        <div
          style={{
            height: CHART_H,
            marginTop: 14,
            display: "grid",
            placeItems: "center",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>
            A few more completions and this fills in.
          </p>
        </div>
      ) : (
        <div ref={ref} style={{ marginTop: 14 }}>
          <div style={{ position: "relative", height: CHART_H }}>
            {/* Gridlines */}
            {[0.25, 0.5, 0.75].map((fraction) => (
              <div
                key={fraction}
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: `${fraction * 100}%`,
                  borderTop: "1px dashed var(--color-line-subtle)",
                  opacity: 0.9,
                }}
              />
            ))}

            {shape === "bars" ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: metric === "weekday" ? 10 : 3 }}>
                {values.map((count, index) => {
                  const heightPct = (count / max) * 100;
                  const isPeak = index === peakIndex && count > 0;
                  return (
                    <motion.div
                      key={`${metric}-${index}`}
                      initial={{ height: 0 }}
                      animate={{ height: count > 0 ? `${Math.max(heightPct, 3)}%` : 3 }}
                      transition={transition}
                      style={{
                        flex: 1,
                        borderRadius: "4px 4px 0 0",
                        background: count > 0 ? "var(--color-accent-primary)" : "var(--color-fill-faint)",
                        opacity: count > 0 && !isPeak ? 0.82 : 1,
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              width > 0 && (
                <svg
                  width="100%"
                  height={CHART_H}
                  viewBox={`0 0 ${width} ${CHART_H}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={metric === "weekday" ? "Completions by weekday" : "Completions by hour"}
                >
                  <defs>
                    <linearGradient id="rhythm-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent-primary)" stopOpacity="0.14" />
                      <stop offset="100%" stopColor="var(--color-accent-primary)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {lineD && <path d={areaPath(lineD, 0, width, CHART_H - 6)} fill="url(#rhythm-area)" />}
                  {lineD && <path d={lineD} fill="none" stroke="var(--color-accent-primary)" strokeWidth={2} strokeLinecap="round" />}
                </svg>
              )
            )}
          </div>

          {/* Axis labels */}
          {metric === "weekday" ? (
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              {WEEKDAY_LABELS.map((label, index) => {
                const isPeak = index === peakIndex && values[index] > 0;
                return (
                  <span
                    key={label}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      fontSize: 9,
                      fontFamily: "var(--font-mono)",
                      letterSpacing: 0.5,
                      color: isPeak ? "var(--color-accent-primary)" : "var(--color-text-dim)",
                      fontWeight: isPeak ? 600 : 400,
                    }}
                  >
                    {label.slice(0, 3).toUpperCase()}
                  </span>
                );
              })}
            </div>
          ) : (
            <div aria-hidden style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              {HOUR_TICKS.map((tick) => (
                <span
                  key={tick}
                  className="tabular"
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: 0.5,
                    color: "var(--color-text-dim)",
                  }}
                >
                  {tick}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer: median cycle time */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}>Median cycle time</span>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          <span
            className="tabular"
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: -0.1,
              color: medianCycle === null ? "var(--color-text-dim)" : "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {medianCycle === null ? "—" : medianCycle < 1 ? `${Math.round(medianCycle * 24)}h` : `${medianCycle.toFixed(1)}d`}
          </span>
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: 0.6, color: "var(--color-text-dim)", textTransform: "uppercase" }}>
            {medianCycle === null ? "not enough data" : "added → done"}
          </span>
        </span>
      </div>
    </div>
  );
}
