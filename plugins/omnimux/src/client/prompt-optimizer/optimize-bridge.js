/**
 * 「优化提示词」的 client↔host 桥。
 *
 * 在 window 上挂 `__omnimuxPromptOptimizer = { optimize, configured }`：
 * `optimize(text)` 走 host JSON 路由（`/omnimux/prompt-optimizer`），
 * 返回 `{ ok, prompt, templateId, matched }`；`configured` 由挂载时的
 * 同源 GET 探测得出（host 端 512/路由未挂载/超时一律按 false 降级，
 * 按钮静默置灰，不弹任何错误）。
 *
 * configured 是异步得出的，因此提供订阅口给按钮组件做响应式置灰；
 * 订阅真源就是这个模块自身的监听集合，不经宿主事件，避免第二个真相。
 *
 * 点击链路的纯逻辑收口在 `runPromptOptimize`：读草稿 → 请求 → 回写 →
 * 聚焦，返回值驱动按钮的唯一轻提示，组件里不再写第二份流程。
 */

import { jsonRequest } from '../api-json.js'

const ROUTE = '/omnimux/prompt-optimizer'
export const PROMPT_OPTIMIZER_GLOBAL = '__omnimuxPromptOptimizer'

const listeners = new Set()

function notifyConfiguredChanged() {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // 监听方异常不影响桥本身
    }
  }
}

function getWindow() {
  return typeof window !== 'undefined' ? window : null
}

/** 读桥的当前配置态；桥未挂或探测失败一律 false（与按钮置灰口径一致）。 */
export function getPromptOptimizerConfigured() {
  try {
    return getWindow()?.[PROMPT_OPTIMIZER_GLOBAL]?.configured === true
  } catch {
    return false
  }
}

/**
 * 订阅配置态变化（configured 探测返回时触发）。
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribePromptOptimizerConfigured(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * 执行一次优化：空草稿、桥未就绪、未配置 → 'skipped'（静默，按禁用态处理）；
 * host 回 ok 且写出成功 → 'applied'（已替换草稿并聚焦）；其余 → 'failed'（调用方提示）。
 * @returns {Promise<'applied' | 'failed' | 'skipped'>}
 */
export async function runPromptOptimize({ readDraft, writeDraft, focusComposerEditor }) {
  const bridge = getWindow()?.[PROMPT_OPTIMIZER_GLOBAL]
  if (!bridge || typeof bridge.optimize !== 'function') return 'skipped'
  if (bridge.configured !== true) return 'skipped'
  const draft = typeof readDraft === 'function' ? readDraft().trim() : ''
  if (!draft) return 'skipped'
  let res = null
  try {
    res = await bridge.optimize(draft)
  } catch {
    res = null
  }
  if (res?.ok && typeof res.prompt === 'string' && res.prompt
    && typeof writeDraft === 'function' && writeDraft(res.prompt) === true) {
    focusComposerEditor?.()
    return 'applied'
  }
  return 'failed'
}

/**
 * 挂载优化桥。返回清场函数；`ctx.effect` 在时自动把清场交给宿主生命周期。
 * @param {{ effect?: (fn: () => unknown, label?: string) => unknown }} [ctx]
 * @returns {() => void} 卸载清理
 */
export function installOptimizeBridge(ctx) {
  const win = getWindow()
  if (!win) return () => {}

  const bridge = {
    configured: false,
    async optimize(text) {
      try {
        const res = await jsonRequest(ROUTE, { method: 'POST', body: { text } })
        const body = res && typeof res.body === 'object' ? res.body : {}
        return {
          // 业务 ok 在 body 里：未配置时 host 也回 200 + {ok:false,unconfigured:true}，
          // 不能看 res.ok（HTTP 层）否则未配置会被当成成功。
          ok: res?.ok === true && body.ok === true,
          prompt: typeof body.prompt === 'string' ? body.prompt : '',
          templateId: typeof body.templateId === 'string' ? body.templateId : '',
          matched: body.matched === true,
        }
      } catch {
        return { ok: false, prompt: '', templateId: '', matched: false }
      }
    },
  }
  win[PROMPT_OPTIMIZER_GLOBAL] = bridge

  // 配置探测只决定「能不能点」：失败静默降级为禁用，不得报错、不得弹提示。
  void (async () => {
    try {
      const res = await jsonRequest(ROUTE)
      const body = res && typeof res.body === 'object' ? res.body : {}
      if (win[PROMPT_OPTIMIZER_GLOBAL] !== bridge) return
      bridge.configured = res?.ok === true && body.configured === true
      notifyConfiguredChanged()
    } catch {
      notifyConfiguredChanged()
    }
  })()

  const dispose = () => {
    if (win[PROMPT_OPTIMIZER_GLOBAL] === bridge) delete win[PROMPT_OPTIMIZER_GLOBAL]
    listeners.clear()
    notifyConfiguredChanged()
  }
  if (typeof ctx?.effect === 'function') ctx.effect(() => dispose, 'omnimux: prompt optimizer bridge')
  return dispose
}
