/**
 * tests/e2e/apptab-cta-theme.e2e.test.mjs
 *
 * 创作画布 AI 应用（AppTab）深浅主题契约：
 *  1. AppTab 样式段引用的宿主主题 Token 必须真实存在（防「引用了宿主不存在的 Token 导致声明静默失效」这一类缺陷）；
 *  2. 「立即生成」主 CTA 遵循 design.md 的 Ink 规则，且具备 hover / active / disabled 三态；
 *  3. 控件几何保持 ai-app-ui-spec §3 的 44px / 398px / 8px 例外规格。
 *
 * 宿主 Token 真源为 tests/e2e/fixtures/dsh-theme-tokens.json（DSH 主题契约快照，宿主升级后需重新抽取）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')

const stylesPath = path.join(root, 'plugins/omnimux-workflow/src/client/styles.js')
const fixturePath = path.join(__dirname, 'fixtures/dsh-theme-tokens.json')

/** 截取 AppTab 样式段（`.omx-apptab-*` 规则集合）。 */
function appTabSection() {
  const src = fs.readFileSync(stylesPath, 'utf8')
  const start = src.indexOf('.omx-apptab-root')
  const end = src.indexOf('项目工程中心 / 文件夹视图')
  assert.ok(start > 0 && end > start, 'AppTab 样式段必须在 styles.js 中可定位')
  return src.slice(start, end)
}

function hostTokens() {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  assert.ok(Array.isArray(fixture.tokens) && fixture.tokens.length > 100, '宿主 Token 快照必须可用')
  return new Set(fixture.tokens)
}

test('E2E: AppTab 样式引用的宿主主题 Token 全部真实存在', () => {
  const tokens = hostTokens()
  const used = [...appTabSection().matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1])
  const missing = [...new Set(used)].filter((t) => !tokens.has(t)).sort()
  assert.deepEqual(missing, [], `AppTab 样式引用了宿主不存在的 Token：${missing.join(', ')}`)
})

test('E2E: 「立即生成」主 CTA 遵循 Ink 主题规则并具备三态反馈', () => {
  const section = appTabSection()
  const cta = section.slice(section.indexOf('.omx-apptab-cta-btn'))
  assert.ok(cta.length > 0, '必须存在 .omx-apptab-cta-btn 规则')

  assert.match(cta, /background:\s*var\(--dsw-alias-label-primary\)/, 'CTA 填充取 label-primary（深色浅底 / 浅色深底）')
  assert.match(cta, /color:\s*var\(--dsw-alias-label-primary-foreground\)/, 'CTA 文字取 label-primary-foreground（随主题反色）')
  assert.match(cta, /\.omx-apptab-cta-btn:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--dsw-alias-button-primary-hover\)/, 'CTA 必须有 hover 填充反馈')
  assert.match(cta, /\.omx-apptab-cta-btn:active:not\(:disabled\)\s*\{[^}]*transform:\s*scale\(0\.96\)/, 'CTA 必须有按压缩放反馈')
  assert.match(cta, /\.omx-apptab-cta-btn:disabled\s*\{[^}]*background:\s*var\(--dsw-alias-button-primary-dimmed\)/, 'CTA 禁用态必须有明确降级底色')
  assert.match(cta, /\.omx-apptab-cta-btn:disabled\s*\{[^}]*color:\s*var\(--dsw-alias-label-tertiary\)/, 'CTA 禁用态文字必须可辨')

  assert.doesNotMatch(cta, /box-shadow/, 'CTA 不得再以模态遮罩色充当投影')
  assert.doesNotMatch(cta, /transition:\s*opacity/, 'CTA 不得声明无对应变化的 opacity 过渡')
})

test('E2E: 「立即生成」主 CTA 保持 44px / 398px / 8px 例外几何', () => {
  const section = appTabSection()
  const cta = section.slice(section.indexOf('.omx-apptab-cta-btn'), section.indexOf('.omx-apptab-output-panel'))
  assert.match(cta, /height:\s*44px/)
  assert.match(cta, /width:\s*398px/)
  assert.match(cta, /border-radius:\s*8px/)
})
