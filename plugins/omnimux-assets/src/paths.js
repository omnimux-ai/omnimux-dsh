import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Resolve the official DSH home, matching the hub auth/store.js convention.
 * @param {string | undefined} homeDir
 * @param {{ DSH_HOME?: string }} [env]
 */
export function resolveDshHome(homeDir, env = process.env) {
  return homeDir || env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * All assets state lives under `<dsh home>/omnimux/assets/`.
 * This directory is the only disk area this plugin may write.
 * @param {{ homeDir?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function resolveAssetsPaths(opts = {}) {
  const home = resolveDshHome(opts.homeDir, opts.env)
  const dir = join(home, 'omnimux', 'assets')
  return {
    dir,
    mappingsFile: join(dir, 'mappings.json'),
    libraryFile: join(dir, 'library.json'),
    artifactsFile: join(dir, 'artifacts.json'),
    scansDir: join(dir, 'scans'),
    artifactsDir: join(dir, 'artifacts'),
    filesDir: join(dir, 'data', 'files'),
  }
}
