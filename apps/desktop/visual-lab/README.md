# Visual Lab (NON-PRODUCTION)

This directory is a **design research sandbox**. It is not part of the product.

- Not referenced by `vite.config.ts`, `index.html`, or any build entry
- Not imported by `apps/desktop/src/**`
- Not bundled into `jianyuan-desktop.exe`
- Contains no product logic, no Core, no Storage, no Provider access

## Purpose

Produce static visual drafts so the Phase 10 Theme Pair and Motion variants can be
compared by eye before any production UI change.

## Contents

| Path | What it is |
|------|-----------|
| `theme-boards/board.html` | Paired Theme Board template (Dark + Light from one DOM) |
| `theme-boards/capture-boards.mjs` | Headless Chrome capture script |
| `theme-boards/out/` | Generated PNG boards and verification crops |

## Current round

Phase 10A - Static Visual Direction Preview.

Three Paired Theme Boards, one per candidate:

- Pair A - Deep Amber / Warm Paper
- Pair B - Mineral Night / Mineral Day
- Pair C - Ember Night / Linen Day

Static only. No motion in this round. Motion Lab comes after a Theme Pair is chosen.

## Rendering notes

- Boards are rendered at device scale factor 1, so CSS pixels equal image pixels.
- Dark and Light columns are cloned from the same `<template>` elements, so layout,
  typography, spacing and component geometry are provably identical. Only semantic
  token values differ.
- Swatch labels are read from resolved computed styles, so the hex values shown are
  the actual values used.
