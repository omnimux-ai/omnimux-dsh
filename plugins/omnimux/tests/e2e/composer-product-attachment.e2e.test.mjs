/**
 * E2E: 输入框选中产品后消息卡片附加缩略图与上下文注入全链路测试 (Issue #2505)
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { getGlobalAttachmentStore } from '../../src/client/attachments/store.ts';
import { submittedAttachmentStore } from '../../src/client/attachments/submittedAttachmentStore.ts';
import { scanAndEnhanceUserAttachments } from '../../src/client/attachments/userMessageAttachmentsEnhancer.ts';
import { buildAttachedContextBlock } from '../../src/client/attachments/prompt-assembly.ts';
import { syncProductAttachment, removeProductAttachment } from '../../src/client/components/product-picker/product-attachment-sync.js';

describe('E2E: Product Selection, Message Thumbnail and Context Attachment (Issue #2505)', () => {
  it('handles product attachment lifecycle: selection, context injection, and message thumbnail rendering', () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;

    const sessionId = 'sess-product-e2e';
    let store;

    try {
      // 1. 初始化 DOM 环境
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <head></head>
          <body>
            <div class="conversation-container" data-conversation-scroll="true">
              <div class="chat-row userRow">
                <div class="userStack">
                  <div class="bubble">帮我根据这款香水喷雾瓶写一段带货短视频黄金开头</div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `);

      const doc = dom.window.document;
      globalThis.window = dom.window;
      globalThis.document = doc;

      store = getGlobalAttachmentStore();
      dom.window.__omnimuxWorkbench = {
        getSnapshot: () => ({ sessionId }),
      };

      store.setActiveSessionId(sessionId);

      // 2. 模拟底栏选中商品
      const sampleProduct = {
        id: 'prod-perfume-5ml',
        name: '5ml 便携迷你香水喷雾瓶 (买二送一)',
        price: '¥29.90',
        brand: 'AromaMini',
        cover: {
          id: 'cov-1',
          kind: 'image',
          real_path: '/assets/products/perfume.jpg',
        },
        cover_url: 'https://example.com/perfume-thumb.jpg',
        selling_points: '底部直接分装对冲，不漏一滴；口红大小，随时随地上飞机高铁免安检；高精度纳米喷雾细腻均匀。',
        target_audience: '精致通勤上班族、出差旅行爱好者、派对聚会达人',
        features: '航空级铝材外壳，高透内胆，容量5ml可喷约80次',
      };

      // 2. 调用真实组件导出的 syncProductAttachment 同步商品附件
      syncProductAttachment(sampleProduct, null, sessionId);

      const activeList = store.getSnapshot(sessionId);
      assert.equal(activeList.length, 1, '商品必须成功加入附件池');
      assert.equal(activeList[0].kind, 'product');
      assert.equal(activeList[0].title, '5ml 便携迷你香水喷雾瓶 (买二送一)');
      assert.equal(activeList[0].relativePath, 'products/prod-perfume-5ml.json', '必须使用安全逻辑路径，杜绝泄漏宿主机物理路径');

      // 3. 验证结构化上下文信封生成
      const contextText = buildAttachedContextBlock(activeList, sessionId);
      assert.ok(contextText.includes('### 会话关联上下文 (Attached Context):'), '必须包含标准上下文标头');
      assert.ok(contextText.includes('- [产品] 5ml 便携迷你香水喷雾瓶 (买二送一)'), '必须准确标记产品名称与类型');
      assert.ok(contextText.includes('@products/prod-perfume-5ml.json'), '必须包含标准相对路径引用');

      // 4. 模拟用户发送消息：记录到 submittedAttachmentStore
      const userPrompt = '帮我根据这款香水喷雾瓶写一段带货短视频黄金开头';
      submittedAttachmentStore.record(sessionId, userPrompt, activeList);

      // 5. 触发视图增强器扫描用户消息卡片
      const enhanced = scanAndEnhanceUserAttachments(doc.body);
      assert.equal(enhanced, 1, '成功增强消息气泡');

      const bubble = doc.querySelector('.bubble');
      assert.ok(bubble);
      const parent = bubble.parentElement;
      assert.ok(parent);

      const rail = parent.querySelector('.omx-user-attachments-rail');
      assert.ok(rail, '消息气泡上方必须挂载附件轨');
      assert.equal(rail.nextElementSibling, bubble, '附件轨紧邻气泡上方');

      const productCard = rail.querySelector('.omx-user-att-card--product');
      assert.ok(productCard, '必须渲染专属商品卡片');
      assert.equal(productCard.getAttribute('title'), '关联商品: 5ml 便携迷你香水喷雾瓶 (买二送一)');

      const img = productCard.querySelector('img');
      assert.ok(img, '必须包含商品缩略图封面');
      assert.equal(img.getAttribute('src'), '/omnimux/products/prod-perfume-5ml?preview=cov-1', '优先走产品库图片预览通道');

      const nameSpan = productCard.querySelector('.omx-user-att-card__name');
      assert.equal(nameSpan?.textContent, '5ml 便携迷你香水喷雾瓶 (买二送一)');

      const badgeSpan = productCard.querySelector('.omx-user-att-card__badge');
      assert.ok(badgeSpan?.textContent?.includes('关联商品'), '卡片带有清晰关联商品标识');

      // 6. 验证组件导出的 removeProductAttachment 正确工作
      removeProductAttachment(sampleProduct.id, sessionId);
      assert.equal(store.getSnapshot(sessionId).length, 0, '移除后附件池恢复清空');
    } finally {
      store.clear(sessionId);
      submittedAttachmentStore.clear(sessionId);
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  });
});
