# Mobile M3.4.1 — UI Closure and Build Report

Status: UI CODE COMPLETE / iOS BUILD VERIFIED / ANDROID BUILD ENVIRONMENT BLOCKED / REAL DEVICE ACCEPTANCE PENDING

Target version: `0.4.0`

This round applies the confirmed review decisions. It does not redesign
Direction AB, does not change deletion behavior, and does not change Core,
Provider, Desktop, SQLite schema, or migration logic.

## UI CHANGES

### Understanding

Confirmed final values:

```yaml
firstPerson: 28 / 28
reflection: 17 / 28
```

The first-person anchor remains colored and remains the entry into the user's
own words. It no longer behaves like a title. Metadata, page structure, theme,
swipe-to-delete, and reflection reading flow are unchanged.

Preview reference:

- `apps/mobile/visual-lab/m3-4-1-review/index.html`
- `apps/mobile/visual-lab/m3-4-1-review/preview/review-board.png`

### Awareness Main

The previous Bubble presentation kept a full pill-shaped outline around the
content while the content itself still flowed as ordinary text. The change
removes that conflicting container language.

Removed:

- `bubbleGhost`;
- the full pill outline;
- the visual behavior that made the observation look like a card or bubble.

Kept:

- central observation focus;
- halo;
- ripple;
- whitespace;
- opacity / tonal hierarchy;
- the sense that an observation is emerging in space;
- the frozen emergence timings.

The Open detail and response flow are not changed.

## BUILD AND VERSION

The mobile version sources are already aligned at `0.4.0`:

- `apps/mobile/app.json`: `0.4.0`
- `apps/mobile/package.json`: `0.4.0`
- `apps/mobile/package-lock.json`: `0.4.0`
- Settings > 应用版本: `0.4.0`
- iOS build number: `2`

No data migration change was made.

## VERIFICATION

- Mobile tests: 23 files, 171 tests PASS
- Mobile typecheck: PASS
- Root tests: 47 files, 857 tests PASS
- Root typecheck: PASS
- Production iOS JS bundle: PASS
  - `_expo/static/js/ios/index-a9f5e76dfd9ef84f83507ef76cc1f6a2.hbc`
  - 1110 modules

## IOS UNSIGNED BUILD

Run: [35236327420](https://github.com/starlighteryuan-rgb/jianyuan/actions/runs/35236327420)

Head SHA: `d5bf9cac92556df551bc39ba24ba39c6a7259ecc`

Result:

- build: PASS
- unsigned packaging: PASS
- IPA verification: PASS
- signature audit: PASS
- artifact upload: PASS

Artifacts:

- IPA artifact ID: `10503656593`
- App zip artifact ID: `10503616955`

SHA256:

```text
9a201923bec0d7ca4618881bef9c2fccb6697a746c85112db8a319893ebba858  Jianyuan-iOS-unsigned.ipa
a0b20d6069002254c14b3f0e688947e97ec036f56abfdf0acbc7207a607d3610  Jianyuan-iOS-unsigned.app.zip
```

## ANDROID BUILD

An Android unsigned workflow was added at:

- `.github/workflows/android-unsigned.yml`

It is committed on `mobile-m3`.

It could not be dispatched from this session because GitHub Actions only allows
`workflow_dispatch` for workflows present on the repository's default branch,
which is `main`. The user explicitly prohibited modifying `main`, so this round
does not modify it.

The local machine also has no Java, Android SDK, Gradle cache, or ADB available,
so a local Android APK production path is not available in this environment.

No Android APK artifact is claimed for this round. The workflow is ready to run
once it is present on an authorized dispatch branch or the user explicitly
approves the required repository-branch change.

## COMMITS

- UI implementation: `d5bf9ca`
- Report: this commit

## NOT MODIFIED

- Core
- Provider
- SQLite schema
- Desktop
- data migration logic
- `main`
- tags
- releases

Final status remains UI-code complete, iOS build verified, and real-device
acceptance pending.
