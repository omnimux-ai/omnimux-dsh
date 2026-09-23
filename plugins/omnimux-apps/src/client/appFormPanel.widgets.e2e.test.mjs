/**
 * plugins/omnimux-apps/src/client/appFormPanel.widgets.e2e.test.mjs
 *
 * E2E (jsdom real-DOM) tests for the Issue #2596 compound widgets.
 * Drives the BUILT client bundle (lib/client.js) through a ModuleLoader shim:
 * real rendering, real click/input/blur events, library HTTP seams stubbed
 * with fixtures. Grounded in the worktree verify evidence
 * (.agent-reports/form-widgets/verify-*.png).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const pluginRoot = path.resolve(import.meta.dirname, '..', '..');

const catalogApps = JSON.parse(
  fs.readFileSync(path.join(pluginRoot, 'catalog', 'builtin-apps.json'), 'utf-8'),
);
const PRODUCT_VIDEO = catalogApps.find((a) => a.appId === 'app-builtin-product-video');
const VIDEO_TO_PROMPT = catalogApps.find((a) => a.appId === 'app-builtin-video-to-prompt');

const ASSET_FIXTURE = {
  lrev: 1,
  assets: [
    {
      id: 'ast_1',
      name: '白色卫衣主图',
      type: 'image',
      description: '',
      cover_file_id: 'fil_ast_1',
      cover: { id: 'fil_ast_1', uri: 'asset://image/ast_1' },
      files: [{ id: 'fil_ast_1', uri: 'asset://image/ast_1' }],
    },
    {
      id: 'ast_2',
      name: '开箱视频片段',
      type: 'video',
      description: '',
      cover_file_id: 'fil_ast_2',
      cover: { id: 'fil_ast_2', uri: 'asset://video/ast_2' },
      files: [{ id: 'fil_ast_2', uri: 'asset://video/ast_2' }],
    },
  ],
};
const PRODUCT_FIXTURE = {
  revision: 1,
  products: [
    { id: 'prd_1', name: '极简连帽卫衣', sku: 'SKU-1001', link: 'https://shop.example.com/p/1' },
  ],
};

let React;
let createRoot;
let act;
let AppFormPanel;
let dom;
let doc;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function click(el) {
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

async function initEnv() {
  if (React) return;
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  doc = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  // Stub the public library seams
  globalThis.fetch = async (url) => {
    const u = String(url);
    const body = u.includes('/omnimux/assets/library')
      ? ASSET_FIXTURE
      : u.includes('/omnimux/products/collection')
        ? PRODUCT_FIXTURE
        : { data: { items: [] } };
    return { ok: true, status: 200, json: async () => body };
  };
  dom.window.fetch = globalThis.fetch;

  // Load the built client bundle through the ModuleLoader contract
  React = require('react');
  ({ createRoot } = require('react-dom/client'));
  ({ act } = React);

  const bundlePath = path.join(pluginRoot, 'lib', 'client.js');
  assert.ok(fs.existsSync(bundlePath), 'lib/client.js must be built before e2e (pnpm --filter omnimux-apps build)');
  let captured = null;
  dom.window.__ModuleLoader__ = {
    load({ id, factory }) {
      assert.equal(id, 'omnimux-apps');
      const shim = (name) => {
        if (name === 'react') return React;
        if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
        if (name === 'react-dom') return require('react-dom');
        if (name === 'react-dom/client') return require('react-dom/client');
        if (name === 'lucide-react') return require('lucide-react');
        throw new Error(`unexpected external: ${name}`);
      };
      captured = factory(shim);
    },
  };
  dom.window.eval(fs.readFileSync(bundlePath, 'utf-8'));
  assert.ok(captured, 'bundle must register through __ModuleLoader__');
  AppFormPanel = captured.AppFormPanel;
}

async function mountPanel(manifest, initialValues) {
  await initEnv();
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const changes = [];
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(AppFormPanel, {
        manifest,
        initialValues,
        onChange: (values) => changes.push(values),
      }),
    );
  });
  const latest = () => changes[changes.length - 1] || {};
  return { host, latest };
}


describe('Compound widgets E2E (Issue #2596, built bundle, jsdom real DOM)', () => {

  it('segmented-tabs: clicking switches the single-choice value', async () => {
    const { host, latest } = await mountPanel(VIDEO_TO_PROMPT);
    const tabs = host.querySelectorAll('.omx-widget-seg-tab');
    assert.equal(tabs.length, 2, '视频转提示词的提示词语言应为 2 个选项卡');

    await act(async () => click(tabs[1]));
    assert.equal(latest().prompt_language, 'en');
    assert.ok(tabs[1].classList.contains('is-on'));
  });

  it('multi-tags: toggle adds/removes and the max limit locks unselected tags', async () => {
    // 视频转提示词的拆解维度默认已选 ['hook','pacing']，上限 4
    const { host, latest } = await mountPanel(VIDEO_TO_PROMPT);
    const tags = [...host.querySelectorAll('.omx-widget-mtag')];
    assert.equal(tags.length, 4, '拆解维度应有 4 个胶囊');
    const focus = () => JSON.stringify(latest().analysis_focus || ['hook', 'pacing']);
    // 注意：组件在 jsdom realm 执行，数组原型跨域，一律用 JSON 比较
    assert.equal(focus(), JSON.stringify(['hook', 'pacing']));

    await act(async () => click(tags[0])); // 取消 hook
    assert.equal(focus(), JSON.stringify(['pacing']));
    await act(async () => click(tags[0])); // 重新选回 hook
    assert.equal(focus(), JSON.stringify(['pacing', 'hook']));

    await act(async () => click(tags[2])); // shots
    await act(async () => click(tags[3])); // script -> 触及 maxItems 4
    assert.equal(focus(), JSON.stringify(['pacing', 'hook', 'shots', 'script']));
    assert.ok(host.textContent.includes('已达上限，先取消一项'), '达上限必须出现提示');

    // 取消一项后提示消失
    await act(async () => click(tags[3]));
    assert.equal(focus(), JSON.stringify(['pacing', 'hook', 'shots']));
    assert.ok(!host.textContent.includes('已达上限'), '取消一项后上限提示应消失');
  });

  it('library-picker: modal search + grid + confirm writes an encoded card, removable', async () => {
    const { host, latest } = await mountPanel(PRODUCT_VIDEO);
    const trigger = [...host.querySelectorAll('.omx-widget-library-trigger')][0];
    assert.ok(trigger, '商品主图字段应渲染资产库触发行');

    await act(async () => click(trigger));
    await act(async () => {
      await sleep(10);
    });
    const modal = doc.querySelector('.omx-widget-modal');
    assert.ok(modal, '点击触发行应打开库选择弹窗');
    assert.ok(modal.textContent.includes('从资产库选择'));

    const items = modal.querySelectorAll('.omx-widget-lib-item');
    assert.equal(items.length, 2, '弹窗网格应渲染 fixture 资产');

    // confirm stays disabled until a selection
    const confirmBtn = [...modal.querySelectorAll('.omx-widget-modal-btn-primary')][0];
    assert.ok(confirmBtn.disabled, '未选择时确认按钮禁用');

    await act(async () => click(items[0]));
    assert.ok(items[0].classList.contains('is-on'));
    await act(async () => click(confirmBtn));

    const val = latest().product_image;
    assert.ok(typeof val === 'string' && val.startsWith('{'), '回填值应为编码 JSON 字符串');
    const parsed = JSON.parse(val);
    assert.equal(parsed.name, '白色卫衣主图');
    assert.equal(parsed.source, 'asset');
    assert.equal(parsed.url, 'asset://image/ast_1');

    // picked card rendered with remove button; modal closed
    assert.ok(!doc.querySelector('.omx-widget-modal'), '确认后弹窗应关闭');
    const clearBtn = host.querySelector('.omx-widget-picked-clear');
    assert.ok(clearBtn, '回填后应出现可移除卡片');
    await act(async () => click(clearBtn));
    assert.equal(latest().product_image, '', '移除后字段清空并回到触发行');
  });

  it('media-extractor: paste link commits via 解析 into a removable link card', async () => {
    const { host, latest } = await mountPanel(VIDEO_TO_PROMPT);
    const input = host.querySelector('.omx-widget-extractor-input');
    assert.ok(input, '视频链接字段应渲染复合输入框');

    // 三来源齐备（提交前断言，提交后输入行被卡片替换）：上传按钮 + 资产库按钮 + 隐藏 file input
    const iconBtns = [...host.querySelectorAll('.omx-widget-extractor-icon-btn')].map((b) =>
      b.getAttribute('aria-label'),
    );
    assert.ok(iconBtns.includes('本地上传'));
    assert.ok(iconBtns.includes('从资产库选择'));
    assert.ok(host.querySelector('input[type="file"]'), '隐藏上传 input 应存在');

    // React 受控输入需走原生 setter 再派 input 事件
    const nativeSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      nativeSetter.call(input, 'https://www.tiktok.com/@demo/video/123');
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    const parseBtn = host.querySelector('.omx-widget-extractor-btn');
    assert.ok(parseBtn, '解析按钮应存在');
    await act(async () => click(parseBtn));

    assert.equal(latest().source_video, 'https://www.tiktok.com/@demo/video/123');
    assert.ok(host.querySelector('.omx-widget-picked'), '提交后应出现链接卡片');
    assert.ok(host.textContent.includes('来源：'), '卡片下应有来源提示');
  });

  it('product-link: product library button opens the product picker', async () => {
    const { host } = await mountPanel(PRODUCT_VIDEO);
    const btn = [...host.querySelectorAll('.omx-widget-extractor-icon-btn')].find(
      (b) => b.getAttribute('aria-label') === '从商品库选择',
    );
    assert.ok(btn, '商品链接字段应有商品库按钮');
    await act(async () => click(btn));
    await act(async () => {
      await sleep(10);
    });
    const modal = doc.querySelector('.omx-widget-modal');
    assert.ok(modal);
    assert.ok(modal.textContent.includes('从商品库选择'));
    assert.ok(modal.textContent.includes('极简连帽卫衣'), '商品 fixture 应出现在网格中');
  });
});
