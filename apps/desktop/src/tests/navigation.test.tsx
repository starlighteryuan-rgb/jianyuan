import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { App } from '../App';

const stylesSource = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');

function getSpaceSections(): readonly string[] {
  const main = document.querySelector('main');
  if (!main) throw new Error('Main content area not found.');
  const sections = [...main.querySelectorAll<HTMLElement>('section[data-space]')];
  return sections.map((section) => section.dataset.space ?? '');
}

async function clickNav(label: string): Promise<void> {
  const nav = document.querySelector('aside[aria-label="主要导航"]') ?? document.querySelector('nav[aria-label="产品空间"]');
  if (!nav) throw new Error('Desktop navigation not found.');
  const buttons = [...nav.querySelectorAll('button')];
  const target = buttons.find((button) => button.textContent?.includes(label));
  if (!target) throw new Error(`Nav button "${label}" not found.`);
  if (!(target instanceof HTMLButtonElement)) throw new Error(`Nav "${label}" is not a button.`);
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mockMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  mockMatchMedia();
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanup();
});

describe('Desktop navigation semantic separation', () => {
  it('stylesheet contains visibility gating rules for all five spaces', () => {
    expect(stylesSource).toContain('main[data-active-space] > [data-space] { display: none; }');
    for (const space of ['records', 'awareness', 'reflection', 'exploration', 'settings']) {
      expect(stylesSource).toContain('main[data-active-space="' + space + '"] > [data-space="' + space + '"]');
    }
  });

  it('renders only the active space sections after navigation', async () => {
    render(<App />);
    const expectedByLabel: Record<string, readonly string[]> = {
      '记录': ['records', 'records'],
      '觉察': ['awareness'],
      '理解': ['reflection'],
      '探索': ['exploration'],
      '设置': ['settings', 'settings', 'settings', 'settings'],
    };
    for (const [label, expected] of Object.entries(expectedByLabel)) {
      await clickNav(label);
      const main = document.querySelector('main');
      if (!main) throw new Error('Main content area not found.');
      expect(main.dataset.activeSpace).toBe(expected[0]);
      const rendered = getSpaceSections().filter((item) => expected.includes(item));
      expect(rendered).toEqual(expected);
    }
  });
});





