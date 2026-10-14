import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'

const CONFIG_KEYS = new Set(['enabled', 'endpoint', 'bucket', 'region', 'publicBaseUrl', 'credentialId'])
const DEFAULT_CONFIG = Object.freeze({ enabled: false, endpoint: '', bucket: '', region: 'auto', publicBaseUrl: '', credentialId: '' })
const REF_ID = /^[0-9a-f]{32}$/
export function storageConfigError(message, code = 'reference-storage-invalid') { return Object.assign(new Error(message), { code }) }
function urlField(raw) {
  if (!raw) return ''
  let url
  try { url = new URL(raw) } catch { throw storageConfigError('请填写有效的公网安全地址') }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !host
    || isIP(host.replace(/^\[|\]$/g, '')) || host === 'localhost' || !host.includes('.')
    || /\.(?:local|localhost|internal|test-invalid)$/.test(host)) throw storageConfigError('存储地址必须是无认证信息的公网安全地址')
  return url.href.replace(/\/+$/, '')
}
/** Non-secret settings contract. Network resolution is enforced again by the upload transport. */
export function parseReferenceStorageConfig(value) {
  if (value === undefined || value === null) return Object.assign({}, DEFAULT_CONFIG)
  if (typeof value !== 'object' || Array.isArray(value)) throw storageConfigError('存储配置格式无效')
  for (const key of Object.keys(value)) if (!CONFIG_KEYS.has(key)) throw storageConfigError('存储配置包含不支持的字段')
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw storageConfigError('启用设置无效')
  const config = Object.assign({}, DEFAULT_CONFIG)
  config.enabled = value.enabled === true
  for (const key of ['endpoint', 'bucket', 'region', 'publicBaseUrl', 'credentialId']) {
    const raw = value[key]
    if (raw !== undefined && (typeof raw !== 'string' || raw.length > 4096 || /[\0\r\n]/.test(raw))) throw storageConfigError('存储配置字段无效')
    if (typeof raw === 'string') config[key] = raw.trim()
  }
  config.region = config.region || 'auto'
  config.endpoint = urlField(config.endpoint)
  config.publicBaseUrl = urlField(config.publicBaseUrl)
  if (config.bucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)) throw storageConfigError('存储空间名称无效')
  if (!/^[a-z0-9-]{1,64}$/.test(config.region)) throw storageConfigError('存储区域无效')
  if (config.credentialId && !REF_ID.test(config.credentialId)) throw storageConfigError('访问凭据引用无效')
  if (config.enabled && (!config.endpoint || !config.bucket || !config.publicBaseUrl)) throw storageConfigError('请填写上传地址、存储空间和公开读取地址')
  return config
}
export function credentialRefs(id) {
  if (!REF_ID.test(id)) throw storageConfigError('访问凭据引用无效')
  const stem = `OMNIMUX_REFERENCE_STORAGE_${id.toUpperCase()}`
  return { accessKeyId: `${stem}_ACCESS`, secretAccessKey: `${stem}_SECRET` }
}
function descriptorOf(settings) {
  if (typeof settings?.describe !== 'function') throw storageConfigError('设置服务暂不可用', 'reference-storage-unavailable')
  const descriptors = settings.describe()
  const descriptor = Array.isArray(descriptors) ? descriptors.find(row => (row.namespace ?? row.ns ?? row.name) === 'omnimux') : undefined
  if (!descriptor || !Number.isSafeInteger(descriptor.revision)) throw storageConfigError('设置服务暂不可用', 'reference-storage-unavailable')
  return descriptor
}
async function currentConfig(settings) {
  if (typeof settings?.get !== 'function') throw storageConfigError('设置服务暂不可用', 'reference-storage-unavailable')
  return parseReferenceStorageConfig((await settings.get('omnimux'))?.referenceStorage)
}
export async function readReferenceStorage({ settings, credentials }) {
  const config = await currentConfig(settings)
  const descriptor = descriptorOf(settings)
  let hasCredentials = false
  let credentialsWritable = typeof credentials?.set === 'function' && typeof credentials?.unset === 'function'
  if (config.credentialId) {
    if (typeof credentials?.describe !== 'function') throw storageConfigError('访问凭据服务暂不可用', 'reference-storage-unavailable')
    const refs = credentialRefs(config.credentialId)
    const access = await credentials.describe(refs.accessKeyId)
    const secret = await credentials.describe(refs.secretAccessKey)
    hasCredentials = access?.configured === true && secret?.configured === true
    credentialsWritable = credentialsWritable && access?.writable === true && secret?.writable === true
  }
  return { config, revision: descriptor.revision, hasCredentials, credentialsWritable }
}
/** Stage a fresh pair before the settings revision commit; never replace a pair used by an in-flight operation. */
export async function saveReferenceStorage(deps, request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw storageConfigError('保存请求无效')
  for (const key of Object.keys(request)) if (!CONFIG_KEYS.has(key) && !['accessKeyId', 'secretAccessKey', 'expectedRevision'].includes(key)) throw storageConfigError('保存请求包含不支持的字段')
  const descriptor = descriptorOf(deps.settings)
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision !== descriptor.revision) throw storageConfigError('设置已被更新，请刷新后重试', 'SETTINGS_CONFLICT')
  const previous = await currentConfig(deps.settings)
  const candidate = {}
  for (const key of CONFIG_KEYS) if (key !== 'credentialId' && request[key] !== undefined) candidate[key] = request[key]
  candidate.credentialId = previous.credentialId
  const config = parseReferenceStorageConfig(candidate)
  const access = request.accessKeyId ?? ''
  const secret = request.secretAccessKey ?? ''
  if (typeof access !== 'string' || typeof secret !== 'string' || access.length > 4096 || secret.length > 4096 || /[\0\r\n]/.test(access) || /[\0\r\n]/.test(secret)) throw storageConfigError('访问凭据格式无效')
  if (Boolean(access) !== Boolean(secret)) throw storageConfigError('更换访问凭据时请同时填写标识和密钥')
  if (request.credentialId !== undefined && request.credentialId !== previous.credentialId) throw storageConfigError('不能指定其他访问凭据')
  if (typeof deps.settings.update !== 'function') throw storageConfigError('设置服务暂不可用', 'reference-storage-unavailable')
  let stagedRefs = null
  try {
    if (access && secret) {
      if (typeof deps.credentials?.set !== 'function' || typeof deps.credentials?.unset !== 'function') throw storageConfigError('访问凭据服务暂不可用', 'reference-storage-unavailable')
      config.credentialId = randomUUID().replaceAll('-', '')
      stagedRefs = credentialRefs(config.credentialId)
      await deps.credentials.set(stagedRefs.accessKeyId, access)
      await deps.credentials.set(stagedRefs.secretAccessKey, secret)
    }
    if (config.enabled) {
      if (!config.credentialId || typeof deps.credentials?.describe !== 'function') throw storageConfigError('请配置完整访问凭据')
      const refs = credentialRefs(config.credentialId)
      if (!(await deps.credentials.describe(refs.accessKeyId))?.configured || !(await deps.credentials.describe(refs.secretAccessKey))?.configured) throw storageConfigError('请配置完整访问凭据')
    }
    await deps.settings.update('omnimux', { referenceStorage: config }, request.expectedRevision)
  } catch (error) {
    if (stagedRefs) {
      // An acknowledgement may be lost after commit. Only remove staged values once non-activation is observed.
      try {
        const active = await currentConfig(deps.settings)
        if (active.credentialId !== config.credentialId) {
          await deps.credentials.unset(stagedRefs.accessKeyId)
          await deps.credentials.unset(stagedRefs.secretAccessKey)
        }
      } catch (cleanupError) {
        throw storageConfigError('保存状态未能确认，请刷新设置后重试；现有访问凭据已保留', 'reference-storage-save-uncertain')
      }
    }
    throw error
  }
  return readReferenceStorage(deps)
}
