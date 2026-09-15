import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deliverReference } from './dispatcher.ts';
import { getGlobalShadowContextStore } from './shadow-context.ts';
import type { UnifiedReference } from './types.ts';

describe('deliverReference dispatcher', () => {
  it('delivers reference to active session and registers shadow context', async () => {
    let collapsed = true;
    let focusMode = '';
    const events: string[] = [];
    let attachedPayload: any = null;

    const fakeWin: any = {
      __omnimuxWorkbench: {
        getConversationCollapsed: () => collapsed,
        setConversationCollapsed: (val: boolean) => { collapsed = val; },
        setFocus: (mode: string) => { focusMode = mode; },
        getSnapshot: () => ({ sessionId: 'sess-active' }),
      },
      __omnimuxAttachments: {
        addAttachment: (sessionId: string, payload: any) => {
          attachedPayload = payload;
          return { ok: true };
        },
        getActiveSessionId: () => 'sess-active',
      },
      dispatchEvent: (e: any) => {
        events.push(e.type);
        return true;
      },
      navigator: {
        clipboard: {
          writeText: async () => {},
        },
      },
    };

    const ref: UnifiedReference = {
      id: 'prod_100',
      source: 'product',
      title: '降噪无线耳机 Pro',
      kind: 'product',
      file: {
        relativePath: '.omnimux/products/prod_100.json',
        extension: 'JSON',
      },
      context: {
        scene: 'ecommerce_marketing',
        summary: '主打 45dB 深度降噪与 40 小时超长续航',
        metadata: { price: 399, original_price: 599 },
      },
    };

    const receipt = await deliverReference(ref, {}, fakeWin);

    // 1. 验证会话分栏自动展开
    assert.equal(collapsed, false, '会话栏应被展开');
    assert.equal(focusMode, 'split', '焦点应切为分栏');

    // 2. 验证附件成功添加
    assert.equal(receipt.ok, true);
    assert.equal(receipt.referenceId, 'prod_100');
    assert.equal(attachedPayload?.title, '降噪无线耳机 Pro');
    assert.equal(attachedPayload?.relativePath, '.omnimux/products/prod_100.json');

    // 3. 验证隐形场景上下文成功注册
    const shadowSnapshot = getGlobalShadowContextStore().getSnapshot('sess-active');
    const matched = shadowSnapshot.find((item) => item.entityId === 'prod_100');
    assert.ok(matched, '应注册隐形上下文');
    assert.equal(matched.context.summary, '主打 45dB 深度降噪与 40 小时超长续航');

    // 4. 验证高亮动效事件与轻量提示事件触发
    assert.ok(events.includes('omnimux:attachments:reveal'), '应派发高亮动效事件');
    assert.ok(events.includes('omnimux:toast'), '应派发轻量提示事件');
  });

  it('handles quota-exceeded rejection gracefully', async () => {
    const fakeWin: any = {
      __omnimuxWorkbench: {
        getConversationCollapsed: () => false,
      },
      __omnimuxAttachments: {
        addAttachment: () => ({ ok: false, reason: 'quota-exceeded' }),
        getActiveSessionId: () => 'sess-1',
      },
      dispatchEvent: () => true,
    };

    const ref: UnifiedReference = {
      id: 'prod_full',
      source: 'product',
      title: '商品',
      kind: 'product',
      file: { relativePath: 'prod.json' },
    };

    const receipt = await deliverReference(ref, { showToast: false }, fakeWin);
    assert.equal(receipt.ok, false);
    assert.equal(receipt.reason, 'quota-exceeded');
  });
});
