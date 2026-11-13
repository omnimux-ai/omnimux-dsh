/**
 * Operation 展示名的唯一合法来源（Issue #4103）。
 *
 * 目录里的 operation 文案只允许来自两处，按优先级：
 * 1. 型号 YAML 里已审校的具体 label（`declaredLabel`）；
 * 2. `operation-registry.json` 的中文名。
 *
 * 都没有 → `undefined`：契约层绝不拿 operation id 冒充 label。展示层
 * （`plugins/omnimux-workflow/src/shared/validation/operationLabels.ts`）再按
 * 「目录 → id」兜底，于是英文 id 不会流到用户界面。
 */

import { loadOperationRegistry } from './schemas/commonSchema.js'

/** @type {Map<string, string>|undefined} */
let cachedLabels

/**
 * 载入（并缓存）registry 的 id → 中文名映射。目录不可读时返回空表：宁可无 label，
 * 也不伪造一个（fixture checkout 里没有 contract 目录是合法场景）。
 * @returns {Map<string, string>}
 */
function labelMapFor(loader) {
  if (cachedLabels) return cachedLabels
  // Issue #4113（F3）：读取失败时**不缓存空表**——否则同进程内即使 registry 之后恢复，
  // 也永远解析不出 label。失败即返回空表，下一次调用重试。
  const labels = new Map()
  try {
    const registry = loader()
    for (const op of Array.isArray(registry?.operations) ? registry.operations : []) {
      if (typeof op?.id === 'string' && typeof op?.label === 'string' && op.label.trim()) {
        labels.set(op.id, op.label.trim())
      }
    }
  } catch {
    // No readable registry → every operation stays unnamed rather than faked; retry next call.
    return labels
  }
  cachedLabels = labels
  return cachedLabels
}

/**
 * 已审校的 operation 中文名。
 * @param {string} id operation id
 * @param {object} [registry] 已加载的 registry 文档（调用方已有就传，省一次读盘）
 * @param {() => object} [loader] 读盘函数（测试注入用；默认 loadOperationRegistry）
 * @returns {string|undefined}
 */
export function approvedOperationLabel(id, registry, loader = loadOperationRegistry) {
  if (typeof id !== 'string' || !id) return undefined
  if (registry && Array.isArray(registry.operations)) {
    const entry = registry.operations.find((candidate) => candidate && candidate.id === id)
    return typeof entry?.label === 'string' && entry.label.trim() ? entry.label.trim() : undefined
  }
  return labelMapFor(loader).get(id)
}
