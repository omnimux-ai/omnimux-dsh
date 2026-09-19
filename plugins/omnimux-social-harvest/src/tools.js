/**
 * @file Agent 工具注册 —— 6 个只读采集工具。
 *
 * 门禁链（每个采集 execute 依次过闸，顺序不可调换）：
 *   1. 总开关（settings 卡片显式开启，默认关）→ HARVEST_DISABLED
 *   2. 环境（OpenCLI 已装且桥接就绪）→ HARVEST_NOT_INSTALLED / HARVEST_UNAVAILABLE
 *   3. 命令白名单与参数校验 → ARG_INVALID
 *   4. 执行与信封归一（exit 66 = 合法空态）
 */

import { ERROR_CODES, HarvestError } from './core/errors.js'
import { detectEnvironment } from './collect/doctor.js'
import { checkSiteLogin, executeHarvest, executeSiteLogin } from './collect/harvest.js'
import { SITES, getSite } from './collect/registry.js'
import { loadConfig } from './store.js'

const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

function objectParams(fields) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(fields)) {
    const { required: isRequired, ...rest } = spec
    properties[key] = rest
    if (isRequired) required.push(key)
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

const LIMIT_FIELD = { type: 'number', description: '返回条数上限（1-50，默认 15）' }

/**
 * 过门禁：开关 + 环境。返回 null 表示放行。
 * @param {{ run: import('./collect/harvest.js').RunFn, nowMs: number }} deps
 * @returns {Promise<HarvestError | null>}
 */
export async function checkGates(deps) {
  const config = await loadConfig()
  if (!config.enabled) {
    return new HarvestError(ERROR_CODES.DISABLED, '社媒采集未开启（enable is required）', {
      hint: '前往 设置 → 插件 → 社媒采集，打开总开关后重试',
      retryable: false,
    })
  }
  const env = await detectEnvironment({ nowMs: deps.nowMs }, { run: deps.run })
  if (!env.installed) {
    return new HarvestError(ERROR_CODES.NOT_INSTALLED, '未检测到 OpenCLI 采集环境（OpenCLI is required）', {
      hint: '请先安装 OpenCLI：桌面版 OpenCLIApp（opencli.info/download）或 npm i -g @jackwener/opencli，并安装浏览器扩展后重试',
      retryable: false,
    })
  }
  if (!env.bridgeOk) {
    return new HarvestError(ERROR_CODES.UNAVAILABLE, 'OpenCLI 浏览器桥接未就绪（bridge offline）', {
      hint: '执行 opencli doctor 检查；确认 Chrome 已打开且 OpenCLI 扩展已连接',
      retryable: true,
    })
  }
  return null
}

/**
 * 采集类 execute 包装：过门禁 → 执行 → 错误收敛。
 * @param {string} siteId @param {string} commandId
 * @param {Record<string, unknown>} args
 * @param {{ run: import('./collect/harvest.js').RunFn }} deps
 */
export async function gatedHarvest(siteId, commandId, args, deps) {
  const gate = await checkGates(deps)
  if (gate) throw gate
  return executeHarvest(
    { siteId, commandId, args, nowMs: Date.now() },
    deps,
  )
}

/** 全部工具名（门禁与测试共用真源）。 */
export const HARVEST_TOOL_NAMES = Object.freeze([
  'harvest_tiktok_search',
  'harvest_tiktok_user',
  'harvest_pinterest_pins',
  'harvest_pinterest_download',
  'harvest_sites_status',
  'harvest_site_login',
])

const SITE_ENUM = SITES.filter((s) => s.login).map((s) => s.id)

/**
 * 注册 6 个 Agent 工具。
 * @param {{ tools: { register: (tool: object) => unknown } }} ctx
 * @param {{ run: import('./collect/harvest.js').RunFn }} deps
 */
export function registerHarvestTools(ctx, deps) {
  ctx.tools.register({
    name: 'harvest_tiktok_search',
    description: '按关键词搜索 TikTok 视频（爆款发现主入口），返回标题/作者/播放/点赞/评论等结构化数据。需要 TikTok 浏览器登录态。',
    parameters: objectParams({
      query: { type: 'string', description: '搜索关键词', required: true },
      limit: LIMIT_FIELD,
    }),
    output: jsonOut,
    execute: (args) => gatedHarvest('tiktok', 'search', args, deps),
  })

  ctx.tools.register({
    name: 'harvest_tiktok_user',
    description: '获取 TikTok 创作者近期视频列表（解构对标账号用）。需要 TikTok 浏览器登录态。',
    parameters: objectParams({
      target: { type: 'string', description: '创作者用户名或主页链接', required: true },
      limit: LIMIT_FIELD,
    }),
    output: jsonOut,
    execute: (args) => gatedHarvest('tiktok', 'user', args, deps),
  })

  ctx.tools.register({
    name: 'harvest_pinterest_pins',
    description: '搜索 Pinterest 图钉（视觉灵感采集，免登录可用），返回图钉标题/图片直链/来源。',
    parameters: objectParams({
      query: { type: 'string', description: '搜索关键词', required: true },
      limit: LIMIT_FIELD,
    }),
    output: jsonOut,
    execute: (args) => gatedHarvest('pinterest', 'search-pins', args, deps),
  })

  ctx.tools.register({
    name: 'harvest_pinterest_download',
    description: '下载 Pinterest 图钉原图到本地插件暂存目录，返回落盘路径。',
    parameters: objectParams({
      url: { type: 'string', description: '图钉链接', required: true },
    }),
    output: jsonOut,
    execute: (args) => gatedHarvest('pinterest', 'download', args, deps),
  })

  ctx.tools.register({
    name: 'harvest_sites_status',
    description: '查询各社媒平台的浏览器登录态（已连接/未登录），用于采集前自检。',
    parameters: objectParams({}),
    output: jsonOut,
    async execute() {
      const gate = await checkGates(deps)
      if (gate) throw gate
      const nowMs = Date.now()
      const sites = []
      for (const site of SITES) {
        if (!site.login) {
          sites.push({ id: site.id, name: site.name, free: true, loggedIn: true })
          continue
        }
        try {
          const status = await checkSiteLogin({ siteId: site.id, nowMs }, deps)
          sites.push({ id: site.id, name: site.name, free: false, loggedIn: status.loggedIn })
        } catch {
          sites.push({ id: site.id, name: site.name, free: false, loggedIn: false, envError: true })
        }
      }
      return { ok: true, sites, checkedAtMs: nowMs }
    },
  })

  ctx.tools.register({
    name: 'harvest_site_login',
    description: '打开指定社媒平台的浏览器登录页，等待人工完成登录（产品不接触账号密码）。',
    parameters: objectParams({
      site: { type: 'string', description: `平台标识：${SITE_ENUM.join(' | ')}`, required: true, enum: SITE_ENUM },
    }),
    output: jsonOut,
    async execute(args) {
      const gate = await checkGates(deps)
      if (gate) throw gate
      const site = getSite(args?.site)
      if (!site || !site.login) {
        throw new HarvestError(ERROR_CODES.ARG_INVALID, `不支持登录的平台：${args?.site}`, {
          hint: `可选：${SITE_ENUM.join('、')}（Pinterest 免登录无需连接）`,
          retryable: false,
        })
      }
      await executeSiteLogin({ siteId: site.id, nowMs: Date.now() }, deps)
      return { ok: true, site: site.id }
    },
  })
}
