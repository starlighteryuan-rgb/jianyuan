# Jianyuan v0.2.2 · Functional Foundation Release Report

Generated: pending

## RELEASE COMMIT

Pending release preparation commit.

## TAG

- Tag: `v0.2.2`
- Status: not created yet
- Type: annotated

## VERSION SOURCES

Release version: `0.2.2`

| Source | Version |
|--------|---------|
| `package.json` | `0.2.2` |
| `apps/desktop/package.json` | `0.2.2` |
| `apps/desktop/src-tauri/tauri.conf.json` | `0.2.2` |
| `apps/desktop/src-tauri/Cargo.toml` | `0.2.2` |
| `apps/desktop/src-tauri/Cargo.lock` | `0.2.2` |
| `apps/mobile/package.json` | `0.2.2` |
| `apps/mobile/app.json` | `0.2.2` |
| `packages/core/package.json` | `0.2.2` |
| `packages/providers/ai/package.json` | `0.2.2` |
| `packages/providers/deterministic/package.json` | `0.2.2` |
| `packages/storage/memory/package.json` | `0.2.2` |
| `packages/storage/sqlite/package.json` | `0.2.2` |
| `package-lock.json` | `0.2.2` |
| `apps/desktop/package-lock.json` | `0.2.2` |
| `apps/mobile/package-lock.json` | `0.2.2` |

## TEST RESULTS

| Suite | Result |
|-------|--------|
| Root tests | 47 files / 857 tests PASS |
| Root typecheck | PASS |
| Mobile tests | 15 files / 115 tests PASS |
| Mobile typecheck | PASS |
| Desktop tests | 4 files / 16 tests PASS |
| Desktop typecheck | PASS |
| `git diff --check` | PASS |

## DESKTOP BUILD

Pending.

## DESKTOP SMOKE TEST

Pending.

## IOS ACTIONS RUN

Pending.

## IOS UNSIGNED VALIDATION

Pending.

## ASSETS

Pending.

## SHA256

Pending.

## SECRET SCAN

Pending.

## KNOWN LIMITATIONS

- Mobile Reflection presentation state may occasionally lag behind a successful
  persistence result; this is a UI state issue, not evidence of data loss.
- Exploration has not received sufficient real-device coverage because
  persistent Relation data is still limited.
- Desktop does not implement the Mobile Automatic Awareness Inbox.
- SQLite is not fully encrypted at rest.
- Windows installer is unsigned.
- The iOS IPA is unsigned and requires the user's own signing or re-signing
  environment.

## GITHUB RELEASE

Pending.

## NEXT PHASE

M3 Mobile UI / UX & Motion under v0.3.0 development.
