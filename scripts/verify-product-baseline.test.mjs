/**
 * scripts/verify-product-baseline.test.mjs
 * 产品基线门禁的断言测试：正例必须红灯，允许的本机用法必须不报（防误报回归）。
 *
 * Contract: docs/contracts/product-baseline.md
 * Spec:     specs/product-baseline-guard.spec.md
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import {
  isRuntimeSource,
  scanContent,
  evaluate,
  loadAllowlist,
  main,
  handle,
  RULES,
  ALLOWLIST_FILENAME,
} from './verify-product-baseline.mjs'

/* ------------------------------------------------------------------ helpers */

const RUNTIME_FILE = 'plugins/omnimux-demo/src/tool.js'

function rulesOf(rel, content) {
  return scanContent(rel, content).map((h) => h.rule)
}

function fixtureRepo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'product-baseline-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'omnimux-dsh' }))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  return root
}

/* ------------------------------------------------------------------ 范围 */

test('扫描范围：只判产品运行时代码', () => {
  assert.equal(isRuntimeSource('plugins/omnimux-demo/src/tool.js'), true)
  assert.equal(isRuntimeSource('plugins/omnimux-demo/extension/src/panel/App.tsx'), true)
  assert.equal(isRuntimeSource('packages/kit/src/index.ts'), true)

  assert.equal(isRuntimeSource('plugins/omnimux-demo/src/tool.test.js'), false, '测试文件不判')
  assert.equal(isRuntimeSource('plugins/omnimux-demo/src/tool.spec.ts'), false, 'spec 文件不判')
  assert.equal(isRuntimeSource('plugins/omnimux-demo/tests/e2e/flow.spec.js'), false, 'e2e 目录不判')
  assert.equal(isRuntimeSource('plugins/omnimux-demo/src/fixtures/sample.js'), false, '夹具不判')
  assert.equal(isRuntimeSource('plugins/omnimux-market/lib/local-api.js'), false, '构建产物不判')
  assert.equal(isRuntimeSource('plugins/omnimux-clip/src/client/openreel/web/config/api-endpoints.ts'), false, 'vendor 不判')
  assert.equal(isRuntimeSource('scripts/verify-product-baseline.mjs'), false, '脚本目录不判')
  assert.equal(isRuntimeSource('plugins/omnimux-demo/README.md'), false, '非源码不判')
})

/* ------------------------------------------------------------------ R1 */

test('R1 正例：开发版身份出现在运行时代码 → 红灯', () => {
  const content = "const p = join(homedir(), '.omnimux-dev', 'settings.yaml')\n"
  assert.ok(rulesOf(RUNTIME_FILE, content).includes('R1'))
})

test('R1 正例：开发版实例标识出现在运行时代码 → 红灯', () => {
  const content = "export const PRESETS = [{ id: 'omnimux-dev', port: 45120, isRecommended: true }]\n"
  assert.ok(rulesOf(RUNTIME_FILE, content).includes('R1'))
})

test('R1 反例：同样的内容在测试文件里 → 不报', () => {
  assert.deepEqual(scanContent('plugins/omnimux-demo/src/tool.test.js', "const p = '~/.omnimux-dev'\n"), [])
})

/* ------------------------------------------------------------------ R2 */

test('R2 正例：业务插件同时读本机配置并含 provider 选择 → 红灯', () => {
  const content = [
    "const candidates = [join(homedir(), '.dsh', 'settings.yaml')]",
    'const providers = doc?.["llm-pi-ai"]?.providers',
    '',
  ].join('\n')
  assert.ok(rulesOf(RUNTIME_FILE, content).includes('R2'))
})

test('R2 反例：中枢自身解析凭据 → 不报（hub.md 是凭据的合法持有者）', () => {
  const content = [
    "const candidates = [join(home, '.credentials.yaml')]",
    'const providers = config.providers',
    '',
  ].join('\n')
  assert.deepEqual(scanContent('plugins/omnimux/src/text/chat.js', content), [])
})

test('R2 反例：注释里提到文件名 → 不报（避免文档说明被当成违规）', () => {
  const content = [
    ' * 凭据来自 `OMNIMUX_API_KEY` 或 `$DSH_HOME/.credentials.yaml`',
    'export const providers = []',
    '',
  ].join('\n')
  assert.deepEqual(rulesOf(RUNTIME_FILE, content), [])
})

/* ------------------------------------------------------------------ R3 */

test('R3 正例：回环地址被当成模型端点 → 红灯', () => {
  const content = "const provider = { baseURL: 'http://127.0.0.1:8317/v1', apiKeyEnv: 'CPA_API_KEY' }\n"
  assert.ok(rulesOf(RUNTIME_FILE, content).includes('R3'))
})

test('R3 反例：回环只用作 URL 解析基准 / 同源写保护 → 不报', () => {
  const content = [
    "const url = new URL(req.url || '/', 'http://127.0.0.1')",
    "const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])",
    '',
  ].join('\n')
  assert.ok(!rulesOf(RUNTIME_FILE, content).includes('R3'))
})

test('R3 反例：浏览器插件与本机宿主之间的桥地址 → 不报', () => {
  const content = "export const wsUrl = `ws://127.0.0.1:${port}/ext/bridge`\n"
  assert.ok(!rulesOf(RUNTIME_FILE, content).includes('R3'))
})

/* ------------------------------------------------------------------ R4 */

test('R4 正例：业务插件读第三方 provider 密钥 → 红灯', () => {
  const content = "const key = process.env.CPA_API_KEY\n"
  assert.ok(rulesOf(RUNTIME_FILE, content).includes('R4'))
})

test('R4 反例：中枢凭据与宿主环境变量 → 不报', () => {
  const content = 'const a = process.env.OMNIMUX_API_KEY\nconst b = process.env.DSH_HOME\n'
  assert.deepEqual(scanContent(RUNTIME_FILE, content), [])
})

/* ------------------------------------------------------------------ R5 */

test('R5 正例：开发机绝对路径进入运行时代码 → 红灯', () => {
  const content = "const candidates = [join('/Users/x/Desktop/Project/OPC/资产库/skills', slug)]\n"
  assert.ok(rulesOf(RUNTIME_FILE, content).includes('R5'))
})

test('R5 正例：开发机检出路径（~ 形态）→ 红灯', () => {
  const content = "defaultPath: '~/Desktop/Project/dsh-plugin/product/omnimux-dsh'\n"
  assert.ok(rulesOf(RUNTIME_FILE, content).includes('R5'))
})

test('R5 反例：用户自己的桌面文件示例路径 → 不报', () => {
  const content = ' * 本地路径导入（agent 引用 ~/Desktop/a.jpg 一类产物路径）\n'
  assert.ok(!rulesOf(RUNTIME_FILE, content).includes('R5'))
})

/* ------------------------------------------------------------------ R6 */

test('R6 正例：随产品分发的 JSON 含开发机路径 → 红灯', () => {
  const asset = 'plugins/omnimux/assets/demo/cards.json'
  const content = '{\n  "localPath": "/Users/x/Desktop/Project/OPC/资产库/skills/a"\n}\n'
  assert.ok(rulesOf(asset, content).includes('R6'))
})

test('R6 正例：家目录下的绝对路径（非 Desktop）同样红灯', () => {
  const asset = 'plugins/omnimux/assets/demo/cards.json'
  assert.ok(rulesOf(asset, '{"sourcePath":"/Users/x/.dsh/plugins/images/a.png"}\n').includes('R6'))
})

test('R6 反例：测试、夹具、docs 下的 JSON → 不报', () => {
  const content = '{"localPath":"/Users/x/Desktop/Project/OPC/资产库/skills/a"}\n'
  for (const rel of [
    'plugins/omnimux/src/tests/fixture.json',
    'plugins/omnimux/src/fixtures/sample.json',
    'plugins/omnimux/docs/report.json',
    'scripts/product-baseline-allowlist.json',
  ]) {
    assert.deepEqual(scanContent(rel, content), [], `${rel} 不应被判定`)
  }
})

test('R6 反例：相对路径与产品目录 → 不报', () => {
  const asset = 'plugins/omnimux/assets/demo/cards.json'
  assert.deepEqual(scanContent(asset, '{"assets/imported/a.png":1}\n'), [])
})

test('R6 覆盖：构建配置（tsconfig）与运行时代码同受约束', () => {
  const ts = 'plugins/omnimux-apps/tsconfig.json'
  assert.ok(rulesOf(ts, '{"typeRoots":["/Users/x/repo/node_modules/@types"]}\n').includes('R6'))
})

/* ------------------------------------------------------------------ 豁免 */

test('豁免：命中被抑制，且记录在 allowed 中', () => {
  const files = [{ rel: RUNTIME_FILE, content: "const x = '~/.omnimux-dev'\n" }]
  const allowlist = { entries: [{ rule: 'R1', path: RUNTIME_FILE, reason: '存量，第二步修复（Issue #2129）' }], errors: [] }
  const result = evaluate(files, allowlist)
  assert.equal(result.violations.length, 0)
  assert.equal(result.allowed.length, 1)
  assert.equal(result.staleEntries.length, 0)
})

test('豁免：僵尸条目被识别（匹配不到任何位置）', () => {
  const files = [{ rel: RUNTIME_FILE, content: 'export const ok = 1\n' }]
  const allowlist = { entries: [{ rule: 'R1', path: RUNTIME_FILE, reason: '已经修好了但忘了删' }], errors: [] }
  const result = evaluate(files, allowlist)
  assert.equal(result.violations.length, 0)
  assert.equal(result.staleEntries.length, 1)
})

test('豁免：缺少理由的条目被拒绝（无理由豁免不予接受）', () => {
  for (const bad of [
    { rule: 'R1', path: RUNTIME_FILE },
    { rule: 'R1', path: RUNTIME_FILE, reason: '短' },
    { rule: 'R9', path: RUNTIME_FILE, reason: '规则名不存在也不接受' },
    { rule: 'R1', reason: '没有 path 也不接受' },
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

test('豁免：列表文件不是合法 JSON → 配置错误退出码 2', () => {
  const root = fixtureRepo({ [ALLOWLIST_FILENAME]: '{ not json' })
  try {
    const { errors } = loadAllowlist(root)
    assert.equal(errors.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/* ------------------------------------------------------------------ hook */

test('hook：写入违规运行时代码 → deny，附规则与理由', () => {
  const root = fixtureRepo({})
  try {
    const input = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'write',
      cwd: root,
      tool_input: {
        file_path: join(root, RUNTIME_FILE),
        content: "const p = join(homedir(), '.omnimux-dev', 'settings.yaml')\n",
      },
    })
    const out = handle(input)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /R1/)
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /product-baseline/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('hook：写入合规代码 / 非运行时代码 / 非写入工具 → allow', () => {
  const root = fixtureRepo({})
  try {
    const base = { hook_event_name: 'PreToolUse', cwd: root }
    const okCases = [
      { tool_name: 'write', tool_input: { file_path: join(root, RUNTIME_FILE), content: 'export const a = 1\n' } },
      { tool_name: 'write', tool_input: { file_path: join(root, 'docs/x.md'), content: "const p = '~/.omnimux-dev'\n" } },
      { tool_name: 'bash', tool_input: { command: 'ls' } },
    ]
    for (const c of okCases) {
      assert.equal(handle(JSON.stringify({ ...base, ...c })).hookSpecificOutput.permissionDecision, 'allow')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/* ------------------------------------------------------------------ 集成 */

test('集成：在真实仓库上全仓扫描通过（规则与豁免清单一致）', () => {
  const root = process.cwd()
  const result = spawnSync(process.execPath, ['scripts/verify-product-baseline.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `门禁应为绿：\n${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /verify-product-baseline/)
})

test('集成：规则表与标签齐全（新增规则必须同步标签与文档）', () => {
  assert.deepEqual(Object.keys(RULES), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'])
})

test('集成：main() 在仓库上返回 0', () => {
  assert.equal(typeof main, 'function')
})
