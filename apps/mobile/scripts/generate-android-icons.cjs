#!/usr/bin/env node
/**
 * Derive Android adaptive-icon assets from the canonical iOS icon.
 *
 * Android adaptive icons composite a foreground layer over a background layer
 * and may mask the result to a circle, squircle, or another OEM shape. Keep the
 * complete brand mark inside the adaptive safe zone instead of cropping it.
 */

const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const sourcePath = path.join(assetsDir, 'icon.png');
const foregroundPath = path.join(assetsDir, 'android-icon-foreground.png');
const backgroundPath = path.join(assetsDir, 'android-icon-background.png');
const monochromePath = path.join(assetsDir, 'android-icon-monochrome.png');
const size = 1024;
const foregroundScale = 0.74;
const background = { r: 22, g: 21, b: 18, alpha: 1 };

async function main() {
  const source = sharp(sourcePath);
  const metadata = await source.metadata();

  if (metadata.width !== size || metadata.height !== size) {
    throw new Error(
      `Canonical icon must be ${size}x${size}; got ${metadata.width}x${metadata.height}`,
    );
  }

  const foregroundSize = Math.round(size * foregroundScale);
  const foregroundOffset = Math.round((size - foregroundSize) / 2);
  const scaledSource = await source
    .clone()
    .resize(foregroundSize, foregroundSize, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: scaledSource,
        left: foregroundOffset,
        top: foregroundOffset,
      },
    ])
    .png()
    .toFile(foregroundPath);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .png()
    .toFile(backgroundPath);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp(foregroundPath).ensureAlpha().extractChannel('alpha').toBuffer(),
        blend: 'dest-in',
      },
    ])
    .png()
    .toFile(monochromePath);

  console.log(`Generated Android adaptive icons from ${path.relative(root, sourcePath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
