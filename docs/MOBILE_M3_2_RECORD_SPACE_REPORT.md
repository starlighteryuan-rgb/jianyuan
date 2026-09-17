# Mobile Phase M3.2 — Record Space UI & Visual Language Report

Status: M3.2 RECORD SPACE CODE COMPLETE — REAL DEVICE UX ACCEPTANCE PENDING

This round redesigns only the Record content layer and adds user-defined Tags
with fused search. Awareness, Understanding, Exploration, the App Shell, Core,
Provider, and the SQLite schema are untouched.

## DESIGN INTENT

The Record feed is a **弱卡片化时间文字流** — a weakly-carded time stream — not a
column of cards.

The user's own words are the primary visual layer. Time is quiet metadata. The
container recedes into the background and only appears on interaction. This
follows the project rule **Card is not the default answer**: a Record is
separated by whitespace and a hairline rather than by a bordered, shadowed
rectangle.

Why not cards: a list of cards reads as a task manager, a notes database, or a
dashboard. Record should feel like something the user once wrote and left
behind, settling quietly — not a record being evaluated.

## BEFORE / AFTER

Before:

- every Record was a bordered, filled Card (`backgroundColor: colors.surface`,
  `borderWidth: 1`, `borderRadius`, `marginBottom`);
- a standalone divider separated the input from the list;
- time was rendered as a full timestamp (`2026-09-17 09:42`) at the same visual
  weight for every row;
- a `FlatList` rendered a flat, ungrouped sequence;
- there were no tags and no tag filtering.

After:

- Records form a grouped, weakly-carded time stream: whitespace and a hairline
  separate them; interaction (expanding a Record) is the only thing that raises
  a surface;
- time is relative and quiet: `09:42` today, `昨天 23:18`, `9月15日 09:42`;
- records are grouped under quiet day headers: 今天 / 昨天 / 9月15日;
- there is no timeline rail, no streak, no count, no progress indicator;
- user-defined Tags can be attached per Record and filtered from the expanded
  search;
- long Records preview at four lines and expand in place.

## RECORD ITEM

Visual hierarchy, in order:

1. **Body** — the Record verbatim, `fontSize: 16`, `lineHeight: 26`. This is the
   absolute subject.
2. **Time** — `fontSize: 12`, muted colour, below the body.
3. **Tags** — only rendered when the Record actually has tags. A Record without
   tags renders no tag area at all; `+ 添加标签` never appears in the collapsed
   feed.

Interaction:

- Pressing the Record body expands or collapses it.
- Preview shows up to 4 lines; expanding shows the full text.
- An expanded Record is the only state that raises a surface
  (`colors.surface`, small radius).
- `+ 添加标签` and tag removal live inside the expanded interaction, not in the
  feed.

The Record's own text is never modified, summarised, or replaced. Tags are
metadata.

## TAG SYSTEM

### Data model

Tags are **Record metadata authored by the user**, never an AI classification
and never a person-level fact.

They are stored in a dedicated key/value store
(`apps/mobile/src/runtime/record-tags-store.ts`), not in SQLite. Reason:
`apps/mobile/tests/mobile-schema-parity.test.ts` asserts that the Mobile SQLite
schema is structurally identical to the Desktop schema (same tables, columns,
indexes, and version). Adding a table would break that parity, and Tags are
Mobile-presentation metadata rather than shared Core storage. The key/value
channel is the same mechanism already used for Awareness history: durable,
local-first, and excluded from Core semantics.

Persisted shape:

```json
{
  "tags": ["关系", "学习"],
  "byRecord": {
    "rec_...": ["关系"]
  }
}
```

- `tags` is the user's vocabulary, most-recently-used first; order is
  meaningful because the picker shows recent tags.
- `byRecord` maps a Record id to its tag names.

### Rules

- Name is trimmed and internal whitespace is collapsed; empty / whitespace-only
  names are rejected and create nothing.
- Names are capped at 24 characters.
- Duplicate handling folds case-insensitively to one vocabulary entry, so
  `Focus` and `focus` do not create two tags.
- Adding a tag already on a Record is a no-op.
- Removing a tag detaches it from that Record but keeps the vocabulary entry for
  reuse.
- Tags never alter the Record's text.
- AI never adds a permanent tag.

### Interaction / UI

- Tags appear as small, low-contrast capsules: `accentSoft` background, subtle
  border, `fontSize: 12`. No per-tag colour coding, no rainbow categories, no
  tag colour editor.
- Adding a tag opens a lightweight inline picker with the user's recent tags
  plus `新建标签`.
- Removing a tag is a press on the capsule inside the expanded Record.
- There is no tag management backend, no hierarchy, no nesting, and no AI tag
  generation.

## SEARCH

Text search and tag filtering are fused into the existing Search control. No
second filter centre was created.

- The default state is still the circular Search button.
- Opening Search reveals the existing field. When the user has tags, a quiet
  tag-filter row appears below the header with `全部` plus the user's real tags.
- Behaviour: text only, tag only, or text AND tag. Results must satisfy every
  active filter.
- Tag filtering is pure local comparison; the Provider is never called.
- The Search keyboard lifecycle is unchanged from M3.1.2: an empty query plus
  keyboard dismissal collapses back to the circular button, and a non-empty
  query keeps the field expanded.

## VISUAL TOKENS

This round establishes the first Record visual system, reusing the existing
Pair A theme tokens rather than inventing parallel ones.

- **Typography** (from `theme/tokens.ts` plus local Record sizes):
  - product title: `TYPOGRAPHY.title` (20) — header, frozen;
  - Record body: 16 / lineHeight 26;
  - metadata and time: 12;
  - day group label: 12, muted;
  - tag: 12;
  - secondary/acknowledgement: 12 body meta.
- **Spacing**: existing `SPACING` scale (4 / 8 / 12 / 16 / 24 / 32). Day groups
  are separated by `SPACING.lg`, Records by vertical padding and a hairline.
- **Radius**: reduced reliance on large radii. Tags and expanded surfaces use
  `RADIUS.sm` (4); the input well keeps `RADIUS.md` (8). Nothing uses a large
  radius decoratively.
- **Surface**: default weak; a surface only appears on the expanded interaction.
  The input well uses the existing `sunken` tone.
- **Shadow**: none added. Separation comes from whitespace, tone, and hairlines.
- **Metadata**: quiet 12px muted text; never allowed to outrank the body.
- **Tag**: `accentSoft` capsule at 12px, no colour coding.

## ACCESSIBILITY

Audited against the `mobile-ui-ux-designer` contract:

- **Dynamic Type**: Record body, metadata, and tags use relative `fontSize`
  values and allow wrapping; expanding a Record shows full text instead of
  clipping meaning.
- **Touch targets**: the Save control was previously roughly 33–35 pt tall
  (`paddingVertical: SPACING.sm` + text). It now has a 44 pt row height plus
  `hitSlop`, satisfying the iOS 44x44 pt minimum. Tag add / remove and the
  filter chips carry `hitSlop`.
- **Contrast**: metadata uses `textMuted`, which remains readable in both
  light and dark mode rather than being faded to the edge of legibility.
- **Long text**: preview at four lines with an explicit expand; the feed cannot
  be occupied by one very long Record.
- **Safe area**: unchanged — the shell owns insets; Record content sits inside
  the shell's safe area.
- **Keyboard**: the input remains inside the existing keyboard flow; saving does
  not depend on keyboard dismissal.
- **VoiceOver labels**: the Save control, Record expand/collapse, tag add /
  remove, and filter chips carry explicit `accessibilityLabel` /
  `accessibilityState`.
- **Dark / light**: Record uses semantic tokens only, so both modes share
  geometry and differ only in colour.
- **Small iPhone widths**: the stream uses flexible layout and wrapping tag
  rows, with no fixed-width containers.

## REGRESSION

- Mobile tests: 150 / 150 PASS
- Mobile typecheck: PASS
- Root tests: 857 / 857 PASS
- Root typecheck: PASS
- Production JS bundle: PASS (1106 modules)

Confirmed not regressed: manual Awareness source-set dedupe, Bubble emergence
timing, Reflection save feedback, Search keyboard lifecycle, the `见渊` header,
Bottom Tab motion, and Reflection-origin Record exclusion from the normal feed.
Awareness, Understanding, and Exploration code was not touched.

## REAL DEVICE CHECKLIST

1. Record page is visibly quieter than before.
2. The feed no longer reads as a column of cards.
3. The body is the dominant layer; time does not compete.
4. Day grouping is present without a timeline rail.
5. Tags are light and only appear when present.
6. Adding / removing a tag feels natural and lives inside the Record.
7. No tag management pressure (no empty `+ 标签` in the feed, no counts).
8. Search + tag filter composes naturally (text only / tag only / both).
9. A long Record is readable and expands safely.
10. Light and Dark both feel comfortable.
11. A newly saved Record settles into the stream naturally.
12. The screen still reads as 见渊, not as another notes app.

## IOS BUILD

- Commit: f612b1eec7d0894e9036f21bd71e1104d9295245
- Run ID: 35186211071
- Run URL: https://github.com/starlighteryuan-rgb/jianyuan/actions/runs/35186211071
- Status: completed / success (all workflow steps green)
- Artifacts: Jianyuan-iOS-unsigned-ipa, Jianyuan-iOS-unsigned-app
- IPA SHA256: 890bb8500a49973c69ea417c562366239293b94ea8620f556b6bb6cab8efa4eb
- APP zip SHA256: 5a8f3d868b35082ba2b0f3afa5be3f652899dc88b5c0e7e73706442a221603e5
- Local unsigned audit of the downloaded IPA: 0 embedded.mobileprovision,
  0 `_CodeSignature`, 0 `CodeResources` (matches CI verification)

## TASK INTEGRATION

- Runtime/UI tests: `apps/mobile/tests/m3-2-record-space.test.ts` (14 tests).
- Tag store: `apps/mobile/src/runtime/record-tags-store.ts`.
- Production binding: `apps/mobile/src/runtime/record-tags-storage.ts`.
- One real defect was found and fixed during verification: the test runtime did
  not pass the tag store into `MobileRuntime`, so tag writes silently hit the
  no-op store. Fixed by wiring `recordTagStorage` in
  `apps/mobile/tests/support/mobile-test-runtime.ts`.
