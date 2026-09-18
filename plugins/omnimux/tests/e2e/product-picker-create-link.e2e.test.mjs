/**
 * E2E: 产品选择弹窗「创建产品 → 链接解析保存 → 回列表选中」
 *
 * 真实打包 ProductPicker（esbuild → jsdom → React），dsh-ui-kit 用轻量桩，
 * fetch 模拟 import-from-link + POST /omnimux/products。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const ENTRY = new URL(
  '../../src/client/components/product-picker/ProductPicker.jsx',
  import.meta.url,
).pathname;

function withDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    KeyboardEvent: globalThis.KeyboardEvent,
    fetch: globalThis.fetch,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return {
    dom,
    restore() {
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.HTMLElement = previous.HTMLElement;
      globalThis.Event = previous.Event;
      globalThis.MouseEvent = previous.MouseEvent;
      globalThis.KeyboardEvent = previous.KeyboardEvent;
      globalThis.fetch = previous.fetch;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
      dom.window.close();
    },
  };
}

async function loadProductPicker() {
  globalThis.React = React;
  const output = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/client', 'dsh-ui-kit'],
    loader: { '.jsx': 'jsx', '.js': 'js' },
  });
  const mod = { exports: {} };
  const stubRequire = (id) => {
    if (id === 'dsh-ui-kit') {
      return {
        Button: ({ children, onClick, disabled, loading, ...rest }) =>
          React.createElement(
            'button',
            {
              type: 'button',
              onClick,
              disabled: Boolean(disabled || loading),
              'data-loading': loading ? 'true' : 'false',
              ...rest,
            },
            children,
          ),
        ModalDialog: ({ open, title, footer, children, onClose, className }) => {
          if (!open) return null;
          return React.createElement(
            'div',
            {
              role: 'dialog',
              'aria-label': title,
              className: className || 'stub-modal',
              'data-testid': 'modal-dialog',
            },
            React.createElement('h2', null, title),
            React.createElement('div', { className: 'stub-modal-body' }, children),
            footer
              ? React.createElement('div', { className: 'stub-modal-footer' }, footer)
              : null,
            React.createElement(
              'button',
              { type: 'button', 'data-testid': 'modal-close', onClick: onClose },
              'x',
            ),
          );
        },
      };
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(
    stubRequire,
    mod,
    mod.exports,
  );
  return mod.exports.ProductPicker;
}

function installFetchMock() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    let body = null;
    if (init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, method, body });

    if (method === 'GET' && url.includes('/omnimux/products') && !url.includes('import-from-link')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          products: [{ id: 'prod_existing', name: 'OmniMux', kind: 'digital' }],
        }),
      };
    }

    if (method === 'POST' && url.includes('/omnimux/products/import-from-link')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            name: 'Aurora Mug',
            kind: 'physical',
            selling_points: '保温',
            price: '24.9',
            link: body?.url || 'https://shop.example.com/p/aurora',
            categories: ['Drinkware'],
          },
        }),
      };
    }

    if (method === 'POST' && /\/omnimux\/products\/?$/.test(url.replace(/\?.*$/, ''))) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          product: {
            id: 'prod_created',
            name: body?.name || 'Aurora Mug',
            kind: body?.kind || 'physical',
            price: body?.price,
            categories: body?.categories || [],
          },
          revision: 2,
        }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'not-found', message: `unexpected ${method} ${url}` }),
    };
  };
  return calls;
}

const flush = async (ms = 20) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const click = async (el) => {
  assert.ok(el, 'click target missing');
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
};

const setInputValue = async (el, value) => {
  assert.ok(el, 'input missing');
  const proto = window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  await act(async () => {
    descriptor.set.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
};

describe('E2E: 产品选择弹窗链接创建回流', () => {
  it('列表首位创建产品 → 粘贴链接解析保存 → 回列表选中且不自动确认', async () => {
    const env = withDom();
    const calls = installFetchMock();
    const { createRoot } = await import('react-dom/client');
    const ProductPicker = await loadProductPicker();
    const host = document.getElementById('root');
    const root = createRoot(host);

    let confirmed = null;
    let closed = 0;

    try {
      await act(async () => {
        root.render(
          React.createElement(ProductPicker, {
            open: true,
            onClose: () => {
              closed += 1;
            },
            onConfirm: (product) => {
              confirmed = product;
            },
          }),
        );
      });
      await flush(40);

      // 1. 列表首位创建卡 + 既有产品
      const addCard = host.querySelector('[data-testid="product-picker-add-card"]');
      assert.ok(addCard, '必须渲染创建产品卡');
      assert.match(addCard.textContent || '', /创建产品/);
      assert.match(host.textContent || '', /OmniMux/);

      // 2. 打开链接创建弹窗
      await click(addCard);
      await flush(30);
      const createModal = host.querySelector('[data-testid="product-create-link-modal"]');
      assert.ok(createModal, '必须打开链接创建弹窗');
      const input = createModal.querySelector('input[type="url"], #omx-product-create-link-input');
      assert.ok(input, '必须有链接输入框');

      // 3. 非法链接拦截
      await setInputValue(input, 'not a url');
      const findButton = (re) =>
        [...host.querySelectorAll('button')].find((btn) => re.test(btn.textContent || ''));
      const submitBtn = findButton(/解析并创建/);
      assert.ok(submitBtn, `必须有解析并创建按钮，当前按钮=${[...host.querySelectorAll('button')].map((b) => b.textContent).join('|')}`);
      await click(submitBtn);
      await flush(30);
      assert.match(host.textContent || '', /合法的网页链接/);
      assert.equal(
        calls.some((c) => c.url.includes('import-from-link')),
        false,
        '非法链接不得发起解析',
      );

      // 4. 合法链接 → 解析 + 保存
      const liveInput =
        host.querySelector('#omx-product-create-link-input') ||
        host.querySelector('input[type="url"]');
      await setInputValue(liveInput, 'https://shop.example.com/p/aurora');
      await click(findButton(/解析并创建/));
      await flush(80);

      assert.ok(
        calls.some((c) => c.method === 'POST' && c.url.includes('import-from-link')),
        '必须调用 import-from-link',
      );
      assert.ok(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            /\/omnimux\/products\/?$/.test(String(c.url).replace(/\?.*$/, '')) &&
            c.body?.name === 'Aurora Mug',
        ),
        '必须保存产品',
      );

      // 5. 创建弹窗关闭，新产品可见并选中，不自动确认
      assert.equal(
        host.querySelector('[data-testid="product-create-link-modal"]'),
        null,
        '创建弹窗应关闭',
      );
      assert.match(host.textContent || '', /Aurora Mug/);
      assert.match(host.textContent || '', /已选择：\s*Aurora Mug|已选择：Aurora Mug/);
      assert.equal(confirmed, null, '创建成功不得自动确认外层');
      assert.equal(closed, 0, '创建成功不得关闭产品选择弹窗');

      // 6. 用户显式确认
      const confirmBtn = [...host.querySelectorAll('button')].find((btn) =>
        /确认选择/.test(btn.textContent || ''),
      );
      assert.ok(confirmBtn, '必须有确认选择');
      await click(confirmBtn);
      await flush(20);
      assert.equal(confirmed?.id, 'prod_created');
      assert.equal(confirmed?.name, 'Aurora Mug');
    } finally {
      await act(async () => {
        root.unmount();
      });
      env.restore();
    }
  });
});
