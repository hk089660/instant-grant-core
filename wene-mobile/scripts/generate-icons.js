#!/usr/bin/env node
/**
 * アプリアイコン生成スクリプト
 *
 * - assets/icon-source.png がある場合: その画像をリサイズして icon / adaptive-icon / favicon を生成
 * - ない場合: 白黒ミニマル "W" ロゴ（SVG）をフォールバックとして生成
 *
 * Usage: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SIZE = 1024;
const SOURCE_NAMES = ['icon-source.png', 'icon-source.webp', 'icon-source.jpg', 'icon-source.jpeg'];

// 幾何学的な "W" の SVG パス（フォントに依存しない・フォールバック用）
const wPath = [
  'M 180 160 L 180 864 L 350 864 L 512 520 L 674 864 L 844 864 L 844 160',
  'L 674 160 L 674 520 L 512 300 L 350 520 L 350 160 Z',
].join(' ');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#ffffff"/>
  <path d="${wPath}" fill="#000000"/>
</svg>
`;

function findSourceImage() {
  for (const name of SOURCE_NAMES) {
    const p = path.join(ASSETS_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function generateFromSource(sourcePath) {
  const basePath = path.join(ASSETS_DIR, 'icon.png');
  const adaptivePath = path.join(ASSETS_DIR, 'adaptive-icon.png');
  const faviconPath = path.join(ASSETS_DIR, 'favicon.png');
  const splashPath = path.join(ASSETS_DIR, 'splash.png');

  const meta = await sharp(sourcePath).metadata();
  const isExactSize = meta.width === SIZE && meta.height === SIZE;

  // アイコン: 先ほど送った画像のデザインをそのまま使用
  // 1024x1024 ならリサイズせず、それ以外は fit('contain') でアスペクト維持＋白余白
  if (isExactSize) {
    await sharp(sourcePath).png().toFile(basePath);
  } else {
    await sharp(sourcePath)
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile(basePath);
  }
  console.log('Created:', basePath);

  if (isExactSize) {
    await sharp(sourcePath).png().toFile(adaptivePath);
  } else {
    await sharp(sourcePath)
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile(adaptivePath);
  }
  console.log('Created:', adaptivePath);

  await sharp(sourcePath).resize(48, 48, { fit: 'contain' }).png().toFile(faviconPath);
  console.log('Created:', faviconPath);

  // スプラッシュ: 同じデザインをそのまま使用（1024x1024）
  if (isExactSize) {
    await sharp(sourcePath).png().toFile(splashPath);
  } else {
    await sharp(sourcePath)
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile(splashPath);
  }
  console.log('Created:', splashPath);
}

async function generateFromSvg() {
  const buffer = Buffer.from(svg);
  const basePath = path.join(ASSETS_DIR, 'icon.png');
  const adaptivePath = path.join(ASSETS_DIR, 'adaptive-icon.png');
  const faviconPath = path.join(ASSETS_DIR, 'favicon.png');

  await sharp(buffer).resize(SIZE, SIZE).png().toFile(basePath);
  console.log('Created:', basePath);

  await sharp(buffer).resize(SIZE, SIZE).png().toFile(adaptivePath);
  console.log('Created:', adaptivePath);

  await sharp(buffer).resize(48, 48).png().toFile(faviconPath);
  console.log('Created:', faviconPath);
}

async function generateIcons() {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  const source = findSourceImage();
  if (source) {
    console.log('Using source image:', source);
    await generateFromSource(source);
  } else {
    console.log('No icon-source.* found; using built-in SVG.');
    await generateFromSvg();
  }
  console.log('Done.');
}

generateIcons().catch((err) => {
  console.error(err);
  process.exit(1);
});
