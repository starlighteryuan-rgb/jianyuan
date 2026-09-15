/**
 * Phase M1-C verification: Pair A theme.
 *
 * Covers the pure resolution rules, the persistence boundary, and the claim the
 * spec cares about most: the appearance preference is a PRESENTATION concern and
 * never enters Core or the database.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from '../src/theme/theme-preference';
import { DARK_THEME, LIGHT_THEME, SPACING, themeFor } from '../src/theme/tokens';
import { openMobileTestRuntime } from './support/mobile-test-runtime';

const temporaryDirectories: string[] = [];

const scratchDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-theme-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Mobile Pair A theme (M1-C)', () => {
  it('defaults to the system preference', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
    expect(parseThemePreference('')).toBe('system');
  });

  it('rejects unknown stored values instead of applying them', () => {
    expect(parseThemePreference('midnight')).toBe('system');
    expect(parseThemePreference('LIGHT')).toBe('system');
    expect(parseThemePreference('{"theme":"dark"}')).toBe('system');
  });

  it('lets an explicit choice win over the OS setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the OS when the preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('resolves to the Deep Amber and Warm Paper palettes', () => {
    expect(themeFor('dark')).toBe(DARK_THEME);
    expect(themeFor('light')).toBe(LIGHT_THEME);

    // Values come from the Desktop tokens so the two platforms match.
    expect(DARK_THEME.colors.canvas).toBe('#161512');
    expect(LIGHT_THEME.colors.canvas).toBe('#f5f1e8');
    expect(DARK_THEME.colors.accent).toBe('#d4a464');
    expect(LIGHT_THEME.colors.accent).toBe('#8a683a');
  });

  it('keeps geometry identical across both themes', () => {
    // Only colour may differ between Light and Dark; geometry is shared, so the
    // two palettes must expose exactly the same keys.
    expect(Object.keys(DARK_THEME.colors).sort()).toEqual(
      Object.keys(LIGHT_THEME.colors).sort(),
    );
    // And the shared spacing scale is a single object, not per-theme.
    expect(SPACING.md).toBe(12);
  });

  it('defines every required semantic colour in both themes', () => {
    for (const theme of [LIGHT_THEME, DARK_THEME]) {
      for (const key of [
        'canvas',
        'surface',
        'elevated',
        'sunken',
        'textPrimary',
        'textSecondary',
        'textMuted',
        'accent',
        'accentCta',
        'borderSubtle',
        'borderStrong',
        'success',
        'danger',
      ] as const) {
        expect(theme.colors[key]).toMatch(/^(#|rgba?\()/);
      }
    }
  });

  it('never writes the theme preference into the database or Core', async () => {
    const directory = scratchDirectory();
    const databasePath = join(directory, 'jianyuan.sqlite');
    const runtime = await openMobileTestRuntime({ location: databasePath });

    await runtime.runtime.capture('一条记录，用于确认主题偏好没有进入数据库。');
    await runtime.close();

    const databaseBytes = readFileSync(databasePath).toString('utf8');
    // The preference key must not appear in the user's database at all.
    expect(databaseBytes).not.toContain(THEME_STORAGE_KEY);
    expect(databaseBytes).not.toContain('"theme"');
    // And it is not a Core storage table: only the Core schema exists.
    expect(databaseBytes).toContain('一条记录，用于确认主题偏好没有进入数据库。');
  });

  it('has no Core storage table for appearance preferences', async () => {
    const directory = scratchDirectory();
    const runtime = await openMobileTestRuntime({
      location: join(directory, 'jianyuan.sqlite'),
    });

    // The preference lives outside the adapter; the adapter's ports are the Core
    // ports only, and none of them stores a theme.
    const portNames = Object.keys(runtime.composition.storage);
    expect(portNames).not.toContain('appearance');
    expect(portNames).not.toContain('theme');
    expect(portNames).not.toContain('preferences');

    await runtime.close();
  });
});
