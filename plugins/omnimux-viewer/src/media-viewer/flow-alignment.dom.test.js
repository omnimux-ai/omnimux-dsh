import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React from 'react';
import ReactDOMTestUtils from 'react-dom/test-utils';
import ReactDOMClient from 'react-dom/client';

const { act } = ReactDOMTestUtils;
const { createRoot } = ReactDOMClient;

// Real MediaViewerTab + real store + jsdom DOM. Layout geometry (container
// queries, drawer width) is proven in the browser evidence, not here.
const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../../../..');
let scratch;
let production;

before(async () => {
  mkdirSync(join(rootDir, '.tmp'), { recursive: true });
  scratch = mkdtempSync(join(rootDir, '.tmp', 'flow-alignment-dom-3533-'));
  const outfile = join(scratch, 'production.mjs');
  await build({
    stdin: {
      contents: `export { MediaViewerTab } from './MediaViewerTab.jsx';
export { getGlobalMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';
export { peekComposerPrefill, resetComposerPrefill } from '../../../omnimux/src/client/media-viewer/composer-prefill.js';`,
      resolveDir: here,
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    plugins: [{
      name: 'same-react',
      setup(builder) {
        builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', external: true }));
        builder.onResolve({ filter: /^react-dom\// }, (args) => ({ path: args.path, external: true }));
        builder.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: 'dsh-ui-kit', namespace: 'kit-stub' }));
        builder.onLoad({ filter: /.*/, namespace: 'kit-stub' }, () => ({
          loader: 'js',
          contents: `import React from 'react';
export const GenWaveCard = () => React.createElement('div', { className: 'stub-genwave' });
export const Button = (props) => React.createElement('button', props, props.children);
export const Card = (props) => React.createElement('div', props, props.children);`,
        }));
      },
    }],
  });
  production = await import(pathToFileURL(outfile).href);
});

after(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

function catalog() {
  return {
    image: [{
      id: 'synthetic-image-3533',
      label: 'Synthetic Image',
      family: 'qa',
      parameters: {
        aspectRatio: { defaultValue: '1:1', options: ['1:1', '16:9'] },
        resolution: { defaultValue: '1K', options: ['1K'] },
        n: { defaultValue: 2, options: [1, 2, 4] },
      },
      channelGroups: [{
        id: 'standard',
        label: '标准版',
        default: true,
        pricing: { pointsEstimate: 0.13, billingMode: 'per_task', discountRate: 1 },
      }],
      operations: [{ id: 'text_to_image', output: { type: 'image' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 }] }],
    }],
    video: [{
      id: 'synthetic-video-3533',
      label: 'Synthetic Video',
      family: 'qa',
      parameters: { aspectRatio: { defaultValue: '16:9', options: ['16:9'] }, resolution: { defaultValue: '720P', options: ['720P'] } },
      channelGroups: [{ id: 'standard', label: '标准版', default: true, pricing: { pointsEstimate: 8, billingMode: 'per_second', discountRate: 1 } }],
      operations: [{ id: 'text_to_video', output: { type: 'video' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 }] }],
    }],
  };
}

function mediaItem(id, timestamp, prompt, extra) {
  return Object.assign({
    id,
    sessionId: 's1',
    timestamp,
    type: 'image',
    status: 'completed',
    url: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23${id.replace(/[^0-9a-f]/gi, '') || '333'}ff'/%3E%3C/svg%3E`,
    title: prompt,
    prompt,
    request: { prompt },
    aspectRatio: '1:1',
  }, extra);
}

async function withMountedTab(run, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://synthetic.example.test' });
  const prior = new Map();
  const setGlobal = (name, value) => {
    prior.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  setGlobal('window', dom.window);
  setGlobal('document', dom.window.document);
  setGlobal('navigator', dom.window.navigator);
  setGlobal('HTMLElement', dom.window.HTMLElement);
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  dom.window.requestAnimationFrame = (callback) => setTimeout(callback, 0);

  const store = production.getGlobalMediaViewerStore();
  store.addMedia(mediaItem('m1', 1000, '第一张：白色瓷杯', { groupId: 'g1' }));
  store.addMedia(mediaItem('m2', 2000, '第二张：窗边人像', { groupId: 'g2' }));
  store.addMedia(mediaItem('m3', 3000, '第三张：沙漠柴犬', { groupId: 'g3' }));
  store.addMedia(mediaItem('g4:0', 4000, '批量四张：产品图', { groupId: 'g4' }));
  store.addMedia(mediaItem('g4:1', 4100, '批量四张：产品图', { groupId: 'g4' }));
  store.addMedia(mediaItem('v6', 4200, '视频结果：镜头推进', { groupId: 'g6', type: 'video', url: 'data:video/mp4;base64,AAAA' }));
  store.setActiveId(options.activeId || 'm3');

  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), method: init && init.method ? init.method : 'GET' });
    if (String(url) === '/omnimux/model-catalog') {
      if (options.catalogFailure) {
        return new Response('unavailable', { status: 503 });
      }
      const body = catalog();
      if (options.catalogVideoOnly) body.image = [];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url) === '/omnimux/assets/state') {
      return new Response(JSON.stringify({ assets: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unplanned request ${url}`);
  };

  production.resetComposerPrefill();
  let root;
  const activeSession = options.sessionId === undefined ? 's1' : options.sessionId;
  const sessions = {
    list: {
      getSnapshot: () => ({ current: activeSession }),
      subscribe: () => () => {},
    },
  };
  const t = (key) => key;
  try {
    root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(production.MediaViewerTab, { sessions, t }));
    });
    await act(async () => { await new Promise((resolvePromise) => setTimeout(resolvePromise, 30)); });
    await run({
      dom,
      act,
      requests,
      store,
      text: () => document.body.textContent,
      click: async (selector) => {
        const target = document.querySelector(selector);
        assert.ok(target, `missing ${selector}`);
        await act(async () => { target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
      },
      keydown: async (key) => {
        const target = dom.window.document.activeElement || dom.window;
        await act(async () => {
          target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
        });
      },
      clickText: async (label) => {
        const target = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
        assert.ok(target, `missing button ${label}`);
        await act(async () => { target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
      },
    });
  } finally {
    if (root) await act(async () => { root.unmount(); });
    globalThis.fetch = previousFetch;
    production.resetComposerPrefill();
    for (const name of prior.keys()) {
      const descriptor = prior.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test('历史栏渲染分组卡片、当前项与提示词快照', async () => {
  await withMountedTab(async ({ text }) => {
    const cards = document.querySelectorAll('.omx-mv-history__card');
    assert.equal(cards.length, 5);
    assert.equal(document.querySelector('.omx-mv-history__title').textContent, '历史');
    assert.match(text(), /第三张：沙漠柴犬/);
    assert.match(text(), /×2/);
    const active = document.querySelector('.omx-mv-history__card[aria-current="true"]');
    assert.ok(active);
    assert.match(active.textContent, /第三张：沙漠柴犬/);
    assert.equal(document.querySelector('.omx-mv-history__list').children.length, 5);
  });
});

test('点击历史卡切换舞台素材', async () => {
  await withMountedTab(async ({ click }) => {
    const beforeSrc = document.querySelector('.omx-mv-display img').getAttribute('src');
    await click('.omx-mv-history__list li:nth-child(4) .omx-mv-history__card');
    const afterSrc = document.querySelector('.omx-mv-display img').getAttribute('src');
    assert.notEqual(afterSrc, beforeSrc);
    assert.match(document.querySelector('.omx-mv-history__card[aria-current="true"]').textContent, /第二张：窗边人像/);
  });
});

test('复用提示只写入 composer 预填队列，不提交生成', async () => {
  await withMountedTab(async ({ click, requests }) => {
    const before = requests.filter((request) => request.method !== 'GET').length;
    await click('.omx-mv-history__list li:nth-child(4) .omx-mv-history__action');
    const textarea = document.querySelector('textarea');
    assert.equal(textarea.value, '第二张：窗边人像');
    const after = requests.filter((request) => request.method !== 'GET').length;
    assert.equal(after, before);
  });
});

test('图像模式显示成本预估，视频模式隐藏', async () => {
  await withMountedTab(async ({ click, clickText }) => {
    await click('#paramSummaryTriggerBtn');
    await clickText('2');
    const cost = document.querySelector('.omx-mv-cost');
    assert.ok(cost);
    assert.match(cost.textContent, /预估消耗/);
    assert.match(cost.textContent, /0\.26/);
    await click('.omx-external-mode-btn[title="视频模式"]');
    assert.equal(document.querySelector('.omx-mv-cost'), null);
  });
});

test('视频记录的历史缩略图使用 video 元素', async () => {
  await withMountedTab(async () => {
    const videoThumb = document.querySelector('.omx-mv-history video');
    assert.ok(videoThumb);
    assert.equal(videoThumb.getAttribute('src'), 'data:video/mp4;base64,AAAA');
  });
});

test('批量中的非 primary 项选中时卡片仍高亮', async () => {
  await withMountedTab(async () => {
    const active = document.querySelector('.omx-mv-history__card[aria-current="true"]');
    assert.ok(active);
    assert.match(active.textContent, /批量四张：产品图/);
  }, { activeId: 'g4:1' });
});

test('目录加载失败时不显示成本预估', async () => {
  await withMountedTab(async ({ requests }) => {
    assert.ok(requests.some((request) => request.url === '/omnimux/model-catalog'));
    assert.equal(document.querySelector('.omx-mv-cost'), null);
  }, { catalogFailure: true });
});

test('目录只返回视频时图像模式仍不显示成本', async () => {
  await withMountedTab(async () => {
    assert.equal(document.querySelector('.omx-mv-cost'), null);
  }, { catalogVideoOnly: true });
});

test('空会话显示历史空态且不聚合其他会话', async () => {
  await withMountedTab(async () => {
    assert.equal(document.querySelectorAll('.omx-mv-history__card').length, 0);
    assert.match(document.body.textContent, /暂无历史/);
  }, { sessionId: 's-empty' });
});

test('无会话时不聚合其他会话的历史', async () => {
  await withMountedTab(async () => {
    assert.equal(document.querySelectorAll('.omx-mv-history__card').length, 0);
  }, { sessionId: null });
});

test('抽屉打开时方向键不切换背后舞台，关闭按钮可收起', async () => {
  await withMountedTab(async ({ click, keydown, dom, act }) => {
    const before = document.querySelector('.omx-mv-display img').getAttribute('src');
    await click('.omx-mv-history-toggle');
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    await keydown('ArrowDown');
    const after = document.querySelector('.omx-mv-display img').getAttribute('src');
    assert.equal(after, before);
    assert.equal(document.querySelector('.omx-media-viewer').getAttribute('data-history-open'), 'true');
    await click('.omx-mv-history__close');
    assert.equal(document.querySelector('.omx-media-viewer').getAttribute('data-history-open'), 'false');
    await act(async () => { await new Promise((resolvePromise) => setTimeout(resolvePromise, 20)); });
    assert.equal(document.activeElement, document.querySelector('.omx-mv-history-toggle'));
  });
});

test('下载历史卡触发对应素材的 anchor 且使用记录标题', async () => {
  await withMountedTab(async ({ dom, click }) => {
    const captured = [];
    const prototype = dom.window.HTMLAnchorElement.prototype;
    const original = prototype.click;
    prototype.click = function capture() {
      captured.push({ href: this.href, download: this.download });
    };
    const firstCard = document.querySelector('.omx-mv-history__list li:nth-child(2)');
    assert.match(firstCard.textContent, /产品图/, firstCard.textContent);
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    try {
      await click('.omx-mv-history__list li:nth-child(2) .omx-mv-history__actions button:nth-child(2)');
    } finally {
      prototype.click = original;
    }
    assert.equal(captured.length, 1);
    assert.equal(captured[0].download, '批量四张：产品图');
    assert.match(captured[0].href, /^data:image\/svg\+xml/);
  });
});

test('抽屉状态与 Esc 关闭', async () => {
  await withMountedTab(async ({ click, keydown }) => {
    const root = document.querySelector('.omx-media-viewer');
    assert.equal(root.getAttribute('data-history-open'), 'false');
    await click('.omx-mv-history-toggle');
    assert.equal(root.getAttribute('data-history-open'), 'true');
    await keydown('Escape');
    assert.equal(root.getAttribute('data-history-open'), 'false');
  });
});

test('↑/↓ 在单图模式切换历史素材，输入框聚焦时不拦截', async () => {
  await withMountedTab(async ({ keydown }) => {
    const before = document.querySelector('.omx-mv-display img').getAttribute('src');
    await keydown('ArrowDown');
    const after = document.querySelector('.omx-mv-display img').getAttribute('src');
    assert.notEqual(after, before);
    const textarea = document.querySelector('textarea');
    textarea.focus();
    const focusedBefore = document.querySelector('.omx-mv-display img').getAttribute('src');
    await keydown('ArrowDown');
    assert.equal(document.querySelector('.omx-mv-display img').getAttribute('src'), focusedBefore);
  });
});
