import { describe, expect, it } from 'vitest';

import {
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredThemePreference,
  applyThemeAttribute,
  readStoredThemePreference,
} from '../theme';

/**
 * Presentation-layer behaviour only. Nothing here touches Core, SQLite or the
 * provider contract, which is the point: appearance must stay cheap and safe.
 */

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    snapshot: () => Object.fromEntries(store),
  };
}

function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
    get: (name: string) => attrs.get(name),
    has: (name: string) => attrs.has(name),
  };
}

describe('resolveTheme', () => {
  it('an explicit choice wins over the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('system follows whichever way the OS is set', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('parseThemePreference', () => {
  it('accepts the three known values', () => {
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
  });

  it('falls back to system for anything unrecognised', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
    expect(parseThemePreference('')).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
    // A hand-edited value must not be able to reach the DOM as an attribute.
    expect(parseThemePreference('light"; background: red')).toBe('system');
  });
});

describe('stored preference', () => {
  it('round-trips under the documented key', () => {
    const storage = fakeStorage();
    writeStoredThemePreference(storage, 'dark');
    expect(storage.snapshot()).toEqual({ [THEME_STORAGE_KEY]: 'dark' });
    expect(readStoredThemePreference(storage)).toBe('dark');
  });

  it('defaults to system when nothing is stored', () => {
    expect(readStoredThemePreference(fakeStorage())).toBe('system');
  });

  it('survives a storage API that throws (private mode)', () => {
    const hostile = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readStoredThemePreference(hostile)).toBe('system');
    expect(() => writeStoredThemePreference(hostile, 'dark')).not.toThrow();
  });
});

describe('applyThemeAttribute', () => {
  it('writes the attribute for an explicit choice', () => {
    const root = fakeRoot();
    applyThemeAttribute(root, 'dark');
    expect(root.get('data-theme')).toBe('dark');
    applyThemeAttribute(root, 'light');
    expect(root.get('data-theme')).toBe('light');
  });

  it('removes the attribute for system so the media query decides', () => {
    const root = fakeRoot();
    applyThemeAttribute(root, 'dark');
    expect(root.has('data-theme')).toBe(true);
    applyThemeAttribute(root, 'system');
    expect(root.has('data-theme')).toBe(false);
  });
});
