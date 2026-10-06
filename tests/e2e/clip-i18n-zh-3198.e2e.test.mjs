import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')

const OPENREEL_DIR = path.join(root, 'plugins/omnimux-clip/src/client/openreel')
const I18N_DIR = path.join(root, 'plugins/omnimux-clip/src/client/i18n')

const load = (rel) => import(pathToFileURL(path.join(I18N_DIR, rel)).href)

const { zh } = await load('zh-CN.js')
const { zhWelcome } = await load('zh/welcome.js')
const { zhChrome } = await load('zh/chrome.js')
const { zhTimeline } = await load('zh/timeline.js')
const { zhPreview } = await load('zh/preview.js')
const { zhInspector } = await load('zh/inspector.js')
const { zhEditorChrome } = await load('zh/editorChrome.js')
const { zhMotion } = await load('zh/motion.js')
const { makeClipT, translateZh } = await load('translate.js')

/**
 * E2E 契约（Issue #3198）：剪辑插件中文界面不留英文残留。
 *
 * 实机证据：docs/evidence/clip-i18n-3198/（welcome-zh.png、editor-zh.png、
 * editor-zh-batch2.png、report.md）——中文环境下欢迎页、编辑器主体、
 * 属性面板与动效工作区均为中文。
 *
 * 本文件锁定交付契约，防止回归：
 *  1) vendored OpenReel 界面里每个 t() 调用方都必须接入剪辑 i18n 桥；
 *  2) 全部用户可见文案字面量必须有中文词条（回退只允许技术符号/产品标识）；
 *  3) 第二批三个面（属性面板/编辑器主体/动效工作区）的词条必须真实入库；
 *  4) 与英文逐字相同的词条只允许品牌名与格式串，禁止原样回显冒充翻译；
 *  5) 双语契约：zh 全部命中、非中文环境原样透传、缺键回退原文。
 */

/** 递归收集 vendored 界面源码（排除 node_modules 与测试文件）。 */
function collectSources(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      collectSources(full, acc)
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

const sourceFiles = collectSources(OPENREEL_DIR)

/** 抽取 t("...") 字面量（本仓约定：双引号、无模板/单引号形态）。 */
function tLiterals(text) {
  return [...text.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1])
}

const sourceText = new Map(sourceFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]))
const allKeys = new Set()
for (const text of sourceText.values()) for (const k of tLiterals(text)) allKeys.add(k)

/**
 * 用户可见文案判据：含 ASCII 字母、长度 ≥ 4，且不是 URL、函数式表达式
 * （如 "value + wiggle(2, 20)"）或文件扩展名串。
 */
function isProseKey(key) {
  if (!/[A-Za-z]/.test(key) || key.length < 4) return false
  if (/^https?:/.test(key)) return false
  if (key.includes('(')) return false
  if (/^[.A-Za-z0-9_/-]+\.[a-z]{2,4}$/i.test(key)) return false
  return true
}

const proseKeys = [...allKeys].filter(isProseKey)

/**
 * 刻意不翻译、允许原样回退的技术取值：计量单位、产品标识、格式清单与
 * 矢量路径数据——它们不是界面文案，中英文呈现相同。
 */
const ALLOWED_PASSTHROUGH = new Set([
  '+0.5s',
  'OpenReel',
  '.hdr / .exr / .jpg / .png',
  'M -50 -50 L 50 -50 L 50 50 L -50 50 Z',
])

/** 品牌名与视频格式串：中英文一致属正确翻译结果。 */
const ALLOWED_IDENTICAL = new Set([
  'Open Reel Video',
  'TikTok',
  'Instagram',
  'YouTube',
  'Instagram Reels',
  'Instagram Stories',
  'YouTube Shorts',
  'Pinterest Pin',
  'AI',
  '1080p 60fps',
  '3840×2160 - YouTube 4K',
  '3D',
])

test('E2E: 每个调用 t() 的界面文件都接入剪辑 i18n 桥，无直出英文的旁路', () => {
  const callers = [...sourceText].filter(([, text]) => /\bt\(/.test(text)).map(([f]) => f)
  const bridged = callers.filter((f) => /i18n\/(index|translate)\.js/.test(sourceText.get(f)))

  assert.ok(callers.length >= 120, `t() 调用方应覆盖全部界面面，实际 ${callers.length}`)
  assert.deepEqual(
    callers.filter((f) => !bridged.includes(f)).map((f) => path.relative(root, f)),
    [],
    '存在 t() 调用方未从剪辑 i18n 桥取 t',
  )
})

test('E2E: 用户可见 t("...") 文案全部命中中文词条，回退仅限技术取值', () => {
  assert.ok(proseKeys.length >= 1500, `文案字面量样本量异常：${proseKeys.length}`)
  const missing = proseKeys.filter((k) => !(k in zh) && !ALLOWED_PASSTHROUGH.has(k))
  assert.deepEqual(missing, [], `以下文案缺少中文词条：${missing.slice(0, 10).join(' | ')}`)
})

test('E2E: 第二批三个面与第一批词条已真实入库且非空', () => {
  const surfaces = {
    inspector: zhInspector,
    editorChrome: zhEditorChrome,
    motion: zhMotion,
  }
  const batch1 = { ...zhWelcome, ...zhChrome, ...zhTimeline, ...zhPreview }

  assert.ok(Object.keys(zhInspector).length >= 600, `inspector 词条不足：${Object.keys(zhInspector).length}`)
  assert.ok(Object.keys(zhEditorChrome).length >= 400, `editorChrome 词条不足：${Object.keys(zhEditorChrome).length}`)
  assert.ok(Object.keys(zhMotion).length >= 900, `motion 词条不足：${Object.keys(zhMotion).length}`)
  assert.ok(Object.keys(batch1).length >= 300, `第一批词条不足：${Object.keys(batch1).length}`)

  for (const [name, dict] of [...Object.entries(surfaces), ['batch1', batch1]]) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, 'string', `${name} 词条值必须是字符串：${key}`)
      assert.notEqual(value.trim(), '', `${name} 词条值不得为空：${key}`)
    }
  }
})

test('E2E: 与英文逐字相同的词条只允许品牌名与格式串，禁止原样回显冒充翻译', () => {
  const identical = Object.entries(zh)
    .filter(([key, value]) => key === value)
    .map(([key]) => key)

  assert.ok(identical.length >= 5, '品牌/格式白名单词条不应消失')
  assert.deepEqual(
    identical.filter((k) => !ALLOWED_IDENTICAL.has(k)),
    [],
    '出现未经翻译的英文原文词条（或需显式登记品牌白名单）',
  )
})

test('E2E: 双语契约——zh 全命中且非中文环境原样透传', () => {
  const tZh = makeClipT('zh')
  const tEn = makeClipT('en-US')

  for (const [key, value] of Object.entries(zh)) {
    assert.equal(tZh(key), value, `zh 未命中词条：${key}`)
    assert.equal(tEn(key), key, `非中文环境必须原样透传：${key}`)
  }

  const untranslated = proseKeys.filter((k) => !ALLOWED_IDENTICAL.has(k))
  for (const key of untranslated) {
    assert.notEqual(zh[key], key, `文案未翻译：${key}`)
  }

  assert.equal(tZh('A brand new untranslated sentence'), 'A brand new untranslated sentence')
  assert.equal(translateZh(''), '')
  assert.equal(translateZh(123), 123)
})
