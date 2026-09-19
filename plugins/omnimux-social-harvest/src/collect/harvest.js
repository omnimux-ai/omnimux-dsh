/**
 * @file 采集执行器 —— 经注入的 run 触达 OpenCLI，把结果归一为统一信封。
 *
 * 硬边界：本文件不直接 spawn；外部进程一律经 deps.run 触达，单测零子进程、零网络。
 * 时间纪律：nowMs 由调用方显式注入，本文件不读真实时钟。
 */

import { ERROR_CODES, HarvestError } from '../core/errors.js'
import { classifyFailure, parseEnvelope } from '../core/envelope.js'
import { HARVEST_TIMEOUT_MS, LOGIN_TIMEOUT_MS, clampLimit } from '../config.js'
import { getCommand } from './registry.js'

/**
 * @typedef {(argv: string[], options: { timeoutMs: number, signal?: AbortSignal }) =>
 *   Promise<{ stdout: string, stderr: string, code: number }>} RunFn
 */

/**
 * 校验并装配命令入参（按表单规格）。
 * @param {object} command CommandSpec
 * @param {Record<string, unknown>} args 用户输入
 * @returns {Record<string, unknown>} 归一后的参数
 */
export function resolveArgs(command, args) {
  const out = {}
  for (const field of command.form) {
    const raw = args?.[field.key]
    if (field.type === 'number') {
      out[field.key] = clampLimit(typeof raw === 'number' ? raw : field.value)
      continue
    }
    if (field.type === 'select') {
      const valid = field.choices.some(([v]) => v === raw)
      out[field.key] = valid ? raw : field.value
      continue
    }
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (field.required && text === '') {
      throw new HarvestError(ERROR_CODES.ARG_INVALID, `请填写${field.label}`, {
        hint: `${field.label}为必填项`,
        retryable: false,
      })
    }
    out[field.key] = text
  }
  // limit 缺席时补默认
  if (!('limit' in out)) out.limit = clampLimit(undefined)
  return out
}

/**
 * 执行一条已登记的采集命令。
 * @param {{ siteId: string, commandId: string, args?: Record<string, unknown>, nowMs: number, signal?: AbortSignal }} input
 * @param {{ run: RunFn }} deps
 * @returns {Promise<{ ok: true, site: string, command: string, items: unknown[], rawCount: number,
 *   warnings: string[], fetchedAtMs: number }>}
 */
export async function executeHarvest(input, deps) {
  if (typeof deps?.run !== 'function') {
    throw new HarvestError(ERROR_CODES.INTERNAL, 'executeHarvest 需要注入 run 依赖', {
      hint: '这是内部缺陷：默认 run 只在 src/index.js 装配，请提交 issue',
    })
  }
  const found = getCommand(input.siteId, input.commandId)
  if (!found) {
    throw new HarvestError(ERROR_CODES.ARG_INVALID, `未登记的采集命令：${input.siteId}.${input.commandId}`, {
      hint: '命令必须在 site-registry 白名单内；写操作命令永不开放',
      retryable: false,
    })
  }
  const { site, command } = found
  const args = resolveArgs(command, input.args ?? {})
  const argv = command.argv(args)
  const timeoutMs = command.loginCmd ? LOGIN_TIMEOUT_MS : HARVEST_TIMEOUT_MS

  const result = await deps.run(argv, {
    timeoutMs,
    ...(input.signal ? { signal: input.signal } : {}),
  })

  const stdout = typeof result?.stdout === 'string' ? result.stdout : ''
  const stderr = typeof result?.stderr === 'string' ? result.stderr : ''
  const code = typeof result?.code === 'number' && Number.isFinite(result.code) ? result.code : 0

  // exit 66 = 合法空态（真的没有结果），不是失败
  if (code === 66) {
    return {
      ok: true, site: site.id, command: command.id,
      items: [], rawCount: 0, warnings: ['平台返回空结果'], fetchedAtMs: input.nowMs,
    }
  }

  if (code !== 0) throw classifyFailure({ code, stdout, stderr }, { siteLabel: site.name })

  const envelope = parseEnvelope(stdout)
  if (envelope.kind === 'error') {
    throw classifyFailure({ code, stdout, stderr, message: envelope.message }, { siteLabel: site.name })
  }
  if (envelope.kind === 'invalid') {
    throw new HarvestError(ERROR_CODES.BAD_PAYLOAD, `OpenCLI 返回的载荷无法解析：${envelope.reason}`, {
      hint: '先用命令行手动复现确认输出形态；若 OpenCLI 升级改变了结构，需更新信封解析',
      retryable: false,
      cause: stdout.slice(0, 200),
    })
  }

  const warnings = []
  const rawCount = envelope.items.length
  let items = envelope.items
  if (rawCount > args.limit) {
    items = items.slice(0, args.limit)
    warnings.push(`数据源返回 ${rawCount} 条，已按数量上限 ${args.limit} 截断`)
  }

  return {
    ok: true, site: site.id, command: command.id,
    items, rawCount, warnings, fetchedAtMs: input.nowMs,
  }
}

/**
 * 登录命令专用执行：打开登录页并等待人工完成。
 * @param {{ siteId: string, nowMs: number }} input
 * @param {{ run: RunFn }} deps
 */
export async function executeSiteLogin(input, deps) {
  return executeHarvest({ siteId: input.siteId, commandId: 'login', nowMs: input.nowMs }, deps)
}

/**
 * whoami 自检：返回是否已登录（不抛 AUTH，吞掉登录失败转为 loggedIn: false）。
 * @param {{ siteId: string, nowMs: number }} input
 * @param {{ run: RunFn }} deps
 * @returns {Promise<{ site: string, loggedIn: boolean, account?: unknown }>}
 */
export async function checkSiteLogin(input, deps) {
  const site = getCommand(input.siteId, 'whoami')?.site
  if (!site) {
    return { site: input.siteId, loggedIn: false }
  }
  try {
    const result = await executeHarvest(
      { siteId: input.siteId, commandId: 'whoami', nowMs: input.nowMs },
      deps,
    )
    return { site: site.id, loggedIn: true, account: result.items[0] ?? null }
  } catch (err) {
    if (err instanceof HarvestError && err.code === ERROR_CODES.AUTH) {
      return { site: site.id, loggedIn: false }
    }
    // 桥接断开等环境故障不吞——由调用方按环境故障展示
    throw err
  }
}
