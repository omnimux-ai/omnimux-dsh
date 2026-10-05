// 路径解析的契约测试：主目录优先级、插件数据目录、形象文件布局。
import test from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import {
  avatarDirOf,
  avatarMainImagePath,
  avatarMultiViewDir,
  avatarMultiViewImagePath,
  resolveAvatarPaths,
  resolveDshHome,
  resolvePluginDataDir,
} from './paths.js'

test('显式 DSH_HOME 优先于默认兜底', () => {
  assert.equal(resolveDshHome(undefined, { DSH_HOME: '/tmp/dsh-home' }), '/tmp/dsh-home')
})

test('homeDir 优先于环境变量', () => {
  assert.equal(resolveDshHome('/tmp/explicit', { DSH_HOME: '/tmp/env-home' }), '/tmp/explicit')
})

test('无任何输入时兜底为 ~/.dsh，且绝不指向仓库或开发目录', () => {
  const got = resolveDshHome(undefined, {})
  assert.equal(got, join(homedir(), '.dsh'))
  assert.ok(isAbsolute(got))
  assert.ok(!got.includes('omnimux-dsh'))
  assert.ok(!got.includes('.worktrees'))
})

test('空字符串 homeDir 不覆盖环境变量', () => {
  assert.equal(resolveDshHome('', { DSH_HOME: '/tmp/from-env' }), '/tmp/from-env')
})

test('插件数据目录位于插件根目录下的 data', () => {
  const dir = resolvePluginDataDir()
  assert.ok(isAbsolute(dir))
  assert.ok(dir.endsWith(`${join('omnimux-avatar', 'data')}`))
})

test('派生路径逐项精确', () => {
  const paths = resolveAvatarPaths({ homeDir: '/tmp/home', env: {} })
  assert.equal(paths.dir, join('/tmp/home', 'omnimux', 'avatar'))
  assert.equal(paths.libraryFile, join('/tmp/home', 'omnimux', 'avatar', 'avatars.json'))
  assert.equal(paths.dataDir, join('/tmp/home', 'omnimux', 'avatar', 'data'))

  const pluginDataDir = resolvePluginDataDir()
  assert.equal(paths.taxonomyFile, join(pluginDataDir, 'taxonomy.json'))
  assert.equal(paths.presetsFile, join(pluginDataDir, 'presets.json'))
  assert.equal(paths.presetsDir, join(pluginDataDir, 'presets'))
})

test('resolveAvatarPaths 也接受环境变量作为来源', () => {
  const paths = resolveAvatarPaths({ env: { DSH_HOME: '/tmp/env-home' } })
  assert.equal(paths.dir, join('/tmp/env-home', 'omnimux', 'avatar'))
})

test('单个形象的文件布局精确', () => {
  const paths = resolveAvatarPaths({ homeDir: '/tmp/home', env: {} })
  const dir = join('/tmp/home', 'omnimux', 'avatar', 'data', 'av1')
  assert.equal(avatarDirOf(paths, 'av1'), dir)
  assert.equal(avatarMainImagePath(paths, 'av1'), join(dir, 'main.png'))
  assert.equal(avatarMultiViewDir(paths, 'av1'), join(dir, '多视角'))
  assert.equal(avatarMultiViewImagePath(paths, 'av1'), join(dir, '多视角', 'turnaround.png'))
})
