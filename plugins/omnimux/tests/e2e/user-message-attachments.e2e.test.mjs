/**
 * E2E: 用户消息卡片上方附件展示（图片/视频/音频/文件）全链路闭环测试
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { submittedAttachmentStore } from '../../src/client/attachments/submittedAttachmentStore.ts';
import { scanAndEnhanceUserAttachments } from '../../src/client/attachments/userMessageAttachmentsEnhancer.ts';

describe('E2E: User Message Attachments Rail Display', () => {
  it('renders multimodal attachment rail right above user bubble matching screenshot spec', async () => {
    // 1. 初始化 DOM 模拟
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div class="conversation-container" data-conversation-scroll="true">
            <div class="chat-row userRow">
              <div class="userStack">
                <div class="attachmentRow" data-message-attachments>
                  <img src="https://example.com/native-large.jpg" alt="native-large" width="240" height="240" />
                </div>
                <div class="bubble">解释下你看到的信息</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);

    const doc = dom.window.document;
    globalThis.window = dom.window;
    dom.window.__omnimuxWorkbench = {
      getSnapshot: () => ({ sessionId: 'sess-display-1' }),
    };

    // 2. 模拟前置在输入框挂载了 Yuna 头像与牛仔服附件并点击发送
    submittedAttachmentStore.record('sess-display-1', '解释下你看到的信息', [
      {
        id: 'att-yuna',
        fingerprint: 'fp-y',
        sessionId: 'sess-display-1',
        sourcePlugin: 'omnimux-assets',
        kind: 'image',
        entityId: 'ast-yuna',
        title: '科技Vlogger-粉衣女郎Yuna',
        extension: 'JPG',
        relativePath: 'data/files/ast_fd4ca05a/yuna.jpg',
        previewUrl: 'https://example.com/yuna.jpg',
        status: 'ready',
        createdAt: 100,
      },
      {
        id: 'att-rodeo',
        fingerprint: 'fp-r',
        sessionId: 'sess-display-1',
        sourcePlugin: 'omnimux-assets',
        kind: 'image',
        entityId: 'ast-rodeo',
        title: '牛仔竞技骑行服',
        extension: 'JPG',
        relativePath: 'data/files/ast_f3c3c24b/rodeo.jpg',
        previewUrl: 'https://example.com/rodeo.jpg',
        status: 'ready',
        createdAt: 200,
      },
    ]);

    // 3. 执行扫描与增强
    const count = scanAndEnhanceUserAttachments(doc.body);
    assert.equal(count, 1, '应成功匹配并增强用户气泡');

    // 4. 断言 DOM 结构与呈现
    const bubble = doc.querySelector('.bubble');
    assert.ok(bubble);
    const parent = bubble.parentElement;
    assert.ok(parent);
    const rail = parent.querySelector('.omx-user-attachments-rail');
    assert.ok(rail, '消息气泡上方必须挂载附件导轨');
    assert.equal(rail.nextElementSibling, bubble, '附件导轨必须紧贴在消息气泡上方');

    const cards = rail.querySelectorAll('.omx-user-att-card');
    assert.equal(cards.length, 2, '必须在气泡上方依次列出两个附件');

    // 检查卡片内容
    assert.equal(cards[0].getAttribute('title'), '科技Vlogger-粉衣女郎Yuna');
    assert.equal(cards[0].querySelector('img')?.src, 'https://example.com/yuna.jpg');

    assert.equal(cards[1].getAttribute('title'), '牛仔竞技骑行服');
    assert.equal(cards[1].querySelector('img')?.src, 'https://example.com/rodeo.jpg');

    // 检查气泡文字纯净度
    assert.equal(bubble.textContent?.trim(), '解释下你看到的信息', '用户气泡内绝对不能含有任何脏文本');

    // 官方大图附件行必须被隐藏，避免与上方紧凑素材轨重复
    const native = parent.querySelector('[data-message-attachments]');
    assert.ok(native, '宿主仍保留官方附件节点（仅隐藏）');
    assert.equal(native.getAttribute('data-omx-native-attachments-hidden'), 'true');
    assert.equal(bubble.querySelectorAll('.omx-chat-media-tail').length, 0, '用户气泡内不得挂媒体尾卡');

    delete globalThis.window;
  });
});
