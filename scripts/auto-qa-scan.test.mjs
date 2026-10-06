import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXTENSION_CONNECT_SRC_ALLOWED_HOSTS,
  connectSrcHost,
  extensionOutboundViolations,
  hasEncodedCredential,
  isAllowedExtensionHost,
  isExtensionManifestPath,
  securityFindings,
  securityViolations,
  staticScan,
} from './auto-qa-scan.mjs'
import {
  changedFilesFromGit,
  createReport,
  findFiles,
  isExtensionManifestFile,
  isScannableSourceFile,
  parseArgs,
  runGate,
} from './auto-qa-gate.mjs'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const CHROME_MANIFEST = 'plugins/omnimux-browser/extension/manifest.json'
const SOURCE_FILE = 'plugins/omnimux-browser/extension/src/background/index.ts'

// 一律使用自造假密钥，禁止在测试里写入任何真实凭据。
const FAKE_KEY = `sk-test${'0'.repeat(24)}`
const FAKE_BEARER = `Bearer ${FAKE_KEY}`
const base64 = (text) => Buffer.from(text, 'utf8').toString('base64')
const base64url = (text) => Buffer.from(text, 'utf8').toString('base64url')

function manifestWith(value) {
  return JSON.stringify({ manifest_version: 3, content_security_policy: value }, null, 2)
}

describe('auto-qa-scan：明文凭据规则（既有行为不得回归）', () => {
  it('命中硬编码的 sk- 明文密钥', () => {
    const violations = securityViolations(SOURCE_FILE, `const key = '${FAKE_KEY}'`)
    assert.deepEqual(violations, ['检测到疑似硬编码敏感凭据。'])
  })

  it('放过不含凭据特征的普通源码', () => {
    assert.deepEqual(securityViolations(SOURCE_FILE, 'export const version = "0.1.4"'), [])
  })
})

describe('auto-qa-scan：R1 base64 承载的凭据', () => {
  it('命中 atob 承载的 Bearer 密钥', () => {
    const source = `Authorization: atob('${base64(FAKE_BEARER)}')`
    assert.equal(hasEncodedCredential(source), true)
    assert.deepEqual(securityViolations(SOURCE_FILE, source), [
      '检测到 base64 承载的硬编码凭据（解码后命中密钥特征）。',
    ])
  })

  it('命中 Buffer.from base64 与 base64url 承载的密钥', () => {
    for (const literal of [base64(FAKE_BEARER), base64url(FAKE_BEARER)]) {
      const encoding = literal === base64(FAKE_BEARER) ? 'base64' : 'base64url'
      const source = `const token = Buffer.from('${literal}', '${encoding}')`
      assert.equal(hasEncodedCredential(source), true, `${encoding} 承载的密钥必须命中`)
      assert.deepEqual(securityViolations(SOURCE_FILE, source), [
        '检测到 base64 承载的硬编码凭据（解码后命中密钥特征）。',
      ])
    }
  })

  it('命中 Buffer.from 里大写 base64 与双引号写法', () => {
    const source = `Buffer.from("${base64(FAKE_BEARER)}", "base64")`
    assert.equal(hasEncodedCredential(source), true)
  })

  it('不误报：图片 data 与普通文案的 base64 不是凭据', () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const fixtures = [
      `const avatar = atob('${png}')`,
      `const csv = Buffer.from('${base64('name,count\\nalpha,1\\nbeta,2')}', 'base64')`,
      `const note = atob('${base64('本机服务已就绪，无需外部模型直连。')}')`,
      `const plain = atob('${base64('sk-short')}')`,
    ]
    for (const source of fixtures) {
      assert.equal(hasEncodedCredential(source), false, `不应命中：${source}`)
      assert.deepEqual(securityViolations(SOURCE_FILE, source), [])
    }
  })

  it('源码路径不套用清单规则：非 JSON 源码不会因清单解析失败而误报', () => {
    assert.deepEqual(securityViolations(SOURCE_FILE, '{ not json'), [])
  })
})

describe('auto-qa-scan：R2 扩展联网出口白名单', () => {
  it('命中 manifest 里放行的外部模型主机（字符串形式 connect-src）', () => {
    const text = manifestWith({
      extension_pages: "script-src 'self'; object-src 'self'; connect-src ws://127.0.0.1:* https://api.deepseek.com https://api.apikey.fun",
    })
    assert.deepEqual(securityViolations(CHROME_MANIFEST, text), [
      '扩展联网出口只允许本机服务与本仓库白名单主机，禁止 api.deepseek.com、api.apikey.fun。',
    ])
  })

  it('命中对象 / 数组形式 connect-src 的外部主机', () => {
    const objectForm = manifestWith({ extension_pages: { 'script-src': ["'self'"], 'connect-src': ['https://api.deepseek.com'] } })
    assert.deepEqual(securityViolations(CHROME_MANIFEST, objectForm), [
      '扩展联网出口只允许本机服务与本仓库白名单主机，禁止 api.deepseek.com。',
    ])
    const arrayForm = manifestWith({ 'connect-src': ['https://evil.example.com', 'ws://127.0.0.1:*'] })
    assert.deepEqual(securityViolations(CHROME_MANIFEST, arrayForm), [
      '扩展联网出口只允许本机服务与本仓库白名单主机，禁止 evil.example.com。',
    ])
  })

  it('命中通配所有主机与 host_permissions 里的 connect-src 声明', () => {
    assert.deepEqual(securityViolations(CHROME_MANIFEST, manifestWith({ extension_pages: "connect-src *" })), [
      '扩展联网出口只允许本机服务与本仓库白名单主机，禁止 *。',
    ])
    const viaPermissions = JSON.stringify({
      permissions: ['storage', 'connect-src https://api.deepseek.com'],
      host_permissions: ['http://*/*', 'https://*/*'],
    })
    assert.deepEqual(securityViolations(CHROME_MANIFEST, viaPermissions), [
      '扩展联网出口只允许本机服务与本仓库白名单主机，禁止 api.deepseek.com。',
    ])
  })

  it('放过本机服务 + 白名单主机（含 ws://、端口与端口通配）', () => {
    const allowed = manifestWith({
      extension_pages: 'script-src \'self\'; connect-src ws://127.0.0.1:* http://127.0.0.1:43120 wss://localhost:* http://localhost:45120 https://raw.githubusercontent.com',
    })
    assert.deepEqual(securityViolations(CHROME_MANIFEST, allowed), [])
    for (const host of ['127.0.0.1', 'localhost']) assert.equal(isAllowedExtensionHost(host), true)
    for (const host of EXTENSION_CONNECT_SRC_ALLOWED_HOSTS) assert.equal(isAllowedExtensionHost(host), true)
    assert.equal(isAllowedExtensionHost('api.deepseek.com'), false)
  })

  it('放过不含 connect-src 的 host_permissions 作用域声明（仓库现状不产生误报）', () => {
    const text = JSON.stringify({ host_permissions: ['http://*/*', 'https://*/*'], permissions: ['storage', 'tabs'] })
    assert.deepEqual(securityViolations(CHROME_MANIFEST, text), [])
  })

  it('路径边界：非扩展清单文件不套用出站白名单规则', () => {
    const text = manifestWith({ extension_pages: 'connect-src https://api.deepseek.com' })
    for (const rel of [
      'plugins/omnimux-market/catalog/index.json',
      'plugins/omnimux-browser/manifest.json',
      'plugins/omnimux-browser/extension/dist/manifest.json',
      'scripts/fixtures/manifest.json',
    ]) {
      assert.equal(isExtensionManifestPath(rel), false, `${rel} 不应被当作扩展清单`)
      assert.deepEqual(securityViolations(rel, text), [])
    }
    assert.equal(isExtensionManifestPath(CHROME_MANIFEST), true)
    assert.equal(isExtensionManifestPath('plugins/omnimux-browser/extension/manifest.firefox.json'), true)
  })

  it('清单不是合法 JSON 时按无法校验报错，而不是静默放过', () => {
    assert.equal(extensionOutboundViolations('{ not json'), null)
    assert.deepEqual(securityViolations(CHROME_MANIFEST, '{ not json'), [
      '扩展清单不是合法 JSON，无法校验联网出口白名单。',
    ])
  })

  it('connect-src 令牌解析：CSP 关键字与非网络地址不是主机', () => {
    assert.equal(connectSrcHost("'self'"), null)
    assert.equal(connectSrcHost('data:'), null)
    assert.equal(connectSrcHost('127.0.0.1:*'), '127.0.0.1')
    assert.equal(connectSrcHost('https://user:pass@evil.example.com:8443/x'), 'evil.example.com')
    assert.equal(connectSrcHost('https://*.example.com'), '*.example.com')
  })
})

describe('auto-qa-scan：事故反证与全仓回归', () => {
  it('0 误报：仓库现有插件源码 + 全部扩展清单通过安全维度', () => {
    const root = repoRoot
    const files = findFiles(root, undefined, (file) => isExtensionManifestFile(root, file))
    const manifests = files.filter((file) => isExtensionManifestPath(relative(root, file)))
    assert.ok(files.length > 200, `扫描集合过小，疑似收集退化：${files.length}`)
    assert.ok(manifests.length >= 2, `扩展清单必须进入扫描集合：${manifests.length}`)
    assert.deepEqual(securityFindings(files, root), [])
  })

  it('反证：事故形态（atob 承载密钥 + 外部模型主机）在门禁处变红', () => {
    const dir = mkdtempSync(join(tmpdir(), 'secret-gate-'))
    try {
      const extension = join(dir, 'plugins', 'omnimux-browser', 'extension')
      mkdirSync(join(extension, 'src', 'background'), { recursive: true })
      writeFileSync(join(extension, 'manifest.json'), manifestWith({
        extension_pages: 'connect-src ws://127.0.0.1:* https://api.deepseek.com https://api.apikey.fun',
      }))
      writeFileSync(
        join(extension, 'src', 'background', 'index.ts'),
        `const HEADERS = { Authorization: atob('${base64(FAKE_BEARER)}') }\nexport { HEADERS }\n`
      )
      const report = runGate(parseArgs([dir, '--all']))
      assert.equal(report.pass, false)
      assert.equal(report.diffMode, false)
      assert.deepEqual(
        report.dimensions.security.errors.map((error) => error.file).sort(),
        ['plugins/omnimux-browser/extension/manifest.json', 'plugins/omnimux-browser/extension/src/background/index.ts']
      )
      assert.deepEqual(report.scannedFiles.filter((file) => file.endsWith('manifest.json')), [
        'plugins/omnimux-browser/extension/manifest.json',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--all 与 --diff 互斥时以 --all 为准，且不改变 --diff 的 base 语义', () => {
    assert.equal(parseArgs(['.', '--all']).all, true)
    assert.equal(parseArgs(['.', '--diff']).all, false)
    const both = parseArgs(['.', '--diff', '--all', '--base', 'HEAD~1'])
    assert.equal(both.all, true)
    assert.equal(both.diff, true)
    assert.equal(both.base, 'HEAD~1')
    // 用空目录跑一次，避免在单测里触发全仓扫描。
    const dir = mkdtempSync(join(tmpdir(), 'secret-gate-empty-'))
    try {
      const report = runGate({ ...both, targetDir: dir })
      assert.equal(report.diffMode, false)
      assert.equal(report.pass, true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('.tmp 目录被 SKIP_DIRS 物理忽略，不进入全仓与清单扫描集合', () => {
    const dir = mkdtempSync(join(tmpdir(), 'secret-gate-tmp-'))
    try {
      const tmpFolder = join(dir, '.tmp')
      mkdirSync(tmpFolder, { recursive: true })
      writeFileSync(join(tmpFolder, 'test-probe.js'), 'console.log("probe")')
      const files = findFiles(dir)
      assert.deepEqual(files, [], '.tmp 目录下的文件必须被完全忽略')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('docs/specs 下的示例源码被忽略，plugins 下同名 specs 目录不受影响', () => {
    const dir = mkdtempSync(join(tmpdir(), 'secret-gate-docs-specs-'))
    try {
      const example = join(dir, 'docs/specs/omnimux-device/src')
      mkdirSync(example, { recursive: true })
      writeFileSync(join(example, 'DeviceStage.jsx'), 'export default function() {}')
      const product = join(dir, 'plugins/omnimux-workflow/src/shared/specs')
      mkdirSync(product, { recursive: true })
      const productFile = join(product, 'registry.ts')
      writeFileSync(productFile, 'export const x = 1')
      const files = findFiles(dir)
      assert.deepEqual(files.map((f) => relative(dir, f)), [relative(dir, productFile)],
        'docs/specs 下的文件必须被忽略，plugins 下的 specs 源码必须保留')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('auto-qa-scan：vendored OpenReel 路径豁免（契约真源 docs/contracts/openreel-vendor-contract.md §3「Vendor 根」）', () => {
  // 契约规定现行 vendor 根是 plugins/omnimux-clip/src/client/openreel/；src/client/engine/openreel/ 是退役过渡路径，保留兼容。
  const VENDOR_CURRENT = 'plugins/omnimux-clip/src/client/openreel/web/motion/components/MotionTimeline.tsx'
  const VENDOR_RETIRED = 'plugins/omnimux-clip/src/client/engine/openreel/render/previewRenderer.tsx'
  const HOST_GLUE = 'plugins/omnimux-clip/src/client/host/InspectorPanel.tsx'
  const RAW_COLOR_LINE = 'const panelBackground = "#1b1d21"\n'

  function scanFixture(relativePaths) {
    const dir = mkdtempSync(join(tmpdir(), 'qa-vendor-path-'))
    try {
      for (const rel of relativePaths) {
        const full = join(dir, rel)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, RAW_COLOR_LINE)
      }
      const report = createReport({ targetDir: dir })
      staticScan(report, relativePaths.map((rel) => join(dir, rel)), dir)
      return report
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('① 契约现行 vendor 根 src/client/openreel/ 下的裸色被跳过', () => {
    const report = scanFixture([VENDOR_CURRENT])
    assert.equal(report.dimensions.tokens.pass, true)
    assert.deepEqual(report.dimensions.tokens.errors, [])
  })

  it('② 退役过渡路径 src/client/engine/openreel/ 下的裸色仍被跳过（向后兼容）', () => {
    const report = scanFixture([VENDOR_RETIRED])
    assert.equal(report.dimensions.tokens.pass, true)
    assert.deepEqual(report.dimensions.tokens.errors, [])
  })

  it('③ 非 vendored 的宿主胶水裸色仍被拦下（门禁未被削弱）', () => {
    const report = scanFixture([HOST_GLUE])
    assert.equal(report.dimensions.tokens.pass, false)
    assert.deepEqual(report.dimensions.tokens.errors.map((error) => error.file), [HOST_GLUE])
    assert.match(report.dimensions.tokens.errors[0].message, /发现裸颜色值 \(#1b1d21\)，必须使用 --dsw-\* token。/)
  })

  it('三态同批：同一轮扫描里两个 vendored 根被跳过、宿主胶水仍报错', () => {
    const report = scanFixture([VENDOR_CURRENT, VENDOR_RETIRED, HOST_GLUE])
    assert.equal(report.scannedFiles.length, 3)
    assert.deepEqual(report.dimensions.tokens.errors.map((error) => error.file), [HOST_GLUE])
  })

  it('回归锚点：仓库真实 vendored 文件仍含裸色，但不再产生 tokens 阻断', () => {
    const realVendored = join(repoRoot, VENDOR_CURRENT)
    assert.match(
      readFileSync(realVendored, 'utf8'),
      /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/,
      '真实 vendored 文件必须仍含裸色，否则本用例退化为空断言'
    )
    const report = createReport({ targetDir: repoRoot })
    staticScan(report, [realVendored], repoRoot)
    assert.deepEqual(report.dimensions.tokens.errors, [])
  })
})

describe('auto-qa-scan：diff 模式下的 vendored 豁免（本次回归的根因面）', () => {
  // 根因：--all 模式靠 auto-qa-gate.mjs 的 SKIP_DIRS('openreel') 在遍历阶段整树跳过，
  // 而 --diff 模式的文件来自 git、不经过 SKIP_DIRS，vendored 文件会真的进入扫描。
  // 因此 VENDOR_ENGINE_RE 是 diff 模式下唯一的豁免入口；它一旦只认退役路径，diff 必红。
  const VENDOR_CURRENT = 'plugins/omnimux-clip/src/client/openreel/web/motion/components/MotionTimeline.tsx'
  const HOST_GLUE = 'plugins/omnimux-clip/src/client/host/InspectorPanel.tsx'
  const RAW_COLOR_LINE = 'const panelBackground = "#1b1d21"\n'

  function gitFixture(relativePaths) {
    const dir = mkdtempSync(join(tmpdir(), 'qa-diff-vendor-'))
    const init = spawnSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8' })
    assert.equal(init.status, 0, `git init 失败：${init.stderr}`)
    for (const rel of relativePaths) {
      const full = join(dir, rel)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, RAW_COLOR_LINE)
    }
    return dir
  }

  function diffSelected(dir) {
    return changedFilesFromGit(dir, 'HEAD').filter((file) => isScannableSourceFile(dir, file))
  }

  it('① diff 模式确实把 vendored 文件送进扫描（不享受 --all 的 SKIP_DIRS 整树跳过）', () => {
    const dir = gitFixture([VENDOR_CURRENT])
    try {
      assert.deepEqual(diffSelected(dir).map((file) => relative(dir, file)), [VENDOR_CURRENT])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('② diff 模式选中 vendored 文件后 tokens 放行；同一批里的宿主胶水仍被拦', () => {
    const dir = gitFixture([VENDOR_CURRENT, HOST_GLUE])
    try {
      const files = diffSelected(dir)
      assert.equal(files.length, 2)
      const report = createReport({ targetDir: dir, diff: true })
      staticScan(report, files, dir)
      assert.equal(report.diffMode, true)
      assert.deepEqual(report.dimensions.tokens.errors.map((error) => error.file), [HOST_GLUE])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
