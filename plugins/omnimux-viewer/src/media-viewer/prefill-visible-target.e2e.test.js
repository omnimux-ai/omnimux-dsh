/**
 * 填入请求只交给看得见的图像生成页（Issue #3009）。
 * 规格：specs/prompt-prefill-visible-target-3009.md
 * 真实浏览器证据：.agent-reports/prompt-prefill-3009/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { claimPrefillWhenVisible, isElementShown } from './prefill-claim.js';
import { installPromptFenceGenerate } from '../../../omnimux/src/client/attachments/promptFenceGenerate.ts';
import {
  peekComposerPrefill,
  resetComposerPrefill,
  subscribeComposerPrefill,
} from '../../../omnimux/src/client/media-viewer/composer-prefill.js';

const here = dirname(fileURLToPath(import.meta.url));

function page() {
  return new JSDOM(`<!DOCTYPE html><html lang="zh"><body>
    <div data-conversation-scroll>
      <div class="md-code-block">
        <div data-code-block-banner><div class="info">prompt-video</div><div class="action"><button type="button">复制</button></div></div>
        <div data-code-block-content><pre><code>15s vertical street interview</code></pre></div>
      </div>
    </div>
    <div id="bottom-panel" style="visibility:hidden"><textarea class="omx-mv-prompt-textarea"></textarea></div>
    <div id="tab-host"><textarea class="omx-mv-prompt-textarea"></textarea></div>
  </body></html>`, { pretendToBeVisual: true });
}

/** 按组合器同款接线挂一个面板：订阅队列，用可见性判定决定是否取走。 */
function mountComposer(win, textarea, mode) {
  textarea.checkVisibility = () => {
    for (let el = textarea; el; el = el.parentElement) {
      if (win.getComputedStyle(el).visibility === 'hidden') return false;
    }
    return true;
  };
  let cancel = () => {};
  const stop = subscribeComposerPrefill((handed) => {
    cancel();
    if (!handed) return;
    cancel = claimPrefillWhenVisible(handed, {
      isVisible: () => isElementShown(textarea),
      onClaim: (request) => { textarea.value = request.prompt; mode.value = request.kind; },
      raf: (fn) => win.setTimeout(fn, 0),
      caf: (id) => win.clearTimeout(id),
    });
  });
  return () => { cancel(); stop(); };
}

test('端到端：点「使用提示词生成」，隐藏的图像生成页不抢，可见的那份收到全文并切到视频', async () => {
  const dom = page();
  const win = dom.window;
  const doc = win.document;
  win.__omnimuxWorkbench = { openWorkbench: async () => true };
  resetComposerPrefill();

  const hiddenTa = doc.querySelector('#bottom-panel textarea');
  const shownTa = doc.querySelector('#tab-host textarea');
  const hiddenMode = { value: 'image' };
  const shownMode = { value: 'image' };
  // 隐藏的那份先订阅，复现旧版「先订阅者先取走」的顺序。
  const unmountHidden = mountComposer(win, hiddenTa, hiddenMode);
  const unmountShown = mountComposer(win, shownTa, shownMode);

  const stop = installPromptFenceGenerate(doc);
  try {
    await new Promise((r) => setTimeout(r, 80));
    const button = doc.querySelector('.omx-prompt-generate');
    assert.equal(button?.textContent, '使用提示词生成');
    button.click();
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(shownTa.value, '15s vertical street interview');
    assert.equal(shownMode.value, 'video');
    assert.equal(hiddenTa.value, '');
    assert.equal(hiddenMode.value, 'image');
    assert.equal(peekComposerPrefill(), null);
    assert.equal(button.textContent, '已填入');
  } finally {
    stop();
    unmountHidden();
    unmountShown();
    resetComposerPrefill();
  }
});

test('图像生成页经可见性判定取走请求，不再直接取走', async () => {
  const source = await readFile(resolve(here, './MediaViewerComposer.jsx'), 'utf8');
  assert.match(source, /claimPrefillWhenVisible\(handedOff,/);
  assert.match(source, /isVisible:\s*\(\)\s*=>\s*isElementShown\(promptRef\.current\)/);
  assert.equal(/takeComposerPrefill\(/.test(source), false, '组合器不得绕过可见性判定直接取走请求');
});
