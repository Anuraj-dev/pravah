import { memo, useEffect, useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { colors } from "../theme/tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * Soft "silk ribbon" background.
 *
 * Why this is built from soft blobs instead of a filled band:
 * a band has rails, and a rail is only soft if a gradient reaches zero exactly
 * on it. On a curved, tapering band that stops being true (see the notes in the
 * task). Here there are no rails at all. Each ribbon is a chain of overlapping
 * circles that share ONE radial gradient fading to 0 at the circle's edge, so
 * every edge is soft by construction. Blob spacing is proportional to blob
 * radius, so the ridge brightness stays constant while the ribbon tapers.
 *
 * No filters, no masks, no animated path data. Geometry is computed once per
 * screen size; motion is a slow transform drift on the whole layer, which the
 * compositor handles without re-rasterising the SVG.
 */

type Point = readonly [number, number];
type Curve = readonly [Point, Point, Point, Point];

type Chain = {
  /** blob radius as a multiple of the ribbon's local half-width */
  radius: number;
  /** sideways shift across the ribbon, in half-widths (+ = lower side) */
  offset: number;
  /** centre opacity of one blob */
  alpha: number;
  /** true = paler where the ribbon pinches */
  tapers: boolean;
};

type Ribbon = {
  id: string;
  /** cubic Bezier in screen fractions; ends sit off-screen on purpose */
  curve: Curve;
  /** half-width at the wide parts, as a fraction of screen width */
  halfWidth: number;
  /** half-width at the pinch, as a fraction of halfWidth */
  pinch: number;
  /** curve parameter where the ribbon is narrowest */
  pinchAt: number;
  chains: readonly Chain[];
  /** hairlines, as fractions of the local half-width from the centre line */
  lines: readonly number[];
  lineAlpha: number;
  /** drift amplitude in dp [x, y] and full back-and-forth period */
  drift: Point;
  periodMs: number;
};

type Blob = { key: string; cx: number; cy: number; r: number; a: number };
type Hairline = {
  key: string;
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** Global strength knob for all fills (1 = as designed). */
const INTENSITY = 1;
/** Extra canvas around the screen so drifting never exposes an edge. */
const PAD = 16;
/** Blob spacing along the curve, in blob radii. Lower = smoother, more nodes. */
const SPACING = 0.5;
const LINE_SAMPLES = 64;
const LINE_FROM = 0.1;
const LINE_TO = 0.92;

const BLOB_STOPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] as const;
const LINE_STOPS = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 1] as const;

const RIBBONS: readonly Ribbon[] = [
  {
    id: "silkTop",
    curve: [
      [-0.3, 0.08],
      [0.35, 0.22],
      [0.55, 0.42],
      [1.3, 0.44],
    ],
    halfWidth: 0.24,
    pinch: 0.25,
    pinchAt: 0.5,
    chains: [
      { radius: 1.9, offset: 0, alpha: 0.026, tapers: false }, // broad wash
      { radius: 1.0, offset: 0.35, alpha: 0.1, tapers: true }, // fold, lower side
      { radius: 0.6, offset: 0.15, alpha: 0.06, tapers: true }, // core
    ],
    lines: [-0.9, -0.75, -0.6, -0.45],
    lineAlpha: 0.3,
    drift: [7, 5],
    periodMs: 22_000,
  },
  {
    id: "silkBottom",
    curve: [
      [-0.3, 0.4],
      [0.28, 0.52],
      [0.45, 0.74],
      [1.3, 0.84],
    ],
    halfWidth: 0.26,
    pinch: 0.25,
    pinchAt: 0.55,
    chains: [
      { radius: 1.9, offset: 0, alpha: 0.026, tapers: false },
      { radius: 1.0, offset: 0.35, alpha: 0.1, tapers: true },
      { radius: 0.6, offset: 0.15, alpha: 0.06, tapers: true },
    ],
    lines: [-0.85, -0.7, -0.55],
    lineAlpha: 0.28,
    drift: [-7, -5],
    periodMs: 28_000,
  },
];

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const smooth = (v: number) => {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
};
const round = (v: number) => Math.round(v * 10) / 10;

function pointAt(curve: Curve, t: number, w: number, h: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    (a * curve[0][0] + b * curve[1][0] + c * curve[2][0] + d * curve[3][0]) * w,
    (a * curve[0][1] + b * curve[1][1] + c * curve[2][1] + d * curve[3][1]) * h,
  ];
}

function velocityAt(curve: Curve, t: number, w: number, h: number): Point {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return [
    (a * (curve[1][0] - curve[0][0]) +
      b * (curve[2][0] - curve[1][0]) +
      c * (curve[3][0] - curve[2][0])) *
      w,
    (a * (curve[1][1] - curve[0][1]) +
      b * (curve[2][1] - curve[1][1]) +
      c * (curve[3][1] - curve[2][1])) *
      h,
  ];
}

function halfWidthAt(ribbon: Ribbon, t: number, w: number): number {
  const span = Math.max(ribbon.pinchAt, 1 - ribbon.pinchAt);
  const k = smooth(Math.abs(t - ribbon.pinchAt) / span);
  return ribbon.halfWidth * w * (ribbon.pinch + (1 - ribbon.pinch) * k);
}

function envelopeAt(ribbon: Ribbon, t: number): number {
  return 0.6 + 0.4 * smooth(Math.abs(t - ribbon.pinchAt) / 0.5);
}

function buildBlobs(
  ribbon: Ribbon,
  chain: Chain,
  chainIndex: number,
  w: number,
  h: number,
): Blob[] {
  const blobs: Blob[] = [];
  let t = -0.02;
  for (let i = 0; i < 400 && t < 1.02; i += 1) {
    const tc = clamp01(t);
    const [x, y] = pointAt(ribbon.curve, t, w, h);
    const [vx, vy] = velocityAt(ribbon.curve, tc, w, h);
    const speed = Math.max(Math.hypot(vx, vy), 1);
    const half = halfWidthAt(ribbon, tc, w);
    const r = chain.radius * half;
    const cx = x - (vy / speed) * half * chain.offset;
    const cy = y + (vx / speed) * half * chain.offset;
    const onScreen =
      cx + r > -PAD && cx - r < w + PAD && cy + r > -PAD && cy - r < h + PAD;
    if (onScreen) {
      const env = chain.tapers ? envelopeAt(ribbon, tc) : 1;
      blobs.push({
        key: `${chainIndex}:${i}`,
        cx: round(cx),
        cy: round(cy),
        r: round(r),
        a: Math.min(chain.alpha * env * INTENSITY, 1),
      });
    }
    t += (SPACING * r) / speed;
  }
  return blobs;
}

function buildHairline(
  ribbon: Ribbon,
  shift: number,
  index: number,
  w: number,
  h: number,
): Hairline {
  let d = "";
  let first: Point = [0, 0];
  let last: Point = [0, 0];
  for (let i = 0; i <= LINE_SAMPLES; i += 1) {
    const t = LINE_FROM + ((LINE_TO - LINE_FROM) * i) / LINE_SAMPLES;
    const [x, y] = pointAt(ribbon.curve, t, w, h);
    const [vx, vy] = velocityAt(ribbon.curve, t, w, h);
    const speed = Math.max(Math.hypot(vx, vy), 1);
    const half = halfWidthAt(ribbon, t, w) * shift;
    const px = round(x - (vy / speed) * half);
    const py = round(y + (vx / speed) * half);
    d += `${i === 0 ? "M" : "L"} ${px} ${py} `;
    if (i === 0) first = [px, py];
    last = [px, py];
  }
  return {
    key: `${ribbon.id}Line${index}`,
    d,
    x1: first[0],
    y1: first[1],
    x2: last[0],
    y2: last[1],
  };
}

const SilkRibbon = memo(function SilkRibbon({ ribbon }: { ribbon: Ribbon }) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const phase = useSharedValue(0.5);
  const [driftX, driftY] = ribbon.drift;

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(phase);
      phase.value = 0.5;
      return undefined;
    }
    phase.value = withRepeat(
      withTiming(1, {
        duration: ribbon.periodMs,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    return () => cancelAnimation(phase);
  }, [phase, reducedMotion, ribbon.periodMs]);

  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(phase.value, [0, 1], [-driftX, driftX]) },
      { translateY: interpolate(phase.value, [0, 1], [driftY, -driftY]) },
    ],
  }));

  const { blobs, hairlines } = useMemo(
    () => ({
      blobs: ribbon.chains.flatMap((chain, index) =>
        buildBlobs(ribbon, chain, index, width, height),
      ),
      hairlines: ribbon.lines.map((shift, index) =>
        buildHairline(ribbon, shift, index, width, height),
      ),
    }),
    [ribbon, width, height],
  );

  // Read at render time: colors.accent resolves per active palette.
  const tint = colors.accent;
  const blobId = `${ribbon.id}Blob`;
  const canvasW = width + PAD * 2;
  const canvasH = height + PAD * 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.layer,
        { left: -PAD, top: -PAD, width: canvasW, height: canvasH },
        driftStyle,
      ]}
    >
      <Svg
        width={canvasW}
        height={canvasH}
        viewBox={`${-PAD} ${-PAD} ${canvasW} ${canvasH}`}
      >
        <Defs>
          <RadialGradient id={blobId} cx="0.5" cy="0.5" r="0.5">
            {BLOB_STOPS.map((q) => (
              <Stop
                key={q}
                offset={q}
                stopColor={tint}
                stopOpacity={1 - smooth(q)}
              />
            ))}
          </RadialGradient>
          {hairlines.map((line) => (
            <LinearGradient
              key={line.key}
              id={line.key}
              gradientUnits="userSpaceOnUse"
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
            >
              {LINE_STOPS.map((q) => (
                <Stop
                  key={q}
                  offset={q}
                  stopColor={tint}
                  stopOpacity={
                    ribbon.lineAlpha *
                    Math.min(smooth(q / 0.3), smooth((1 - q) / 0.3))
                  }
                />
              ))}
            </LinearGradient>
          ))}
        </Defs>
        {blobs.map((blob) => (
          <Circle
            key={blob.key}
            cx={blob.cx}
            cy={blob.cy}
            r={blob.r}
            fill={`url(#${blobId})`}
            fillOpacity={blob.a}
          />
        ))}
        {hairlines.map((line) => (
          <Path
            key={line.key}
            d={line.d}
            fill="none"
            stroke={`url(#${line.key})`}
            strokeWidth={1}
          />
        ))}
      </Svg>
    </Animated.View>
  );
});

export function SoftWaveField() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      {RIBBONS.map((ribbon) => (
        <SilkRibbon key={ribbon.id} ribbon={ribbon} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  layer: { position: "absolute" },
});
