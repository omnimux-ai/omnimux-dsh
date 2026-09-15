import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createShadowContextStore } from './shadow-context.ts';

describe('ShadowContextStore', () => {
  it('registers and reads shadow context by session', () => {
    const store = createShadowContextStore();
    store.registerContext('sess-1', 'prod_123', {
      scene: 'ecommerce_marketing',
      summary: '无线降噪蓝牙耳机',
      metadata: { price: 299, brand: 'Sony' },
    });

    const snapshot = store.getSnapshot('sess-1');
    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0].entityId, 'prod_123');
    assert.equal(snapshot[0].context.summary, '无线降噪蓝牙耳机');

    // 其他会话隔离
    assert.equal(store.getSnapshot('sess-2').length, 0);
  });

  it('updates existing entity context on re-register', () => {
    const store = createShadowContextStore();
    store.registerContext('sess-1', 'prod_123', {
      scene: 'ecommerce_marketing',
      summary: '版本 1',
    });
    store.registerContext('sess-1', 'prod_123', {
      scene: 'ecommerce_marketing',
      summary: '版本 2',
    });

    const snapshot = store.getSnapshot('sess-1');
    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0].context.summary, '版本 2');
  });

  it('consumes context and clears session storage', () => {
    const store = createShadowContextStore();
    store.registerContext('sess-1', 'prod_1', {
      scene: 'ecommerce_marketing',
      summary: '商品1',
    });

    const consumed = store.consume('sess-1');
    assert.equal(consumed.length, 1);
    assert.equal(store.getSnapshot('sess-1').length, 0);
  });

  it('formats system context block properly', () => {
    const store = createShadowContextStore();
    store.registerContext('sess-1', 'prod_1', {
      scene: 'ecommerce_marketing',
      summary: '便携咖啡机',
      metadata: { sku: 'CM-01' },
    });

    const text = store.formatSystemContext('sess-1');
    assert.match(text, /\[场景附加上下文 \/ Scene Enrichment Context\]:/);
    assert.match(text, /实体: prod_1 \(场景: ecommerce_marketing\)/);
    assert.match(text, /摘要: 便携咖啡机/);
    assert.match(text, /"sku":"CM-01"/);
  });
});
