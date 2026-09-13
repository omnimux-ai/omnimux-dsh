/**
 * 「自动化」Cordis Host 插件入口。
 *
 * 生命周期：打开 AutomationService → 给 root Agent 挂管理工具 → 注册系统提示词段落
 * → 注册 `tools/pre-execute` 审批门 → 注册 RPC 通道 → Loader 就绪后启动时钟。
 * 所有清理函数必须幂等；服务打开失败时先清理已注册的贡献再抛出。
 */

import z from '@deepseek-ai/schemastery'
import { readSessionEvents } from './executor.js'
import { AUTOMATION_PROMPT_NAME, AUTOMATION_PROMPT_ORDER, AUTOMATION_PROMPT_TEXT } from './prompt.js'
import { registerAutomationRpc } from './rpc.js'
import { AutomationService } from './service.js'
import { registerAutomationTools } from './tools.js'

export const name = 'omnimux-automation'

export const inject = [
  'storageDomain',
  'agents',
  'sessions',
  'workspaceRegistry',
  'agentDefaultModel',
  'agentPresets',
  'permissionPresets',
  'tools',
  'connection',
  'llm',
]

export const Config = z.object({
  runTimeoutMinutes: z.number().step(1).min(1).max(1440).default(60),
  misfireGraceMinutes: z.number().step(1).min(0).max(10080).default(15),
  historyLimit: z.number().step(1).min(1).max(5000).default(200),
})

const MUTATING_TOOLS = new Set([
  'automation_create',
  'automation_update',
  'automation_run_now',
  'automation_delete',
])

/**
 * 读取当前会话实际审批策略；自定义权限预设也以 Host 投影结果为准。
 *
 * @param {{ config?: { policy?: 'ask' | 'never' }, overrideOf?: (session: unknown) => unknown }} [approval]
 * @param {unknown} session
 * @returns {'ask' | 'never' | undefined}
 */
export function sessionApprovalPolicy(approval, session) {
  const override = approval?.overrideOf?.(session)
  if (override === 'ask' || override === 'never') return override
  const fallback = approval?.config?.policy
  if (fallback === 'ask' || fallback === 'never') return fallback
  return undefined
}

/**
 * 只在实际 ask 策略下二次确认。never 策略再 ask 会被映射成
 * “the user rejected tool”，且不会弹窗。
 *
 * @param {{ name: string, arguments?: unknown, signal: AbortSignal }} exec
 * @param {boolean} isMountedAgent
 * @param {'ask' | 'never'} [policy]
 * @returns {boolean}
 */
export function needsHumanApproval(exec, isMountedAgent, policy) {
  if (!isMountedAgent || exec.signal.aborted || !MUTATING_TOOLS.has(exec.name)) return false
  if (policy !== 'ask') return false
  if (exec.name !== 'automation_update') return true
  const args = typeof exec.arguments === 'object' && exec.arguments !== null
    ? exec.arguments
    : {}
  return !(args.status === 'paused' && Object.keys(args).every(key => key === 'id' || key === 'status'))
}

/**
 * @param {string} toolName
 * @returns {string}
 */
export function humanApprovalReason(toolName) {
  return toolName === 'automation_delete'
    ? '此操作会永久删除自动化定义。运行历史会保留，但计划无法自动恢复。'
    : '此操作会创建或扩大无人值守的未来工作。请核对任务说明、计划、工作区和权限边界。'
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ runTimeoutMinutes?: number, misfireGraceMinutes?: number, historyLimit?: number }} rawConfig
 * @returns {Promise<void>}
 */
export async function apply(ctx, rawConfig) {
  const config = {
    runTimeoutMinutes: rawConfig?.runTimeoutMinutes ?? 60,
    misfireGraceMinutes: rawConfig?.misfireGraceMinutes ?? 15,
    historyLimit: rawConfig?.historyLimit ?? 200,
  }
  await ctx.effect(async () => {
    let alive = true
    const service = await AutomationService.open(ctx, {
      runTimeoutMs: config.runTimeoutMinutes * 60_000,
      misfireGraceMs: config.misfireGraceMinutes * 60_000,
      historyLimit: config.historyLimit,
    })
    const agentTools = new Map()
    let cleaned = false
    let stopCreated = () => {}
    let stopDisposed = () => {}
    let stopApproval = () => {}
    let stopPrompt = () => {}
    let stopSessionGone = () => {}
    let removeRpc = async () => {}

    const cleanup = async () => {
      if (cleaned) return
      cleaned = true
      alive = false
      for (const stop of [stopCreated, stopDisposed, stopApproval, stopPrompt, stopSessionGone]) {
        try {
          stop()
        } catch (error) {
          ctx.logger.warn(`omnimux-automation: lifecycle cleanup failed: ${String(error)}`)
        }
      }
      const results = await Promise.allSettled([
        removeRpc(),
        ...[...agentTools.values()].reverse().map(dispose => Promise.resolve().then(dispose)),
      ])
      for (const result of results) {
        if (result.status === 'rejected') {
          ctx.logger.warn(`omnimux-automation: contribution cleanup failed: ${String(result.reason)}`)
        }
      }
      agentTools.clear()
      await service.dispose()
    }

    try {
      const mountTools = (agent) => {
        if (!alive || agentTools.has(agent)
          || service.ownsSession(String(agent.id), readSessionEvents(agent.session))) return
        if (!ctx.agents.roots().includes(agent)) return
        const dispose = agent.ctx.effect(
          () => registerAutomationTools(service, agent),
          'omnimux-automation: management tools',
        )
        agentTools.set(agent, dispose)
      }
      for (const agent of ctx.agents.roots()) mountTools(agent)
      stopCreated = ctx.on('agent/created', ({ agent }) => { mountTools(agent) })
      stopDisposed = ctx.on('agent/disposed', ({ agent }) => { agentTools.delete(agent) })
      stopSessionGone = ctx.on('session/disposed', (session) => {
        const id = String(session?.id ?? '')
        if (id === '') return
        void service.forgetSession(id)
      })
      const systemPrompt = ctx.get('systemPrompt')
      if (typeof systemPrompt?.section === 'function') {
        stopPrompt = systemPrompt.section({
          name: AUTOMATION_PROMPT_NAME,
          order: AUTOMATION_PROMPT_ORDER,
          text: AUTOMATION_PROMPT_TEXT,
        })
      }
      stopApproval = ctx.on('tools/pre-execute', async (exec, next) => {
        const downstream = await next()
        const approval = ctx.get('approval')
        const policy = sessionApprovalPolicy(approval, exec.agent?.session)
        if (downstream.kind !== 'allow' || !needsHumanApproval(exec, agentTools.has(exec.agent), policy)) {
          return downstream
        }
        return {
          kind: 'ask',
          reason: humanApprovalReason(exec.name),
        }
      })
      removeRpc = registerAutomationRpc(ctx, service)

      const loader = ctx.get('loader')
      if (loader === undefined) service.start()
      else {
        void loader.await().then(() => {
          if (alive) service.start()
        }, (error) => {
          if (alive) ctx.logger.warn(`omnimux-automation: Loader did not settle; clock remains stopped: ${String(error)}`)
        })
      }

      return cleanup
    } catch (error) {
      await cleanup()
      throw error
    }
  }, 'omnimux-automation: host service')
}

export { automationDomainSpec } from './domain.js'
