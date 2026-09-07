/** Issue metadata and authorization facts: no environment, filesystem or network access. */
export function parseFrontmatter(body = '') {
  const result = {}
  const match = /^\s*---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body)
  if (!match) return result
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (value === 'true') result[key] = true
    else if (value === 'false') result[key] = false
    else if (/^\d+$/.test(value)) result[key] = Number(value)
    else result[key] = value
  }
  return result
}

export function labelNames(issue = {}) {
  return new Set((issue.labels || []).map(label => typeof label === 'string' ? label : label?.name).filter(Boolean))
}

export function normalizeTier(value) {
  const tier = String(value || '').trim().toUpperCase().replace(/^RISK:/, '')
  return /^R[0-3]$/.test(tier) ? tier : ''
}

export function collectAuthorizationFacts(issue = {}, maintainers = new Set()) {
  const labels = labelNames(issue)
  const frontmatter = parseFrontmatter(issue.body || '')
  const tier = normalizeTier(frontmatter['risk-tier'] ?? frontmatter.riskTier)
  const preAuthorized = (frontmatter['pre-authorized'] ?? frontmatter.preAuthorized) === true
  const trusted = new Set([...maintainers].map(login => String(login).toLowerCase()))
  let approval = null
  let revoked = false
  // GitHub supplies comments in timeline order. A later maintainer approval can reauthorize.
  for (const comment of Array.isArray(issue.comments) ? issue.comments : []) {
    const login = comment?.author?.login || ''
    if (!login || !trusted.has(login.toLowerCase())) continue
    const text = String(comment.body || '').trim()
    const match = /^\/auto-approve\s+risk:(R[23])(?:\s|$)/i.exec(text)
    if (match) {
      approval = { tier: match[1].toUpperCase(), login, createdAt: comment.createdAt || null }
      revoked = false
    }
    if (/^\/revoke\b/i.test(text)) revoked = true
  }
  return { labels, tier, preAuthorized, approval, revoked, closed: String(issue.state || '').toUpperCase() === 'CLOSED' }
}

function authorizationReasons(facts) {
  const { labels, tier, preAuthorized, approval, revoked, closed } = facts
  const reasons = []
  if (!['R2', 'R3'].includes(tier)) reasons.push('风险不是 R2/R3，R0/R1 禁止自动合入')
  const riskLabels = [...labels].filter(label => label.startsWith('risk:'))
  if (riskLabels.length !== 1 || riskLabels[0] !== `risk:${tier}`) reasons.push('risk 标签与 frontmatter 不一致')
  if (!preAuthorized) reasons.push('frontmatter pre-authorized 不是 true')
  if (!approval) reasons.push('缺少维护者 /auto-approve 评论')
  if (approval && approval.tier !== tier) reasons.push('授权评论风险等级与 Issue 不一致')
  if (revoked) reasons.push('已被 /revoke 撤销')
  if (closed) reasons.push('Issue 已 closed')
  if (labels.has('status:blocked')) reasons.push('Issue 带有 status:blocked')
  return reasons
}

function result(facts, reasons) {
  const { tier, preAuthorized, approval, revoked } = facts
  return { eligible: reasons.length === 0, tier, preAuthorized, approval, revoked, reasons }
}

export function assessAdmission(issue, maintainers) {
  const facts = collectAuthorizationFacts(issue, maintainers)
  const reasons = authorizationReasons(facts)
  if (!facts.labels.has('status:ready-to-run')) reasons.push('缺少 status:ready-to-run')
  return { ...result(facts, reasons), admitted: reasons.length === 0 }
}

/** Runtime authorization deliberately does not inspect the consumed admission label. */
export function assessRuntimeAuthorization(issue, maintainers, currentRiskTier) {
  const facts = collectAuthorizationFacts(issue, maintainers)
  const reasons = authorizationReasons(facts)
  const currentTier = normalizeTier(currentRiskTier)
  if (!['R2', 'R3'].includes(currentTier)) reasons.push('当前实际风险不是 R2/R3，风险升级或未知，禁止自动合入')
  else if (facts.approval && Number(currentTier.slice(1)) < Number(facts.approval.tier.slice(1))) {
    reasons.push(`当前风险升级至 ${currentTier}，高于授权风险 ${facts.approval.tier}`)
  }
  return { ...result(facts, reasons), valid: reasons.length === 0, currentTier }
}

export const assessAuthorization = assessAdmission
