import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { validateRoot } from './storage-types.js'

/**
 * Resolve the official DSH home, matching the hub auth/store.js convention.
 * @param {string | undefined} homeDir
 * @param {{ DSH_HOME?: string }} [env]
 */
export function resolveDshHome(homeDir, env = process.env) {
  return homeDir || env.DSH_HOME || join(homedir(), '.dsh')
}

/** Resolve the stable Home control area independently of the removable content root. */
export function resolveStoragePaths(opts = {}) {
  const home = resolve(resolveDshHome(opts.homeDir, opts.env))
  const controlDir = join(home, 'omnimux', 'assets-storage')
  return { home, controlDir, rootFile: join(controlDir, 'root.json'), defaultRoot: join(home, 'omnimux', 'assets') }
}

/** Read the sole root pointer; a corrupt pointer must never select a default empty library. */
export function resolveAssetsPaths(opts = {}) {
  const storage = resolveStoragePaths(opts)
  let dir = opts.rootPath
  if (!dir) {
    try { dir = validateRoot(JSON.parse(readFileSync(storage.rootFile, 'utf8'))).active.path }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  dir ||= storage.defaultRoot
  return {
    ...storage,
    dir,
    mappingsFile: join(dir, 'mappings.json'),
    libraryFile: join(dir, 'library.json'),
    artifactsFile: join(dir, 'artifacts.json'),
    scansDir: join(dir, 'scans'),
    artifactsDir: join(dir, 'artifacts'),
    filesDir: join(dir, 'data', 'files'),
  }
}
