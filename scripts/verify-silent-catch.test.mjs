/**
 * scripts/verify-silent-catch.test.mjs
 * 静默吞错存量扫描门禁的断言测试：真吞错必须命中，合法写法必须不报（防误报回归）。
 *
 * 规格：specs/silent-catch-gate-3233.spec.md
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  isScannableSource,
  pluginOf,
  maskSource,
  findCatchClauses,
  scanContent,
  evaluate,
  loadAllowlist,
  main,
  RULES,
  DEFINITE_RULES,
  ALLOWLIST_FILENAME,
  CALIBER_NOTE,
  SCOPE_NOTE,
} from './verify-silent-catch.mjs'

/* ------------------------------------------------------------------ helpers */

const SCRIPT = fileURLToPath(new URL('./verify-silent-catch.mjs', import.meta.url))
const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

const SRC_FILE = 'plugins/omnimux-demo/src/tool.js'

function rulesOf(rel, content) {
  return scanContent(rel, content).map((h) => h.rule)
}

function firstRule(rel, content) {
  const hits = scanContent(rel, content)
  return hits.length > 0 ? hits[0].rule : null
}

function fixtureRepo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'silent-catch-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'omnimux-dsh' }))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  return root
}

function runScanner(cwd, args = []) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}

/* ------------------------------------------------------------------ 范围（A1/A2/A3） */

test('范围：只扫 plugins/<name>/src/** 的源码扩展名', () => {
  for (const rel of [
    'plugins/omnimux-demo/src/tool.js',
    'plugins/omnimux-demo/src/deep/nested/panel.tsx',
    'plugins/omnimux-demo/src/a.mjs',
    'plugins/omnimux-demo/src/a.cjs',
    'plugins/omnimux-demo/src/a.ts',
    'plugins/omnimux-demo/src/a.jsx',
  ]) {
    assert.equal(isScannableSource(rel), true, `${rel} 应在扫描范围内`)
  }
})

test('范围：Markdown / YAML / JSON 等文档与配置不扫（A3）', () => {
  for (const rel of [
    'plugins/omnimux-demo/src/README.md',
    'plugins/omnimux-demo/src/config.yaml',
    'plugins/omnimux-demo/src/data.json',
    'docs/report.md',
    'scripts/verify-silent-catch.mjs',
    'packages/kit/src/index.ts',
  ]) {
    assert.equal(isScannableSource(rel), false, `${rel} 不应在扫描范围内`)
  }
})

test('范围：排除 node_modules、lib、测试与夹具（A2）', () => {
  for (const rel of [
    'plugins/omnimux-demo/src/node_modules/pkg/a.js',
    'plugins/omnimux-demo/lib/a.js',
    'plugins/omnimux-demo/src/tests/a.js',
    'plugins/omnimux-demo/src/fixtures/a.js',
    'plugins/omnimux-demo/src/__tests__/a.js',
    'plugins/omnimux-demo/src/e2e/a.js',
    'plugins/omnimux-demo/src/tool.test.js',
    'plugins/omnimux-demo/src/tool.spec.ts',
    'plugins/omnimux-demo/src/test-helper.js',
  ]) {
    assert.equal(isScannableSource(rel), false, `${rel} 应被排除`)
  }
})

test('范围：随包第三方编辑器目录被排除（A2）', () => {
  assert.equal(
    isScannableSource('plugins/omnimux-clip/src/client/openreel/web/config/api-endpoints.ts'),
    false,
  )
  assert.equal(isScannableSource('plugins/omnimux-clip/src/client/other/a.ts'), true)
})

test('范围：非源码文件即使内容含吞错也不命中', () => {
  assert.deepEqual(scanContent('plugins/omnimux-demo/src/README.md', 'try {} catch {}\n'), [])
})

test('pluginOf：取出插件名', () => {
  assert.equal(pluginOf('plugins/omnimux-market/src/a.js'), 'omnimux-market')
  assert.equal(pluginOf('scripts/a.mjs'), '')
})

/* ------------------------------------------------------------------ 词法遮罩 */

test('遮罩：注释与字符串被替换成空格，且长度与换行保持不变', () => {
  const src = ['const a = "try {} catch {}" // try {} catch {}', '/* try {} catch {} */', 'const b = 1'].join('\n')
  const masked = maskSource(src)
  assert.equal(masked.length, src.length, '长度必须一致（便于把下标映射回原文件）')
  assert.equal(masked.split('\n').length, src.split('\n').length, '换行必须保留')
  assert.ok(!masked.includes('catch'), '注释与字符串里的 catch 必须被遮掉')
})

test('遮罩：正则字面量里的花括号与引号不破坏结构', () => {
  // 第一行含引号字符类（\u0027 即单引号），第二行含转义斜杠
  const src = ['const re = /["\u0027]{2}/g', 'const q = /a\\/b/', 'try { x() } catch {}'].join('\n')
  const masked = maskSource(src)
  const clauses = findCatchClauses(masked)
  assert.equal(clauses.length, 1, '正则字面量不应干扰 catch 子句识别')
})

/* ------------------------------------------------------------------ 检测（核心） */

test('SC1 确证：空 catch（单行与跨行）都命中', () => {
  assert.equal(firstRule(SRC_FILE, 'try { x() } catch {}\n'), 'SC1')
  assert.equal(firstRule(SRC_FILE, 'try {\n  x()\n} catch {\n}\n'), 'SC1')
  assert.equal(firstRule(SRC_FILE, 'try { x() } catch (e) {}\n'), 'SC1', '带括号空 catch 同样命中')
})

test('SC1：行号指向 catch 关键字所在行', () => {
  const content = ['const a = 1', '', 'try {', '  x()', '} catch {}', ''].join('\n')
  const hits = scanContent(SRC_FILE, content)
  assert.equal(hits.length, 1)
  assert.equal(hits[0].line, 5)
})

test('SC2 确证：catch 体内只有注释、没有可执行语句', () => {
  assert.equal(firstRule(SRC_FILE, 'try { x() } catch { /* ignore */ }\n'), 'SC2')
  assert.equal(firstRule(SRC_FILE, 'try {\n  x()\n} catch {\n  // ignore\n}\n'), 'SC2')
  assert.equal(firstRule(SRC_FILE, 'try { x() } catch { /* a */ /* b */ }\n'), 'SC2')
})

test('SC3 疑似：catch 体内有语句但不抛、不记、不上报', () => {
  assert.equal(firstRule(SRC_FILE, 'try { x() } catch { return null }\n'), 'SC3')
  assert.equal(firstRule(SRC_FILE, 'try { x() } catch (e) { data = null }\n'), 'SC3')
  assert.equal(firstRule(SRC_FILE, 'try { x() } catch { continue }\n'), 'SC3')
})

test('不报：catch 体内抛错 / 记日志 / 上报 / 交给回调', () => {
  for (const body of [
    'throw e',
    'throw new Error("boom")',
    'console.error(e)',
    'console.warn("fallback", e)',
    'logger.warn(e)',
    'log.error(e)',
    'reportError(e)',
    'telemetry.track(e)',
    'notify(e)',
    'toast(e)',
    'showError(e)',
    'handleError(e)',
    'onError(e)',
    'fail(e)',
    'reject(e)',
    'next(e)',
    'callback(e)',
    'cb(e)',
    'bus.emit("failed", e)',
    'process.emitWarning(e)',
  ]) {
    const content = `try { x() } catch (e) { ${body} }\n`
    assert.deepEqual(rulesOf(SRC_FILE, content), [], `不应报：${body}`)
  }
})

test('不报：字符串里的 throw / console 不算痕迹（遮罩生效）', () => {
  const content = 'try { x() } catch { const s = "throw e"; return s }\n'
  assert.equal(firstRule(SRC_FILE, content), 'SC3', '字符串内容不得被当成痕迹')
})

test('不报：Promise 的 .catch(...) 不是 catch 子句', () => {
  for (const content of [
    'p.catch(() => {})\n',
    'p.catch(function () { return null })\n',
    'await p.catch((e) => { return null })\n',
  ]) {
    assert.deepEqual(rulesOf(SRC_FILE, content), [], `不应报：${content.trim()}`)
  }
})

test('不报：class / object 里名为 catch 的方法', () => {
  assert.deepEqual(rulesOf(SRC_FILE, 'class X { foo() {} catch() { return null } }\n'), [])
  assert.deepEqual(rulesOf(SRC_FILE, 'const o = { catch() { return null } }\n'), [])
})

test('不报：注释与字符串里的 catch {}', () => {
  assert.deepEqual(rulesOf(SRC_FILE, '// try {} catch {}\n'), [])
  assert.deepEqual(rulesOf(SRC_FILE, '/* try {} catch {} */\n'), [])
  assert.deepEqual(rulesOf(SRC_FILE, 'const s = `try {} catch {}`\n'), [])
})

test('嵌套：catch 体内的 try/catch 同样计入存量', () => {
  const content = ['try {', '  a()', '} catch {', '  try { b() } catch {}', '}', ''].join('\n')
  const hits = scanContent(SRC_FILE, content)
  assert.equal(hits.length, 2, '外层与嵌套的吞错都要报')
  assert.deepEqual(hits.map((h) => h.line), [3, 4])
})

test('单行口径标记：跨行 catch 的 singleLine 为 false', () => {
  const single = scanContent(SRC_FILE, 'try { x() } catch {}\n')[0]
  const multi = scanContent(SRC_FILE, 'try {\n x()\n} catch {\n}\n')[0]
  assert.equal(single.singleLine, true)
  assert.equal(multi.singleLine, false)
})

test('绑定形态：区分 catch {} 与 catch (e) {}', () => {
  const files = [
    { rel: SRC_FILE, content: 'try { x() } catch {}\n' },
    { rel: 'plugins/omnimux-demo/src/b.js', content: 'try { x() } catch (e) {}\n' },
  ]
  const result = evaluate(files, { entries: [], errors: [] })
  assert.equal(result.byBinding.withoutBinding, 1)
  assert.equal(result.byBinding.withBinding, 1)
})

test('口径与范围说明是常量，便于报告与测试共用', () => {
  assert.match(SCOPE_NOTE, /plugins\/\*\/src/)
  assert.match(CALIBER_NOTE, /SC1/)
  assert.deepEqual(Object.keys(RULES), ['SC1', 'SC2', 'SC3'])
  assert.deepEqual([...DEFINITE_RULES], ['SC1', 'SC2'])
})

/* ------------------------------------------------------------------ 豁免（A8/A9） */

test('豁免：命中被抑制，且记录在 allowed 中', () => {
  const files = [{ rel: SRC_FILE, content: 'try { x() } catch {}\n' }]
  const allowlist = { entries: [{ rule: 'SC1', path: SRC_FILE, line: 1, reason: 'JSON.parse 试探式解析，属合法空 catch' }], errors: [] }
  const result = evaluate(files, allowlist)
  assert.equal(result.violations.length, 0)
  assert.equal(result.allowed.length, 1)
  assert.equal(result.staleEntries.length, 0)
  assert.equal(result.byRule.SC1, 1, '统计口径仍按原始命中计数')
})

test('豁免：未登记的命中进入 violations', () => {
  const files = [{ rel: SRC_FILE, content: 'try { x() } catch {}\n' }]
  const result = evaluate(files, { entries: [], errors: [] })
  assert.equal(result.violations.length, 1)
  assert.equal(result.violations[0].rule, 'SC1')
  assert.equal(result.violations[0].path, SRC_FILE)
  assert.equal(result.violations[0].line, 1)
})

test('A9 僵尸豁免：代码已修好时条目匹配不到，必须报出来', () => {
  const files = [{ rel: SRC_FILE, content: 'try { x() } catch (e) { logger.warn(e) }\n' }]
  const allowlist = {
    entries: [{ rule: 'SC1', path: SRC_FILE, line: 1, reason: '这里曾经是空 catch，现已补上日志' }],
    errors: [],
  }
  const result = evaluate(files, allowlist)
  assert.equal(result.violations.length, 0)
  assert.equal(result.allowed.length, 0)
  assert.equal(result.staleEntries.length, 1, '修好后必须报僵尸豁免')
})

test('A9 僵尸豁免：行号漂移后条目失效（条目只能减少）', () => {
  const files = [{ rel: SRC_FILE, content: 'const a = 1\ntry { x() } catch {}\n' }]
  const allowlist = {
    entries: [{ rule: 'SC1', path: SRC_FILE, line: 1, reason: '这里曾经是空 catch，现已下移一行' }],
    errors: [],
  }
  assert.equal(evaluate(files, allowlist).staleEntries.length, 1)
})

test('A8 结构：缺少理由 / 理由过短 / 规则名非法 / 缺行号 / 缺路径都被拒绝', () => {
  for (const bad of [
    { rule: 'SC1', path: SRC_FILE, line: 1 },
    { rule: 'SC1', path: SRC_FILE, line: 1, reason: '短' },
    { rule: 'SC9', path: SRC_FILE, line: 1, reason: '规则名不存在也不接受' },
    { rule: 'SC1', path: SRC_FILE, reason: '没有行号就无法判定僵尸条目' },
    { rule: 'SC1', line: 1, reason: '没有 path 也不接受' },
    { rule: 'SC1', path: SRC_FILE, line: 0, reason: '行号必须是正整数' },
  ]) {
    const root = fixtureRepo({ [ALLOWLIST_FILENAME]: JSON.stringify({ entries: [bad] }) })
    try {
      const { errors } = loadAllowlist(root)
      assert.ok(errors.length > 0, `应拒绝：${JSON.stringify(bad)}`)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('A8 结构：合法的 {rule,path,line,reason} 被接受', () => {
  const root = fixtureRepo({
    [ALLOWLIST_FILENAME]: JSON.stringify({
      entries: [{ rule: 'SC1', path: SRC_FILE, line: 12, reason: '探测式 JSON.parse，解析失败即走默认值' }],
    }),
  })
  try {
    const { entries, errors } = loadAllowlist(root)
    assert.deepEqual(errors, [])
    assert.equal(entries.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('豁免：清单不是合法 JSON → 配置错误', () => {
  const root = fixtureRepo({ [ALLOWLIST_FILENAME]: '{ not json' })
  try {
    assert.equal(loadAllowlist(root).errors.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('豁免：清单文件不存在时不报错（默认空清单）', () => {
  const root = fixtureRepo({})
  try {
    const { entries, errors } = loadAllowlist(root)
    assert.deepEqual(entries, [])
    assert.deepEqual(errors, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/* ------------------------------------------------------------------ 退出码（A5/A9） */

test('A5 告警档：发现存量吞错仍以成功状态退出', () => {
  const root = fixtureRepo({
    'plugins/omnimux-demo/src/tool.js': 'export function f() {\n  try { x() } catch {}\n}\n',
  })
  try {
    const r = runScanner(root)
    assert.equal(r.status, 0, `告警档必须退出 0，实际 ${r.status}\n${r.stdout}\n${r.stderr}`)
    assert.match(r.stdout, /告警档/)
    assert.match(r.stdout, /SC1/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('A9 僵尸豁免：以失败状态退出并要求删除条目', () => {
  const root = fixtureRepo({
    'plugins/omnimux-demo/src/tool.js': 'export function f() {\n  try { x() } catch (e) { logger.warn(e) }\n}\n',
    [ALLOWLIST_FILENAME]: JSON.stringify({
      entries: [{ rule: 'SC1', path: 'plugins/omnimux-demo/src/tool.js', line: 2, reason: '这里曾经是空 catch，现已补上日志' }],
    }),
  })
  try {
    const r = runScanner(root)
    assert.equal(r.status, 1, `僵尸豁免必须退出 1，实际 ${r.status}\n${r.stdout}`)
    assert.match(r.stdout, /僵尸豁免/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('配置错误：豁免清单非法 → 退出码 2', () => {
  const root = fixtureRepo({ [ALLOWLIST_FILENAME]: '{ not json' })
  try {
    assert.equal(runScanner(root).status, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('新用户基线：缺少 plugins/ 目录时成功退出并说明未扫描（不谎报 PASS）', () => {
  const root = fixtureRepo({})
  try {
    const r = runScanner(root)
    assert.equal(r.status, 0)
    assert.match(r.stdout, /未扫描/)
    assert.ok(!/✅/.test(r.stdout), '未扫描时不得给出通过标记')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--json：机器可读输出含口径、统计与清单', () => {
  const root = fixtureRepo({
    'plugins/omnimux-demo/src/tool.js': 'export function f() {\n  try { x() } catch {}\n}\n',
  })
  try {
    const r = runScanner(root, ['--json'])
    assert.equal(r.status, 0)
    const doc = JSON.parse(r.stdout)
    assert.equal(doc.scanned, 1)
    assert.equal(doc.total, 1)
    assert.equal(doc.byRule.SC1, 1)
    assert.equal(doc.byPlugin['omnimux-demo'], 1)
    assert.equal(doc.violations.length, 1)
    assert.equal(doc.violations[0].path, 'plugins/omnimux-demo/src/tool.js')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--json：缺少 plugins/ 目录时如实报告未扫描', () => {
  const root = fixtureRepo({})
  try {
    const doc = JSON.parse(runScanner(root, ['--json']).stdout)
    assert.equal(doc.scanned, 0)
    assert.equal(doc.total, 0)
    assert.ok(doc.skipped)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/* ------------------------------------------------------------------ 真实代码库（A6） */

test('A6 真库冒烟：对真实代码库跑出清单，且告警档退出 0', () => {
  const r = runScanner(REPO_ROOT, ['--quiet'])
  assert.equal(r.status, 0, `真实仓库扫描必须退出 0\n${r.stderr}`)
  const scanned = Number((r.stdout.match(/扫描 (\d+) 个文件/) || [])[1])
  const total = Number((r.stdout.match(/命中 (\d+) 处/) || [])[1])
  assert.ok(scanned > 100, `真实仓库应有大量待扫描文件，实际 ${scanned}`)
  assert.ok(total > 0, '真实仓库应能跑出存量吞错清单')
  assert.ok(/SC1 空 catch \d+ 处/.test(r.stdout), '报告应给出分规则统计')
})

test('A6 真库冒烟：main() 与子进程结论一致', () => {
  const saved = process.cwd()
  process.chdir(REPO_ROOT)
  try {
    assert.equal(main(['--quiet']), 0, 'main() 在告警档必须返回 0')
  } finally {
    process.chdir(saved)
  }
})

/* ------------------------------------------------------------------ 反黑名单（A10） */

test('A10 数据源是静态分析：扫描器自身不读取任何界面黑名单文件', async () => {
  const { readFileSync } = await import('node:fs')
  const self = readFileSync(SCRIPT, 'utf8')
  for (const banned of ['LEGACY_', 'HIDDEN_', 'EXCLUDED_', 'BANNED_']) {
    assert.ok(!self.includes(banned), `扫描器不得依赖黑名单常量 ${banned}`)
  }
})
