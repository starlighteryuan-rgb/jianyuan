import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FORBIDDEN = [/^next(?:\/|$)/, /^react(?:\/|$)/, /^@prisma(?:\/|$)/, /^prisma(?:\/|$)/];

const files = (directory: string): string[] => {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : extname(path) === '.ts' && !path.includes(`${join('tests', '')}`)
        ? [path]
        : [];
  });
};

describe('SQLite adapter dependency boundary', () => {
  it('does not import Web, Prisma, or React', () => {
    for (const path of files(ROOT)) {
      const source = readFileSync(path, 'utf8');
      const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
        (match) => match[1] ?? '',
      );
      for (const specifier of specifiers) {
        expect(
          FORBIDDEN.some((pattern) => pattern.test(specifier)),
          `${relative(ROOT, path)} imports ${specifier}`,
        ).toBe(false);
      }
    }
  });
});
