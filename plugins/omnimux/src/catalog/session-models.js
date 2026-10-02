/**
 * Session-reachable text models for the tool-model picker.
 *
 * The composer's model button and the session engine both resolve through the
 * `llm-pi-ai` settings namespace: whatever a provider lists there is a model a
 * session can reach. This module flattens that same registry into the single
 * `provider:modelId` vocabulary `omnimux.toolModel` stores, so a tool model is
 * reachable by construction — the picker cannot offer a model sessions cannot
 * run, and it cannot invent one either.
 */

import { findDescriptor, PI_AI_NAMESPACE } from './composer-sync.js'

/**
 * One provider's models flattened into picker rows.
 *
 * `input` declares modalities; a model that publishes no `input` at all is
 * text-capable by convention (the composer treats it the same way), while one
 * that names modalities must include `text` to be listed.
 *
 * @param {string} providerId
 * @param {Record<string, unknown>} profile
 * @returns {Array<{ id: string, label: string }>}
 */
function providerRows(providerId, profile) {
  const models = Array.isArray(profile?.models) ? profile.models : []
  const providerName = typeof profile?.displayName === 'string' && profile.displayName.trim()
    ? profile.displayName.trim()
    : providerId
  const rows = []
  for (const model of models) {
    if (!model || typeof model !== 'object') continue
    const modelId = typeof model.id === 'string' ? model.id.trim() : ''
    if (!modelId) continue
    const input = Array.isArray(model.input) ? model.input : null
    if (input !== null && !input.includes('text')) continue
    const modelName = typeof model.name === 'string' && model.name.trim()
      ? model.name.trim()
      : modelId
    rows.push({ id: `${providerId}:${modelId}`, label: `${modelName} · ${providerName}` })
  }
  return rows
}

/**
 * Flatten every llm-pi-ai provider's model list.
 *
 * The user layer is authoritative when it exists (it is what the composer
 * actually renders after narrowing); a provider absent from user falls back to
 * the shipped base layer. Settings unavailable or a describe() failure means
 * an empty list — the picker degrades to just its "auto" entry, never throws.
 *
 * @param {unknown} settingsService - the host `settings` service (describe()).
 * @returns {Array<{ id: string, label: string }>}
 */
export function listSessionModels(settingsService) {
  if (!settingsService || typeof settingsService.describe !== 'function') return []
  let descriptor
  try {
    descriptor = findDescriptor(settingsService.describe(), PI_AI_NAMESPACE)
  } catch {
    return []
  }
  if (!descriptor) return []

  const userProviders = descriptor.user?.providers && typeof descriptor.user.providers === 'object'
    ? descriptor.user.providers
    : null
  const baseProviders = descriptor.base?.providers && typeof descriptor.base.providers === 'object'
    ? descriptor.base.providers
    : null

  const providerIds = new Set([
    ...Object.keys(userProviders ?? {}),
    ...Object.keys(baseProviders ?? {}),
  ])

  const rows = []
  for (const providerId of providerIds) {
    // User entries can be partial overlays (endpoint/key without models):
    // merge per field so base models/displayName survive a thin user entry.
    const baseProfile = baseProviders && baseProviders[providerId]
    const userProfile = userProviders && userProviders[providerId]
    const profile = {
      ...(baseProfile && typeof baseProfile === 'object' ? baseProfile : {}),
      ...(userProfile && typeof userProfile === 'object' ? userProfile : {}),
    }
    rows.push(...providerRows(providerId, profile))
  }
  return rows
}
