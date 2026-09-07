/**
 * canvasNoticeService 单测（T05）：发布/去重/自动淡出/dismiss/dismissKind/订阅。
 * 假调度器注入，不用真实定时器。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCanvasNoticeService } from './canvasNoticeService.ts';
import { NOTICE_DEFAULT_TTL_MS } from './types.ts';

function fakeScheduler() {
  let now = 1000;
  const timers = new Map();
  let seq = 0;
  return {
    scheduler: {
      now: () => now,
      setTimeout: (cb, ms) => { const h = ++seq; timers.set(h, { cb, ms }); return h; },
      clearTimeout: (h) => { timers.delete(h); },
    },
    advance(ms) {
      now += ms;
      for (const [h, timer] of [...timers.entries()]) {
        timer.ms -= ms;
        if (timer.ms <= 0) { timers.delete(h); timer.cb(); }
      }
    },
    pending: () => timers.size,
  };
}

describe('canvasNoticeService', () => {
  it('publish 追加通知并按种类默认 ttl 自动淡出（3s/4s/5s）', () => {
    const { scheduler, advance } = fakeScheduler();
    const service = createCanvasNoticeService(scheduler);
    service.publish({ kind: 'structure_reject', message: '不能连接到自己' });
    service.publish({ kind: 'submit_blocked_click', message: '还差首帧' });
    service.publish({ kind: 'mode_consumption_changed', message: '部分素材不再被消费' });
    assert.equal(service.list().length, 3);
    assert.equal(service.list()[0].ttlMs, NOTICE_DEFAULT_TTL_MS.structure_reject);

    advance(3000);
    assert.deepEqual(service.list().map((n) => n.kind), ['submit_blocked_click', 'mode_consumption_changed']);
    advance(1000);
    assert.deepEqual(service.list().map((n) => n.kind), ['mode_consumption_changed']);
    advance(1000);
    assert.equal(service.list().length, 0);
  });

  it('相同 dedupeKey 防堆叠：刷新内容并重置计时', () => {
    const { scheduler, advance } = fakeScheduler();
    const service = createCanvasNoticeService(scheduler);
    const first = service.publish({ kind: 'structure_reject', message: '不能连接到自己' });
    advance(2000);
    const second = service.publish({ kind: 'structure_reject', message: '不能连接到自己' });
    assert.equal(first, second);
    assert.equal(service.list().length, 1);
    advance(2500);
    assert.equal(service.list().length, 1, '重置后 2.5s 仍未淡出');
    advance(600);
    assert.equal(service.list().length, 0);
  });

  it('不同消息默认 dedupeKey 不同，可并存', () => {
    const { scheduler } = fakeScheduler();
    const service = createCanvasNoticeService(scheduler);
    service.publish({ kind: 'structure_reject', message: '不能连接到自己' });
    service.publish({ kind: 'structure_reject', message: '这条连线会形成循环依赖' });
    assert.equal(service.list().length, 2);
  });

  it('dismiss / dismissKind 立即移除并取消计时', () => {
    const { scheduler, pending } = fakeScheduler();
    const service = createCanvasNoticeService(scheduler);
    const id = service.publish({ kind: 'submit_blocked_click', message: '还差尾帧' });
    service.publish({ kind: 'mode_consumption_changed', message: 'x' });
    service.dismiss(id);
    assert.deepEqual(service.list().map((n) => n.kind), ['mode_consumption_changed']);
    service.dismissKind('mode_consumption_changed');
    assert.equal(service.list().length, 0);
    assert.equal(pending(), 0);
    service.dismiss('不存在');
  });

  it('subscribe 收到快照并在退订后停止', () => {
    const { scheduler } = fakeScheduler();
    const service = createCanvasNoticeService(scheduler);
    const seen = [];
    const unsubscribe = service.subscribe((notices) => seen.push(notices.length));
    service.publish({ kind: 'structure_reject', message: 'a' });
    service.dismissKind('structure_reject');
    unsubscribe();
    service.publish({ kind: 'structure_reject', message: 'b' });
    assert.deepEqual(seen, [1, 0]);
  });

  it('list 快照引用在变化时替换（useSyncExternalStore 兼容）', () => {
    const { scheduler } = fakeScheduler();
    const service = createCanvasNoticeService(scheduler);
    const before = service.list();
    service.publish({ kind: 'structure_reject', message: 'a' });
    const after = service.list();
    assert.notEqual(before, after);
    assert.equal(service.list(), after, '无变化时保持同一引用');
  });
});
