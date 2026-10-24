import { existsSync } from 'node:fs'
import { isInstalled } from './catalog.js'
import { findItem, installItem } from './install.js'
import { expertModePresent } from './paths.js'

/**
 * @param {{
 *   catalog: import('./catalog.js').parseCatalog extends Function ? ReturnType<import('./catalog.js').parseCatalog> : never,
 *   id: string,
 *   sessionState: 'blank' | 'locked',
 *   home: string,
 *   profileDir: string,
 *   packageRoot: string,
 * }} opts
 */
export function summonItem(opts) {
  const item = findItem(opts.catalog, opts.id)
  if (!item) throw new Error(`unknown item ${opts.id}`)
  if (item.kind === 'connector') throw new Error('connectors are installed, not summoned')
  const roots = { home: opts.home, profileDir: opts.profileDir, packageRoot: opts.packageRoot }
  if (!isInstalled(item, roots)) installItem({ ...opts, id: item.id })
  if (!item.skill) throw new Error(`item ${item.id} missing skill`)
  const gesture = `/${item.skill}`
  const hasExpertMode = existsSync(expertModePresent(opts.home))
  const stagePreset = opts.sessionState === 'blank' && hasExpertMode ? 'expert-mode' : null
  return {
    id: item.id,
    skill: item.skill,
    gesture,
    stagePreset,
    sessionState: opts.sessionState,
  }
}
