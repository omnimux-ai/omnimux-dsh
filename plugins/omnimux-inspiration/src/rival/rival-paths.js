/**
 * Path resolution for the rival-accounts module.
 *
 * Two trees, deliberately separate:
 * - data  → `<inspirations>/rival-accounts/` (accounts, config, budget, posts)
 * - media → `<inspirations>/media/rival-accounts/` (covers, avatars, videos)
 *
 * The media tree is a *real* subdirectory of the existing `paths.mediaDir`, so
 * the already-shipped `/omnimux/inspiration/local/media/...` stream endpoint
 * serves these files unchanged. Nothing here may hand-build a URL out of an
 * absolute path: an absolute filesystem path is only ever used for `@` file
 * references and `existsSync` checks.
 */

import { join } from 'node:path'
import { resolveInspirationPaths } from '../paths.js'
import {
  DEFAULT_COVER_EXT,
  RIVAL_DATA_DIR_NAME,
  RIVAL_MEDIA_DIR_NAME,
  RIVAL_MEDIA_URL_PREFIX,
} from './constants.js'

/**
 * @typedef {Object} RivalPaths
 * @property {string} dir           data root: <inspirations>/rival-accounts
 * @property {string} configFile
 * @property {string} accountsFile
 * @property {string} budgetFile
 * @property {string} postsDir
 * @property {string} mediaDir      <inspirations>/media/rival-accounts
 * @property {string} coversDir
 * @property {string} avatarsDir
 * @property {string} videosDir
 * @property {ReturnType<typeof resolveInspirationPaths>} inspiration observed inspiration paths
 */

/**
 * @param {{ paths?: ReturnType<typeof resolveInspirationPaths>, homeDir?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {RivalPaths}
 */
export function resolveRivalPaths(opts = {}) {
  const inspirationPaths = opts.paths ?? resolveInspirationPaths({ homeDir: opts.homeDir, env: opts.env })
  const dir = join(inspirationPaths.dir, RIVAL_DATA_DIR_NAME)
  const mediaDir = join(inspirationPaths.mediaDir, RIVAL_MEDIA_DIR_NAME)
  return {
    dir,
    configFile: join(dir, 'config.json'),
    accountsFile: join(dir, 'accounts.json'),
    budgetFile: join(dir, 'budget.json'),
    cooldownFile: join(dir, 'cooldown.json'),
    postsDir: join(dir, 'posts'),
    mediaDir,
    coversDir: join(mediaDir, 'covers'),
    avatarsDir: join(mediaDir, 'avatars'),
    videosDir: join(mediaDir, 'videos'),
    inspiration: inspirationPaths,
  }
}

/**
 * Absolute path of the `posts/<account_id>.json` cache file.
 * @param {RivalPaths} paths
 * @param {string} accountId
 * @returns {string}
 */
export function rivalPostsFile(paths, accountId) {
  return join(paths.postsDir, `${sanitizeId(accountId)}.json`)
}

/**
 * Every directory the module writes into, in creation order.
 * @param {RivalPaths} paths
 * @returns {string[]}
 */
export function rivalDirs(paths) {
  return [paths.dir, paths.postsDir, paths.mediaDir, paths.coversDir, paths.avatarsDir, paths.videosDir]
}

/**
 * Host-relative URL of a downloaded rival media file.
 *
 * The subpath is always `rival-accounts/<kind>/<file>` — a genuine relative path
 * under `mediaDir` — and the file name is reduced to its basename so a crafted
 * value can never climb out of the media root.
 * @param {'covers' | 'avatars' | 'videos'} kind
 * @param {string} filename
 * @returns {string}
 */
export function rivalMediaUrl(kind, filename) {
  const file = basename(filename)
  if (!file) return ''
  return `${RIVAL_MEDIA_URL_PREFIX}${RIVAL_MEDIA_DIR_NAME}/${kind}/${file}`
}

/**
 * Relative subpath (under `mediaDir`) of a rival media file, for `join()`.
 * @param {'covers' | 'avatars' | 'videos'} kind
 * @param {string} filename
 * @returns {string}
 */
export function rivalMediaSubpath(kind, filename) {
  const file = basename(filename)
  if (!file) return ''
  return `${RIVAL_MEDIA_DIR_NAME}/${kind}/${file}`
}

/**
 * Deterministic media file name of a post, so re-clicking "add to session"
 * reuses the file already on disk instead of downloading it again.
 * @param {string} postId
 * @param {'.jpg' | '.mp4' | string} [ext]
 * @returns {string}
 */
export function rivalMediaFilename(postId, ext = DEFAULT_COVER_EXT) {
  const suffix = /^\.[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : DEFAULT_COVER_EXT
  return `rival-${hashId(postId)}${suffix}`
}

/**
 * Basename of a path-like value; '' when there is nothing usable.
 * @param {unknown} value
 * @returns {string}
 */
export function basename(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.includes('..')) return ''
  const tail = text.split(/[\\/]/).pop() ?? ''
  return /^[A-Za-z0-9._-]+$/.test(tail) ? tail : ''
}

/**
 * Collapse a value into a filesystem-safe id fragment.
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeId(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  const safe = text.replace(/[^A-Za-z0-9_-]/g, '')
  return safe || 'unknown'
}

/**
 * Stable 8-hex digest, used for media file names and 账号 ids. A tiny FNV-1a
 * keeps this module dependency-free and deterministic across processes.
 * @param {unknown} value
 * @returns {string}
 */
export function hashId(value) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
