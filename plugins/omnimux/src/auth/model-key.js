import { createHash } from 'node:crypto'
import { OmnimuxError } from '../media/errors.js'
import { createOfficialClient } from '../official/client.js'

const text = (value) => typeof value === 'string' ? value.trim() : ''
const idValue = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null
const fail = (code, message, status = 503) => { throw new OmnimuxError(code, message, { status }) }

/** Private reference: the site and account own the selected execution key. */
export function accountModelKeyRef(origin, userId) {
  const binding = JSON.stringify([new URL(origin).origin, String(userId)])
  return `OMNIMUX_ACCOUNT_MODEL_KEY_${createHash('sha256').update(binding).digest('hex').toUpperCase()}`
}

/** Secrets and untrusted upstream fields never leave this service. */
function publicName(value, token) {
  return text(value).split(token).join('[已隐藏]')
    .replace(/sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{40,}/g, '[已隐藏]').slice(0, 160)
}

function publicItem(row, token) {
  const id = idValue(row?.id)
  if (!id) fail('official-key-invalid-response', '账号密钥列表格式无效', 502)
  return {
    id, name: publicName(row.name, token),
    expired_time: Number.isFinite(row.expired_time) ? row.expired_time : 0,
    remain_quota: Number.isFinite(row.remain_quota) ? row.remain_quota : 0,
    unlimited_quota: row.unlimited_quota === true,
    status: Number.isSafeInteger(row.status) ? row.status : 0,
  }
}

function parseStored(value) {
  if (!text(value)) return null
  let parsed
  try { parsed = JSON.parse(value) } catch { fail('official-credential-invalid', '已保存的分析凭据无效，请在个人资料中重新启用') }
  if (parsed?.version !== 1 || !idValue(parsed.id) || !/^sk-[A-Za-z0-9]{48}$/.test(parsed.key)) {
    fail('official-credential-invalid', '已保存的分析凭据无效，请在个人资料中重新启用')
  }
  return { id: parsed.id, key: parsed.key }
}

/**
 * Explicitly selects an existing account key. Never creates or changes a cloud key.
 * The account token is used only by the site client, never by a model request.
 */
export function createAccountModelKeyService(deps) {
  const origin = new URL(deps.siteBaseUrl).origin
  const credentials = () => deps.getCredentials?.() ?? deps.credentials
  let tail = Promise.resolve()
  const exclusive = (run) => {
    const pending = tail.then(run)
    tail = pending.then(() => undefined, () => undefined)
    return pending
  }

  async function current(verify = false) {
    let token, status
    try {
      token = text(await deps.store.resolve())
      if (verify && typeof deps.identity.load === 'function') {
        const loaded = await deps.identity.load({ verify: true })
        if (loaded.kind === 'self_failed') fail('official-identity-unavailable', '账号身份验证未完成，请检查网络后重试', 502)
        status = loaded.body
      } else {
        status = await deps.identity.status({ verify })
      }
      if (token !== text(await deps.store.resolve())) fail('official-account-changed', '登录账号已变化，请重新读取账号密钥', 409)
    } catch (error) {
      if (error instanceof OmnimuxError) throw error
      fail('official-credential-unavailable', '无法读取登录凭据，请重新登录')
    }
    const userId = idValue(status?.id)
    if (!token || !status?.logged_in || !userId) fail('needs-omnimux', '请先登录 OmniMux 账号', 401)
    if (status.base_url && new URL(status.base_url).origin !== origin) fail('official-account-changed', '登录站点已变化，请重新登录', 409)
    return { token, userId, ref: accountModelKeyRef(origin, userId) }
  }

  async function assertCurrent(account) {
    const now = await current()
    if (now.token !== account.token || now.userId !== account.userId || now.ref !== account.ref) {
      fail('official-account-changed', '登录账号已变化，请重新读取账号密钥', 409)
    }
  }

  async function explicit(env = deps.env ?? process.env) {
    const fromEnv = text(env.OMNIMUX_API_KEY || env.OMNIMUX_TOKEN)
    if (fromEnv) return fromEnv
    const service = credentials()
    if (typeof service?.resolve !== 'function') return undefined
    for (const ref of ['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN']) {
      let hit
      try { hit = await service.resolve(ref) }
      catch { fail('official-credential-unavailable', '无法读取 OmniMux 调用凭据，请检查凭据服务') }
      if (text(hit?.value)) return text(hit.value)
    }
    return undefined
  }

  async function read(account) {
    const service = credentials()
    if (typeof service?.resolve !== 'function') fail('official-credential-unavailable', '凭据服务不可用，请重新打开应用')
    let hit
    try { hit = await service.resolve(account.ref) }
    catch { fail('official-credential-unavailable', '无法读取分析凭据，请检查凭据服务') }
    await assertCurrent(account)
    return parseStored(hit?.value)
  }

  async function request(account, path, method = 'GET') {
    const client = createOfficialClient({
      siteBaseUrl: origin, fetcher: deps.fetcher,
      resolveApiKey: () => undefined,
      resolveAccess: async () => {
        await assertCurrent(account)
        return { token: account.token, userId: account.userId }
      },
    })
    let response, body
    try {
      response = await client.withPatRaw(path, { method })
      body = await response.json()
    } catch (error) {
      if (error instanceof OmnimuxError) throw error
      fail('official-key-request-failed', '读取账号密钥失败，请稍后重试', 502)
    }
    await assertCurrent(account)
    if (!response.ok || body?.success !== true) {
      fail('official-key-request-failed', `账号密钥服务拒绝请求（HTTP ${response.status}），请在控制台检查权限与密钥状态`, response.status >= 400 ? response.status : 502)
    }
    return body.data
  }

  async function list() {
    const account = await current(true)
    const items = []
    for (let page = 1; page <= 20; page += 1) {
      const data = await request(account, `/api/token/?p=${page}&page_size=100`)
      const rows = Array.isArray(data) ? data : data?.items
      if (!Array.isArray(rows)) fail('official-key-invalid-response', '账号密钥列表格式无效', 502)
      items.push(...rows.map((row) => publicItem(row, account.token)))
      if (Array.isArray(data) || rows.length < 100 || (Number.isFinite(data.total) && items.length >= data.total)) break
      if (page === 20) fail('official-key-list-too-large', '账号密钥较多，请先在控制台整理后重新读取', 409)
    }
    const fromExplicit = await explicit()
    const selected = fromExplicit ? null : await read(account)
    await assertCurrent(account)
    return { items, configured: Boolean(fromExplicit || selected), source: fromExplicit ? 'explicit' : selected ? 'account' : null,
      selectedId: selected?.id ?? null, createUrl: `${origin}/keys/` }
  }

  async function select(id) {
    if (!Number.isSafeInteger(id) || id <= 0) fail('omnimux-invalid-request', '请选择账号密钥', 400)
    return exclusive(async () => {
      const account = await current(true)
      const row = publicItem(await request(account, `/api/token/${id}`), account.token)
      if (row.id !== id) fail('official-key-invalid-response', '账号密钥身份不匹配', 502)
      if (row.status !== 1 || (row.expired_time !== -1 && row.expired_time <= Date.now() / 1000)
        || (!row.unlimited_quota && row.remain_quota <= 0)) {
        fail('official-key-unavailable', '此密钥已停用、过期或额度不足，请选择其他密钥', 409)
      }
      const data = await request(account, `/api/token/${id}/key`, 'POST')
      const raw = text(data?.key)
      const key = raw.startsWith('sk-') ? raw : `sk-${raw}`
      if (!/^sk-[A-Za-z0-9]{48}$/.test(key) || key === account.token) fail('official-key-invalid-response', '账号密钥服务未返回有效的调用凭据', 502)
      const service = credentials()
      if (typeof service?.set !== 'function' || typeof service?.resolve !== 'function') fail('official-credential-save-failed', '凭据服务不可写，分析服务尚未启用')
      await assertCurrent(account)
      const value = JSON.stringify({ version: 1, id, key })
      try { await service.set(account.ref, value) }
      catch { fail('official-credential-save-failed', '分析凭据保存失败，请检查凭据服务后重试') }
      const saved = await read(account)
      if (saved?.id !== id || saved.key !== key) fail('official-credential-save-failed', '分析凭据保存未确认，请重新读取账号密钥')
      await assertCurrent(account)
      return { configured: true, source: 'account', selectedId: id }
    })
  }

  async function resolve(options = {}) {
    const fromExplicit = await explicit(options.env)
    if (fromExplicit) return fromExplicit
    const account = await current(true)
    const selected = await read(account)
    if (!selected) fail('official-credential-required', '请在个人资料中启用 OmniMux 分析服务', 409)
    return selected.key
  }

  return { list, select, resolve }
}
