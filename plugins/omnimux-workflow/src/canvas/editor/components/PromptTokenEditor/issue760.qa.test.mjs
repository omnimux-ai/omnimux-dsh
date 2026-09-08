import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { referenceToken } from './referenceCandidates.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(new URL('../../../../../../omnimux/package.json', import.meta.url))('jsdom');
const dom = new JSDOM('<!doctype html><html><body><main></main><button id="slot"></button></body></html>');
for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Element']) globalThis[name] = dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
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
let root;
async function render(Component, props) {
  if (root) await act(() => root.unmount());
  root = createRoot(document.querySelector('main'));
  await act(() => root.render(React.createElement(Component, props)));
}
function caret(editor, offset) {
  const range = document.createRange();
  range.setStart(editor.firstChild, offset);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}
after(async () => { if (root) await act(() => root.unmount()); dom.window.close(); });

describe('Issue #760 independent QA: caret and viewport boundaries', () => {
  test('slot insertion uses current caret after keyboard or mouse relocation without new input', async () => {
    const ref = React.createRef();
    const commits = [];
    await render(Editor, { ref, value: '', onCommitReference: (_token, prompt) => { commits.push(prompt); return true; } });
    const editor = document.querySelector('[role="textbox"]');
    editor.focus();
    editor.textContent = 'abcdef';
    caret(editor, 6);
    await act(() => editor.dispatchEvent(new window.Event('input', { bubbles: true })));
    caret(editor, 2);
    await act(() => ref.current.insertToken(referenceToken('image', 'image.png', 'image')));
    assert.equal(commits[0], 'ab@ref[image:-2:image.png] cdef');
  });

  test('slot insertion after blur preserves the last actual editor caret', async () => {
    const ref = React.createRef();
    const commits = [];
    await render(Editor, { ref, value: 'abcdef', onCommitReference: (_token, prompt) => { commits.push(prompt); return true; } });
    const editor = document.querySelector('[role="textbox"]');
    editor.focus();
    caret(editor, 2);
    await act(() => document.querySelector('#slot').focus());
    await act(() => ref.current.insertToken(referenceToken('image', 'image.png', 'image')));
    assert.equal(commits[0], 'ab@ref[image:-2:image.png] cdef');
  });

  for (const [name, left] of [['center', 400], ['right edge', 950]]) {
    test(`preview remains horizontally reachable above its ${name} slot`, async () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
      const anchor = document.querySelector('#slot');
      anchor.getBoundingClientRect = () => ({ x: left, y: 600, left, right: left + 44, top: 600, bottom: 644, width: 44, height: 44 });
      await render(Preview, { anchor, upstream: { materialType: 'image', availability: 'ready', url: 'https://example.test/image.png', label: 'image.png' }, onClose() {}, onReplace() {} });
      const preview = document.querySelector('.wf-slot-hover-preview');
      const previewLeft = parseFloat(preview.style.left);
      const previewRight = previewLeft + parseFloat(preview.style.width);
      // This is a component positioning invariant, not a real-browser visibility claim.
      assert.ok(previewRight >= left && previewLeft <= left + 44,
        `preview horizontal footprint [${previewLeft}, ${previewRight}] must overlap slot [${left}, ${left + 44}] so the vertical hover gap remains traversable`);
      assert.ok(previewLeft >= 12 && previewRight <= 988);
    });
  }
});
