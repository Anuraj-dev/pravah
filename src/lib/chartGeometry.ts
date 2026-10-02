/**
 * Web port of apps/mobile/src/lib/chartGeometry.ts (same monotone-cubic math,
 * minus the reanimated worklet directives). Turns a count series into SVG path
 * strings for the Progress hero chart.
 *
 * Interpolation is monotone cubic (Fritsch–Carlson / Steffen tangents), not
 * Catmull-Rom: for count data it never overshoots between points, so a run
 * like [0, 0, 5] cannot draw a fake negative dip before the rise.
 */

export type Pt = { x: number; y: number };

const sgn = (x: number): number => (x < 0 ? -1 : 1);

/** Fritsch–Carlson / Steffen monotone tangents. Never overshoots. */
function monotoneTangents(pts: Pt[]): number[] {
  const n = pts.length;
  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = pts[i + 1].x - pts[i].x;
    s[i] = h[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / h[i];
  }
  const m = new Array<number>(n);
  m[0] = s[0];
  m[n - 1] = s[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const s0 = s[i - 1];
    const s1 = s[i];
    if (s0 * s1 <= 0) {
      // Local extremum → flat tangent. This is the anti-overshoot guarantee.
      m[i] = 0;
    } else {
      const p = (s0 * h[i] + s1 * h[i - 1]) / (h[i - 1] + h[i]);
      m[i] = (sgn(s0) + sgn(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p));
    }
  }
  return m;
}

/** Round to 2dp to keep `d` strings compact without visible precision loss. */
function r(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Monotone-cubic SVG path (`M … C …`) through points with x ascending.
 * Degenerate inputs fall back to a move / straight line so callers never get
 * an empty `d` for 1–2 points.
 */
export function monotoneLinePath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${r(pts[0].x)},${r(pts[0].y)}`;
  if (pts.length === 2) return `M${r(pts[0].x)},${r(pts[0].y)}L${r(pts[1].x)},${r(pts[1].y)}`;
  const m = monotoneTangents(pts);
  let d = `M${r(pts[0].x)},${r(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dx = (p1.x - p0.x) / 3;
    d +=
      `C${r(p0.x + dx)},${r(p0.y + dx * m[i])} ` +
      `${r(p1.x - dx)},${r(p1.y - dx * m[i + 1])} ${r(p1.x)},${r(p1.y)}`;
  }
  return d;
}

/**
 * Close a line path into a filled area by dropping to the baseline under the
 * last point, running back along the baseline, and closing.
 */
export function areaPath(line: string, firstX: number, lastX: number, baselineY: number): string {
  if (!line) return "";
  return `${line}L${r(lastX)},${r(baselineY)}L${r(firstX)},${r(baselineY)}Z`;
}

/**
 * Index of the point whose x is nearest to `x`, with `x` clamped into the
 * domain first (a pointer dragged past the chart edge reads the end day).
 * Binary search, so it tolerates non-uniform spacing; midpoint ties resolve
 * to the lower index.
 */
export function nearestIndex(xs: number[], x: number): number {
  const n = xs.length;
  if (n === 0) return -1;
  const clamped = Math.max(xs[0], Math.min(x, xs[n - 1]));
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < clamped) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1] - clamped) <= Math.abs(xs[lo] - clamped)) {
    lo -= 1;
  }
  return lo;
}

/**
 * Describe the same days twice — once per range window — so switching range is
 * a single per-point interpolation instead of a crossfade. Both windows end
 * today, so today is the anchor: pin it to the right edge and a wider window
 * is literally a zoom-out. Point count never changes (both states lay out over
 * the union of days; days outside a window get negative x, off-screen by
 * construction).
 */
export function anchoredMorph(
  prev: number[],
  next: number[],
  { width, padTop, innerH }: { width: number; padTop: number; innerH: number },
) {
  const union = prev.length >= next.length ? prev : next;
  const n = union.length;

  const state = (s: number[]) => {
    const m = s.length;
    let max = 1;
    for (const v of s) max = Math.max(max, v);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const dayOffset = n - 1 - i;
      xs.push(m > 1 ? width - (dayOffset / (m - 1)) * width : width / 2);
      const v = dayOffset <= m - 1 ? s[m - 1 - dayOffset] : union[i];
      ys.push(padTop + innerH - (v / max) * (innerH - 2));
    }
    return { xs, ys };
  };

  const a = state(prev);
  const b = state(next);
  return { fromXs: a.xs, fromYs: a.ys, toXs: b.xs, toYs: b.ys };
}
