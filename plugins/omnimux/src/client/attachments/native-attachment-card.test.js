import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// 沿用 scripts/live-qa.test.mjs 的做法：内存里转译 TSX，再用 react-dom/server 渲染断言。
async function loadNativeAttachmentCard() {
  const output = await require('esbuild').build({
    entryPoints: [join(here, 'NativeAttachmentCard.tsx')],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    write: false,
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', output.outputFiles[0].text)(
    module,
    module.exports,
    (name) => require(name),
  );
  return module.exports;
}

const { NativeAttachmentCard, resolveRetryHandler } = await loadNativeAttachmentCard();
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');

const FILE_ATTACHMENT = { id: 'att_file_1', kind: 'file', file: { name: 'report.pdf' } };
const noop = () => {};

function renderFileCard(extra = {}) {
  const markup = renderToStaticMarkup(React.createElement(NativeAttachmentCard, {
    attachment: FILE_ATTACHMENT,
    onOpen: noop,
    onRemove: noop,
    ...extra,
  }));
  return new JSDOM(`<div id="root">${markup}</div>`).window.document;
}

describe('NativeAttachmentCard file attachment states', () => {
  it('renders the uploading state with a spinner, label and percentage', () => {
    const doc = renderFileCard({ upload: { status: 'uploading', loaded: 3, total: 4 } });
    const card = doc.querySelector('.omx-att-card--uploading');
    assert.ok(card, 'uploading modifier class must be present');
    assert.ok(card.querySelector('.omx-att-card__spinner'), 'uploading state must show the spinner');
    assert.equal(card.querySelector('.omx-att-card__file-title').textContent, 'report.pdf');
    assert.equal(card.querySelector('.omx-att-card__file-ext').textContent, '上传中 75%');
    assert.equal(card.querySelector('.omx-att-card__retry-btn'), null);
    assert.ok(card.querySelector('.omx-att-card__remove-btn'), 'uploading state must keep remove');

    const indeterminate = renderFileCard({ upload: { status: 'uploading', loaded: 1 } });
    assert.equal(
      indeterminate.querySelector('.omx-att-card__file-ext').textContent,
      '上传中',
      'a total-less upload must not render a percentage',
    );
  });

  it('renders the failed state with a retry control and keeps the remove control', () => {
    const doc = renderFileCard({ upload: { status: 'error', message: 'boom' }, onRetry: noop });
    const card = doc.querySelector('.omx-att-card--failed');
    assert.ok(card, 'failed modifier class must be present');
    assert.equal(card.querySelector('.omx-att-card__file-ext').textContent, 'boom');
    const retry = card.querySelector('.omx-att-card__retry-btn');
    assert.ok(retry, 'failed state must offer a retry control');
    assert.equal(retry.textContent, '重试');
    assert.equal(retry.hasAttribute('disabled'), false);
    const remove = card.querySelector('.omx-att-card__remove-btn');
    assert.ok(remove, 'failed state must keep the remove control');
    assert.equal(remove.getAttribute('aria-label'), '移除 report.pdf');
  });

  it('renders the failed state with a disabled retry control when no handler is wired', () => {
    const doc = renderFileCard({ upload: { status: 'error', message: 'boom' } });
    assert.equal(doc.querySelector('.omx-att-card__retry-btn').hasAttribute('disabled'), true);
  });

  it('renders the plain file card and no retry control for ready or absent uploads', () => {
    for (const extra of [{}, { upload: { status: 'ready', receiptId: 'rcp_1' } }]) {
      const doc = renderFileCard(extra);
      const card = doc.querySelector('.omx-att-card--file');
      assert.ok(card);
      assert.equal(card.getAttribute('class'), 'omx-att-card omx-att-card--file');
      assert.equal(card.querySelector('.omx-att-card__file-title').textContent, 'report.pdf');
      assert.equal(card.querySelector('.omx-att-card__file-ext').textContent, 'PDF');
      assert.equal(card.querySelector('.omx-att-card__retry-btn'), null);
      assert.ok(card.querySelector('.omx-att-card__remove-btn'));
    }
  });
});

describe('resolveRetryHandler', () => {
  it('wires the retry callback only for a failed upload', () => {
    const retryHandler = () => {};
    assert.equal(resolveRetryHandler({ status: 'error', message: 'boom' }, retryHandler), retryHandler);
    assert.equal(resolveRetryHandler({ status: 'uploading', loaded: 1, total: 2 }, retryHandler), undefined);
    assert.equal(resolveRetryHandler({ status: 'ready', receiptId: 'rcp_1' }, retryHandler), undefined);
    assert.equal(resolveRetryHandler(undefined, retryHandler), undefined);
    assert.equal(resolveRetryHandler({ status: 'error', message: 'boom' }, undefined), undefined);
  });
});
