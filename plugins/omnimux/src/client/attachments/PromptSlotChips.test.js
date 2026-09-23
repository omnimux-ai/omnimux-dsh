import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

// Component integration only: geometry fixtures do not establish browser acceptance.
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
const keys = ['window', 'document', 'Event', 'ResizeObserver', 'IntersectionObserver', 'IS_REACT_ACT_ENVIRONMENT'];
const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
const { default: React, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const require = createRequire(import.meta.url);
const heavy = ['../composer-add/AssetPickerModal.jsx', '../composer-add/ProductPickerModal.jsx', './ProductSlotMenu.tsx'];
const output = await build({ entryPoints: [fileURLToPath(new URL('./PromptSlotChips.tsx', import.meta.url))], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', 'react-dom', 'dsh-ui-kit', ...heavy] });
let menuProps;
const button = (name, onClick) => React.createElement('button', { type: 'button', onClick }, name);
const stubs = {
  '../composer-add/AssetPickerModal.jsx': { AssetPickerModal: () => null },
  '../composer-add/ProductPickerModal.jsx': { ProductPickerModal: props => React.createElement('section', { 'aria-label': 'Product picker' }, button('Cancel picker', props.onClose), button('Choose product', () => props.onConfirm({ id: 'chosen', name: 'Chosen' }))) },
  './ProductSlotMenu.tsx': {
    saveRecentProductId() {},
    ProductSlotMenu: props => {
      menuProps = props;
      return props.isOpen ? React.createElement('section', { 'aria-label': 'Product menu' },
        button('Product URL', () => { props.onClose(); props.onOpenUrlInput(); }),
        button('More products', () => { props.onClose(); props.onOpenMoreProducts(); }),
        button('Custom input', () => { props.onClose(); props.onActivateCustomInput(); }),
        button('Cancel menu', props.onClose)) : null;
    },
  },
  'dsh-ui-kit': { Button: React.forwardRef((props, ref) => React.createElement('button', { ...props, ref })) },
};
const module = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(name => stubs[name] ?? require(name), module, module.exports);
const { PromptSlotChips } = module.exports;
test.after(() => {
  dom.window.close();
  for (const key of keys) {
    const descriptor = previous.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this; } });
const slot = (id, protocol, quickLinkKind) => ({ id, protocol, placeholder: id, raw: `[${id}]`, start: 0, end: 5, ...(quickLinkKind ? { quickLinkKind } : {}) });
const products = [slot('Product A', 'product'), slot('Product B', 'product')];
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

async function mount(t, extra = {}) {
  document.body.innerHTML = '<main data-session-id="test"><section data-phase="hero"><div data-composer-card><div contenteditable="true" tabindex="0" id="editor"></div><div id="root"></div></div></section></main>';
  const originalRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute('data-phase')) return rect(0, 0, 1000, 800);
    if (this.getAttribute('role') === 'dialog') return rect(0, 0, 420, 138);
    return rect(this.textContent === 'Product B' ? 400 : 120, 500, 100, 32);
  };
  Object.defineProperties(window, { innerWidth: { value: 1200, configurable: true }, innerHeight: { value: 800, configurable: true } });
  const observers = [];
  class Observer {
    constructor() { this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  globalThis.ResizeObserver = Observer;
  globalThis.IntersectionObserver = Observer;
  const selected = [], opened = [], replaced = [], added = [];
  let props = { slots: products, onSelectSlot: (...args) => selected.push(args), onOpenLink: (...args) => opened.push(args), onReplaceSlot: (...args) => replaced.push(args), onAddLink: async (...args) => { added.push(args); return true; }, ...extra };
  const root = createRoot(document.getElementById('root'));
  const update = patch => act(async () => { props = { ...props, ...patch }; root.render(React.createElement(PromptSlotChips, props)); });
  await update({});
  t.after(async () => {
    await act(async () => root.unmount());
    assert.ok(observers.every(observer => observer.disconnected));
    dom.window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    document.body.innerHTML = '';
  });
  const findButton = name => [...document.querySelectorAll('button')].find(el => el.textContent === name || el.getAttribute('aria-label') === name);
  const input = () => document.querySelector('[aria-label="粘贴商品页面链接"]');
  const click = async name => { const element = findButton(name); assert.ok(element, `button ${name} exists`); await act(async () => element.click()); return element; };
  return { selected, opened, replaced, added, update, click, input,
    dialog: () => document.querySelector('[role="dialog"]'),
    async open(name = 'Product A') { await click(name); await click('Product URL'); assert.ok(input()); },
    async type(value) { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input(), value); input().dispatchEvent(new window.Event('input', { bubbles: true })); }); },
    async assertClean() {
      assert.equal(menuProps.isOpen, false);
      assert.equal(menuProps.slot, null);
      assert.equal(menuProps.anchorRect, null);
      assert.equal(document.querySelector('[aria-label="Product picker"]'), null);
      assert.equal(document.querySelector('[role="dialog"]'), null);
      const count = replaced.length;
      // Probe the current child contract: neither pending nor active target may survive.
      await act(async () => menuProps.onSelectProduct({ id: 'stale', name: 'Stale' }));
      assert.equal(replaced.length, count);
    },
  };
}

test('generic URLs retain selection while explicit quick video/product open their own link kinds', async t => {
  const slots = [slot('Generic URL', 'url'), slot('Quick video', 'url', 'video'), slot('Quick product', 'url', 'product')];
  const h = await mount(t, { slots });
  await h.click('Generic URL');
  assert.deepEqual(h.selected, [[slots[0], 0]]);
  assert.deepEqual(h.opened, []);
  const video = await h.click('Quick video');
  const product = await h.click('Quick product');
  assert.deepEqual(h.opened, [['video', video], ['product', product]]);
  assert.equal(h.selected.length, 1);
});

test('quick links without opener preserve generic fallback and disabled slots do nothing', async t => {
  const slots = [slot('Quick video', 'url', 'video'), slot('Disabled product', 'url', 'product')];
  const h = await mount(t, { slots, onOpenLink: undefined, disabledSlotIds: ['Disabled product'] });
  await h.click('Quick video');
  await h.click('Disabled product');
  assert.deepEqual(h.selected, [[slots[0], 0]]);
  assert.deepEqual(h.opened, []);
});

test('successful product URL closes and clears menu, pending target and anchor before choosing another product', async t => {
  const h = await mount(t);
  await h.open();
  assert.equal(h.dialog().style.left, '120px');
  await h.type('https://example.com/product');
  await h.click('添加');
  assert.deepEqual(h.added, [['product', 'https://example.com/product']]);
  await h.assertClean();
  await h.open('Product B');
  assert.equal(h.dialog().style.left, '400px');
  assert.equal(h.input().value, '');
  await h.click('关闭');
  await h.click('Product B');
  await h.click('More products');
  await h.click('Choose product');
  assert.deepEqual(h.replaced, [[products[1], '[Product B: Chosen]']]);
  await h.assertClean();
});

for (const cancel of ['close', 'escape', 'outside']) {
  test(`product URL ${cancel} cancellation clears all product targets without insertion`, async t => {
    const h = await mount(t);
    await h.open();
    await h.type('https://example.com/unused');
    if (cancel === 'close') await h.click('关闭');
    else await act(async () => {
      if (cancel === 'escape') h.input().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    });
    assert.deepEqual(h.added, []);
    await h.assertClean();
    const editor = document.getElementById('editor');
    if (cancel === 'close' || cancel === 'escape') {
      assert.equal(document.activeElement, editor, `${cancel} cancel must refocus the owning composer editor`);
    } else {
      assert.notEqual(document.activeElement, editor, 'outside cancel must not steal focus');
    }
  });
}

for (const failure of ['false', 'reject', 'missing']) {
  test(`product URL ${failure} receipt retains input and target for successful retry`, async t => {
    const h = await mount(t, { onAddLink: failure === 'missing' ? undefined : async () => { if (failure === 'reject') throw new Error('rejected'); return false; } });
    await h.open();
    await h.type('https://example.com/retry');
    await h.click('添加');
    assert.equal(h.input().value, 'https://example.com/retry');
    assert.equal(document.querySelector('[role="alert"]').textContent, '未能添加链接，请重试');
    assert.equal(menuProps.slot, products[0]);
    await h.update({ onAddLink: async () => true });
    await h.click('添加');
    await h.assertClean();
  });
}

for (const outcome of ['success', 'rejection']) {
  test(`stale ${outcome} after cancel/reopen cannot clear the newer product flow`, async t => {
    const first = deferred(), second = deferred();
    let count = 0;
    const h = await mount(t, { onAddLink: () => (++count === 1 ? first.promise : second.promise) });
    await h.open();
    await h.type('https://example.com/old');
    await h.click('添加');
    await h.click('关闭');
    await h.open('Product B');
    await h.type('https://example.com/new');
    await h.click('添加');
    await act(async () => outcome === 'success' ? first.resolve(true) : first.reject(new Error('stale')));
    assert.equal(h.input().value, 'https://example.com/new');
    assert.equal(menuProps.slot, products[1]);
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal([...document.querySelectorAll('button')].find(el => el.textContent === '添加').disabled, true);
    await act(async () => second.resolve(true));
    await h.assertClean();
  });
}

for (const route of ['menu', 'picker', 'custom']) {
  test(`product ${route} exit clears target state`, async t => {
    const h = await mount(t);
    await h.click('Product A');
    if (route === 'menu') await h.click('Cancel menu');
    else if (route === 'picker') { await h.click('More products'); await h.click('Cancel picker'); }
    else { await h.click('Custom input'); assert.deepEqual(h.selected, [[products[0], 0]]); }
    await h.assertClean();
  });
}
