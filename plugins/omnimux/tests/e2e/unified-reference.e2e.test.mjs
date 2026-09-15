/**
 * OmniMux 全场景统一引用与场景上下文端到端闭环测试
 * E2E: Unified Reference -> Conversation Split Reveal -> Attachment Mounting -> Shadow Context Enrichment -> Clean Message Bubble
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAttachmentStore } from '../../src/client/attachments/store.ts';
import { createShadowContextStore } from '../../src/client/reference/shadow-context.ts';
import { deliverReference } from '../../src/client/reference/dispatcher.ts';
import { buildAttachedContextBlock } from '../../src/client/attachments/prompt-assembly.ts';
import { hideAttachedContextBlock } from '../../src/client/attachments/attachedContextCleaner.ts';
import { JSDOM } from 'jsdom';

describe('E2E: Unified Reference & Shadow Context Pipeline', () => {
  it('executes full cycle from reference delivery to clean message bubble rendering', async () => {
    // 1. 初始化模拟宿主环境
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
    const doc = dom.window.document;
    globalThis.window = dom.window;
    globalThis.document = doc;

    let collapsed = true;
    let focusMode = 'gui';
    const attachmentStore = createAttachmentStore();
    const shadowStore = createShadowContextStore();

    dom.window.__omnimuxWorkbench = {
      getConversationCollapsed: () => collapsed,
      setConversationCollapsed: (val) => { collapsed = val; },
      setFocus: (mode) => { focusMode = mode; },
      getSnapshot: () => ({ sessionId: 'sess-e2e-1' }),
    };
    dom.window.__omnimuxAttachments = attachmentStore;
    dom.window.__omnimuxShadowContext = shadowStore;

    // 2. 模拟商品库调用 deliverReference
    const ref = {
      id: 'prd_camera_01',
      source: 'product',
      title: '4K超清智能摄像机',
      kind: 'product',
      file: {
        relativePath: '.omnimux/products/prd_camera_01.json',
        previewUrl: '/omnimux/products/prd_camera_01?preview=cover',
        extension: 'JSON',
      },
      context: {
        scene: 'ecommerce_marketing',
        summary: 'AI人脸识别，微光全彩夜视，超长云端存储',
        metadata: {
          brand: 'VisionTech',
          sku: 'VT-4K-PRO',
          price: 299,
        },
      },
    };

    const receipt = await deliverReference(ref, { sessionId: 'sess-e2e-1' }, dom.window);

    // 断言 A: 交付回执与分栏展开
    assert.equal(receipt.ok, true, '交付应当成功');
    assert.equal(collapsed, false, '会话栏应当自动展开');
    assert.equal(focusMode, 'split', '视口焦点应当切换至 split');

    // 断言 B: 附件导轨成功挂载
    const attachments = attachmentStore.getSnapshot('sess-e2e-1');
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].title, '4K超清智能摄像机');
    assert.equal(attachments[0].relativePath, '.omnimux/products/prd_camera_01.json');

    // 断言 C: 场景上下文注册至 ShadowContextStore
    const shadows = shadowStore.getSnapshot('sess-e2e-1');
    assert.equal(shadows.length, 1);
    assert.equal(shadows[0].context.scene, 'ecommerce_marketing');

    // 断言 D: 组装模型提交块（模型视界内能感知完整文件与卖点）
    const promptBlock = buildAttachedContextBlock(attachments, 'sess-e2e-1');
    assert.match(promptBlock, /### 会话关联上下文 \(Attached Context\):/);
    assert.match(promptBlock, /- \[产品\] 4K超清智能摄像机 \(`JSON`\): @\.omnimux\/products\/prd_camera_01\.json/);
    assert.match(promptBlock, /\* 场景: ecommerce_marketing/);
    assert.match(promptBlock, /\* 简述: AI人脸识别/);

    // 断言 E: 前端渲染用户气泡（界面上彻底隐形，没有任何脏代码）
    const userPrompt = '请帮我写一段吸引年轻用户的短视频爆款带货脚本';
    const fullSubmittedText = `${userPrompt}${promptBlock}`;

    // 构造模拟的用户消息 DOM 节点
    const bubbleEl = doc.createElement('div');
    bubbleEl.className = 'bubble user-bubble';
    bubbleEl.textContent = fullSubmittedText;
    doc.body.appendChild(bubbleEl);

    // 调用清洗器
    const cleaned = hideAttachedContextBlock(bubbleEl, doc);
    assert.equal(cleaned, true, '应当识别并剥离上下文数据块');
    assert.equal(bubbleEl.textContent.trim(), userPrompt, '气泡中展现的文本必须 100% 纯净，没有任何附件或上下文代码');

    delete globalThis.window;
    delete globalThis.document;
  });
});
