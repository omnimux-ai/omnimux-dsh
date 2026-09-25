/**
 * @file plugins/omnimux-market/src/expert/pixel-avatar.js
 * 开源风格像素头像生成器（Pixel Art Avatar Generator）。
 */

import {
  PIXEL_AVATAR_ACCESSORIES,
  PIXEL_AVATAR_ACCESSORY_COLORS,
  PIXEL_AVATAR_BACKGROUNDS,
  PIXEL_AVATAR_CLOTHING,
  PIXEL_AVATAR_DEFAULT_RENDER_SIZE,
  PIXEL_AVATAR_EYE_COLORS,
  PIXEL_AVATAR_EYE_COVERING_ACCESSORIES,
  PIXEL_AVATAR_EYE_STYLES,
  PIXEL_AVATAR_FACIAL_HAIR,
  PIXEL_AVATAR_GRID,
  PIXEL_AVATAR_HAIR_COLORS,
  PIXEL_AVATAR_HAIR_STYLES,
  PIXEL_AVATAR_MOUTH_STYLES,
  PIXEL_AVATAR_SKIN_TONES,
  PIXEL_AVATAR_TOOTH_COLOR,
} from './pixel-avatar-constants.js';

const HAIR_STYLE_KEYS = Object.keys(PIXEL_AVATAR_HAIR_STYLES);
const EYE_STYLE_KEYS = Object.keys(PIXEL_AVATAR_EYE_STYLES);
const MOUTH_STYLE_KEYS = Object.keys(PIXEL_AVATAR_MOUTH_STYLES);
const FACIAL_HAIR_KEYS = Object.keys(PIXEL_AVATAR_FACIAL_HAIR);
const ACCESSORY_KEYS = Object.keys(PIXEL_AVATAR_ACCESSORIES);

export function hashPixelAvatarSeed(text) {
  const source = text === null || text === undefined ? '' : String(text);
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function createPixelAvatarRandom(seedValue) {
  let state = seedValue >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom(random, list) {
  const index = Math.floor(random() * list.length);
  return list[Math.min(Math.max(index, 0), list.length - 1)];
}

function createCells(fill) {
  const cells = [];
  for (let y = 0; y < PIXEL_AVATAR_GRID; y += 1) cells.push(new Array(PIXEL_AVATAR_GRID).fill(fill));
  return cells;
}

function paintRun(cells, x0, x1, y, color) {
  if (!color || y < 0 || y >= PIXEL_AVATAR_GRID) return;
  const from = Math.max(0, Math.min(x0, x1));
  const to = Math.min(PIXEL_AVATAR_GRID - 1, Math.max(x0, x1));
  const row = cells[y];
  for (let x = from; x <= to; x += 1) row[x] = color;
}

function paintPixel(cells, x, y, color) {
  paintRun(cells, x, x, y, color);
}

function paintRuns(cells, runs, color) {
  if (!runs || !color) return;
  for (const run of runs) paintRun(cells, run[0], run[1], run[2], color);
}

function paintPixels(cells, pixels, color) {
  if (!pixels || !color) return;
  for (const pixel of pixels) paintPixel(cells, pixel[0], pixel[1], color);
}

function paintBackdrop(cells, background, random) {
  for (let y = 0; y < PIXEL_AVATAR_GRID; y += 1) {
    for (let x = 0; x < PIXEL_AVATAR_GRID; x += 1) cells[y][x] = background.base;
  }
  const leftSide = random() < 0.5;
  const column = leftSide ? 1 : 14;
  const sparkleY = 2 + (random() < 0.5 ? 0 : 1);
  paintPixel(cells, column, sparkleY, background.accent);
  paintPixel(cells, column, sparkleY + 1, background.accent);
  if (random() < 0.5) paintPixel(cells, leftSide ? 2 : 13, sparkleY + 2, background.accent);
}

function paintHead(cells, skin) {
  paintRun(cells, 5, 10, 2, skin.base);
  for (let y = 3; y <= 10; y += 1) paintRun(cells, 4, 11, y, skin.base);
  paintRun(cells, 5, 10, 11, skin.base);
  for (let y = 6; y <= 8; y += 1) {
    paintPixel(cells, 3, y, skin.shade);
    paintPixel(cells, 12, y, skin.shade);
  }
  paintRun(cells, 5, 6, 11, skin.shade);
  paintRun(cells, 9, 10, 11, skin.shade);
}

function paintBody(cells, skin, clothes) {
  paintRun(cells, 4, 11, 12, clothes.base);
  for (let y = 13; y <= 15; y += 1) paintRun(cells, 3, 12, y, clothes.base);
  for (let y = 13; y <= 15; y += 1) {
    paintPixel(cells, 3, y, clothes.shade);
    paintPixel(cells, 12, y, clothes.shade);
  }
  paintRun(cells, 5, 10, 15, clothes.shade);
  paintRun(cells, 7, 8, 12, skin.shade);
  paintPixel(cells, 6, 12, clothes.collar);
  paintPixel(cells, 9, 12, clothes.collar);
  paintRun(cells, 6, 9, 13, clothes.collar);
}

function paintHair(cells, styleKey, hairColor, hatColor) {
  const style = PIXEL_AVATAR_HAIR_STYLES[styleKey] || PIXEL_AVATAR_HAIR_STYLES.short;
  const tone = style.hat ? hatColor : hairColor;
  paintRuns(cells, style.base, tone.base);
  paintRuns(cells, style.shade, tone.shade);
  paintRuns(cells, style.highlight, tone.highlight);
  paintRuns(cells, style.brim, tone.shade);
  if (style.hat) paintRuns(cells, style.hair, hairColor.base);
}

function paintFacialHair(cells, styleKey, hairColor) {
  const style = PIXEL_AVATAR_FACIAL_HAIR[styleKey];
  if (!style || styleKey === 'none') return;
  paintRuns(cells, style.base, hairColor.base);
  paintRuns(cells, style.shade, hairColor.shade);
}

function paintEyes(cells, styleKey, tone) {
  const style = PIXEL_AVATAR_EYE_STYLES[styleKey] || PIXEL_AVATAR_EYE_STYLES.round;
  paintRuns(cells, style.eye, tone.eye);
  paintPixels(cells, style.pixel, tone.eye);
  paintPixels(cells, style.glint, tone.glint);
}

function paintMouth(cells, styleKey, color) {
  const style = PIXEL_AVATAR_MOUTH_STYLES[styleKey] || PIXEL_AVATAR_MOUTH_STYLES.smile;
  paintRuns(cells, style.line, color);
  paintPixels(cells, style.pixel, color);
  paintPixels(cells, style.tooth, PIXEL_AVATAR_TOOTH_COLOR);
}

function paintAccessory(cells, accessoryKey) {
  const accessory = PIXEL_AVATAR_ACCESSORIES[accessoryKey];
  if (!accessory || accessoryKey === 'none') return;
  const frameColor = accessoryKey === 'earring' ? PIXEL_AVATAR_ACCESSORY_COLORS.gold : PIXEL_AVATAR_ACCESSORY_COLORS.frame;
  paintRuns(cells, accessory.frame, frameColor);
  paintRuns(cells, accessory.lens, PIXEL_AVATAR_ACCESSORY_COLORS.lens);
}

export function alignPixelAvatarEyes(accessoryKey, eyeStyleKey) {
  if (PIXEL_AVATAR_EYE_COVERING_ACCESSORIES.includes(accessoryKey) && (eyeStyleKey === 'sleepy' || eyeStyleKey === 'wink')) {
    return 'round';
  }
  return eyeStyleKey;
}

function resolveRenderSize(options) {
  const candidate = options && typeof options === 'object' ? Number(options.size) : NaN;
  if (Number.isFinite(candidate) && candidate > 0) return Math.round(candidate);
  return PIXEL_AVATAR_DEFAULT_RENDER_SIZE;
}

function renderCellsToSvg(cells, size) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`,
    ` viewBox="0 0 ${PIXEL_AVATAR_GRID} ${PIXEL_AVATAR_GRID}"`,
    ' shape-rendering="crispEdges" role="img" aria-label="pixel avatar" focusable="false">',
  ];
  for (let y = 0; y < PIXEL_AVATAR_GRID; y += 1) {
    const row = cells[y];
    let x = 0;
    while (x < PIXEL_AVATAR_GRID) {
      const color = row[x];
      let runLength = 1;
      while (x + runLength < PIXEL_AVATAR_GRID && row[x + runLength] === color) runLength += 1;
      parts.push(`<rect x="${x}" y="${y}" width="${runLength}" height="1" fill="${color}"/>`);
      x += runLength;
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

const SVG_CACHE = new Map();
const SVG_CACHE_LIMIT = 256;

function rememberSvg(cacheKey, svg) {
  if (SVG_CACHE.size >= SVG_CACHE_LIMIT) SVG_CACHE.clear();
  SVG_CACHE.set(cacheKey, svg);
}

export function generatePixelAvatarSvg(seed, options) {
  const size = resolveRenderSize(options);
  const seedKey = seed === null || seed === undefined ? '' : String(seed);
  const cacheKey = `${seedKey}#${size}`;
  const cached = SVG_CACHE.get(cacheKey);
  if (cached) return cached;

  const random = createPixelAvatarRandom(hashPixelAvatarSeed(seedKey));
  const skin = pickFrom(random, PIXEL_AVATAR_SKIN_TONES);
  const hairColor = pickFrom(random, PIXEL_AVATAR_HAIR_COLORS);
  const clothes = pickFrom(random, PIXEL_AVATAR_CLOTHING);
  const background = pickFrom(random, PIXEL_AVATAR_BACKGROUNDS);
  const hairStyleKey = pickFrom(random, HAIR_STYLE_KEYS);
  const eyeTone = pickFrom(random, PIXEL_AVATAR_EYE_COLORS);
  const eyeStyleKey = pickFrom(random, EYE_STYLE_KEYS);
  const mouthStyleKey = pickFrom(random, MOUTH_STYLE_KEYS);
  const facialHairKey = pickFrom(random, FACIAL_HAIR_KEYS);
  const accessoryKey = pickFrom(random, ACCESSORY_KEYS);
  const hatColor = pickFrom(random, PIXEL_AVATAR_CLOTHING.filter((c) => c.base !== clothes.base));

  const cells = createCells(background.base);
  paintBackdrop(cells, background, random);
  paintBody(cells, skin, clothes);
  paintHead(cells, skin);
  paintHair(cells, hairStyleKey, hairColor, hatColor);
  paintFacialHair(cells, facialHairKey, hairColor);
  paintEyes(cells, alignPixelAvatarEyes(accessoryKey, eyeStyleKey), eyeTone);
  paintPixel(cells, 7, 9, skin.shade);
  paintMouth(cells, mouthStyleKey, skin.shade);
  paintPixel(cells, 4, 9, skin.blush);
  paintPixel(cells, 11, 9, skin.blush);
  paintAccessory(cells, accessoryKey);

  const svg = renderCellsToSvg(cells, size);
  rememberSvg(cacheKey, svg);
  return svg;
}

export function generatePixelAvatarDataUrl(seed, options) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(generatePixelAvatarSvg(seed, options));
}

export function isPixelAvatarDataUrl(src) {
  return typeof src === 'string' && src.startsWith('data:image/svg+xml');
}
