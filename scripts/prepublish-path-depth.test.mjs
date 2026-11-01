import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * 包声明面的守卫：`prepublishOnly` 里写的脚本必须真的存在。
 *
 * PR #3858 给每个包加发布可复现校验时，只有 `packages/dsh-ui-kit` 少写一级相对路径
 * （`../scripts/` 而非 `../../scripts/`），CI 用 `--ignore-scripts` 安装所以一直没暴露，
 * 但全新工作树 `pnpm install` 会直接失败（Issue #3872）。
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 收集 `packages/*` 与 `plugins/*` 里声明了 prepublishOnly 的包。 */
function declaringPackages() {
  const found = []
  for (const group of ['packages', 'plugins']) {
    const base = join(root, group)
    if (!existsSync(base)) continue
    for (const name of readdirSync(base)) {
      const manifest = join(base, name, 'package.json')
      if (!existsSync(manifest)) continue
      const scripts = JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {}
      const command = scripts.prepublishOnly
      if (typeof command !== 'string' || command.trim() === '') continue
      found.push({ packageDir: join(base, name), relative: `${group}/${name}`, command })
    }
  }
  return found
}

/** 从 `node <script> <args...>` 里取出脚本路径并按包目录解析。 */
function scriptTarget(packageDir, command) {
  const tokens = command.trim().split(/\s+/)
  assert.equal(tokens[0], 'node', `prepublishOnly 必须以 node 开头：${command}`)
  const script = tokens[1]
  assert.ok(script && !script.startsWith('-'), `prepublishOnly 缺少脚本路径：${command}`)
  return resolve(packageDir, script)
}

test('每个 prepublishOnly 声明的脚本路径都真实存在', () => {
  const declaring = declaringPackages()
  assert.ok(declaring.length > 0, '未发现任何 prepublishOnly 声明，守卫自身失效')
  const broken = declaring
    .map((entry) => ({ ...entry, target: scriptTarget(entry.packageDir, entry.command) }))
    .filter((entry) => !existsSync(entry.target))
    .map((entry) => `${entry.relative}: ${entry.command} → 缺少 ${entry.target}`)
  assert.deepEqual(broken, [], `prepublishOnly 指向不存在的脚本（全新工作树 pnpm install 会失败）：\n${broken.join('\n')}`)
})

test('dsh-ui-kit 的 prepublishOnly 指向仓库根 scripts 目录', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'packages/dsh-ui-kit/package.json'), 'utf8'))
  const target = scriptTarget(join(root, 'packages/dsh-ui-kit'), manifest.scripts.prepublishOnly)
  assert.equal(target, join(root, 'scripts/verify-publish-source.mjs'))
})
