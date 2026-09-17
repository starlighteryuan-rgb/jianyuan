# Mobile M3.4 Release Candidate — Direction AB UI Closure

Status: CODE COMPLETE / BUILD VERIFIED / REAL DEVICE ACCEPTANCE PENDING

Target version: `0.4.0`

This round is intentionally narrow. It does not redesign Direction AB and does
not add a content-management system. It closes three release-candidate items:

1. Understanding first-person scale reduction;
2. unified mobile swipe-to-delete;
3. version update to `0.4.0`.

## UNDERSTANDING FIRST-PERSON SCALE

The first-person anchor remains part of the Understanding visual language. It
is still the entry point for the user's own reflection, but it no longer
dominates the page.

Before:

- `firstPerson`: 44 / 40

After:

- `firstPerson`: 34 / 32

The body remains `reflection` at 17 / 28. The change is limited to the shared
first-person type token; the Understanding page structure, rail, metadata,
source expansion, and relation semantics are unchanged.

A local visual comparison is available at:

- `apps/mobile/visual-lab/m3-4-release-candidate/first-person-scale.html`
- `apps/mobile/visual-lab/m3-4-release-candidate/preview/first-person-scale.png`

The comparison shows Current and Revised in Light and Dark. The runtime uses
the Revised value.

## SWIPE TO DELETE

A shared `SwipeToDelete` component now provides one mobile interaction contract:

- left swipe reveals a destructive action;
- the action is visibly destructive;
- no modal or multi-step workflow is introduced;
- the item is removed from the user-visible list after the action.

The component owns presentation only. Each space decides what deletion means
for its data.

### Coverage

Record:

- left swipe reveals delete;
- the Record disappears immediately from the Mobile list;
- the visibility decision is persisted locally;
- the Core Record row is retained because it may be referenced by Relation,
  Evidence, or Lineage.

Awareness:

- pending Awareness bubbles and History items both expose delete;
- Awareness history is a Mobile presentation store, so the history item is
  actually removed from that durable store;
- no Core Relation or Evidence is deleted.

Understanding:

- left swipe reveals delete;
- the Reflection disappears from Understanding immediately;
- the visibility decision is persisted locally;
- the Core UserReflectionRecord remains intact, so relation-bound Reflection
  provenance is not silently broken.

Exploration:

- no delete affordance is added;
- Exploration items are derived long-term Relations, not user-managed content
  rows;
- removing them from a Mobile screen would conflict with the existing Core Gate
  and evidence semantics.

### Why Record and Understanding Use Visibility, Not Physical Delete

The Mobile SQLite schema mirrors Core and contains:

- `relation_record_refs.record_id ... ON DELETE RESTRICT`
- `lineage_edges.parent_id ... ON DELETE RESTRICT`
- `user_reflection_records.record_id ... ON DELETE CASCADE`

Physically deleting a Record can therefore fail when a Relation or lineage
parent still exists, and deleting an Understanding row does not by itself
clean up Discovery, Relation, or Evidence references. A Mobile-only hard delete
would either fail or leave semantic references inconsistent.

The release candidate therefore uses a local presentation visibility list:

`apps/mobile/src/runtime/user-content-visibility-store.ts`

It lives in the same key/value presentation channel as Record tags and
Awareness history. It is outside Core, outside the SQLite schema, and outside
the Provider contract. The Core relationship model remains coherent.

## VERSION 0.4.0

Updated user-visible and build sources:

- `apps/mobile/app.json`: `expo.version = 0.4.0`
- `apps/mobile/app.json`: iOS `buildNumber = 2`
- `apps/mobile/package.json`: `version = 0.4.0`
- `apps/mobile/package-lock.json`: root package version `0.4.0`
- Settings > 运行状态 > 应用版本: `0.4.0`

The internal iOS build number is independent from the user-visible marketing
version and was incremented from 1 to 2.

## VERIFICATION

Automated verification:

- Mobile tests: 23 files, 171 tests PASS
- Root tests: 47 files, 857 tests PASS
- Mobile typecheck: PASS
- Root typecheck: PASS
- Production iOS JS bundle: PASS
  - `_expo/static/js/ios/index-19437d94b72e3b94adafbc0a56b5d4b7.hbc`
  - 3.2 MB
  - 1110 modules

New coverage:

- `apps/mobile/tests/m3-4-delete-version.test.ts`
- visibility rule tests;
- Record hide persistence across restart;
- Understanding hide persistence across restart;
- Awareness history deletion;
- absence of a derived Exploration delete API;
- `package.json` / `app.json` version assertions;
- theme test updated for the revised first-person scale.

## REAL DEVICE ACCEPTANCE CHECKLIST

Understanding:

- [ ] The first character still feels intentional
- [ ] The body reads as the page subject
- [ ] Light and Dark feel balanced

Delete:

- [ ] Record left swipe feels natural
- [ ] Record disappears and stays gone after restart
- [ ] Awareness pending item delete feels natural
- [ ] Awareness history delete leaves no stale state
- [ ] Understanding left swipe feels natural
- [ ] Understanding stays gone after restart
- [ ] Exploration has no accidental or inconsistent delete affordance

Version:

- [ ] Settings shows `0.4.0`

Final status remains:

**CODE COMPLETE / BUILD VERIFIED / REAL DEVICE ACCEPTANCE PENDING**
