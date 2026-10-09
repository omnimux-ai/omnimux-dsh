import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { canonicalStringify } from '../catalog/contract/load.js'
import { getModelChannelGroups } from '../catalog/serving/id-universe.js'
import { PROTOCOLS, resolveMediaRoute } from './route.js'

const SOURCE_PATHS = [
  'media/generation-mapping.js', 'media/route.js', 'media/execute.js', 'media/vendors/omnimux.js',
  'media/protocols/openai-media.js', 'catalog/generation-products.js', 'catalog/serving/id-universe.js',
  'catalog/serving/channel-groups.js', 'catalog/contract/auto-serving-manifest.json',
  'catalog/contract/dispositions.json', 'catalog/contract/submit-guard/map.js',
  'catalog/contract/submit-guard/map-bindings.js', 'catalog/contract/submit-guard/map-contract.js',
]
// Package identity is captured at first module evaluation, not at a later factory call.
const sourceVersion = (() => {
  try {
    const sources = SOURCE_PATHS.map(path => [path, readFileSync(new URL(`../${path}`, import.meta.url)).toString('base64')])
    return createHash('sha256').update(canonicalStringify(sources)).digest('hex')
  } catch { return null }
})()
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const name = value => typeof value === 'string' && value.length > 0 && value === value.trim()
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))
function record(value) {
  return plain(value) && !Object.getOwnPropertySymbols(value).length && Object.getOwnPropertyNames(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor?.enumerable === true && own(descriptor, 'value')
  })
}
/** Read only a necessary own data field; unrelated credential descriptors are never accessed. */
function field(value, key) {
  if (!plain(value)) return undefined
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor?.enumerable === true && own(descriptor, 'value') ? descriptor.value : undefined
}
function transportTarget(baseUrl) {
  if (!name(baseUrl) || !/^https?:\/\//.test(baseUrl) || /[?#]/.test(baseUrl)) return null
  try {
    const url = new URL(baseUrl)
    if (!url.hostname || url.username || url.password || url.search || url.hash) return null
    return Object.freeze({ origin: url.origin, basePath: url.pathname.replace(/\/+$/, '') })
  } catch { return null }
}
function projectMedia(media) {
  const defaultProvider = field(media, 'defaultProvider'), providers = field(media, 'providers')
  if (!name(defaultProvider)) return null
  const provider = field(providers, defaultProvider)
  const protocol = field(provider, 'protocol'), baseUrl = field(provider, 'baseUrl'), models = field(provider, 'models')
  if (!PROTOCOLS.includes(protocol) || !transportTarget(baseUrl) || !record(models) || !Object.values(models).every(name)) return null
  const cleanModels = Object.freeze(Object.fromEntries(Object.entries(models)))
  const cleanProvider = Object.freeze({ protocol, baseUrl, models: cleanModels })
  return Object.freeze({ defaultProvider, providers: Object.freeze({ [defaultProvider]: cleanProvider }) })
}
/**
 * Current non-secret transport identity for one explicit registered group.
 * No channel binding is inferred from the provider or supplier contract.
 * @param {unknown} media Already parsed Hub media configuration.
 * @returns {(candidate: {model: {id: string}, operation: {id: string, output: {type: string}}, group: object}) => object | null}
 */
export function createGenerationMapping(media) {
  const projected = projectMedia(media)
  return candidate => {
    if (!sourceVersion || !projected) throw new Error('catalog unavailable')
    if (!record(candidate) || Object.keys(candidate).some(key => !['model', 'operation', 'group'].includes(key))) return null
    const { model, operation, group } = candidate
    if (!record(model) || Object.keys(model).some(key => key !== 'id')
      || !record(operation) || Object.keys(operation).some(key => !['id', 'output'].includes(key))
      || !record(operation.output) || Object.keys(operation.output).some(key => key !== 'type')
      || !record(group) || Object.keys(group).some(key => !['id', 'wireGroup', 'wireModel', 'enabled'].includes(key))
      || !name(model.id) || !name(operation.id) || !['image', 'video'].includes(operation.output.type)
      || group.enabled !== true || !name(group.id) || (own(group, 'wireGroup') && !name(group.wireGroup))
      || (own(group, 'wireModel') && !name(group.wireModel))) return null
    const wireGroup = group.wireGroup ?? group.id, expectedModel = group.wireModel ?? model.id
    const registered = getModelChannelGroups(model.id).find(row => row.id === group.id)
    if (!registered || registered.enabled !== true || (registered.wireGroup || registered.id) !== wireGroup
      || (registered.wireModel || model.id) !== expectedModel) return null
    let route
    try {
      route = resolveMediaRoute(operation.output.type, { model: model.id, group: wireGroup, allowedGroups: [group.id] }, projected, {})
    } catch { return null }
    if (route.modelId !== model.id || route.group !== wireGroup || route.candidates.length !== 1 || route.unresolvedGroups.length) return null
    // Preserve the literal candidate spelling, including execute's bare-candidate group fallback.
    const literal = route.candidates[0], at = literal.indexOf('@')
    const wireModel = (at > 0 ? literal.slice(0, at) : literal).trim()
    const candidateGroup = at > 0 ? literal.slice(at + 1).trim() : route.group
    if (wireModel !== expectedModel || candidateGroup !== wireGroup) return null
    const target = transportTarget(route.baseUrl)
    if (!target) throw new Error('catalog unavailable')
    return Object.freeze({ providerId: route.providerId, protocol: route.protocol, wireModel, wireGroup, sourceVersion, transportTarget: target })
  }
}
