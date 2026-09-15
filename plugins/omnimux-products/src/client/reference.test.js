import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildProductReference, deliverProductReference } from './reference.js';

describe('omnimux-products unified reference', () => {
  const sampleProduct = {
    id: 'prd_abc123',
    name: '智能降噪耳机',
    kind: 'physical',
    brand: '声学工坊',
    sku: 'ANC-PRO-01',
    selling_points: '双馈主动降噪，40小时长续航，双设备切换',
    description: '一款出色的降噪耳机',
    link: 'https://example.com/headphones',
    categories: ['数码', '耳机'],
    cover: {
      id: 'med_cover1',
      kind: 'image',
      real_path: '/Users/test/.dsh/omnimux/products/media/med_cover1.jpg',
      ext: '.jpg',
    },
  };

  it('builds a standard UnifiedReference with scene context', () => {
    const ref = buildProductReference(sampleProduct);
    assert.ok(ref);
    assert.equal(ref.id, 'prd_abc123');
    assert.equal(ref.source, 'product');
    assert.equal(ref.title, '智能降噪耳机');
    assert.equal(ref.kind, 'product');
    assert.equal(ref.file.relativePath, '/Users/test/.dsh/omnimux/products/media/med_cover1.jpg');
    assert.equal(ref.file.extension, 'JPG');
    assert.equal(ref.file.previewUrl, '/omnimux/products/prd_abc123?preview=med_cover1');

    assert.equal(ref.context.scene, 'ecommerce_marketing');
    assert.equal(ref.context.summary, sampleProduct.selling_points);
    assert.equal(ref.context.metadata.brand, '声学工坊');
    assert.equal(ref.context.metadata.sku, 'ANC-PRO-01');
    assert.deepEqual(ref.context.metadata.categories, ['数码', '耳机']);
  });

  it('delivers product reference through global reference api if available', async () => {
    let deliveredRef = null;
    globalThis.window = {
      __omnimuxReference: {
        deliver: async (ref) => {
          deliveredRef = ref;
          return { ok: true, referenceId: ref.id };
        },
      },
    };

    const res = await deliverProductReference(sampleProduct);
    assert.equal(res.ok, true);
    assert.equal(res.referenceId, 'prd_abc123');
    assert.equal(deliveredRef.title, '智能降噪耳机');

    delete globalThis.window;
  });

  it('falls back to window events and store when global reference api is absent', async () => {
    let uncollapsed = false;
    let focus = '';
    let attachedPayload = null;

    globalThis.window = {
      __omnimuxWorkbench: {
        setConversationCollapsed: (val) => { uncollapsed = !val; },
        setFocus: (f) => { focus = f; },
      },
      __omnimuxAttachments: {
        addAttachment: (sess, payload) => {
          attachedPayload = payload;
          return { ok: true };
        },
      },
      dispatchEvent: () => true,
    };

    const res = await deliverProductReference(sampleProduct);
    assert.equal(res.ok, true);
    assert.equal(uncollapsed, true);
    assert.equal(focus, 'split');
    assert.equal(attachedPayload.entityId, 'prd_abc123');
    assert.equal(attachedPayload.sourcePlugin, 'omnimux-products');

    delete globalThis.window;
  });
});
