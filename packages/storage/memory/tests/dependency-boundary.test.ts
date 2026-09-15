import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const adapterRoot = fileURLToPath(new URL('..', import.meta.url));
const forbiddenImports = [
  /^next(?:\/|$)/,
  /^react(?:\/|$)/,
  /^@prisma(?:\/|$)/,
  /^prisma(?:\/|$)/,
  /^pg(?:\/|$)/,
  /^postgres(?:\/|$)/,
  /(?:^|\/)src(?:\/|$)/,
];

const listTypeScriptFiles = async (directory: string): Promise<readonly string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'tests') {
      files.push(...await listTypeScriptFiles(path));
    }
    if (entry.isFile() && extname(entry.name) === '.ts') files.push(path);
  }
  return files;
};

const importedSpecifiers = (source: string): readonly string[] => {
  const specifiers: string[] = [];
  const pattern = /(?:from\s+|import\s*)['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
};

describe('Memory storage dependency boundary', () => {
  it('depends inward on Core and not on Web or database implementations', async () => {
    const violations: string[] = [];
    for (const file of await listTypeScriptFiles(adapterRoot)) {
      const source = await readFile(file, 'utf8');
      for (const specifier of importedSpecifiers(source)) {
        if (forbiddenImports.some((pattern) => pattern.test(specifier))) {
          violations.push(`${relative(adapterRoot, file)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
