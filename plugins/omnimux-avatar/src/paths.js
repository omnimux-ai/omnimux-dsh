// 路径解析：DSH 主目录、插件只读数据目录、单个形象的文件布局。
// 仅使用 node 内置模块，保证在插件宿主与测试进程下行为一致。
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 本文件位于 <plugin root>/src/，向上一级即插件根目录。
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 解析 DSH 主目录。优先级：显式 homeDir > 环境变量 DSH_HOME > ~/.dsh。
 * 兜底永不指向仓库或开发目录，保证新装机用户的默认行为。
 */
export function resolveDshHome(homeDir, env = process.env) {
  if (homeDir) return homeDir
  if (env && env.DSH_HOME) return env.DSH_HOME
  return join(homedir(), '.dsh')
}

/** 插件自带的只读数据目录（taxonomy / presets 快照）。 */
export function resolvePluginDataDir() {
  return join(PLUGIN_ROOT, 'data')
}

/**
 * 形象库的完整路径集合。
 * opts.homeDir / opts.env 透传给 resolveDshHome，便于测试注入。
 */
export function resolveAvatarPaths(opts = {}) {
  const dshHome = resolveDshHome(opts.homeDir, opts.env ?? process.env)
  const dir = join(dshHome, 'omnimux', 'avatar')
  const pluginDataDir = resolvePluginDataDir()
  return {
    dir,
    libraryFile: join(dir, 'avatars.json'),
    dataDir: join(dir, 'data'),
    taxonomyFile: join(pluginDataDir, 'taxonomy.json'),
    presetsFile: join(pluginDataDir, 'presets.json'),
    presetsDir: join(pluginDataDir, 'presets'),
  }
}

/** 单个形象的数据目录。 */
export function avatarDirOf(paths, avatarId) {
  return join(paths.dataDir, avatarId)
}

/** 形象主图。 */
export function avatarMainImagePath(paths, avatarId) {
  return join(avatarDirOf(paths, avatarId), 'main.png')
}

/** 形象多视角设定板目录。 */
export function avatarMultiViewDir(paths, avatarId) {
  return join(avatarDirOf(paths, avatarId), '多视角')
}

/** 形象多视角设定板图片。 */
export function avatarMultiViewImagePath(paths, avatarId) {
  return join(avatarMultiViewDir(paths, avatarId), 'turnaround.png')
}
