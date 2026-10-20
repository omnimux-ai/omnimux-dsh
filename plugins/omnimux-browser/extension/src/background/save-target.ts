/**
 * 保存目标分流：把 host 的 URL 分类结果映射成扩展侧唯一的路由决策。
 *
 * host 是分类的唯一真源（`POST …/rival-accounts/classify`）；扩展只做纯映射，
 * 所以面板按钮文案、后台保存路径和单测共用同一条规则：
 * `kind === 'account'` → 账号监控，其余（content / unknown / 分类失败）→ 灵感库。
 *
 * 分类失败不得阻断保存：调用方拿到 `null` 时必须回退灵感库，绝不假成功。
 *
 * @module
 */

/** 保存动作最终写入的位置。 */
export type SaveTarget = 'account' | 'inspiration'

/** host 对 URL 的三种分类。 */
export type SaveTargetKind = 'account' | 'content' | 'unknown'

/** host classify 接口里有意义的那部分字段。 */
export interface SaveTargetClassification {
  kind: SaveTargetKind
  /** host 的平台标识；host 未给出时回落为 `unknown`。 */
  platform: string
  /** 账号主页的 handle（host 以 `@handle` 形式返回）。 */
  handle?: string
}

/** 账号导入响应里调用方需要的两个事实。 */
export interface AccountImportOutcome {
  /** 该账号此前已在账号监控中（host 返回 `existing` 或 `is_duplicate`）。 */
  existing: boolean
  /** 账号 handle，供 toast 说明写到哪个账号。 */
  handle?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 单个 kind 的路由判断。
 *
 * 只认 `account` 这一种账号主页；content、unknown 以及任何未知取值都按灵感库处理，
 * 这样新增平台或 host 协议漂移都不会把作品误存进账号监控。
 */
export function saveTargetFromKind(kind: unknown): SaveTarget {
  return kind === 'account' ? 'account' : 'inspiration'
}

/**
 * 分类结果的路由判断。
 *
 * `null` / `undefined` 代表「host 不可达或分类接口失败」，与 content/unknown 同等
 * 回退灵感库（spec J4/J6）。
 */
export function saveTargetFromClassification(
  classification: SaveTargetClassification | null | undefined,
): SaveTarget {
  if (classification === null || classification === undefined) return 'inspiration'
  return saveTargetFromKind(classification.kind)
}

/**
 * 读取 host classify 的响应体。
 *
 * host 把结果包在 `{ data: … }` 里；这里也接受裸对象，便于调用方直接喂已解包的 body。
 * 结构不合法（缺 kind、kind 不在契约内）时返回 `null`，调用方据此按分类失败处理。
 */
export function readSaveTargetClassification(body: unknown): SaveTargetClassification | null {
  if (!isRecord(body)) return null
  const data = isRecord(body.data) ? body.data : body
  const kind = data.kind
  if (kind !== 'account' && kind !== 'content' && kind !== 'unknown') return null
  const platform = typeof data.platform === 'string' && data.platform.trim() !== ''
    ? data.platform.trim()
    : 'unknown'
  const handle = typeof data.handle === 'string' ? data.handle.trim() : ''
  return { kind, platform, ...(handle === '' ? {} : { handle }) }
}

/**
 * 读取账号导入的响应体。
 *
 * 账号行本身在 `data` 下，去重标记在顶层（`existing` / `is_duplicate`），两处都要看。
 * 响应体不可解析时仍视为导入成功（HTTP 2xx 才是成功证据），只是没有 handle 可展示。
 */
export function readAccountImportOutcome(body: unknown): AccountImportOutcome {
  if (!isRecord(body)) return { existing: false }
  const data = isRecord(body.data) ? body.data : {}
  const existing = body.existing === true || body.is_duplicate === true
  const handle = typeof data.handle === 'string' && data.handle.trim() !== ''
    ? data.handle.trim()
    : (typeof data.external_id === 'string' ? data.external_id.trim() : '')
  return { existing, ...(handle === '' ? {} : { handle }) }
}
