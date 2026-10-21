/**
 * Chinese fallback copy for the Flow-alignment surface.
 *
 * Production passes `t` from `ctx.locale.bind('tool.viewer')`. Tests and the
 * standalone browser harness mount the components without a locale service, so
 * a missing key must never render the raw key into the UI.
 */

export const FLOW_ALIGNMENT_FALLBACK = Object.freeze({
  'mediaViewer.history.title': '历史',
  'mediaViewer.history.empty': '暂无历史',
  'mediaViewer.history.toggle': '历史',
  'mediaViewer.history.close': '关闭',
  'mediaViewer.history.reusePrompt': '复用提示词',
  'mediaViewer.history.download': '下载',
  'mediaViewer.history.noPrompt': '无提示词',
  'mediaViewer.history.failed': '生成失败',
  'mediaViewer.history.generating': '生成中',
  'mediaViewer.history.partialFailed': '部分失败',
  'mediaViewer.kind.image': '图片',
  'mediaViewer.kind.video': '视频',
  'mediaViewer.cost.estimated': '预估消耗',
  'mediaViewer.cost.unit': '积分',
  'mediaViewer.cost.hint': '预估值，实际以执行中枢结算为准',
});

/**
 * Resolve one key through the locale binder, falling back to Chinese copy.
 * @param {((key: string) => string) | undefined} t
 * @param {keyof typeof FLOW_ALIGNMENT_FALLBACK} key
 * @returns {string}
 */
export function flowAlignmentText(t, key) {
  if (typeof t === 'function') {
    const value = t(key);
    if (value && value !== key) return value;
  }
  return FLOW_ALIGNMENT_FALLBACK[key] ?? key;
}
