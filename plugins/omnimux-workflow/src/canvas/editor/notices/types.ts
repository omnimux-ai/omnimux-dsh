/**
 * Canvas notice contracts — 画板级轻量通知（Feed-Slot 阶段二 / T05）。
 *
 * 通知是画板顶部的浮动提示，替代节点内部的静态错误条：
 * 空卡槽自解释，瞬时反馈交给自动淡出的 Toast / Banner。
 */

/** 通知种类：提交被拦截点击 / 模式切换后供给消费变化 / 结构硬拒绝。 */
export type NoticeKind =
  | 'submit_blocked_click'
  | 'mode_consumption_changed'
  | 'structure_reject';

export type NoticeLevel = 'info' | 'success' | 'warning' | 'error';

export interface CanvasNotice {
  id: string;
  kind: NoticeKind;
  level: NoticeLevel;
  message: string;
  createdAt: number;
  /** 自动淡出毫秒数（3s / 4s / 5s 档）。 */
  ttlMs: number;
  /** 相同 dedupeKey 的通知刷新而不是堆叠。 */
  dedupeKey: string;
}

export interface PublishNoticeInput {
  kind: NoticeKind;
  message: string;
  level?: NoticeLevel;
  /** 覆盖默认自动淡出时长。 */
  ttlMs?: number;
  /** 缺省为 `${kind}:${message}`。 */
  dedupeKey?: string;
}

/** 各通知种类的默认自动淡出时长。 */
export const NOTICE_DEFAULT_TTL_MS: Readonly<Record<NoticeKind, number>> = Object.freeze({
  structure_reject: 3000,
  submit_blocked_click: 4000,
  mode_consumption_changed: 5000,
});

/** 各通知种类的默认级别。 */
export const NOTICE_DEFAULT_LEVEL: Readonly<Record<NoticeKind, NoticeLevel>> = Object.freeze({
  structure_reject: 'warning',
  submit_blocked_click: 'warning',
  mode_consumption_changed: 'info',
});
