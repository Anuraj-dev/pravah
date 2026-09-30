# Ambient Backgrounds

How the soft "silk ribbon" background on the auth screen works, why it is built
from blob chains rather than filled bands, and which approaches were tried and
rejected. Read this before changing `src/components/SoftWaveField.tsx`.

Component: `src/components/SoftWaveField.tsx`
Consumer: `src/components/MobileAuthScreen.tsx`

## What it does

Three wide ribbons sweep diagonally across the auth screen. Each fades in and
out along its length, carries a few thin hairlines, and drifts slowly. Geometry
is computed once per screen size; motion is a `transform: translate` on the
whole layer, so the SVG rasterises once and never re-rasterises.

The layer is `pointerEvents="none"` and sits directly behind the brand mark,
wordmark, and sign-in button.

## The core constraint: soft edges vs. curvature

This is the thing that shapes the whole design, and the thing most likely to
be re-broken by a well-meaning refactor.

A filled band has **rails** — its two long edges. A rail is only soft if a
gradient reaches exactly zero alpha *on* the rail. The obvious way to get soft
rails is a `LinearGradient` laid perpendicular to the band's axis. That pairing
is exact for a **straight** band: rails sit on the gradient's zero-opacity ends
at every angle, so no edge can ever resolve into a notch.

It stops being exact the moment the band is **curved**. A rail's distance from
that gradient axis is `bow(t) ± halfWidth`, and `bow(t)` varies along a curve,
so somewhere on every band a rail picks up partial alpha and renders as a hard
crease. Holding it clean requires `bow ≤ 0.14 × halfWidth`, which is visually
indistinguishable from straight.

**How SoftWaveField sidesteps it: there are no rails.** Each ribbon is a chain
of overlapping `<Circle>`s that share one `RadialGradient` reaching zero at the
circle's edge (`BLOB_STOPS`, opacity `1 - smooth(q)`). Every edge is soft by
construction, and the ribbon is free to follow a real cubic Bézier. Blob spacing
is proportional to blob radius (`SPACING`), which keeps ridge brightness constant
while the ribbon tapers (`halfWidthAt`, `pinch`, `pinchAt`).

This also means curvature costs nothing and no filter or mask is required —
both of which are unreliable in `react-native-svg` on Android.

## Rejected approaches

Each was implemented and visually verified by rasterising real frames. Do not
re-attempt without new information.

- **Stacked copies of a bowed band** (draw one band N times at decreasing width
  and low alpha to fake a soft edge). Bands visibly. The nested edges are
  straight and parallel, so the eye reads the steps — still stepped at 6 layers
  × 3.2% alpha each. Rejected at 3, 6 and 8 layers.
- **A static gradient widened to absorb the drift.** Pushing the fade's zero
  point *outside* the rails is the opposite of what's needed; the rails then land
  mid-fade at roughly a third of peak alpha and read as a hard edge. If you need
  a gradient to follow a moving shape, animate the gradient — but note that is
  also why this design avoids it, since a static SVG is far cheaper on Android.
- **Non-integer phase multipliers** (`phase * 0.65`) leave the term part-way
  through a cycle at t = T, so the loop visibly snaps. Measured an 87px jump on
  a band whose entire amplitude was 49px. Only integer multiples loop
  seamlessly. `SoftWaveField` sidesteps this too: geometry is static and the
  drift ping-pongs, so there is no loop boundary at all.

## Things that will bite you

- **Never hardcode the accent.** `colors.accent` is a Proxy resolving at render
  time across **seven** accent palettes (purple, copper, teal, plum ×
  light/dark). `#6753c7` is only the purple one. `SoftWaveField` reads
  `colors.accent` once per render, before the `Stop` list is built, so theme
  changes apply.
- **Never bake alpha into `stopColor`.** `react-native-svg` reads a gradient
  stop's alpha from `stopOpacity`; an `rgba()` passed to `stopColor` is dropped
  and the fill renders fully opaque. Use the split form. This is also why the
  blobs must share one gradient keyed off each circle's own bounding box
  (`cx="0.5" cy="0.5" r="0.5"`, default `objectBoundingBox` units) rather than
  a `userSpaceOnUse` gradient.
- **Keep each ribbon's own `useSharedValue` inside its own component.** Calling
  hooks inside `.map()` trips `react-hooks/rules-of-hooks`. Do not silence it
  with an eslint-disable.
- **Reduced motion is a static equivalent, not a missing background.**
  `useReducedMotion()` cancels the animation and pins phase to 0.5, which puts
  drift at zero. A user with reduce-motion on sees the same layout as everyone
  else. See `docs/ux-orchestration.md` for the general rule.

## Verified state

Checked numerically or by rasterising frames:

- Loop is seamless by construction (static geometry + ping-pong drift).
- Wordmark contrast over both ribbons overlapping: **9.82:1** (AA needs 4.5).
- Button text across all eight accent palettes: **5.43–5.55:1** light,
  **7.39–9.97:1** dark. All pass AA.
- 178 static `Circle` nodes plus 7 hairline `Path`s. Static, so cost does not
  scale with frame rate.
- No SVG filters, no masks, no animated path data, no `AnimatedLinearGradient`.

Marginal: `textSecondary` on the tinted background is **4.43:1**, a hair under
AA. It only renders in the `hint` when `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is
missing — a broken-config state, not the normal path.

**Not yet verified on a physical device.** Worth a first look at: hairline
weight on a lower-DPI screen (they are 1px gradient strokes), and any jank
during drift. The Android risk profile is deliberately low — the only animated
property is a transform on a plain `Animated.View` — but it has not been
confirmed on hardware.

## Tuning

| Constant | Effect |
|---|---|
| `INTENSITY` | Global multiplier on all blob fills |
| `SPACING` | Blob spacing in blob radii. Lower = smoother, more nodes |
| `PAD` | Canvas overscan so drift never exposes an edge |
| `Ribbon.chains` | Layered washes per ribbon: `radius`, `offset`, `alpha`, `tapers` |
| `Ribbon.halfWidth` / `pinch` / `pinchAt` | Thickness profile and where it necks in |
| `Ribbon.lines` / `lineAlpha` | Hairline offsets as fractions of local half-width |
| `Ribbon.drift` / `periodMs` | Travel amplitude `[x, y]` and full back-and-forth period |

To preview offline without a device, port the geometry to a standalone SVG and
rasterise it. That is how the rejected approaches above were evaluated, and it
catches rail notches and banding that are hard to judge from constants alone.
Note the periods must stay non-commensurate so the composite field does not
visibly reset.
