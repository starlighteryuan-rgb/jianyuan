# Mobile M3.0 iOS Build Hotfix Report

Status: HOTFIX IN PROGRESS

## ROOT CAUSE

The first real failure inside `Bundle React Native code and images` was:

```text
Failed to construct transformer:
Error: Cannot find module 'babel-preset-expo'
```

The later `iOS Bundling failed`, `transformFile` undefined, and Xcode
`exit code 65` / `BUILD FAILED` were consequences. The failing CI run was:

- workflow: `iOS Unsigned Build`
- branch: `mobile-m3`
- commit: `fdc53b2 feat(mobile): add motion and interaction foundation`
- run: `35094420462`

M3.0 introduced an app-level `apps/mobile/babel.config.js` using
`babel-preset-expo`. Babel resolves this bare preset name from the Mobile app
root. In the installed tree, `babel-preset-expo` was only nested under
`expo/node_modules`, so the app-root resolution failed when Metro initialized
its transformer.

## WHY V0.2.2 WORKED

`v0.2.2` had no app-level `apps/mobile/babel.config.js`. Expo's internal
transformer used the same `babel-preset-expo` package from its own installation
context, so it could resolve its dependency. The M3.0 app-level Babel config
changed the resolution location without first promoting `babel-preset-expo` to
a top-level Mobile dependency.

## FIX

The minimal repair is one dependency promotion:

- Added `babel-preset-expo@~57.0.11` to `apps/mobile/package.json`
  devDependencies.
- Updated `apps/mobile/package-lock.json`.
- npm resolved `57.0.12`, satisfying the existing Expo `~57.0.11` range.
- Did not remove, downgrade, or alter `react-native-reanimated` or
  `react-native-worklets`.
- Did not change M3.0 Motion code.

## VALIDATION

### Local production iOS bundle

Command equivalent to the CI Release bundling step:

```sh
npx expo export:embed \
  --entry-file index.ts \
  --platform ios \
  --dev false \
  --reset-cache \
  --bundle-output main.jsbundle \
  --assets-dest assets \
  --minify false
```

Result after the fix:

- PASS
- 1103 modules bundled
- production bundle output written successfully

### Automated regression

- Mobile tests: 16 files / 120 tests PASS
- Mobile typecheck: PASS
- Root regression: 47 files / 857 tests PASS
- Root typecheck: PASS

### GitHub Actions

A fresh `iOS Unsigned Build` run for the hotfix commit will be triggered after
committing. This section will be completed only after the run reports PASS.

## SCOPE

- Core: untouched
- SQLite schema: untouched
- Provider contract: untouched
- Desktop runtime: untouched
- `main`: untouched
- `v0.2.2` tag and release: untouched
- `docs/learning/`: untouched
- `.release-artifacts/`: untouched and not committed
- M3.0 Motion behavior: unchanged
