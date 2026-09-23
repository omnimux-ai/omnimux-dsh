import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { focusEditorElement } from './focusEditorElement.ts';

function fixture(t: { after: (fn: () => void) => void }) {
  const dom = new JSDOM('<div data-composer-card id="a"><div contenteditable="true" tabindex="0" id="editor-a"></div></div><div data-composer-card id="b"><span id="anchor" hidden></span><div contenteditable="true" tabindex="0" id="editor-b"></div></div><div data-composer-card id="empty"></div>');
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  t.after(() => {
    dom.window.close();
    if (prior) Object.defineProperty(globalThis, 'document', prior);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  return dom.window.document;
}

test('scoped focus returns to the anchored card even when another editor appears first', t => {
  const doc = fixture(t);
  const anchor = doc.getElementById('anchor');
  focusEditorElement(anchor?.closest('[data-composer-card]') ?? null);
  assert.equal(doc.activeElement, doc.getElementById('editor-b'));
});

test('explicit null, undefined and empty scope never fall back to another composer', t => {
  const doc = fixture(t);
  for (const root of [null, undefined, doc.getElementById('empty')]) {
    focusEditorElement(root);
    assert.equal(doc.activeElement, doc.body);
  }
});

test('a detached composer scope never calls its editor focus or another composer focus', t => {
  const doc = fixture(t);
  const card = doc.getElementById('b')!;
  let calls = 0;
  doc.getElementById('editor-b')!.focus = () => { calls++; };
  card.remove();
  focusEditorElement(card);
  assert.equal(calls, 0);
  assert.equal(doc.activeElement, doc.body);
});

test('no-argument callers keep their existing document-level behavior', t => {
  const doc = fixture(t);
  focusEditorElement();
  assert.equal(doc.activeElement, doc.getElementById('editor-a'));
});

test('window scope resolves to its document and focuses the composer editor', t => {
  const doc = fixture(t);
  focusEditorElement(doc.defaultView as unknown as Window);
  assert.equal(doc.activeElement, doc.getElementById('editor-a'));
});

test('non-Node scope without querySelector does not throw and does not focus', t => {
  const doc = fixture(t);
  assert.doesNotThrow(() => {
    focusEditorElement({} as any);
  });
  assert.equal(doc.activeElement, doc.body);
});
