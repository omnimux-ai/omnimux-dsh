#!/usr/bin/env node
/**
 * scripts/verify-modality-matrix.mjs
 *
 * 「路由声明 ↔ 模型契约」模态（素材类型）双向对账门禁 — Issue #3236。
 *
 * 两份互相独立的模态真源，任一侧自证都不算数（`catalog/project.js` 的
 * `CHAT_MODELS[].input` 是契约的派生投影，契约改坏时它会跟着一起变，抓不到故障）：
 *
 *   A. 路由声明 plugins/omnimux/cordis.patch.yml → llm-pi-ai 行 models[].input[]
 *      —— DSH pi-ai 适配器真正 gate 媒体块的声明；缺 `input` 键等价于 ['text']
 *      （claude-opus-5 / deepseek-v4-pro / glm-5.3 是有意保持纯文本，不是漏写）。
 *   B. 模型契约 plugins/omnimux/src/catalog/specs/*.yaml 每个 operation 的
 *      inputs[].type —— 经 contract/load.js 的 loadAll() 读取，枚举见 MEDIA_TYPES。
 *
 * 对每个两侧都出现的模型 id，令 A=路由模态集、B=契约模态集，逐模态三态对账：
 *   over-declared  m ∈ A \ B：路由声明了契约没有的模态 → pi-ai 放行、上游中途拒绝
 *   under-declared m ∈ B \ A：契约声明了路由没有的模态 → 中枢门禁放行、上游中途拒绝
 *                              （本 Issue 的真实故障：gemini-3.x-flash 契约带 video，
 *                                路由只声明 [text, image]，运行期才由 text/catalog.js:112
 *                                抛 `does not accept video input`）
 *
 * 只出现在一侧的模型 id 归入 unpaired 报告（不算失败，避免新模型未同步时误红）。
 *
 * 已知缺口（当前主干真实存在、尚未修复）以 KNOWN_GAPS 显式基线清单呈现，带 Issue 引用；
 * 其余任何缺口一律失败。基线条目一旦不再复现同样失败——否则基线会腐化，把「缺口被重新
 * 引入」静音。放宽断言不在本门禁的可选项里。
 *
 * 用法：
 *   node scripts/verify-modality-matrix.mjs                # 应用基线，CI 形态
 *   node scripts/verify-modality-matrix.mjs --no-baseline  # 不应用基线，列出全部缺口
 *
 * 全离线：不发起任何网络请求（docs/contracts/model-api-authority.md）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'yaml'
import { loadAll } from '../plugins/omnimux/src/catalog/contract/load.js'
import { MEDIA_TYPES } from '../plugins/omnimux/src/catalog/contract/schemas/commonSchema.js'

const here = dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = join(here, '..')
export const CORDIS_PATH = join(REPO_ROOT, 'plugins/omnimux/cordis.patch.yml')
export const SPECS_DIR = join(REPO_ROOT, 'plugins/omnimux/src/catalog/specs')

/** 模态枚举（真源 contract/schemas/commonSchema.js 的 MEDIA_TYPES，保持插入顺序）。 */
export const MODALITY_ORDER = Object.freeze([...MEDIA_TYPES])

/** 路由行缺 `input` 键时的等价声明。 */
export const DEFAULT_ROUTE_INPUT = Object.freeze(['text'])

/**
 * 已确认的缺口基线（Issue #3236 记录，由后续修复任务收敛）。
 *
 * 每条都是「当前主干真实存在、尚未修复」的两侧分歧；新增缺口不在此清单内即失败。
 * 修复这些缺口时，必须在同一个改动里删除对应条目——残留的条目会让门禁转红。
 * `document` 之所以也在基线里：pi-ai 的 input 枚举本身不含 document，路由侧无法声明它，
 * 收敛方向更可能是收紧契约槽位而不是放宽路由声明；在收敛前它仍是真实的声明分歧。
 */
export const KNOWN_GAPS = Object.freeze([
  {
    id: 'gemini-3.8-flash',
    modality: 'video',
    direction: 'under',
    issue: '#3236',
    reason: '契约 text-models.yaml 有 video 槽（research.status=draft），路由只声明 [text, image]',
  },
  {
    id: 'gemini-3.8-flash',
    modality: 'audio',
    direction: 'under',
    issue: '#3236',
    reason: '契约 text-models.yaml 有 audio 槽，路由只声明 [text, image]',
  },
  {
    id: 'gemini-3.8-flash',
    modality: 'document',
    direction: 'under',
    issue: '#3236',
    reason: '契约 text-models.yaml 有 document 槽；pi-ai 的 input 枚举不含 document，路由侧无法声明',
  },
  {
    id: 'gemini-3.7-flash',
    modality: 'video',
    direction: 'under',
    issue: '#3236',
    reason: '契约 text-models.yaml 有 video 槽（limitSource.kind=policy_conservative），路由只声明 [text, image]',
  },
])

/**
 * 解析路由声明：cordis.patch.yml 的 llm-pi-ai 行 models[]。
 * 结构变化一律 fail loud——静默返回空矩阵就是恒真门禁。
 * @param {string} cordisText
 * @returns {Array<{ id: string; input: string[]; declaredInput: boolean }>}
 */
export function parseRouteModalities(cordisText) {
  let doc
  try {
    doc = yaml.parse(cordisText)
  } catch (error) {
    throw new Error(`cordis.patch.yml is not valid YAML: ${error.message}`)
  }
  if (!Array.isArray(doc)) {
    throw new Error('cordis.patch.yml is no longer a top-level YAML sequence — the patch structure changed')
  }
  const row = doc.find((entry) => entry && entry.id === 'llm-pi-ai')
  if (!row) {
    throw new Error('cordis.patch.yml has no `- id: llm-pi-ai` row — the plugin model list is gone')
  }
  const models = row?.config?.providers?.omnimux?.models
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('cordis.patch.yml llm-pi-ai row declares no config.providers.omnimux.models — refusing to report an empty matrix')
  }
  return models.map((model) => {
    const id = model?.id
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('cordis.patch.yml has a model row without an `id`')
    }
    const declaredInput = model.input != null
    if (declaredInput && !Array.isArray(model.input)) {
      throw new Error(`model '${id}' declares a non-array \`input\` value`)
    }
    const input = declaredInput ? model.input.map((value) => String(value)) : [...DEFAULT_ROUTE_INPUT]
    return { id, input, declaredInput }
  })
}

/**
 * 从契约索引汇总每个模型的输入模态集合（model.operations[].inputs[].type）。
 * 不经 project.js 的 mergeInputCapability / projectChatRows——那是投影，是自证面。
 * @param {{ all: () => Array<object> }} index
 * @returns {Map<string, { modalities: Set<string>; managementGroup: string | null }>}
 */
export function collectContractModalities(index) {
  const byId = new Map()
  for (const model of index.all()) {
    const modalities = new Set()
    for (const operation of model.operations ?? []) {
      for (const slot of operation.inputs ?? []) {
        if (typeof slot?.type === 'string' && slot.type.length > 0) modalities.add(slot.type)
      }
    }
    byId.set(model.id, { modalities, managementGroup: model.managementGroup ?? null })
  }
  return byId
}

/**
 * 双向对账。两侧都出现的模型逐模态比 A/B；只在一侧的 id 归入 unpaired。
 * @param {{ routeModels: Array<{ id: string; input: string[]; declaredInput: boolean }>;
 *           contractModalities: Map<string, { modalities: Set<string>; managementGroup: string | null }> }} input
 */
export function reconcile({ routeModels, contractModalities }) {
  const known = new Set(MODALITY_ORDER)
  const pairs = []
  const mismatches = []
  const routeOnly = []
  const unknownModalities = []

  for (const model of routeModels) {
    const contract = contractModalities.get(model.id)
    if (!contract) {
      routeOnly.push(model.id)
      continue
    }
    const routeSet = new Set(model.input)
    const contractSet = new Set(contract.modalities)
    for (const modality of routeSet) {
      if (!known.has(modality)) unknownModalities.push({ id: model.id, side: 'route', modality })
    }
    for (const modality of contractSet) {
      if (!known.has(modality)) unknownModalities.push({ id: model.id, side: 'contract', modality })
    }
    const route = MODALITY_ORDER.filter((modality) => routeSet.has(modality))
    const declared = MODALITY_ORDER.filter((modality) => contractSet.has(modality))
    for (const modality of MODALITY_ORDER) {
      const inRoute = routeSet.has(modality)
      const inContract = contractSet.has(modality)
      if (inRoute === inContract) continue
      mismatches.push({
        id: model.id,
        modality,
        direction: inRoute ? 'over' : 'under',
        route,
        contract: declared,
      })
    }
    pairs.push({ id: model.id, route, contract: declared, declaredInput: model.declaredInput })
  }

  const pairedIds = new Set(pairs.map((pair) => pair.id))
  const contractOnly = [...contractModalities.entries()]
    .filter(([id, row]) => !pairedIds.has(id) && row.managementGroup === 'text')
    .map(([id]) => id)
    .sort()

  return {
    pairs,
    mismatches,
    unpaired: { routeOnly: routeOnly.sort(), contractOnly },
    unknownModalities,
  }
}

/** 缺口记录 → 基线键。 */
function gapKey(entry) {
  return `${entry.id}::${entry.modality}::${entry.direction}`
}

/**
 * 基线比对：命中的缺口放行，其余任何缺口即 unexpected；不再复现的基线条目即 stale。
 * @param {Array<object>} mismatches
 * @param {ReadonlyArray<object>} baseline
 */
export function applyBaseline(mismatches, baseline = KNOWN_GAPS) {
  const allowed = new Map(baseline.map((entry) => [gapKey(entry), entry]))
  const seen = new Set()
  const unexpected = []
  for (const mismatch of mismatches) {
    const key = gapKey(mismatch)
    if (allowed.has(key)) {
      seen.add(key)
      continue
    }
    unexpected.push(mismatch)
  }
  const stale = baseline.filter((entry) => !seen.has(gapKey(entry)))
  return { unexpected, stale }
}

/**
 * 门禁主判定。
 * @param {{ cordisText: string;
 *           contractModalities: Map<string, { modalities: Set<string>; managementGroup: string | null }>;
 *           baseline?: ReadonlyArray<object>;
 *           useBaseline?: boolean }} input
 */
export function verifyModalityMatrix({ cordisText, contractModalities, baseline = KNOWN_GAPS, useBaseline = true }) {
  const routeModels = parseRouteModalities(cordisText)
  const reconciled = reconcile({ routeModels, contractModalities })
  const { unexpected, stale } = useBaseline
    ? applyBaseline(reconciled.mismatches, baseline)
    : { unexpected: reconciled.mismatches, stale: [] }

  const structural = []
  if (reconciled.pairs.length === 0) {
    structural.push('no model id appears on both the route list and the contract index — the matrix compared nothing')
  }
  if (contractModalities.size === 0) {
    structural.push('the contract index exposed no models — refusing to report a vacuous pass')
  }

  const routeDefaulted = routeModels.filter((model) => !model.declaredInput).map((model) => model.id).sort()

  return {
    ok: unexpected.length === 0 && stale.length === 0 && reconciled.unknownModalities.length === 0 && structural.length === 0,
    routeModels,
    routeDefaulted,
    contractModelCount: contractModalities.size,
    ...reconciled,
    unexpected,
    stale,
    structural,
    baselineApplied: useBaseline,
  }
}

/* ------------------------------------------------------------------ CLI */

function formatGap(entry) {
  return `  - ${entry.id}  ${entry.direction}-declared  ${entry.modality}  route=[${entry.route.join(',')}] contract=[${entry.contract.join(',')}]`
}

function printReport(report, baseline) {
  const lines = []
  lines.push('verify-modality-matrix: 路由声明 ↔ 模型契约 模态双向对账（Issue #3236）')
  lines.push(`  route     : plugins/omnimux/cordis.patch.yml llm-pi-ai models=${report.routeModels.length}（缺 input 键按 ['text'] 处理: ${report.routeDefaulted.length} → ${report.routeDefaulted.join(', ') || 'none'}）`)
  lines.push(`  contract  : plugins/omnimux/src/catalog/specs/*.yaml models=${report.contractModelCount}`)
  lines.push(`  modalities: ${MODALITY_ORDER.join(',')}`)
  lines.push(`  paired=${report.pairs.length}  unpaired route-only=${report.unpaired.routeOnly.length} contract-only=${report.unpaired.contractOnly.length}`)
  if (report.unpaired.routeOnly.length > 0) lines.push(`    unpaired route-only   : ${report.unpaired.routeOnly.join(', ')}`)
  if (report.unpaired.contractOnly.length > 0) lines.push(`    unpaired contract-only: ${report.unpaired.contractOnly.join(', ')}`)
  if (report.unknownModalities.length > 0) {
    lines.push('  枚举外模态（必须修）:')
    for (const entry of report.unknownModalities) lines.push(`  - ${entry.id}  ${entry.side}  ${entry.modality}`)
  }
  if (report.structural.length > 0) {
    lines.push('  结构性失败（门禁未能真正比对）:')
    for (const entry of report.structural) lines.push(`  - ${entry}`)
  }
  if (baseline.length > 0 && report.baselineApplied) {
    lines.push(`  已知缺口（基线清单，不阻断 CI；Issue ${[...new Set(baseline.map((entry) => entry.issue))].join(', ')}）:`)
    const keys = new Set(report.mismatches.map(gapKey))
    for (const entry of baseline) {
      const marker = keys.has(gapKey(entry)) ? ' ' : '!'
      lines.push(`${marker} - ${entry.id}  ${entry.direction}-declared  ${entry.modality}  ${entry.issue}  ${entry.reason}`)
    }
    lines.push('  （前缀 ! 表示该基线条目当前不再复现 = 基线腐化，必须删除该条目）')
  }
  lines.push('  全部门禁缺口（基线前，逐格差异）:')
  if (report.mismatches.length === 0) {
    lines.push('  - none')
  } else {
    for (const entry of report.mismatches) lines.push(formatGap(entry))
  }
  lines.push('  基线外新缺口（阻断）:')
  if (report.unexpected.length === 0) {
    lines.push('  - none')
  } else {
    for (const entry of report.unexpected) lines.push(formatGap(entry))
  }
  lines.push('  失效基线条目（阻断）:')
  if (report.stale.length === 0) {
    lines.push('  - none')
  } else {
    for (const entry of report.stale) lines.push(`  - ${entry.id}  ${entry.direction}-declared  ${entry.modality}  ${entry.issue}`)
  }
  lines.push(`ok=${report.ok}`)
  return lines.join('\n')
}

function main() {
  const args = new Set(process.argv.slice(2))
  const useBaseline = !args.has('--no-baseline')
  const report = verifyModalityMatrix({
    cordisText: readFileSync(CORDIS_PATH, 'utf8'),
    contractModalities: collectContractModalities(loadAll()),
    baseline: KNOWN_GAPS,
    useBaseline,
  })

  process.stdout.write(`${printReport(report, KNOWN_GAPS)}\n`)
  process.stdout.write(`${JSON.stringify({
    event: 'modality-matrix',
    ok: report.ok,
    route: 'plugins/omnimux/cordis.patch.yml',
    contract: 'plugins/omnimux/src/catalog/specs/*.yaml',
    modalities: MODALITY_ORDER,
    routeModels: report.routeModels.length,
    routeDefaulted: report.routeDefaulted,
    paired: report.pairs.length,
    unpaired: report.unpaired,
    knownGaps: report.mismatches.map((entry) => ({
      id: entry.id,
      modality: entry.modality,
      direction: entry.direction,
      issue: KNOWN_GAPS.find((base) => gapKey(base) === gapKey(entry))?.issue ?? null,
    })),
    unexpectedGaps: report.unexpected.map((entry) => `${entry.id} × ${entry.modality}`),
    staleBaseline: report.stale.map((entry) => `${entry.id} × ${entry.modality}`),
    unknownModalities: report.unknownModalities,
    structural: report.structural,
    baselineApplied: report.baselineApplied,
    checkedAt: new Date().toISOString(),
  })}\n`)

  if (!report.ok) {
    process.stderr.write(`verify-modality-matrix: FAIL unexpected gaps=[${report.unexpected.map((entry) => `${entry.id}×${entry.modality}`).join(', ')}] stale baseline=[${report.stale.map((entry) => `${entry.id}×${entry.modality}`).join(', ')}] unknown modalities=[${report.unknownModalities.map((entry) => `${entry.id}×${entry.modality}`).join(', ')}] structural=[${report.structural.join('; ')}]\n`)
    process.exit(1)
  }
  process.stderr.write('verify-modality-matrix: ok (all modality gaps are on the Issue #3236 baseline)\n')
}

if (process.argv[1] && process.argv[1].endsWith('verify-modality-matrix.mjs')) {
  main()
}
