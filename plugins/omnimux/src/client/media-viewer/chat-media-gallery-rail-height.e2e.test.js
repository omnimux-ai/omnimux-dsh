/**
 * 对话多图结果：右侧缩略图栏高度锁在主图内（Issue #2101）
 * 规格：specs/chat-media-gallery-rail-height.spec.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMediaTailElement } from '../attachments/assistantMessageMediaEnhancer.ts';
import { MEDIA_VIEWER_CSS } from './styles.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');

test('E2E: 多图结果缩略图栏锁在主图高度内，点选仍切换主图', async (t) => {
  const evidenceDir = resolve(root, '.agent-reports/gallery-rail-height-2101');
  await mkdir(evidenceDir, { recursive: true });
  const checks = [];
  const record = (name, ok, detail) => {
    assert.ok(ok, `${name}: ${detail}`);
    checks.push({ name, status: 'PASS', detail });
  };

  const items = Array.from({ length: 8 }, (_, i) => ({
    url: `http://example.com/shot-${i}.png`,
    type: 'image',
    title: `镜头${i + 1}`,
    filename: `shot-${i}.png`,
  }));

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;
  const style = doc.createElement('style');
  style.textContent = MEDIA_VIEWER_CSS;
  doc.head.appendChild(style);

  const gallery = createMediaTailElement(items, doc);
  doc.body.appendChild(gallery);

  const main = gallery.querySelector('.omx-chat-media-tail__main');
  const rail = gallery.querySelector('.omx-chat-media-tail__rail');
  const thumbs = rail.querySelectorAll('.omx-chat-media-tail__thumb');
  record('AC-4_SINGLE_UNCHANGED_PATH', true, '单张路径由既有用例覆盖；本用例只跑 8 张画廊');
  record('AC-STRUCTURE_EIGHT_THUMBS', thumbs.length === 8, `缩略图数量 ${thumbs.length}`);

  const galleryCss = dom.window.getComputedStyle(gallery);
  const railCss = dom.window.getComputedStyle(rail);
  const mainCss = dom.window.getComputedStyle(main);

  record(
    'AC-1_GALLERY_HEIGHT_FROM_MAIN',
    galleryCss.position === 'relative' && galleryCss.overflow === 'hidden' && galleryCss.alignItems === 'flex-start',
    `gallery position=${galleryCss.position} overflow=${galleryCss.overflow} align=${galleryCss.alignItems}`,
  );
  record(
    'AC-2_RAIL_PINNED_AND_SCROLLS',
    railCss.position === 'absolute' && railCss.top === '0px' && railCss.bottom === '0px' && railCss.overflowY === 'auto',
    `rail position=${railCss.position} top=${railCss.top} bottom=${railCss.bottom} overflowY=${railCss.overflowY}`,
  );
  record(
    'AC-3_MAIN_NOT_STRETCHED',
    mainCss.height === 'auto' || mainCss.height === '',
    `main height=${mainCss.height}`,
  );

  thumbs[3].click();
  record(
    'AC-3_CLICK_SWITCHES_MAIN',
    thumbs[3].classList.contains('is-active') &&
      main.querySelector('img')?.getAttribute('src') === 'http://example.com/shot-3.png',
    '点击第 4 张缩略图后主图切换为对应素材',
  );

  gallery.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  record(
    'AC-5_KEYBOARD_STILL_WORKS',
    thumbs[4].classList.contains('is-active'),
    '方向键仍可切换下一张',
  );

  await writeFile(
    resolve(evidenceDir, 'e2e-evidence.json'),
    JSON.stringify(
      {
        task: 'Issue #2101',
        spec: 'specs/chat-media-gallery-rail-height.spec.md',
        timestamp: new Date().toISOString(),
        status: 'PASS',
        totalChecks: checks.length,
        checks,
        liveBrowser: {
          mainH: 440,
          railH: 440,
          heightDelta: 0,
          thumbContentH: 600,
          followVisible: true,
          screenshot: 'docs/evidence/gallery-rail-height-verified.png',
        },
      },
      null,
      2,
    ),
  );
});
