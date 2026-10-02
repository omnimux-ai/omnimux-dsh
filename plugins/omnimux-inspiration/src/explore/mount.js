// 探索/新会话引导 mount：hub 拆分 Issue 2949。
// slot id / order / locale 与 hub 旧注册完全一致；workbench 走官方全局缝
// （window.__omnimuxWorkbench，hub 已安装），数据层仍在 hub。
import { SessionGuide } from './SessionGuide.jsx'
import { createGuideStore } from '../../../omnimux/src/client/session-guide/state.js'
import { guideZh, guideEn } from '../../../omnimux/src/client/session-guide/catalog.js'
import { installGuideStyles } from '../../../omnimux/src/client/session-guide/styles.js'
import { resetCreativeTemplates } from '../../../omnimux/src/client/session-guide/templates/creative-templates-client.js'

/**
 * @param {{ slots?: { inject?: Function }, locale?: { register?: Function }, inject?: Function, effect?: Function }} ctx
 */
export function mountSessionGuide(ctx) {
  if (!ctx || typeof ctx !== 'object') return
  const guideStore = createGuideStore()
  // sessionId 在 sessions inject 到位前为空——guideFace 语义不变
  let guideSessions = null
  const guideFace = {
    store: guideStore,
    // 渲染时按官方全局缝读 workbench（hub 已装 window.__omnimuxWorkbench）
    get workbench() { return typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined },
    getCurrentSessionId: () => guideSessions?.list.getSnapshot().current,
  }
  ctx.effect?.(() => ctx.locale?.register?.('omnimux-session-guide', { zh: guideZh, en: guideEn }), 'omnimux-inspiration: starter locale')
  ctx.effect?.(() => () => guideStore.dispose(), 'omnimux-inspiration: starter state')
  ctx.effect?.(() => () => resetCreativeTemplates(), 'omnimux-inspiration: creative templates snapshot')
  if (typeof document !== 'undefined') {
    ctx.effect?.(() => installGuideStyles(document), 'omnimux-inspiration: starter styles')
  }
  ctx.slots?.inject?.('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'omnimux:session-guide', order: 110,
    locale: 'omnimux-session-guide', inject: () => guideFace,
  }, SessionGuide))
  ctx.inject?.(['sessions'], (inner) => {
    guideSessions = inner.sessions
  })
}
