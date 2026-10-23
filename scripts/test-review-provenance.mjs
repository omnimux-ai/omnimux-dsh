/**
 * scripts/test-review-provenance.mjs
 *
 * 旧测试标准变更的「独立评审 Agent 来源证明」通道。
 *
 * 背景：RULE-01（PR #3579）只放行 additive 覆盖，改写既有断言一律拒绝；
 * 该 PR 自述"改写既有断言本次保守拒绝，后续可单独设计"。本模块即该后续设计：
 * 允许「非本业务源码作者」的另一个 Agent 会话落笔期待值变更，无需人类介入。
 *
 * 契约与不变量见 specs/test-review-provenance.spec.md。
 * 安全边界：只证明「身份不同 + 内容精确 + 可回放」，不是执行沙箱；
 * 挡不住 agent 直接修改 guard 源码，那条只能靠 PR 评审与 guard 自身测试兜底。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'

/** 业务源码编辑账本（由 hook 写入，记录 hook 观察到的会话身份）。 */
export const LEDGER_REL = '.dsh/agent-edit-ledger.jsonl'
/** 独立评审存证与放行审计。 */
export const ATTEST_REL = '.dsh/test-review-attestations.jsonl'

/** 唯一可被来源证明放行的拒绝原因；其余判定不受影响。 */
export const PROVENANCE_REASONS = new Set(['test-assertion-removed-or-rewritten'])

export function digestText(text) {
  return createHash('sha256').update(String(text)).digest('hex')
}

/** 与 guard-quality-loop 的业务源码判定保持一致（plugins|packages 下的 src）。 */
export function isBusinessSourceRel(relPath) {
  const p = String(relPath || '').replace(/\\/g, '/')
  if (!p || p.startsWith('..')) return false
  if (p.startsWith('plugins/') && (p.includes('/src/') || p.includes('/extension/src/'))) return true
  if (p.startsWith('packages/') && p.includes('/src/')) return true
  return false
}

/** 从任意目标路径回溯到最近的 git 工作树根（工作树里 .git 是文件，同样命中）。 */
export function treeRootOf(target) {
  let current = resolve(target)
  if (!existsSync(current)) current = dirname(current)
  for (let i = 0; i < 40; i++) {
    if (existsSync(resolve(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
  return null
}

function appendJsonl(root, rel, record) {
  const file = resolve(root, rel)
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, JSON.stringify(record) + '\n')
}

/** 读取 jsonl；坏行跳过（账本损坏只会让证明失效，不会误放行）。 */
export function readJsonl(root, rel) {
  let text
  try {
    text = readFileSync(resolve(root, rel), 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed = null
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      parsed = null
    }
    if (parsed && typeof parsed === 'object') out.push(parsed)
  }
  return out
}

/**
 * hook 观察到一次业务源码写入 → 记账。
 * 失败静默返回 false：账本缺失只会导致后续存证无法成立（fail-closed，不会误放行）。
 */
export function recordBusinessEdit({ root, relPath, sessionId, digest = null, at = Date.now() }) {
  if (!root || !sessionId || !isBusinessSourceRel(relPath)) return false
  try {
    appendJsonl(root, LEDGER_REL, {
      kind: 'business-edit',
      at,
      sessionId: String(sessionId),
      path: String(relPath).replace(/\\/g, '/'),
      digest,
    })
    return true
  } catch {
    return false
  }
}

/** 该会话是否写过业务源码（写过的会话不得担任评审者）。 */
export function sessionAuthoredBusinessSource(root, sessionId) {
  if (!sessionId) return true
  return readJsonl(root, LEDGER_REL).some(
    (entry) => entry.kind === 'business-edit' && entry.sessionId === sessionId && isBusinessSourceRel(entry.path),
  )
}

/**
 * 独立评审会话登记一次存证：精确描述 (file, before, after) 三元组。
 * 身份只来自调用方传入的 sessionId —— CLI 只从 process.env.DSH_SESSION_ID 取值，不接受覆盖。
 * 写入失败向上抛出，由调用方（CLI）显式上报，不在这里伪造成功。
 */
export function writeAttestation({
  root, reviewerSessionId, relFile, beforeText, afterText,
  specPath = null, specText = null, evidencePath = null, evidenceText = null, at = Date.now(),
}) {
  if (!root) throw new Error('missing-repository-root')
  if (!reviewerSessionId) throw new Error('missing-session-identity')
  const file = String(relFile || '').replace(/\\/g, '/')
  if (!file || file.startsWith('..')) throw new Error('invalid-file-path')
  if (typeof beforeText !== 'string' || typeof afterText !== 'string') throw new Error('invalid-content')

  const record = {
    kind: 'attestation',
    id: digestText(`${file}\u0000${digestText(beforeText)}\u0000${digestText(afterText)}\u0000${reviewerSessionId}`),
    at,
    reviewerSessionId: String(reviewerSessionId),
    file,
    beforeDigest: digestText(beforeText),
    afterDigest: digestText(afterText),
    specPath,
    specDigest: typeof specText === 'string' ? digestText(specText) : null,
    evidencePath,
    evidenceDigest: typeof evidenceText === 'string' ? digestText(evidenceText) : null,
  }
  appendJsonl(root, ATTEST_REL, record)
  return { ok: true, record }
}

/**
 * 放行判定：存在精确匹配的存证，且该存证只能被其作者会话使用，且作者会话不是业务源码作者。
 * @returns {{ok: boolean, reason?: string, attestationId?: string}}
 */
export function verifyAttestation({ root, relFile, beforeText, afterText, sessionId }) {
  if (!root) return { ok: false, reason: 'no-repository-root' }
  if (!sessionId) return { ok: false, reason: 'no-session-identity' }
  if (typeof beforeText !== 'string' || typeof afterText !== 'string') return { ok: false, reason: 'invalid-content' }

  const file = String(relFile || '').replace(/\\/g, '/')
  const beforeDigest = digestText(beforeText)
  const afterDigest = digestText(afterText)

  const hit = readJsonl(root, ATTEST_REL).find(
    (entry) => entry.kind === 'attestation'
      && entry.file === file
      && entry.beforeDigest === beforeDigest
      && entry.afterDigest === afterDigest
      && entry.reviewerSessionId === String(sessionId),
  )
  if (!hit) return { ok: false, reason: 'no-matching-attestation' }
  if (sessionAuthoredBusinessSource(root, sessionId)) {
    return { ok: false, reason: 'reviewer-authored-business-source' }
  }
  return { ok: true, attestationId: hit.id }
}

/** 每次放行留痕，使"谁用哪份存证放行了哪次标准变更"可回放。 */
export function recordAttestationUse({ root, relFile, beforeText, afterText, sessionId, attestationId, at = Date.now() }) {
  try {
    appendJsonl(root, ATTEST_REL, {
      kind: 'used',
      at,
      sessionId: String(sessionId || ''),
      file: String(relFile || '').replace(/\\/g, '/'),
      beforeDigest: digestText(beforeText),
      afterDigest: digestText(afterText),
      attestationId: attestationId || null,
    })
    return true
  } catch {
    return false
  }
}
