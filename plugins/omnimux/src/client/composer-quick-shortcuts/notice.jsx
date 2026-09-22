import React, { useCallback, useEffect, useState } from 'react'

/**
 * 「输入框未就绪，请重试」这条轻提示的**单一实现**。
 *
 * 两条写入通道都可能失败，且都必须让用户看见、不许静默：
 *   - 输入框下方的四条快捷方式（写提示语、插胶囊）；
 *   - 输入框内侧的素材卡槽行（点卡槽插胶囊）。
 *
 * 两处共用同一个 hook 与同一个展示组件，文案（`quickShortcuts.notice.writeFailed`）
 * 与样式类（`omx-quick-shortcut-notice`，见 `styles.js`）只有一份，不各自造一套。
 */

/** 提示自动收起时长：内容固定一条，重复触发靠序号刷新。 */
export const QUICK_NOTICE_TTL_MS = 4000

/** 文案缺失（字典没有该键、或解析器回键名本身）时的中文兜底。 */
export const QUICK_NOTICE_FALLBACK = '输入框未就绪，请重试'

const NOTICE_KEY = 'quickShortcuts.notice.writeFailed'

/**
 * 轻提示状态：`notify()` 触发一次展示，`QUICK_NOTICE_TTL_MS` 后自动收起，
 * 期间再次触发会重新计时（序号驱动，所以重复失败也看得见）；
 * `dismiss()` 用于紧接着的成功操作顺手收起。
 * @returns {{ visible: boolean, notify: () => void, dismiss: () => void }}
 */
export function useQuickWriteNotice() {
  const [seq, setSeq] = useState(0)
  useEffect(() => {
    if (seq === 0) return undefined
    const timer = setTimeout(() => setSeq(0), QUICK_NOTICE_TTL_MS)
    return () => clearTimeout(timer)
  }, [seq])
  const notify = useCallback(() => setSeq((n) => n + 1), [])
  const dismiss = useCallback(() => setSeq(0), [])
  return { visible: seq > 0, notify, dismiss }
}

/**
 * 轻提示本体：`role="status"` 供读屏播报；不展示时渲染 null。
 * @param {{ visible?: boolean, t?: (key: string) => string }} props
 */
export function QuickWriteNotice({ visible, t }) {
  if (!visible) return null
  const resolved = typeof t === 'function' ? t(NOTICE_KEY) : ''
  const text = typeof resolved === 'string' && resolved && resolved !== NOTICE_KEY
    ? resolved
    : QUICK_NOTICE_FALLBACK
  return (
    <p className="omx-quick-shortcut-notice" role="status">
      {text}
    </p>
  )
}
