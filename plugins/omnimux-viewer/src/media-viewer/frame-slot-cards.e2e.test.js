/**
 * Issue #2994 首帧/尾帧成对空卡槽：真实渲染 MediaSlotGroup 产出的 DOM，
 * 断言成对首尾帧才挂倾斜 modifier 与槽名，单首帧方式与参考槽零差异。
 * 规格：specs/2994-viewer-frame-slot-cards.spec.md
 * 浏览器证据：.agent-reports/issue-2994/frame-slot-cards-round2.{png,json}
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';
import React from 'react';
import { renderToString } from 'react-dom/server';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, '../../../..');
const scratchDir = join(rootDir, '.workbuddy');
mkdirSync(scratchDir, { recursive: true });
const tempFile = join(scratchDir, `temp-frame-slot-cards-${Date.now()}.mjs`);

let MediaSlotGroup;
try {
  await esbuild.build({
    entryPoints: [join(here, './MediaSlotGroup.jsx')],
    bundle: true,
    format: 'esm',
    outfile: tempFile,
    external: ['react', 'react/jsx-runtime', 'react-dom'],
  });
  ({ MediaSlotGroup } = await import(pathToFileURL(tempFile).href));
} finally {
  try { unlinkSync(tempFile); } catch {}
}

const slotOf = (role, label) => ({
  key: `image:${role}:${role}`, slot: role, type: 'image', role,
  max: role === 'reference' ? 4 : 1, durationMax: null, allowedMimes: [], label,
});

function render(props) {
  const html = renderToString(React.createElement(MediaSlotGroup, {
    items: [], onChange() {}, onReject() {}, ...props,
  }));
  return new JSDOM(`<body>${html}</body>`).window.document;
}

describe('Issue #2994 首帧/尾帧成对空卡槽 DOM 渲染', () => {
  it('成对首帧：挂 is-frame-first、加号图标与逐字槽名「首帧」，aria-label 不变', () => {
    const doc = render({ slot: slotOf('first_frame', '首帧'), framePair: 'first' });
    const group = doc.querySelector('.omx-slot-group');
    assert.equal(group.classList.contains('is-frame'), true);
    assert.equal(group.classList.contains('is-frame-first'), true);
    const btn = doc.querySelector('.omx-slot-btn');
    assert.equal(btn.querySelector('path').getAttribute('d'), 'M12 5v14M5 12h14');
    assert.equal(doc.querySelector('.omx-slot-btn-label').textContent, '首帧');
    assert.equal(btn.getAttribute('aria-label'), '首帧');
  });

  it('成对尾帧：挂 is-frame-last 与逐字槽名「尾帧」', () => {
    const doc = render({ slot: slotOf('last_frame', '尾帧'), framePair: 'last' });
    assert.equal(doc.querySelector('.omx-slot-group').classList.contains('is-frame-last'), true);
    assert.equal(doc.querySelector('.omx-slot-btn-label').textContent, '尾帧');
  });

  it('单首帧方式（无相邻尾帧，framePair 缺省）：不倾斜、不渲染槽名，保持原类型图标', () => {
    const doc = render({ slot: slotOf('first_frame', '首帧') });
    const group = doc.querySelector('.omx-slot-group');
    assert.equal(group.classList.contains('is-frame'), false);
    assert.equal(group.classList.contains('is-frame-first'), false);
    assert.equal(doc.querySelector('.omx-slot-btn-label'), null);
    assert.notEqual(doc.querySelector('.omx-slot-btn path').getAttribute('d'), 'M12 5v14M5 12h14');
  });

  it('参考槽即使误传 framePair 也不挂帧样式', () => {
    const doc = render({ slot: slotOf('reference', ''), framePair: 'first' });
    assert.equal(doc.querySelector('.omx-slot-group').classList.contains('is-frame'), false);
    assert.equal(doc.querySelector('.omx-slot-btn-label'), null);
  });

  it('成对首帧已填素材：添加按钮消失，缩略图卡不挂槽名', () => {
    const doc = render({
      slot: slotOf('first_frame', '首帧'),
      framePair: 'first',
      items: [{ id: 'a', url: 'https://example.com/a.png', name: 'a.png', type: 'image/png' }],
    });
    assert.equal(doc.querySelector('.omx-slot-btn'), null);
    assert.equal(doc.querySelectorAll('.omx-slot-card').length, 1);
    assert.equal(doc.querySelector('.omx-slot-btn-label'), null);
  });
});
