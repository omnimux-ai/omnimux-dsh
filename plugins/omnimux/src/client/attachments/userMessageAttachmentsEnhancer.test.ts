import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  createAttachmentCardElement,
  scanAndEnhanceUserAttachments,
} from './userMessageAttachmentsEnhancer.ts';
import { submittedAttachmentStore } from './submittedAttachmentStore.ts';
import type { ConversationAttachment } from './types.ts';

describe('userMessageAttachmentsEnhancer', () => {
  it('creates media card for image attachment', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const doc = dom.window.document;

    const imgAtt: ConversationAttachment = {
      id: 'att-1',
      fingerprint: 'fp-1',
      sessionId: 'sess-1',
      sourcePlugin: 'omnimux-assets',
      kind: 'image',
      entityId: 'ast-yuna',
      title: '科技Vlogger-Yuna',
      extension: 'JPG',
      relativePath: 'data/files/yuna.jpg',
      previewUrl: 'https://example.com/yuna.jpg',
      status: 'ready',
      createdAt: 100,
    };

    const card = createAttachmentCardElement(imgAtt, doc);
    assert.ok(card.classList.contains('omx-user-att-card--media'));
    assert.equal(card.title, '科技Vlogger-Yuna');
    const img = card.querySelector('img');
    assert.ok(img);
    assert.equal(img.src, 'https://example.com/yuna.jpg');
  });

  it('creates video card with play badge and duration', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const doc = dom.window.document;

    const vidAtt: ConversationAttachment = {
      id: 'att-2',
      fingerprint: 'fp-2',
      sessionId: 'sess-1',
      sourcePlugin: 'omnimux-workflow',
      kind: 'video',
      entityId: 'vid-demo',
      title: '爆款开场.mp4',
      extension: 'MP4',
      relativePath: 'assets/shot1.mp4',
      duration: '0:35',
      status: 'ready',
      createdAt: 100,
    };

    const card = createAttachmentCardElement(vidAtt, doc);
    assert.ok(card.classList.contains('omx-user-att-card--media'));
    assert.ok(card.querySelector('.omx-user-att-play-badge'));
    const dur = card.querySelector('.omx-user-att-duration');
    assert.ok(dur);
    assert.equal(dur.textContent, '0:35');
  });

  it('creates file capsule for documents, tables, and products', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const doc = dom.window.document;

    const fileAtt: ConversationAttachment = {
      id: 'att-3',
      fingerprint: 'fp-3',
      sessionId: 'sess-1',
      sourcePlugin: 'omnimux-products',
      kind: 'product',
      entityId: 'prd-01',
      title: '智能降噪耳机',
      extension: 'JSON',
      relativePath: '.omnimux/products/prd-01.json',
      status: 'ready',
      createdAt: 100,
    };

    const card = createAttachmentCardElement(fileAtt, doc);
    assert.ok(card.classList.contains('omx-user-att-card--file'));
    assert.equal(card.querySelector('.omx-user-att-ext-badge')?.textContent, 'JSON');
    assert.equal(card.querySelector('.omx-user-att-title')?.textContent, '智能降噪耳机');
  });

  it('mounts attachments rail right above user message bubble', () => {
    const dom = new JSDOM(`
      <div class="conversation">
        <div class="userRow">
          <div class="userStack">
            <div class="bubble">解释下你看到的信息</div>
          </div>
        </div>
      </div>
    `);
    const doc = dom.window.document;

    // 预先记录本次会话提交
    submittedAttachmentStore.record('sess-test', '解释下你看到的信息', [
      {
        id: 'att-yuna',
        fingerprint: 'fp-y',
        sessionId: 'sess-test',
        sourcePlugin: 'omnimux-assets',
        kind: 'image',
        entityId: 'ast-yuna',
        title: '科技Vlogger Yuna',
        extension: 'JPG',
        relativePath: 'data/files/yuna.jpg',
        status: 'ready',
        createdAt: 100,
      },
    ]);

    // 模拟 currentSessionId
    globalThis.window = dom.window as any;
    (dom.window as any).__omnimuxWorkbench = {
      getSnapshot: () => ({ sessionId: 'sess-test' }),
    };

    const count = scanAndEnhanceUserAttachments(doc.body);
    assert.equal(count, 1, '应成功增强 1 个气泡');

    const bubble = doc.querySelector('.bubble')!;
    const parent = bubble.parentElement!;
    const rail = parent.querySelector('.omx-user-attachments-rail')!;
    assert.ok(rail, '气泡上方必须挂载附件导轨');
    assert.equal(rail.nextElementSibling, bubble, '导轨必须位于消息卡片上方');
    assert.equal(rail.querySelectorAll('.omx-user-att-card').length, 1);

    // 验证幂等：再次扫描不重复插入
    const secondCount = scanAndEnhanceUserAttachments(doc.body);
    assert.equal(secondCount, 0);
    assert.equal(parent.querySelectorAll('.omx-user-attachments-rail').length, 1);

    delete (globalThis as any).window;
  });
});
