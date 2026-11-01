/**
 * tests/e2e/uikit-prepublish-path.e2e.test.mjs
 * `prepublishOnly` 脚本路径必须真实可解析（Issue #3883）
 *
 * 缺陷形态：`packages/dsh-ui-kit/package.json` 曾写 `node ../scripts/...`，
 * 从 `packages/dsh-ui-kit` 解析到不存在的 `packages/scripts/`，导致
 * `corepack pnpm build` 在 prepublishOnly 阶段 MODULE_NOT_FOUND，
 * 进而让 `sync-to-app.sh` 的 kit 构建门禁永远失败、每次物化都被拦。
 *
 * 这条测试遍历全仓 packages/ 与 plugins/ 的同类钩子，逐个把引用路径
 * resolve 到真实文件，因此任何一处写错深度都会红。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')

/** 收集 packages/* 与 plugins/* 的 package.json。 */
function manifestPaths() {
  const out = []
  for (const group of ['packages', 'plugins']) {
    const dir = path.join(root, group)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name, 'package.json')
      if (fs.existsSync(file)) out.push({ group, name, file, dir: path.join(dir, name) })
    }
  }
  return out
}

/** 从一条 npm script 里取出 verify-publish-source.mjs 的相对引用。 */
function publishSourceRef(script) {
  const match = /node\s+(\S+verify-publish-source\.mjs)/.exec(String(script ?? ''))
  return match ? match[1] : ''
}

test('E2E 契约一：每处 prepublishOnly 的脚本引用都能解析到真实文件 (AC-1, AC-2)', () => {
  const manifests = manifestPaths()
  const hooks = []
  for (const manifest of manifests) {
    const pkg = JSON.parse(fs.readFileSync(manifest.file, 'utf8'))
    for (const [scriptName, script] of Object.entries(pkg.scripts ?? {})) {
      const ref = publishSourceRef(script)
      if (ref === '') continue
      hooks.push({ ...manifest, scriptName, ref })
    }
  }

  assert.ok(hooks.length > 0, '至少应有一处 verify-publish-source 钩子')

  const broken = hooks.filter((hook) => !fs.existsSync(path.resolve(hook.dir, hook.ref)))
  assert.deepEqual(
    broken.map((hook) => `${hook.group}/${hook.name} -> ${hook.ref}`),
    [],
    '所有 prepublishOnly 引用都必须指向真实存在的脚本',
  )
})

test('E2E 契约二：dsh-ui-kit 的钩子用 ../../scripts/ 而不是 ../scripts/ (AC-2)', () => {
  const file = path.join(root, 'packages/dsh-ui-kit/package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  const ref = publishSourceRef(pkg.scripts?.prepublishOnly)

  assert.equal(ref, '../../scripts/verify-publish-source.mjs', 'dsh-ui-kit 必须与插件侧同一深度约定')
  assert.ok(
    fs.existsSync(path.resolve(path.dirname(file), ref)),
    '解析结果必须是仓库根的 scripts/verify-publish-source.mjs',
  )
  // 旧的错误写法会把路径指到不存在的 packages/scripts/。
  assert.equal(
    fs.existsSync(path.resolve(path.dirname(file), '../scripts/verify-publish-source.mjs')),
    false,
    'packages/scripts/ 不存在——这正是修复前失败的原因',
  )
})

test('E2E 契约三：packages/ 与 plugins/ 的钩子深度一致 (AC-3)', () => {
  const refs = new Map()
  for (const manifest of manifestPaths()) {
    const pkg = JSON.parse(fs.readFileSync(manifest.file, 'utf8'))
    const ref = publishSourceRef(pkg.scripts?.prepublishOnly)
    if (ref === '') continue
    if (!refs.has(ref)) refs.set(ref, [])
    refs.get(ref).push(`${manifest.group}/${manifest.name}`)
  }

  // 两类目录深度相同，因此正确的引用只有一种写法。
  assert.deepEqual(
    [...refs.keys()],
    ['../../scripts/verify-publish-source.mjs'],
    `所有钩子应共用同一引用，实际：${[...refs.keys()].join(', ')}`,
  )
  assert.ok(refs.get('../../scripts/verify-publish-source.mjs').length >= 20, '覆盖 packages/ 与 plugins/ 两侧')
})
