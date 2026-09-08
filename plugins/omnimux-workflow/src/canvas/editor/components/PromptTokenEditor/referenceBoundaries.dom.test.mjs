import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React, { act } from 'react';
import { referenceToken } from './referenceCandidates.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(new URL('../../../../../../omnimux/package.json', import.meta.url))('jsdom');
const dom = new JSDOM('<!doctype html><html><body><main></main><button id="slot">slot</button><p id="outside">outside</p></body></html>');
for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Element']) globalThis[name] = dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
// React DOM detects native composition support when the module is initialized.
const { createRoot } = await import('react-dom/client');
dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 200, top: 420, bottom: 438, width: 1, height: 18 });

async function load(relative) {
  const result = await build({
    entryPoints: [new URL(relative, import.meta.url).pathname], bundle: true,
    write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/client'],
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports);
  return mod.exports.default;
}
const Editor = await load('./PromptTokenEditor.tsx');
const Preview = await load('../MaterialNode/ConfigPanel/SlotWells/SlotHoverPreview.tsx');
const Menu = await load('./MentionPopover.tsx');
const token = referenceToken('image', 'image.png', 'image');
let root;
async function render(Component, props) {
  if (root) await act(() => root.unmount());
  root = createRoot(document.querySelector('main'));
  await act(() => root.render(React.createElement(Component, props)));
}
function select(start, startOffset, end = start, endOffset = startOffset) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}
async function mountEditor() {
  const ref = React.createRef();
  const commits = [];
  function ControlledEditor() {
    const [value, setValue] = React.useState('abcdef');
    return React.createElement(Editor, { ref, value, onChange: setValue, onCommitReference: (_token, prompt) => {
      commits.push(prompt);
      setValue(prompt);
      return true;
    } });
  }
  await render(ControlledEditor, {});
  const editor = document.querySelector('[role="textbox"]');
  editor.focus();
  select(editor.firstChild, 6);
  await act(() => editor.dispatchEvent(new window.Event('input', { bubbles: true })));
  return { editor, ref, commits };
}
after(async () => { if (root) await act(() => root.unmount()); dom.window.close(); });

test('live noncollapsed selection replaces selected text rather than cached caret', async () => {
  const { editor, ref, commits } = await mountEditor();
  select(editor.firstChild, 2, editor.firstChild, 4);
  await act(() => ref.current.insertToken(token));
  assert.deepEqual(commits, ['ab@ref[image:-2:image.png] ef']);
});

test('selection outside editor restores blur snapshot without changing outside text', async () => {
  const { editor, ref, commits } = await mountEditor();
  select(editor.firstChild, 2);
  await act(() => document.querySelector('#slot').focus());
  const outside = document.querySelector('#outside');
  select(outside.firstChild, 0, outside.firstChild, 7);
  await act(() => ref.current.insertToken(token));
  assert.deepEqual(commits, ['ab@ref[image:-2:image.png] cdef']);
  assert.equal(outside.textContent, 'outside');
});

test('cross-editor selection is rejected even when its anchor is inside', async () => {
  const { editor, ref, commits } = await mountEditor();
  const outside = document.querySelector('#outside');
  select(editor.firstChild, 2, outside.firstChild, 3);
  await act(() => ref.current.insertToken(token));
  assert.deepEqual(commits, ['abcdef@ref[image:-2:image.png] ']);
  assert.equal(outside.textContent, 'outside');
  assert.ok(document.querySelector('#slot'));
});

test('menu query range takes priority over a relocated live caret', async () => {
  const { editor, ref, commits } = await mountEditor();
  editor.textContent = 'ab @im cd';
  select(editor.firstChild, 6);
  await act(() => editor.dispatchEvent(new window.Event('input', { bubbles: true })));
  select(editor.firstChild, 1);
  await act(() => ref.current.insertToken(token));
  assert.deepEqual(commits, ['ab @ref[image:-2:image.png]  cd']);
});

test('imperative insertion stays inert during composition and resumes at composed caret', async () => {
  const { editor, ref, commits } = await mountEditor();
  await act(() => editor.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true })));
  select(editor.firstChild, 2);
  await act(() => ref.current.insertToken(token));
  assert.equal(commits.length, 0);
  assert.equal(editor.textContent, 'abcdef');
  await act(() => editor.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true })));
  await act(() => ref.current.insertToken(token));
  assert.deepEqual(commits, ['ab@ref[image:-2:image.png] cdef']);
});

test('consecutive insertions follow the newly placed caret', async () => {
  const { editor, ref, commits } = await mountEditor();
  select(editor.firstChild, 2);
  await act(() => ref.current.insertToken(token));
  await act(() => ref.current.insertToken(token));
  assert.equal(commits[1], 'ab@ref[image:-2:image.png] @ref[image:-2:image.png] cdef');
});

for (const [name, viewportWidth, left, top] of [
  ['left edge', 1000, 0, 600],
  ['right edge', 1000, 950, 600],
  ['narrow viewport', 220, 160, 600],
  ['top flip', 1000, 950, 8],
]) {
  test(`preview uses rendered width for ${name}`, async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewportWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const anchor = document.querySelector('#slot');
    anchor.getBoundingClientRect = () => ({ x: left, y: top, left, right: left + 44, top, bottom: top + 44, width: 44, height: 44 });
    await render(Preview, { anchor, upstream: { materialType: 'image', availability: 'ready', url: 'https://example.test/image.png', label: 'image.png' }, onClose() {}, onReplace() {} });
    const panel = document.querySelector('.wf-slot-hover-preview');
    const width = parseFloat(panel.style.width);
    const x = parseFloat(panel.style.left);
    assert.equal(width, Math.min(240, viewportWidth - 24));
    assert.ok(x >= 12 && x + width <= viewportWidth - 12);
    assert.ok(x <= left + 44 && x + width >= left);
    assert.equal(panel.parentElement, document.body);
    if (top === 8) assert.equal(parseFloat(panel.style.top), top + 44 + 8);
  });
}

for (const viewportWidth of [1000, 220]) {
  test(`root mention menu uses its rendered width in ${viewportWidth}px viewport`, async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewportWidth });
    const x = viewportWidth - 30;
    await render(Menu, { open: true, position: { x, y: 500 }, query: '', current: [], canvas: [], onSelect() {}, onClose() {} });
    const panel = document.querySelector('.wf-mention-popover');
    const width = parseFloat(panel.style.width);
    const left = parseFloat(panel.style.left);
    assert.equal(width, Math.min(280, viewportWidth - 24));
    assert.ok(left >= 12 && left + width <= viewportWidth - 12);
    assert.ok(left <= x && left + width >= x);
    assert.equal(panel.parentElement, document.body);
  });
}
