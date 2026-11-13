/**
 * Issue #4110 — 守卫自身的失败用例（证明它不是空跑）。
 *
 * 每个用例构造一个最小仓库夹具（`plugins/<pkg>/src/...`），断言守卫：
 *   - 能抓住运行时代码里的 catch-all `kind: 'plugin'`；
 *   - 不误报注释、测试夹具、带 allow 标记的文档行；
 *   - 在真实仓库上 exit 0。
 *
 * 背景：同一个错误已经复发两次（#3742 迁移漏掉 plugins/omnimux，#4110 每轮对话失败），
 * 第一次修完没有守卫。守卫若不能失败，就还是等于没有。
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'
import { scanMessageSourceKinds } from './verify-message-source-kinds.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const SCRIPT = join(REPO_ROOT, 'scripts', 'verify-message-source-kinds.mjs')

const scratchDirs = []
after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true })
})

/** Build a throwaway repo root with exactly the given files. */
function fixtureRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-msg-source-guard-'))
  scratchDirs.push(root)
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(root, relativePath)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

function runGuard(root) {
  return spawnSync(process.execPath, [SCRIPT, root], { encoding: 'utf8' })
}

describe('verify-message-source-kinds guard (#4110)', () => {
  it('抓得住运行时代码里的 catch-all kind', () => {
    const root = fixtureRepo({
      'plugins/fake/src/injector.js': [
        'export function createMessage(text) {',
        '  return { role: "user", source: { kind: \'plugin\', plugin: \'fake\', form: \'snapshot\' } }',
        '}',
      ].join('\n'),
    })
    const result = runGuard(root)
    assert.equal(result.status, 1, 'catch-all must fail the guard')
    assert.match(result.stderr, /kind: 'plugin'/)
    assert.match(result.stderr, /#4110/)
    assert.match(result.stderr, /#3742/)
  })

  it('多行 source 里的 catch-all 同样抓得住（kind 单独一行）', () => {
    const root = fixtureRepo({
      'plugins/fake/src/injector.js': [
        'source: {',
        "  kind: 'plugin',",
        "  plugin: 'fake',",
        '}',
      ].join('\n'),
    })
    const result = runGuard(root)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /injector\.js:2/)
  })

  it('结构性问题：source 有 form/sections 却没有 kind（忘记声明）也要红', () => {
    const root = fixtureRepo({
      'plugins/fake/src/injector.js': [
        'export const message = { role: \'user\', source: {',
        "  plugin: 'fake',",
        "  form: 'snapshot',",
        "  sections: [{ name: 'x', text: 'y' }],",
        '} }',
      ].join('\n'),
    })
    const result = runGuard(root)
    assert.equal(result.status, 1, 'missing kind must fail the guard')
    assert.match(result.stderr, /\[missing-kind\]/)
    assert.match(result.stderr, /injector\.js:1/)
  })

  it('空 kind 与双引号 plugin 同样算结构性问题', () => {
    const root = fixtureRepo({
      'plugins/fake/src/empty.js': "export const m = { source: { kind: '', plugin: 'x', form: 'snapshot' } }\n",
      'plugins/fake/src/double.js': 'export const m = { source: { kind: "plugin", plugin: "x" } }\n',
    })
    const result = runGuard(root)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /\[retired-kind\].*empty\.js:1/)
    assert.match(result.stderr, /\[retired-kind\].*double\.js:1/)
  })

  it('非消息来源的 source 字面量（无 form/sections）不误报', () => {
    const root = fixtureRepo({
      'plugins/fake/src/artifact.js': "export const rec = { source: { agent: 'image_generate', channel: 'image' } }\n",
    })
    const result = runGuard(root)
    assert.equal(result.status, 0, result.stderr)
  })

  it('不误报 producer-owned 常量写法', () => {
    const root = fixtureRepo({
      'plugins/fake/src/injector.js': [
        "import { FAKE_SOURCE_KIND } from '../message-source.js'",
        'export const message = { source: { kind: FAKE_SOURCE_KIND } }',
      ].join('\n'),
      'plugins/fake/src/message-source.js': "export const FAKE_SOURCE_KIND = 'fake-context'\n",
    })
    const result = runGuard(root)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /no retired or missing message-source kind/)
  })

  it('spread 写法 { ...base, form } 的 kind 可能来自 spread —— 不误判 missing-kind', () => {
    const root = fixtureRepo({
      'plugins/fake/src/spread.js': [
        "export const make = (base) => ({ source: { ...base, form: 'snapshot', sections: [] } })",
      ].join('\n'),
    })
    const result = runGuard(root)
    assert.equal(result.status, 0, result.stderr)
  })

  it('变量间接值不在静态守卫范围（由 v4 e2e 兜底）——明确记录该边界', () => {
    const root = fixtureRepo({
      'plugins/fake/src/indirect.js': [
        "const K = 'plugin'",
        "export const m = { source: { kind: K, plugin: 'fake', form: 'snapshot' } }",
      ].join('\n'),
    })
    const result = runGuard(root)
    // 静态守卫只拦字面量；间接写法不会红 —— 这是已知边界，靠 message-source-v4.test.js 兜底。
    assert.equal(result.status, 0, result.stderr)
  })

  it('评审给出的 4 个非消息样本不得误判 missing-kind（同体必须有 plugin:）', () => {
    const root = fixtureRepo({
      'plugins/fake/src/nonmsg-flat.js': "export const a = { source: { form: 'json', sections: ['a', 'b'] } }\n",
      'plugins/fake/src/nonmsg-nested.js': "export const b = { source: { meta: { form: 'x', sections: 2 } } }\n",
      'plugins/fake/src/nonmsg-numeric.js': "export const c = { source: { form: 1, sections: 3 } }\n",
      'plugins/fake/src/nonmsg-doc.js': "export const d = { source: { form: 'markdown', sections: [{ title: 'a' }] } }\n",
    })
    const result = runGuard(root)
    assert.equal(result.status, 0, result.stderr)
  })

  it('两个真消息源（带 plugin: 缺 kind）必须 flag', () => {
    const root = fixtureRepo({
      'plugins/fake/src/msg-a.js': "export const m = { source: { plugin: 'omnimux', form: 'snapshot', sections: [] } }\n",
      'plugins/fake/src/msg-b.js': "export const n = { source: { plugin: 'omnimux-workbench', sections: [{ name: 'x', text: 'y' }] } }\n",
    })
    const result = runGuard(root)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /\[missing-kind\] plugins\/fake\/src\/msg-a\.js:1/)
    assert.match(result.stderr, /\[missing-kind\] plugins\/fake\/src\/msg-b\.js:1/)
  })

  it('同一 source 块只报 1 条（按块去重，不是按行）', () => {
    const root = fixtureRepo({
      'plugins/fake/src/block.js': [
        'export const message = { role: \'user\', source: {',
        "  kind: 'plugin',",
        "  plugin: 'fake',",
        "  form: 'snapshot',",
        '  sections: [],',
        '} }',
      ].join('\n'),
    })
    const result = runGuard(root)
    assert.equal(result.status, 1)
    const hits = (result.stderr.match(/\[retired-kind\]/g) || []).length
    assert.equal(hits, 1, `同一块应只报 1 条，实际 ${hits}\n${result.stderr}`)
  })

  it('不同 source 块各自报 1 条（不掩盖多处违规）', () => {
    const root = fixtureRepo({
      'plugins/fake/src/two.js': [
        "export const a = { source: { kind: 'plugin', plugin: 'a', form: 'snapshot' } }",
        "export const b = { source: { kind: 'plugin', plugin: 'b', form: 'snapshot' } }",
      ].join('\n'),
    })
    const result = runGuard(root)
    assert.equal(result.status, 1)
    assert.equal((result.stderr.match(/\[retired-kind\]/g) || []).length, 2)
  })

  it('不误报注释与带 allow 标记的文档行', () => {
    const root = fixtureRepo({
      'plugins/fake/src/docs.js': [
        "// 旧写法 source: { kind: 'plugin' } 已在 rc.3 被删除",
        "/* kind: 'plugin' 是 catch-all，禁止 */",
        " * kind: 'plugin'",
        "export const shownInDocs = { kind: 'plugin' } // message-source-guard: allow 文档示例",
      ].join('\n'),
    })
    const result = runGuard(root)
    assert.equal(result.status, 0, result.stderr)
  })

  it('测试夹具里的旧形状不算违规（负例需要它）', () => {
    const root = fixtureRepo({
      'plugins/fake/src/injector.test.js': "assert.equal(legacy.source.kind, 'plugin')\n",
      'plugins/fake/src/tests/fixture.js': "export const legacy = { source: { kind: 'plugin' } }\n",
    })
    const result = runGuard(root)
    assert.equal(result.status, 0, result.stderr)
  })

  it('真实仓库当前 exit 0（守卫挂在 test:gates 里）', () => {
    const scan = scanMessageSourceKinds(REPO_ROOT)
    assert.equal(scan.violations.length, 0, JSON.stringify(scan.violations, null, 2))
    assert.ok(scan.scanned > 100, `expected to scan the real source tree, got ${scan.scanned}`)
    const result = runGuard(REPO_ROOT)
    assert.equal(result.status, 0, result.stderr)
  })
})
