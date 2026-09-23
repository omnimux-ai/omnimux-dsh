import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

// Unit-only geometry/observer fixtures: these do not establish browser acceptance.
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
const keys = ['window', 'document', 'Event', 'ResizeObserver', 'IntersectionObserver', 'IS_REACT_ACT_ENVIRONMENT'];
const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
// Import after installing the DOM so React uses its normal input/composition event path.
const { default: React, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const require = createRequire(import.meta.url);
const output = await build({ entryPoints: [new URL('./VideoLinkPopover.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', 'react-dom', 'dsh-ui-kit'] });
const module = { exports: {} };
const semanticButton = React.forwardRef((props, ref) => React.createElement('button', { ...props, ref }));
new Function('require', 'module', 'exports', output.outputFiles[0].text)(name => name === 'dsh-ui-kit' ? { Button: semanticButton } : require(name), module, module.exports);
const { VideoLinkPopover } = module.exports;
test.after(() => {
  dom.window.close();
  for (const key of keys) {
    const descriptor = previous.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this; } });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

async function mount(t, options = {}) {
  document.body.innerHTML = '<main data-session-id="A"><section data-phase="hero"><button id="anchor">Video</button><div id="root"></div></section></main>';
  const anchor = document.getElementById('anchor');
  const column = anchor.closest('[data-phase]');
  let anchorRect = options.anchorRect ?? rect(640, 500, 80, 32);
  let columnRect = options.columnRect ?? rect(500, 0, 600, 800);
  const originalRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === anchor) return anchorRect;
    if (this === column) return columnRect;
    if (this.classList.contains('omx-link-popover')) return rect(0, 0, 420, 138);
    return rect(0, 0, 0, 0);
  };
  Object.defineProperties(window, { innerWidth: { value: options.width ?? 1200, configurable: true }, innerHeight: { value: options.height ?? 800, configurable: true } });
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  globalThis.ResizeObserver = Observer;
  globalThis.IntersectionObserver = Observer;
  const root = createRoot(document.getElementById('root'));
  let closed = 0;
  const calls = [];
  let props = { isOpen: true, anchor, onClose: () => { closed++; }, onConfirm: value => { calls.push(value); return true; }, ...options.props };
  const update = patch => act(async () => { props = { ...props, ...patch }; root.render(React.createElement(VideoLinkPopover, props)); });
  t.after(async () => {
    await act(async () => root.unmount());
    assert.ok(observers.every(observer => observer.disconnected), 'all unit observer fixtures must be disconnected');
    dom.window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    document.body.innerHTML = '';
  });
  await update({});
  const input = () => document.querySelector('.omx-link-popover input');
  return { anchor, calls, observers, update, get closed() { return closed; }, input,
    dialog: () => document.querySelector('[role="dialog"]'),
    add: () => document.querySelector('.omx-link-popover-add'),
    async type(value) { await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input(), value);
      input().dispatchEvent(new window.Event('input', { bubbles: true }));
    }); },
    async click() { await act(async () => document.querySelector('.omx-link-popover-add').click()); },
    async key(key, extra = {}) { const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }); await act(async () => input().dispatchEvent(event)); return event; },
    async geometry(nextAnchor, nextColumn, event = 'resize') { anchorRect = nextAnchor; if (nextColumn) columnRect = nextColumn; await act(async () => window.dispatchEvent(new window.Event(event))); },
  };
}

test('VideoLinkPopover renders a body portal with video/product copy and disables empty input', async t => {
  const h = await mount(t);
  assert.equal(h.dialog().parentElement, document.body);
  assert.equal(h.dialog().getAttribute('aria-label'), '添加视频链接');
  assert.equal(h.input().placeholder, '粘贴视频链接');
  assert.equal(document.activeElement, h.input());
  assert.ok(h.dialog().textContent.includes('添加参考视频，用于拆解或复刻。'));
  assert.equal(h.add().disabled, true);
  await h.type('   ');
  assert.equal(h.add().disabled, true);
  await h.update({ kind: 'product' });
  assert.equal(h.dialog().getAttribute('aria-label'), '添加商品链接');
  assert.equal(h.input().placeholder, '粘贴商品页面链接');
  assert.ok(h.dialog().textContent.includes('添加商品页面，用于介绍产品或制作带货视频。'));
});

test('VideoLinkPopover retains invalid input with an error and clears the error on editing', async t => {
  const h = await mount(t);
  await h.type('bare-id');
  await h.click();
  assert.equal(h.input().value, 'bare-id');
  assert.equal(document.querySelector('[role="alert"]').textContent, '请粘贴一个完整的 http 或 https 链接');
  assert.equal(h.calls.length, 0);
  assert.equal(h.closed, 0);
  await h.type(' https://example.com/video ');
  assert.equal(document.querySelector('[role="alert"]'), null);
  await h.click();
  assert.deepEqual(h.calls, ['https://example.com/video']);
  assert.equal(h.closed, 1);
});

for (const throws of [false, true]) {
  test(`VideoLinkPopover retains valid input and permits retry after ${throws ? 'rejection' : 'false receipt'}`, async t => {
    const h = await mount(t, { props: { onConfirm: () => throws ? Promise.reject(new Error('rejected')) : false } });
    await h.type('https://example.com/video');
    await h.click();
    assert.equal(h.input().value, 'https://example.com/video');
    assert.equal(document.querySelector('[role="alert"]').textContent, '未能添加链接，请重试');
    assert.equal(h.add().disabled, false);
    assert.equal(h.closed, 0);
    await h.update({ onConfirm: () => true });
    await h.click();
    assert.equal(h.closed, 1);
  });
}

test('VideoLinkPopover IME Enter never confirms or bubbles to composer listeners', async t => {
  const h = await mount(t);
  let bubbled = 0;
  const onKey = () => { bubbled++; };
  document.addEventListener('keydown', onKey);
  t.after(() => document.removeEventListener('keydown', onKey));
  await h.type('https://example.com/video');
  await act(async () => h.input().dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true })));
  await h.key('Enter');
  await act(async () => h.input().dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true })));
  await h.key('Enter', { isComposing: true });
  await h.key('Enter', { keyCode: 229 });
  assert.equal(h.calls.length, 0);
  assert.equal(bubbled, 0);
  const enter = await h.key('Enter');
  assert.equal(enter.defaultPrevented, true);
  assert.equal(h.calls.length, 1);
  assert.equal(bubbled, 0);
});

test('VideoLinkPopover locks same-tick double clicks and Enter until asynchronous completion', async t => {
  const pending = deferred();
  let calls = 0;
  const h = await mount(t, { props: { onConfirm: () => { calls++; return pending.promise; } } });
  await h.type('https://example.com/video');
  await act(async () => { h.add().click(); h.add().click(); });
  await h.key('Enter');
  assert.equal(calls, 1);
  assert.equal(h.add().disabled, true);
  assert.equal(h.closed, 0);
  await act(async () => pending.resolve(true));
  assert.equal(h.closed, 1);
});

for (const switchKind of [false, true]) {
  test(`VideoLinkPopover ignores stale success after ${switchKind ? 'kind switch' : 'cancellation and reopening'}`, async t => {
    const pending = deferred();
    const h = await mount(t, { props: { onConfirm: () => pending.promise } });
    await h.type('https://example.com/old');
    await h.click();
    if (switchKind) await h.update({ kind: 'product' });
    else { await h.update({ isOpen: false }); await h.update({ isOpen: true }); }
    assert.equal(h.input().value, '');
    await h.type('https://example.com/new');
    await act(async () => pending.resolve(true));
    assert.equal(h.closed, 0);
    assert.equal(h.input().value, 'https://example.com/new');
    assert.equal(h.add().disabled, false);
    assert.equal(document.querySelector('[role="alert"]'), null);
  });
}

test('VideoLinkPopover stale rejection does not unlock or show an error over the next pending operation', async t => {
  const first = deferred();
  const second = deferred();
  const h = await mount(t, { props: { onConfirm: () => first.promise } });
  await h.type('https://example.com/old');
  await h.click();
  await h.update({ kind: 'product', onConfirm: () => second.promise });
  await h.type('https://example.com/new');
  await h.click();
  await act(async () => first.reject(new Error('stale rejection')));
  assert.equal(h.add().disabled, true);
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.equal(h.closed, 0);
  await act(async () => second.resolve(true));
  assert.equal(h.closed, 1);
});

test('VideoLinkPopover cancels through outside pointer, Escape and close button but not anchor or card', async t => {
  const h = await mount(t);
  const pointer = target => act(async () => target.dispatchEvent(new window.Event('pointerdown', { bubbles: true })));
  await pointer(h.input()); await pointer(h.anchor);
  assert.equal(h.closed, 0);
  await pointer(document.body);
  assert.equal(h.closed, 1);
  const escape = await h.key('Escape');
  assert.equal(escape.defaultPrevented, true);
  assert.equal(h.closed, 2);
  await act(async () => document.querySelector('[aria-label="关闭"]').click());
  assert.equal(h.closed, 3);
});

test('VideoLinkPopover clamps to its column, positions above and flips below with limited top space', async t => {
  const h = await mount(t);
  assert.equal(h.dialog().style.width, '420px');
  assert.equal(h.dialog().style.left, '640px');
  assert.equal(h.dialog().style.top, '354px');
  await h.geometry(rect(1040, 20, 40, 32));
  assert.equal(h.dialog().style.left, '668px');
  assert.equal(h.dialog().style.top, '60px');
  await h.geometry(rect(240, 300, 40, 32), rect(200, 0, 280, 800), 'scroll');
  assert.equal(h.dialog().style.width, '256px');
  assert.equal(h.dialog().style.left, '212px');
});

test('VideoLinkPopover clamps against viewport and bounds available height', async t => {
  const h = await mount(t, { width: 320, height: 180, columnRect: rect(-50, -50, 450, 300), anchorRect: rect(270, 100, 30, 20) });
  assert.equal(h.dialog().style.left, '12px');
  assert.equal(h.dialog().style.width, '296px');
  assert.equal(h.dialog().style.top, '12px');
  assert.equal(h.dialog().style.maxHeight, '80px');
});

test('VideoLinkPopover closes when anchor leaves viewport, intersection is lost or anchor is destroyed', async t => {
  const h = await mount(t);
  await h.geometry(rect(640, -40, 80, 32));
  assert.equal(h.closed, 1);
  await act(async () => h.observers[1].callback([{ isIntersecting: false }]));
  assert.equal(h.closed, 2);
  h.anchor.remove();
  await h.geometry(rect(640, 500, 80, 32));
  assert.equal(h.closed, 3);
});

test('VideoLinkPopover uses translator and keeps native button enter without submitting', async t => {
  const dictionary = {
    'attachments.popover.videoTitle': 'Custom Title',
    'attachments.popover.videoPlaceholder': 'Custom Placeholder',
  };
  const closeReasons = [];
  const h = await mount(t, {
    props: {
      t: key => dictionary[key] ?? key,
      onClose: reason => { closeReasons.push(reason); },
    },
  });
  assert.ok(h.dialog().textContent.includes('Custom Title'));
  assert.equal(h.input().getAttribute('placeholder'), 'Custom Placeholder');
  const closeBtn = document.querySelector('.omx-link-popover-close');
  closeBtn.focus();
  const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
  closeBtn.dispatchEvent(enter);
  assert.equal(h.calls.length, 0);
  await h.key('Escape');
  assert.equal(closeReasons[closeReasons.length - 1], 'cancel');
});
