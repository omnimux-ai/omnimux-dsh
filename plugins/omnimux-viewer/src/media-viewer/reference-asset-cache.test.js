/**
 * Issue #3012 追加需求：选择素材弹层模块级缓存单测。
 * 覆盖：in-flight 去重、stale-while-revalidate、按 id 列表比较不重复通知、
 * 有缓存时刷新失败保留缓存、无缓存失败进入 error、状态按 Tab 独立。
 * 规格：specs/3012-ref-picker-align-composer.spec.md §6.2
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  ensureReferenceTab,
  peekReferenceTab,
  resetReferenceAssetCache,
  subscribeReferenceAssets,
} from './reference-asset-cache.js';

const items = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i + 1}` }));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('reference-asset-cache：模块级 Tab 缓存 (#3012)', () => {
  beforeEach(() => resetReferenceAssetCache());

  it('同一 Tab 并发请求去重：两次 ensure 复用同一 in-flight，fetcher 只调一次', async () => {
    let calls = 0;
    const fetcher = async () => { calls += 1; await flush(); return items('a', 3); };
    const p1 = ensureReferenceTab('local', fetcher);
    const p2 = ensureReferenceTab('local', fetcher);
    assert.strictEqual(p1, p2, '并发 ensure 必须返回同一个 in-flight Promise');
    await p1;
    assert.equal(calls, 1);
    assert.equal(peekReferenceTab('local').status, 'ready');
    assert.equal(peekReferenceTab('local').items.length, 3);
  });

  it('首次加载成功后进入 ready 并通知订阅者', async () => {
    const seen = [];
    const off = subscribeReferenceAssets((tab) => seen.push(tab));
    ensureReferenceTab('local', async () => items('a', 2));
    await flush();
    await flush();
    assert.deepEqual(seen, ['local']);
    assert.equal(peekReferenceTab('local').status, 'ready');
    off();
  });

  it('SWR：已有缓存再次 ensure 立刻可读且后台静默刷新；数据未变不通知', async () => {
    const list = items('a', 3);
    await ensureReferenceTab('local', async () => list);

    let notified = 0;
    subscribeReferenceAssets(() => { notified += 1; });
    let calls = 0;
    const p = ensureReferenceTab('local', async () => { calls += 1; return items('a', 3); });
    // 缓存立即可读，不进入 loading
    assert.equal(peekReferenceTab('local').items.length, 3);
    assert.equal(peekReferenceTab('local').status, 'ready');
    await p;
    assert.equal(calls, 1, '后台确实发起了刷新');
    await flush();
    assert.equal(notified, 0, 'id 列表相同不得触发重渲染通知');
  });

  it('SWR：数据变化时更新缓存并通知订阅者', async () => {
    await ensureReferenceTab('local', async () => items('a', 3));
    const seen = [];
    subscribeReferenceAssets((tab) => seen.push(tab));
    await ensureReferenceTab('local', async () => items('b', 5));
    await flush();
    assert.deepEqual(seen, ['local']);
    assert.equal(peekReferenceTab('local').items.length, 5);
    assert.equal(peekReferenceTab('local').items[0].id, 'b-1');
  });

  it('已有缓存时刷新失败：继续显示缓存，status 保持 ready，不降级', async () => {
    await ensureReferenceTab('local', async () => items('a', 4));
    let notified = 0;
    subscribeReferenceAssets(() => { notified += 1; });
    await ensureReferenceTab('local', async () => null);
    await flush();
    assert.equal(peekReferenceTab('local').status, 'ready');
    assert.equal(peekReferenceTab('local').items.length, 4, '失败不得用空或占位替换缓存');
    assert.equal(notified, 0, '静默失败无任何通知');
  });

  it('无缓存且请求失败：进入 error，由调用方退回离线占位', async () => {
    const seen = [];
    subscribeReferenceAssets((tab) => seen.push(tab));
    await ensureReferenceTab('cloud', async () => null);
    await flush();
    assert.equal(peekReferenceTab('cloud').status, 'error');
    assert.equal(peekReferenceTab('cloud').items, null);
    assert.deepEqual(seen, ['cloud']);
  });

  it('fetcher 抛异常同样收敛：无缓存 → error，有缓存 → 保留', async () => {
    await ensureReferenceTab('local', async () => items('a', 1));
    await ensureReferenceTab('local', async () => { throw new Error('boom'); });
    assert.equal(peekReferenceTab('local').status, 'ready');
    assert.equal(peekReferenceTab('local').items.length, 1);

    await ensureReferenceTab('product', async () => { throw new Error('boom'); });
    await flush();
    assert.equal(peekReferenceTab('product').status, 'error');
  });

  it('加载状态按 Tab 独立：一个 Tab loading 不影响另一 Tab 的 ready', async () => {
    let resolveCloud;
    const cloudP = new Promise((r) => { resolveCloud = r; });
    ensureReferenceTab('cloud', () => cloudP);
    await ensureReferenceTab('local', async () => items('a', 1));
    assert.equal(peekReferenceTab('cloud').status, 'loading');
    assert.equal(peekReferenceTab('local').status, 'ready');
    resolveCloud(items('c', 1));
    await cloudP;
    await flush();
    assert.equal(peekReferenceTab('cloud').status, 'ready');
  });
});
