import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Resolve the official DSH home, matching the hub / assets convention.
 * @param {string | undefined} homeDir
 * @param {{ DSH_HOME?: string }} [env]
 */
export function resolveDshHome(homeDir, env = process.env) {
  return homeDir || env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * All products state lives under `<dsh home>/omnimux/products/`.
 * This directory is the only disk area this plugin may write.
 * @param {{ homeDir?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function resolveProductsPaths(opts = {}) {
  const home = resolveDshHome(opts.homeDir, opts.env)
  const dir = join(home, 'omnimux', 'products')
  return {
    dir,
    libraryFile: join(dir, 'library.json'),
    mediaDir: join(dir, 'media'),
  }
}

/**
 * The screenshot media directory of an already-resolved path set.
 *
 * `mediaDir` is optional by contract: stores built from `{ libraryFile }` alone
 * still resolve, falling back to the `media/` sibling of the library file.
 * Callers must never build this path themselves.
 *
 * @param {{ mediaDir?: string, libraryFile?: string }} [paths]
 * @returns {string}
 */
export function mediaDirOf(paths) {
  if (paths && typeof paths.mediaDir === 'string' && paths.mediaDir) return paths.mediaDir
  const libraryFile = String(paths?.libraryFile ?? '')
  return libraryFile ? join(dirname(libraryFile), 'media') : ''
}
