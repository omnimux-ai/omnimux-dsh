/**
 * E2E: 验证回车单次畅通发送、输入框草稿零污染与 Host 原生 Pre-Step 注入闭环
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mountWorkbenchContextInjector } from '../../src/workbench/context-injector.js';

const require = createRequire(import.meta.url);

describe('E2E: Clean Submit Flow & Pre-Step Injection', () => {
  it('sends immediately on Enter without polluting draft or blocking submission', async () => {
    // 1. 打包加载 AttachmentSubmitBridge
    const output = await build({
      entryPoints: [new URL('../../src/client/composer-add/AttachmentSubmitBridge.jsx', import.meta.url).pathname],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'node',
      external: ['react', 'react-dom', 'react-dom/client'],
    });
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, mod, mod.exports);
    const { AttachmentSubmitBridge } = mod.exports;

    // 2. 模拟前端 DOM
    const dom = new JSDOM('<div data-phase="plain"><div id="bridge"></div><div data-composer-input="true" contenteditable="true"></div><button data-send-button aria-label="发送消息">Send</button></div>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    let draft = '说说你分别收到的';
    let sends = 0;
    const arms = [];
    const attachments = [{
      id: 'att-1',
      title: '科技 Vlogger Yuna',
      kind: 'image',
      relativePath: 'data/files/yuna.jpg',
    }];

    const props = {
      sessionId: 'sess-test',
      useInput: (selector) => selector({ draft, phase: 'plain' }),
      inputActions: {
        setDraft(val) { draft = val; },
      },
      attachmentStore: {
        getSnapshot: () => attachments,
      },
      attachmentDrafts: new Map(),
      attachmentAdmission: {
        arm: (...args) => arms.push(args),
      },
      getCurrentSessionId: () => 'sess-test',
      t: (key) => key,
    };

    const root = createRoot(document.querySelector('#bridge'));
    document.querySelector('button').addEventListener('click', () => { sends += 1; });

    try {
      await act(async () => {
        root.render(React.createElement(AttachmentSubmitBridge, props));
      });

      // 模拟用户在输入框按回车发送
      const editor = document.querySelector('[data-composer-input="true"]');
      let accepted = false;
      await act(async () => {
        accepted = editor.dispatchEvent(new window.KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }));
      });

      // 核心断言 1: 发送未被 stopImmediatePropagation 拦截，事件正常通过
      assert.equal(accepted, true, '回车事件必须直接放行');

      // 核心断言 2: 草稿绝对没有被篡改注入 ### 会话关联上下文
      assert.equal(draft, '说说你分别收到的', '草稿必须 100% 保持用户原始输入');

      // 核心断言 3: 没有弹出「素材说明已加入草稿请再次发送」提示
      assert.equal(document.querySelector('#bridge > div').style.display, 'none');

      // 3. 验证 Host 侧通过 agent/pre-step 原生拿到该附件上下文
      const listeners = new Map();
      const fakeCtx = { on: (ev, fn) => { listeners.set(ev, fn); return () => {}; } };
      const fakeMailbox = {
        getActiveView: () => ({
          ok: true,
          uiContext: {
            attachedContextText: '### 会话关联上下文 (Attached Context):\n- [图像] 科技 Vlogger Yuna: @data/files/yuna.jpg',
          },
        }),
      };

      mountWorkbenchContextInjector(fakeCtx, { mailbox: fakeMailbox });
      const preStepHandler = listeners.get('agent/pre-step');
      const decision = await preStepHandler(
        { agent: { session: { id: 'sess-test' } }, turn: 1, step: 1, signal: {} },
        async () => ({ kind: 'enter', messages: [{ role: 'user', content: [{ type: 'text', text: draft }] }] }),
      );

      // 模型拿到两条消息：第一条是用户的纯净消息，第二条是原生的附件上下文快照消息
      assert.equal(decision.messages.length, 2);
      assert.equal(decision.messages[0].content[0].text, '说说你分别收到的');
      assert.match(decision.messages[1].content[0].text, /科技 Vlogger Yuna/);
      assert.equal(decision.messages[1].source.form, 'snapshot');
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      delete globalThis.window;
      delete globalThis.document;
    }
  });
});
