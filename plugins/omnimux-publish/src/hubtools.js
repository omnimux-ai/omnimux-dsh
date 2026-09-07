import { PUBLISH_PROVIDER } from './account-policy.js'
/**
 * HubPublishChannel: 懒封装 `ctx.tools.get/execute` 程序化调用 hub
 * `omnimux_publish_*` / `omnimux_accounts_list` 官方工具。
 *
 * - 懒解析：调用时才 get(name)，规避插件加载顺序；不存在 → 确定性
 *   `needs-hub`，不假装成功。
 * - `ctx.tools.execute` 走完整策略管线（与模型直调同一条路），返回
 *   { content, isError, value }；jsonOut 工具的 value 即上游 JSON 原样。
 * - 媒体 PUT 走预签名 URL（自授权），不带任何 secret header。
 */
import { PublishError } from './publish-error.js'
import { isObject } from './shared/values.js'
/** @typedef {{ callId: string, name: string, arguments: Record<string, unknown>, signal: AbortSignal, agent?: unknown }} ToolExecution */
/** @typedef {{ get?: (name: string) => unknown, execute?: (input: ToolExecution) => Promise<unknown> }} ToolRegistry */

/**
 * @param {{ tools?: ToolRegistry, fetcher?: typeof fetch, now?: () => number, idFactory?: () => string }} [deps]
 */
export function createHubChannel(deps = {}) {
  const tools = deps.tools
  const fetcher = deps.fetcher ?? fetch
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  const newCallId = deps.idFactory ?? (() => `omnimux-publish-${now().toString(36)}`)

  /**
   * @param {string} name
   * @param {Record<string, unknown>} args
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   * @returns {Promise<unknown>}
   */
  async function exec(name, args, opts = {}) {
    if (!tools || typeof tools.get !== 'function' || typeof tools.execute !== 'function') {
      throw new PublishError('needs-hub', 'omnimux hub 插件未装载（ctx.tools 不可用），请安装/启用 omnimux hub 插件后再使用发布通道')
    }
    const tool = tools.get(name)
    if (!tool) {
      throw new PublishError('needs-hub', `omnimux hub 插件未装载（工具 ${name} 不存在），请安装/启用 omnimux hub 插件后再使用发布通道`)
    }
    /** @type {ToolExecution} */
    const input = { callId: newCallId(), name, arguments: args, signal: opts.signal || new AbortController().signal }
    if (opts.agent !== undefined) input.agent = opts.agent
    let result
    try {
      result = await tools.execute(input)
    } catch (error) {
      throw new PublishError('hub-tool-error', `tool ${name} threw: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!isObject(result)) {
      throw new PublishError('hub-tool-error', `tool ${name} returned no result object`)
    }
    const text = Array.isArray(result.content)
      ? result.content.map((/** @type {unknown} */ block) => (isObject(block) && typeof block.text === 'string' ? block.text : '')).join('\n')
      : ''
    if (result.isError) {
      // harness 把 execute 抛错物化为 content 文本 `Error: <message>`；
      // hub OmnimuxError 的 code 不进 content（errorInfo 只认 HarnessError），
      // 所以 needs-omnimux 要按 code + 已知消息特征双路识别（client.js 实证的消息串）。
      const errorInfo = isObject(result.error) ? result.error : {}
      const info = isObject(errorInfo.info) ? errorInfo.info : {}
      const structured = `${String(errorInfo.message || '')} ${String(info.code || '')}`
      const errText = `${text}\n${structured}`
      const sourceError = ['invalid-provider', 'account-provider-mismatch', 'post-provider-mismatch']
        .find((code) => errText.includes(code))
      if (sourceError) throw new PublishError(sourceError, text.trim() || sourceError)
      if (/needs-omnimux/i.test(errText)
        || /sign in to OmniMux/i.test(errText)
        || /OMNIMUX_ACCESS_TOKEN/.test(errText)
        || /official request unauthorized/i.test(errText)) {
        throw new PublishError('needs-omnimux', 'OmniMux 未登录：请先在 OmniMux 登录或设置 OMNIMUX_ACCESS_TOKEN，再执行发布相关操作')
      }
      if (/quota-exceeded|insufficient_user_quota|预扣费额度失败/i.test(errText)) {
        throw new PublishError('quota-exceeded', '当前操作需要更多额度，充值后即可继续使用 OmniMux。')
      }
      if (/UNKNOWN_TOOL/i.test(text) || /unknown tool/i.test(text)) {
        throw new PublishError('needs-hub', `omnimux hub 插件未装载（工具 ${name} 未知），请安装/启用 omnimux hub 插件`)
      }
      throw new PublishError('hub-tool-error', text.trim() || `tool ${name} failed`)
    }
    return result.value
  }

  /**
   * 解包 `{ success, data }` 上游信封（docs/hub-tool-contracts.md）。
   * 兼容无信封的直返对象；success:false → 确定性错误。
   * @param {unknown} value
   * @param {string} toolName
   */
  function unwrap(value, toolName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new PublishError('hub-tool-error', `${toolName} returned a non-object payload`)
    }
    const row = /** @type {Record<string, unknown>} */ (value)
    if ('success' in row && row.success === false) {
      throw new PublishError('hub-tool-error', String(row.message || row.error || `${toolName} upstream success:false`))
    }
    if ('data' in row && row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
      return /** @type {Record<string, unknown>} */ (row.data)
    }
    return row
  }

  /**
   * presign 媒体上传许可。
   * @param {{ filename: string, content_type?: string }} args
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  async function presign(args, opts = {}) {
    const value = await exec('omnimux_publish_presign', {
      filename: args.filename,
      ...(args.content_type ? { content_type: args.content_type } : {}),
    }, opts)
    const data = unwrap(value, 'omnimux_publish_presign')
    const uploadUrl = typeof data.upload_url === 'string' && data.upload_url ? data.upload_url : ''
    const publicUrl = typeof data.public_url === 'string' && data.public_url ? data.public_url : ''
    if (!uploadUrl || !publicUrl) {
      throw new PublishError('hub-tool-error', `presign response missing upload_url/public_url: ${JSON.stringify(data).slice(0, 300)}`)
    }
    return { upload_url: uploadUrl, public_url: publicUrl }
  }

  /**
   * @param {{ account_ids: string[], content: string, media_items: Array<Record<string, unknown>> }} args
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  async function createPost(args, opts = {}) {
    const value = await exec('omnimux_publish_create', { ...args, provider: PUBLISH_PROVIDER }, opts)
    return unwrap(value, 'omnimux_publish_create')
  }

  /**
   * @param {string} postId
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  async function getPost(postId, opts = {}) {
    const value = await exec('omnimux_publish_get', { id: String(postId), provider: PUBLISH_PROVIDER }, opts)
    return unwrap(value, 'omnimux_publish_get')
  }

  /**
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  async function listAccounts(opts = {}) {
    const value = await exec('omnimux_accounts_list', { provider: PUBLISH_PROVIDER }, opts)
    return unwrap(value, 'omnimux_accounts_list')
  }

  /**
   * PUT 字节到预签名 URL（预签名自授权，不带任何 auth header）。
   * @param {string} uploadUrl
   * @param {Buffer} buffer
   * @param {string} contentType
   * @param {{ signal?: AbortSignal }} [opts]
   */
  async function putBytes(uploadUrl, buffer, contentType, opts = {}) {
    let response
    try {
      response = await fetcher(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: buffer,
        ...(opts.signal ? { signal: opts.signal } : {}),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new PublishError('upload-failed', `media upload request failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!response.ok) {
      throw new PublishError('upload-failed', `media upload failed (HTTP ${response.status})`)
    }
    return { ok: true, status: response.status }
  }

  return { exec, unwrap, presign, createPost, getPost, listAccounts, putBytes }
}

/**
 * 从 create/get 响应中提取 post_id（data.id；number 归一为 string）。
 * @param {Record<string, unknown>} data
 * @param {string} toolName
 */
export function extractPostId(data, toolName) {
  const id = data.id ?? data.post_id ?? data.taskId ?? data.task_id
  if (id === undefined || id === null || id === '') {
    throw new PublishError('hub-tool-error', `${toolName} response missing post id: ${JSON.stringify(data).slice(0, 300)}`)
  }
  return String(id)
}

/**
 * 从 get 响应中提取平台原始状态（data.status；缺失返回 null）。
 * @param {Record<string, unknown>} data
 */
export function extractRawStatus(data) {
  const status = data.status ?? data.platform_status ?? data.raw_status
  return typeof status === 'string' && status.trim() !== '' ? status : null
}
