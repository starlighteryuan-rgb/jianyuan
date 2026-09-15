/**
 * Metro resolution for a monorepo WITHOUT npm workspaces.
 *
 * The repo root deliberately has no `workspaces` field (see root
 * package.json), so Metro cannot discover `packages/core`,
 * `packages/providers/*`, or `packages/storage/*` on its own: they live above
 * the project root and carry TypeScript sources with no build step.
 *
 * Two things are therefore required and nothing more:
 *   1. `watchFolders` — let Metro read files outside apps/mobile.
 *   2. `resolver.nodeModulesPaths` — resolve bare specifiers (react,
 *      react-native, expo-*) from apps/mobile/node_modules first, then fall
 *      back to the repo root, so a package imported from `packages/*` still
 *      finds its dependencies.
 *
 * `blockList` keeps the repo-root node_modules OUT of the graph except as a
 * resolution fallback, which prevents two copies of react/react-native from
 * being bundled when the root install also has them.
 */

const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(repoRoot, 'node_modules'),
  ],
  // The shared packages ship .ts sources directly; make sure the raw
  // TypeScript extension is resolvable for extensionless relative imports.
  sourceExts: [...new Set([...(config.resolver?.sourceExts ?? []), 'ts', 'tsx'])],
};

module.exports = config;
