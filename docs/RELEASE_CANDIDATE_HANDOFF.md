# Jianyuan Release Candidate · Handoff Summary

> Generated: 2026-09-15. All status below reflects a live read-only inspection
> of the real worktree, not memory or assumption.

---

## CURRENT STATUS

Release Candidate Productionization is IN PROGRESS. The theme system files are
all present and passing tests. The large `styles.css` rewrite (the one remaining
step of "migrate Pair A into formal Desktop UI") has not been applied yet, and
`App.tsx` has not been touched in this session. The tool loop on `styles.css`
left no partial write.

---

## LAST COMPLETED

| Step | Status | Evidence |
|------|--------|----------|
| Step 0 read-only audit | DONE | git status / diff / docs / board.html all read this session |
| `vitest.config.ts` include fixed | DONE | `apps/desktop/vitest.config.ts` line 5 now includes `src/tests/**/*.test.ts` |
| `theme.ts` + hook + 9 tests | DONE | files exist; desktop vitest 13/13 passed this session |
| `tokens.css` (full Pair A, Light+Dark) | DONE | 178 lines; Light wave-ring line 67, Dark lines 117 + 158 |
| FOUC guard in `index.html` | DONE | inline script present |
| `main.tsx` imports tokens.css | DONE | line 5 confirmed |
| Visual Lab `board.html` (Pair A, water, brand mark) | DONE | 1524 lines; production migration authority |
| Previous Phase 9.1-9.6 | DONE | source + docs present in untracked `apps/` |

---

## CURRENT WORKTREE

- Branch: `phase-9-freeze`
- HEAD: `49895ded7d8da30f27d7bf9077a4718dbe67105e` (`docs: finalize public release hygiene`)
- Working tree: very dirty. Phase 9/10 product code under `src/app/**`, `packages/**`, `apps/**`, `tests/**` is untracked from Git's perspective.
- `git diff --stat` shows 37 tracked-file changes (3109 insertions / 1796 deletions), including `.env.example` and `.gitignore` hygiene.
- No secret or user-database files found in this session's diff scan.

---

## COMPLETED PHASES

| Phase | Status |
|-------|--------|
| 9.1 Navigation | DONE |
| 9.2 Semantic Separation | DONE |
| 9.3 Observation Migration | DONE |
| 9.4 Reflection / Exploration | DONE |
| 9.5 Language / Accessibility | DONE |
| 9.6 Product Flow Validation | DONE |
| Phase 10 Visual Research | DONE |
| Pair A Deep Amber / Warm Paper | DONE (Visual Lab + tokens.css) |
| Light / Dark / System theme logic | DONE (presentation layer, tested) |
| Water / Ripple language | DONE in Visual Lab; NOT in production styles.css |
| Brand Mark | DONE in Visual Lab + App.tsx uses SVG mark; production CSS missing |
| AI visual hierarchy | DONE in Visual Lab; NOT in production styles.css |
| Formal UI Migration | IN PROGRESS (tokens done; styles.css + App.tsx styling hooks pending) |
| Release Candidate steps 12-24 | NOT STARTED (except desktop unit tests) |

---

## PRODUCTION UI STATUS

- `apps/desktop/src/App.tsx`: 546 lines. Structure matches Phase 9 IA.
  Uses brand mark SVG (center point + vertical axis + rings), but **no `useThemePreference` hook call and no Appearance section in Settings yet**.
- `apps/desktop/src/styles.css`: 153 lines. **Still the old hard-coded light
  theme.** No Pair A tokens, no water geometry, no reduced-motion.
- `apps/desktop/src/tokens.css`: DONE, full Pair A Light+Dark semantic tokens.
- `index.html`: FOUC guard done. `main.tsx`: tokens imported. Both verified by file read.
- Theme logic (`theme.ts`, `use-theme-preference.ts`, `tests/theme.test.ts`): DONE and passing.

---

## VISUAL LAB STATUS

- `apps/desktop/visual-lab/theme-boards/board.html` (1524 lines) is the frozen
  visual authority for Pair A, water geometry, brand mark, and AI hierarchy.
- Pair A complete. Light/Dark columns rendered from one template.
- Water language present as sparse large-span arcs and ripples (600px / 860px).
- All five screens have full mockups in the board.
- Brand Mark (center point + vertical axis + concentric rings) is in the board and in the current `App.tsx` markup, but its supporting CSS lives in the pending `styles.css` rewrite.

---

## TOOL ISSUE

- `apply_patch_batch` rejects same-path delete + add.
- Do not repeat that call. Use `apply_patch_replace_file` (single-file replace)
  or `apply_patch_update_file` with exact-context precise patches.
- The previous model entered a repeated explanation / tool loop on
  `styles.css`. No partial write resulted from the failed calls.

---

## BUILD ENVIRONMENT

- `~/.cargo/bin` may contain a broken 0-byte cargo proxy. Do NOT trust `PATH` cargo.
- Real Rust toolchain: `C:\Users\26067\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin\` (cargo 1.97.1).
- Previous successful Tauri release build exists:
  `apps/desktop/src-tauri/target/release/jianyuan-desktop.exe` (10,383,360 bytes, timestamp 2026-09-15 01:41).
- MSVC linker: VS 18 Community, MSVC 14.51.
- Project cargo home: `D:\Hackson\project build\.cargo-home-desktop`.
- `apps/desktop/scripts/do-native-build.cmd` is the proven build script
  (renderer/runtime build then `tauri build --no-bundle`).

---

## TEST STATUS

| Suite | Status | Last verified |
|-------|--------|---------------|
| Desktop unit tests | PASS 13/13 | 2026-09-15 08:21, this session |
| Root full tests (856+) | NOT STARTED this RC session | previous phase baseline |
| typecheck | NOT STARTED this RC session | previous phase baseline |
| Web production build | NOT STARTED this RC styles migration | dist/ exists from 2026-09-15 07:50 (pre-styles rewrite) |
| Desktop renderer build | NOT STARTED this RC styles migration | dist/ from 07:50 is stale after styles rewrite |
| Tauri release build | NOT STARTED this RC styles migration | exe from 01:41 is pre-styles |
| `git diff --check` | NOT STARTED this RC session | previous phase run passed |

---

## RELEASE STATUS

| Item | Status |
|------|--------|
| Version unification to 0.2.0-alpha | NOT STARTED |
| NSIS installer | NOT STARTED (bundle.active=false) |
| Installer SHA256 | NOT STARTED |
| README product rewrite | NOT STARTED |
| Security audit | partial (gitignore/env hygiene in diff; full scan not run) |
| Release commit | NOT STARTED |
| Tag v0.2.0-alpha | NOT STARTED (tags: phase-9-foundation, v0.1.0-zhihu-demo, v1.1-runtime-validation-ready) |
| Push | NOT STARTED |
| GitHub Release | BLOCKED (gh CLI not authenticated) |
| Installer upload | BLOCKED (depends on release) |
| Demo download link | NOT STARTED |

---

## BLOCKERS

1. `styles.css` rewrite pending (the only remaining Phase 10 migration blocker).
2. `App.tsx` theme integration pending.
3. Full test/build/native chain not run after those edits.
4. GitHub CLI not authenticated in the managed environment.

---

## NEXT ACTION

1. Replace `apps/desktop/src/styles.css` using `apply_patch_replace_file` with the full Pair A stylesheet (water geometry, brand mark, AI hierarchy, reduced motion). Do NOT use `apply_patch_batch` delete+add.
2. Update `apps/desktop/src/App.tsx`: call `useThemePreference`, add the Settings > Appearance segmented control, and make sure no AI banner appears in the records main area.
3. Run desktop unit tests, desktop typecheck, root tests/typecheck, web build, desktop renderer/runtime build, `git diff --check`.
4. Use `apps/desktop/scripts/do-native-build.cmd` to run the real Tauri release build. Record exe timestamp, size, SHA256.
5. Enable `bundle.active=true` + NSIS, run installer build, record filename/size/SHA256.
6. Unify version to 0.2.0-alpha in package.json / Cargo.toml / tauri.conf.json.
7. README rewrite + full security audit.
8. Release commit + tag `v0.2.0-alpha`.
9. GitHub push/release/asset: blocked until `gh auth login`.
10. Demo download link after release URL exists.

---

## FROZEN PRODUCT DECISIONS

1. IA: 记录 → 觉察 → 理解 → 探索 → 设置 (independent).
2. AI semantics: Record → AI Observation (temporary) → User Reflection → Core Gate → Relation / Evidence.
3. AI does not own interpretation rights.
4. Only user free text enters Core Gate.
5. User rejection does not create Relation / Evidence.
6. Visual: Pair A. Dark: Deep Amber. Light: Warm Paper.
7. Brand language: warm light, point, ring, ripple, trajectory, soft curve, spatial hierarchy, user experience at center.
8. Water principle: "感觉得到，但不会首先注意到。"
9. No Motion Lab in this release.
10. Release target: Jianyuan Early Preview / Alpha (v0.2.0-alpha).

---

## REMAINING RISKS

- The `styles.css` rewrite is large; a careless edit could break layout or the reduced-motion contract. Read the existing 153-line file and `board.html` before editing.
- `App.tsx` is 546 lines; theme integration must not change business flow.
- Do not "complete" unverified steps. Label unverified results honestly.
