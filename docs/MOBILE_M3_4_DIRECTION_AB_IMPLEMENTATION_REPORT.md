# Mobile M3.4 — Direction AB Implementation Report

Status: M3.4 DIRECTION AB MOBILE UI CODE COMPLETE — REAL DEVICE UX ACCEPTANCE PENDING

This round applies Direction AB to runtime Mobile UI. Direction AB was already
frozen as a design baseline; this document records the implementation and its
verification. It does not claim experience completion, because final acceptance
is still on a real iPhone.

## GLOBAL FIRST

The work followed Global First -> Spaces Second:

1. Direction AB design baseline commit
2. Global Visual Foundation
3. Record
4. Awareness
5. Understanding
6. Exploration
7. Cross-space validation, tests, production bundle, and this report

No runtime page was redesigned independently of the shared foundation, and no
Core, storage, Provider, Desktop, or Web semantics were changed.

## SHARED TOKENS

The shared token file is `apps/mobile/src/theme/tokens.ts`.

Direction AB keeps A as the visual identity and B2 as a capability layer:

- Light is warm paper / bone / limestone, with restrained copper.
- Dark is refined warm charcoal / smoke, not pure black and not luxury gold.
- Geometry is shared across themes; only colour values change.
- User writing roles stay at 16 px or above.
- `firstPerson` provides the deliberate Understanding anchor role.
- `DEPTH` defines the very small near / far scale and recede values.

New shared role families include:

- `divider`, `dividerWeak`, `connector`, `connectorStrong`, `focusIndicator`
- `tagBackground`, `tagBorder`, `tagText`, `tagSelectedBackground`
- `awarenessFill`, `awarenessEdge`, `awarenessHalo`, `awarenessRipple`
- `nearSurface`, `farSurface`
- `textFaint`, `warning`

The geometry scale now includes screen padding, section spacing, item spacing,
inline spacing, header spacing, and bottom-safe spacing. Radius is a small
scale: 6 / 10 / 14 / 18 / pill.

## SHARED SHELL

`apps/mobile/src/shell/app-shell.tsx` and
`apps/mobile/src/shell/local-search.tsx` were adapted to the AB foundation.

Preserved interaction contracts:

- header brand is `见渊`;
- search mode removes the brand and actions from layout;
- Awareness History remains a separate header entry;
- Bottom Tabs keep horizontal direction + fade motion;
- only the active space is mounted;
- search lifecycle and Provider idleness are unchanged.

Visual adaptation:

- header and tab divider use the shared weak divider role;
- the collapsed search control is a 44 pt touch target without an old chip-like
  border;
- the expanded search line keeps the accepted 236 x 38 logical geometry;
- selected tab emphasis is text + a small underline indicator rather than a
  scaling chip.

## RECORD

Files:

- `apps/mobile/src/spaces/record-space.tsx`

Implementation:

- composer is a quiet bottom-rule writing area, not a floating card;
- timeline is an editorial text stream with a left-side time rail;
- the newest visible Record is near; next items are mid; older items recede;
- recede uses contrast, opacity, spacing, and hairline tone, not shadow;
- expanded Record uses a left focus indicator and a tonal near surface;
- text remains the subject;
- tags use the shared low-emphasis tag roles;
- text search, tag search, tag persistence, save states, and local-first
  capture behaviour are unchanged.

## AWARENESS

Files:

- `apps/mobile/src/spaces/awareness-space.tsx`

Awareness Main:

- keeps the large quiet stage;
- keeps concentric halo / ripple identity;
- keeps a single current Awareness object;
- keeps the frozen emergence timings at 520 / 420 / 820 ms;
- B2 contributes only a very light background recede;
- does not become an inbox, card feed, or floating stack.

Awareness Open:

- keeps A's reading order: observation, explanation, provenance, response,
  free-text reflection, and boundary note;
- uses an upper boundary plus a tonal foreground surface;
- surrounding stage recedes instead of becoming an accordion;
- does not restore the heavy B2 response card.

Preserved behaviour:

- manual Awareness dedupe;
- `NO_OBSERVATION`;
- automatic Awareness;
- History movement;
- viewed persistence;
- Reflection save feedback and settlement;
- Relation / Evidence boundaries;
- search lifecycle.

## UNDERSTANDING

Files:

- `apps/mobile/src/spaces/understanding-space.tsx`

Implementation:

- Understanding is A-led;
- the first-person `我` is the visual anchor through the first-person type role
  and essay fragment layout;
- the current Reflection is nearer and stable;
- older Reflections recede through contrast and spacing, not stacked cards;
- source Records remain secondary;
- AI context never visually equals the user's own Reflection;
- relation and source expansion still use the existing read models and
  testIDs.

## EXPLORATION

Files:

- `apps/mobile/src/spaces/exploration-space.tsx`

Implementation:

- B2 contributes the spatial relation field;
- A contributes typography, hairline anchors, quiet connectors, and whitespace;
- source Records are distributed along a vertical relation axis rather than
  placed in rounded floating cards;
- the current relation uses restrained accent;
- older node anchors recede;
- the user's Reflection is the closing statement of the relation;
- the page states that this is a possible structure, not a conclusion;
- no drag, zoom, graph editing, or complex node controls were added.

## MOTION

No new timing regime was introduced.

- Tab navigation keeps directional horizontal movement + fade.
- Record keeps settle / focus semantics.
- Awareness keeps the frozen emergence and foreground-focus semantics.
- Understanding keeps quiet settle semantics.
- Exploration treats connection as structure becoming visible.
- Reduce Motion continues to collapse spatial movement and ripple while keeping
  state and fade information.

## ACCESSIBILITY AUDIT

Checked against `mobile-ui-ux-designer`:

- Dynamic Type: shared body, record, and reflection roles are 16 px or above and
  use line-height rather than clipping.
- Touch targets: the header actions, search action controls, submit actions,
  tag editor actions, history toggles, and Bottom Tab targets in the changed
  surfaces now use a 44 pt minimum hit area. Remaining small metadata labels
  are non-interactive, and the full app still requires real-device touch
  confirmation.
- Safe area: the shell still uses `SafeAreaView`; bottom padding moved to the
  shared `bottomSafe` role.
- Keyboard: the search render-mode contract is unchanged and keyboard
  dismissal remains the authoritative lifecycle signal.
- VoiceOver: existing accessibility roles and labels remain on interactive
  controls; the visual refactor did not remove labels.
- Reduce Motion: existing tests pass and the motion contract is unchanged.
- Long text: Record and Understanding allow user text to grow without turning
  it into a fixed card height.
- Small iPhone width: search mode still removes brand/actions from layout and
  the expanded field keeps the accepted contract.
- Contrast: colour is not the only state signal; focus, selected, and recede
  states also use line, position, or opacity.

What still requires device judgment: OLED tone separation, real Dynamic Type
rendering, keyboard feel, VoiceOver reading order, and motion feel.

## LIGHT / DARK

Light and Dark use the same geometry and role names. Light keeps Direction A's
warm paper identity. Dark uses refined warm charcoal with restrained copper,
not pure black and not a bright gold luxury look.

Both themes were checked through the shared token contract. The mobile theme
test asserts identical colour-key sets across themes and verifies the AB role
families exist in both.

## REGRESSION

Preserved and covered by existing tests:

- Record semantics and local-first capture;
- tag ownership, persistence, text + tag search;
- AI Observation vs user Reflection distinction;
- Relation, Evidence, and Core Gate semantics;
- `NO_OBSERVATION`;
- manual Awareness dedupe;
- automatic Awareness;
- Awareness History and viewed persistence;
- Reflection save feedback;
- local search lifecycle;
- navigation isolation;
- Settings remains reachable without becoming a tab.

## TESTS

Commands and results:

- `apps/mobile`: `npm run typecheck` — PASS
- `apps/mobile`: `npm test` — 22 files, 164 tests PASS
- repository root: `npm run typecheck` — PASS
- repository root: `npm test -- --run` — 47 files, 857 tests PASS
- `apps/mobile`: `npx expo export --platform ios --output-dir .expo-export-m3.4`
  — PASS
- Production iOS JS bundle: `_expo/static/js/ios/index-12088a226dafa0772e1d8d2762d7611f.hbc`
  (3.2 MB, 1107 modules)

## COMMITS

Direction AB work is split into reviewable commits:

- `docs(mobile): freeze Direction AB visual baseline`
- `refactor(mobile): add Direction AB visual foundation`
- `feat(mobile): apply Direction AB to record space`
- `feat(mobile): apply Direction AB to awareness space`
- `feat(mobile): apply Direction AB to understanding space`
- `feat(mobile): apply Direction AB to exploration space`

## REAL DEVICE ACCEPTANCE CHECKLIST

Global:

- [ ] Light / Dark feel comfortable on the actual screen
- [ ] Header and Search feel like one system
- [ ] Bottom Tab motion feels natural

Record:

- [ ] User text is still the subject
- [ ] It does not read as a Card stack
- [ ] Expanded focus feels natural

Awareness:

- [ ] Main still has stage / ripple identity
- [ ] Open truly feels like foreground focus
- [ ] Response flow feels comfortable

Understanding:

- [ ] The `我` anchor feels natural
- [ ] It feels like the user's own understanding, not an AI feed

Exploration:

- [ ] The spatial relation field reads as connection
- [ ] Nodes do not feel over-carded
- [ ] Connectors stay quiet

Final status remains:

**M3.4 DIRECTION AB MOBILE UI CODE COMPLETE — REAL DEVICE UX ACCEPTANCE PENDING**
