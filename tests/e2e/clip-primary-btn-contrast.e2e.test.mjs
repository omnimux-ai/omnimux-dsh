/**
 * tests/e2e/clip-primary-btn-contrast.e2e.test.mjs
 *
 * 剪辑工作台主行动按钮对比度契约（回归「新建剪辑项目」主按钮白底白字不可见缺陷）：
 *  1. 创建表单主按钮与错误边界重试按钮必须遵循 design.md 的 Ink CTA 规范——
 *     背景 --dsw-alias-button-primary-fill、文字 --dsw-alias-label-primary-foreground；
 *  2. 引用的宿主主题 Token 必须真实存在（真源 tests/e2e/fixtures/dsh-theme-tokens.json）；
 *  3. 禁止回退到 --dsw-alias-accent-primary（宿主定义为 var(--dsw-alias-label-primary)=纯白）
 *     或 --dsw-alias-on-accent（宿主未定义），也禁止主按钮文字硬编码白色。
 *
 * 预演证据：.workbuddy/evidence/clip-primary-btn/（真实无头 Chrome 计算样式：
 * 背景 rgb(255,255,255)、文字 rgb(17,17,19)、对比度 18.86:1，PNG 截图留存）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')

const studioTabPath = path.join(root, 'plugins/omnimux-clip/src/client/OpenReelStudioTab.jsx')
const clipStagePath = path.join(root, 'plugins/omnimux-clip/src/client/ClipStage.jsx')
const fixturePath = path.join(__dirname, 'fixtures/dsh-theme-tokens.json')

function hostTokens() {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  assert.ok(Array.isArray(fixture.tokens) && fixture.tokens.length > 100, '宿主 Token 快照必须可用')
  return new Set(fixture.tokens)
}

test('E2E: 剪辑主按钮引用的宿主主题 Token 全部真实存在', () => {
  const tokens = hostTokens()
  assert.ok(tokens.has('--dsw-alias-button-primary-fill'), '宿主必须提供 --dsw-alias-button-primary-fill')
  assert.ok(tokens.has('--dsw-alias-label-primary-foreground'), '宿主必须提供 --dsw-alias-label-primary-foreground')
})

test('E2E: 创建表单主按钮遵循 Ink CTA 规范且不再白底白字', () => {
  const src = fs.readFileSync(studioTabPath, 'utf8')
  const start = src.indexOf('const btnPrimary')
  const end = src.indexOf('return (', start)
  assert.ok(start > 0 && end > start, 'btnPrimary 样式段必须可定位')
  const section = src.slice(start, end)
  assert.match(section, /backgroundColor:\s*'var\(--dsw-alias-button-primary-fill/, '主按钮背景必须使用 button-primary-fill')
  assert.match(section, /color:\s*'var\(--dsw-alias-label-primary-foreground/, '主按钮文字必须使用 label-primary-foreground')
  assert.doesNotMatch(section, /--dsw-alias-accent-primary/, '禁止回退到宿主定义为纯白的 accent-primary')
  assert.doesNotMatch(section, /color:\s*'#ffffff'/, '禁止主按钮文字硬编码白色（白底白字根因）')
})

test('E2E: 错误边界重试按钮同步遵循 Ink CTA 规范', () => {
  const src = fs.readFileSync(clipStagePath, 'utf8')
  const start = src.indexOf('重试加载')
  assert.ok(start > 0, '重试加载按钮必须存在')
  const section = src.slice(Math.max(0, start - 600), start)
  assert.match(section, /background:\s*'var\(--dsw-alias-button-primary-fill/, '重试按钮背景必须使用 button-primary-fill')
  assert.match(section, /color:\s*'var\(--dsw-alias-label-primary-foreground/, '重试按钮文字必须使用 label-primary-foreground')
  assert.doesNotMatch(section, /--dsw-alias-accent-primary/, '禁止回退到 accent-primary')
  assert.doesNotMatch(section, /--dsw-alias-on-accent/, '禁止使用宿主未定义的 on-accent')
})
