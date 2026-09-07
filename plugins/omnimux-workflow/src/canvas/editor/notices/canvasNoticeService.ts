/**
 * Canvas notice service — 画板级通知的发布/订阅与自动淡出（T05）。
 *
 * 无 React 依赖；调度器可注入，node:test 用假时钟直接断言。
 * `list()` 返回内部数组的只读视图，引用只在变化时替换，
 * 可直接作为 useSyncExternalStore 的 getSnapshot。
 */

import {
  NOTICE_DEFAULT_LEVEL,
  NOTICE_DEFAULT_TTL_MS,
  type CanvasNotice,
  type NoticeKind,
  type PublishNoticeInput,
} from './types.ts';

export interface NoticeScheduler {
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const defaultScheduler: NoticeScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
};

export type NoticeListener = (notices: readonly CanvasNotice[]) => void;

export interface CanvasNoticeService {
  publish: (input: PublishNoticeInput) => string;
  dismiss: (id: string) => void;
  dismissKind: (kind: NoticeKind) => void;
  list: () => readonly CanvasNotice[];
  subscribe: (listener: NoticeListener) => () => void;
}

export function createCanvasNoticeService(scheduler: NoticeScheduler = defaultScheduler): CanvasNoticeService {
  let notices: CanvasNotice[] = [];
  let sequence = 0;
  const listeners = new Set<NoticeListener>();
  const timers = new Map<string, unknown>();

  const emit = (): void => {
    const snapshot = list();
    for (const listener of listeners) listener(snapshot);
  };

  const clearTimer = (id: string): void => {
    const handle = timers.get(id);
    if (handle !== undefined) {
      scheduler.clearTimeout(handle);
      timers.delete(id);
    }
  };

  const arm = (id: string, ttlMs: number): void => {
    clearTimer(id);
    if (!(ttlMs > 0)) return;
    timers.set(id, scheduler.setTimeout(() => dismiss(id), ttlMs));
  };

  function dismiss(id: string): void {
    if (!notices.some((notice) => notice.id === id)) return;
    clearTimer(id);
    notices = notices.filter((notice) => notice.id !== id);
    emit();
  }

  function publish(input: PublishNoticeInput): string {
    const dedupeKey = input.dedupeKey ?? `${input.kind}:${input.message}`;
    const ttlMs = input.ttlMs ?? NOTICE_DEFAULT_TTL_MS[input.kind];
    const existing = notices.find((notice) => notice.dedupeKey === dedupeKey);
    if (existing) {
      // 相同 dedupeKey 防堆叠：刷新内容并重置淡出计时。
      notices = notices.map((notice) => notice.id === existing.id
        ? { ...notice, message: input.message, createdAt: scheduler.now(), ttlMs }
        : notice);
      arm(existing.id, ttlMs);
      emit();
      return existing.id;
    }
    const notice: CanvasNotice = {
      id: `notice-${++sequence}`,
      kind: input.kind,
      level: input.level ?? NOTICE_DEFAULT_LEVEL[input.kind],
      message: input.message,
      createdAt: scheduler.now(),
      ttlMs,
      dedupeKey,
    };
    notices = [...notices, notice];
    arm(notice.id, ttlMs);
    emit();
    return notice.id;
  }

  function dismissKind(kind: NoticeKind): void {
    const ids = notices.filter((notice) => notice.kind === kind).map((notice) => notice.id);
    for (const id of ids) dismiss(id);
  }

  function list(): readonly CanvasNotice[] {
    return notices;
  }

  function subscribe(listener: NoticeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { publish, dismiss, dismissKind, list, subscribe };
}

/** 画板共享实例：ConfigPanel / CanvasEditor / Host 同源。 */
export const canvasNoticeService: CanvasNoticeService = createCanvasNoticeService();
