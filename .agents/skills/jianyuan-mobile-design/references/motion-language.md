# Motion Language

Motion in 见渊 is not decoration. It is the visible form of a state change.
Read this before designing or changing any animation.

## The four semantic verbs

- **settle (落下)** — Record. What the user wrote lands. Motion moves downward or
  inward to rest, quickly and quietly. It confirms capture, not achievement.
- **surface (浮现)** — Awareness. Something worth noticing floats up. This is the
  most deliberate motion in the product: a light gather, a shape forming, text
  arriving, and a ripple dissipating. Never a bounce, never a pulse loop.
- **sink (沉淀)** — Understanding. The user's own thinking settles into place,
  more stable and slower than Record, without celebrating itself.
- **connect (连接)** — Exploration. Long-term relations gradually form. Motion
  should suggest relationship and structure, never assert a confirmed fact.

## Timing reference

- fast: 120–180 ms
- normal: 200–300 ms
- slow: 320–450 ms

These are reference points, not mechanical law. Real-device feel wins.

## Frozen timing

Awareness Bubble emergence has been accepted on a real device:

- Bubble: about 520 ms
- content: about 420 ms
- ripple: about 820 ms

Treat this as frozen. Do not speed it up or restructure it without an explicit
user request.

## Layering and sequencing

Motion should have time hierarchy, not all properties arriving together. For
Awareness, the intended order is: a light gather → the Bubble takes shape → the
core text gradually appears → the ripple slowly dissipates.

## Do not

- big springs, overshoot, or bounce;
- continuous pulsing;
- high-frequency ripple;
- flashy or attention-seeking effects;
- motion that implies the system is judging or pushing the user.

## Reduce Motion

Follow the iOS system Reduce Motion setting. It is not an in-app toggle.

When Reduce Motion is on: reduce large scale changes, large spatial movement,
and ripple movement; keep fade, emphasis changes, and simplified opacity
transitions. Do not disable the functionality that the motion was
communicating. Reduce Motion must not break navigation, save feedback, or state.

## Motion and accessibility

Motion must not be the only carrier of a state change. Always pair it with a
stable text or shape cue, so the meaning survives when motion is reduced.
