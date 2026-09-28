import { test } from 'node:test'
import { ok, equal } from 'node:assert'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

/**
 * 递归获取目录下的所有代码文件
 */
function getAllSourceFiles(dir, extensions = ['.js', '.jsx', '.ts', '.tsx']) {
  const files = []
  if (!existsSync(dir)) return files
  for (const child of readdirSync(dir)) {
    if (child.startsWith('.') || child === 'node_modules' || child === 'dist' || child === 'lib') continue
    const full = join(dir, child)
    const st = statSync(full)
    if (st.isDirectory()) {
      files.push(...getAllSourceFiles(full, extensions))
    } else if (extensions.some((ext) => child.endsWith(ext))) {
      files.push(full)
    }
  }
  return files
}

test('Anti-Slop Gate 1: 客户端代码严禁声明退役/隐藏预设黑名单字典 (No Banned/Hidden Blacklist Dictionaries)', () => {
  const clientFiles = [
    'plugins/omnimux/src/client/agent-preset-enhancer.js',
    'plugins/omnimux/src/client/agent-presets-i18n.js',
  ]

  const bannedNamePatterns = [
    /LEGACY_COMPATIBILITY_PRESET_IDS/,
    /LEGACY_HIDDEN_PRESET_IDS/,
    /HIDDEN_PRESET_IDS/,
    /EXCLUDED_PRESETS/,
    /BANNED_PRESETS/,
  ]

  for (const rel of clientFiles) {
    const full = join(root, rel)
    if (!existsSync(full)) continue
    const code = readFileSync(full, 'utf8')
    for (const pattern of bannedNamePatterns) {
      ok(
        !pattern.test(code),
        `[Architecture Violation] ${rel} 声明了违背单一真源的黑名单常量 ${pattern}。过滤必须依赖权威 Manifest 白名单！`
      )
    }
  }
})

test('Anti-Slop Gate 2: 严禁在视图层硬编码特定预设 ID 进行隐藏遮盖 (No Hardcoded ID Masking)', () => {
  const clientFiles = [
    'plugins/omnimux/src/client/agent-preset-enhancer.js',
    'plugins/omnimux/src/client/agent-presets-i18n.js',
  ]

  const bannedMaskingPatterns = [
    /media-creator['"]\s*\)[\s\S]*?display\s*=\s*['"]none['"]/i,
    /marketing-agent['"]\s*\)[\s\S]*?display\s*=\s*['"]none['"]/i,
    /LEGACY_COMPATIBILITY_PRESET_IDS\.has\(/,
    /LEGACY_HIDDEN_PRESET_IDS\.has\(/,
  ]

  for (const rel of clientFiles) {
    const full = join(root, rel)
    if (!existsSync(full)) continue
    const code = readFileSync(full, 'utf8')
    for (const pattern of bannedMaskingPatterns) {
      ok(
        !pattern.test(code),
        `[Architecture Violation] ${rel} 存在针对特定预设 ID 强行遮掩的下游补丁代码: ${pattern}`
      )
    }
  }
})

test('Anti-Slop Gate 3: 出厂主力预设必须 100% 严格对齐 presets/manifest.json 白名单 (Strict SSOT Alignment)', () => {
  const manifestPath = join(root, 'presets/manifest.json')
  ok(existsSync(manifestPath), 'presets/manifest.json 必须存在')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  ok(Array.isArray(manifest.shippedPresets), 'manifest.json 必须包含 shippedPresets 数组')

  const expectedShippedIds = [
    'cordis',
    'omni-agent',
    'tiktok-agent',
    'instagram-agent',
    'x-agent',
    'youtube-agent',
    'viral-video-agent',
    'ad-creative-agent',
  ]

  const actualShippedIds = manifest.shippedPresets.map((p) => p.id)
  equal(
    actualShippedIds.length,
    expectedShippedIds.length,
    `出厂主力预设数量必须严格为 ${expectedShippedIds.length} 项`
  )
  for (const id of expectedShippedIds) {
    ok(actualShippedIds.includes(id), `出厂白名单必须包含核心主力预设: ${id}`)
  }
})
