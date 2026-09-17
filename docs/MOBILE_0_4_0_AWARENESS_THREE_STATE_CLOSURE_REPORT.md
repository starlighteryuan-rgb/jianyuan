# Mobile 0.4.0 Awareness Three-State Closure

## Scope

This report records the final Awareness implementation pass for Mobile `0.4.0`.
It covers only:

1. Awareness Main
2. New Awareness Result
3. Awareness Open
4. The design rules that now prevent these states from collapsing together again

Record, Understanding structure, Exploration, deletion behavior, Core semantics,
Provider contracts, and SQLite schema were not changed.

## Confirmed Decisions

### Awareness Main

Awareness Main keeps a stage, not an object:

- keep the center stage and quiet attention center;
- use a blurred, diffused tonal field;
- remove hard-edged circular outlines;
- do not use a solid dark disc;
- do not let a closed shape dominate the screen.

The intended meaning is "the space where awareness is about to happen", not
"a large circular object".

### New Awareness Result

The result of `开始一次觉察` is frozen as editorial text flow:

- no circle;
- no oval;
- no halo around the result;
- no large shape container;
- no object card;
- keep the hierarchy of "新的觉察", observation, time;
- allow only a very light focus line and subtle tonal emphasis.

The intended meaning is "一句被提炼出来的话", not "a large wrapped object".

### Awareness Open

Awareness Open keeps the Direction AB baseline:

- foreground reading logic;
- opened observation enters the foreground;
- surrounding content recedes;
- clear reading order;
- natural response area;
- no heavy card or heavy container.

## Design Rules

The following rules were written into the project design skill:

- `.agents/skills/jianyuan-mobile-design/SKILL.md`
- `.agents/skills/jianyuan-mobile-design/references/design-principles.md`
- `.agents/skills/jianyuan-mobile-design/references/frozen-ui.md`
- `.agents/skills/jianyuan-mobile-design/references/product-spaces.md`

The frozen rules are:

1. `Awareness Main ≠ New Awareness Result ≠ Awareness Open`
2. `Stage ≠ Object`
3. `Observation Is Not Object`
4. Awareness Main may keep a blurred stage / halo atmosphere
5. New Awareness Result must be editorial text flow, never a circle, oval, or object container
6. Awareness Open keeps the AB foreground reading logic
7. Never return to a track-shaped outline, a solid dark circle, or text incorrectly enclosed by an object

## Version

Mobile user-visible version remains `0.4.0`.

- Expo version: `0.4.0`
- iOS build number: `2`
- Android versionCode: `2`
- Settings / About visible value: `0.4.0`

## Verification

Verification is recorded in the final thread response after the full matrix runs.
