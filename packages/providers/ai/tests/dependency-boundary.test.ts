import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const sources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sources(path);
    return extname(path) === '.ts' ? [path] : [];
  });

describe('AI provider dependency boundary', () => {
  it('contains no Web, database, vendor SDK, or product-provider dependencies', () => {
    for (const path of sources(root)) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/from ['"](?:next|react|@prisma|openai|@anthropic|zhihu)/i);
      expect(source).not.toMatch(/node:sqlite|better-sqlite|postgres/i);
    }
  });
});
