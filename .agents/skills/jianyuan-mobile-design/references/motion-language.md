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

## Awareness motion is emergence, not object entry

Awareness Result is text-first. Its motion should make a sentence feel noticed,
not make a card or bubble appear.

Use:

- a quiet fade;
- a small, low-distance rise;
- focus-line emphasis;
- a soft tonal shift.

Do not use:

- scale-in cards;
- springs or overshoot;
- object-like entrance motion;
- a closed container drawing itself around the text.

Awareness Main may keep a very light stage / halo / center focus, but motion must
not make that stage read as a bubble or object. The stage is an atmosphere, not
the thing being animated into existence.

## Timing reference

- fast: 120–180 ms
- normal: 200–300 ms
- slow: 320–450 ms

These are reference points, not mechanical law. Real-device feel wins.

## Frozen timing

Awareness Bubble emergence has been accepted on a real device for automatic
Awareness entries:

- Bubble: about 520 ms
- content: about 420 ms
- ripple: about 820 ms

Treat this as frozen. Do not speed it up or restructure it without an explicit
user request. The text-first manual Result may reuse the emergence timing without
reusing the Bubble object shape.

## Layering and sequencing

Motion should have time hierarchy, not all properties arriving together. For
Awareness, the intended order is: a light gather → the observation emerges → the
core text gradually appears → any ripple slowly dissipates.

## Do not

- big springs, overshoot, or bounce;
- continuous pulsing;
- high-frequency ripple;
- flashy or attention-seeking effects;
- motion that implies the system is judging or pushing the user;
- motion that turns an Observation into a card, bubble, or object shell.

## Reduce Motion

Follow the iOS system Reduce Motion setting. It is not an in-app toggle.

When Reduce Motion is on: reduce large scale changes, large spatial movement,
and ripple movement; keep fade, emphasis changes, and simplified opacity
transitions. Do not disable the functionality that the motion was
communicating. Reduce Motion must not break navigation, save feedback, or state.

## Motion and accessibility

Motion must not be the only carrier of a state change. Always pair it with a
stable text or shape cue, so the meaning survives when motion is reduced.
