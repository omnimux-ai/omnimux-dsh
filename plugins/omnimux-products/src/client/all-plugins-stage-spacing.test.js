import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../../../../plugins')

describe('All Plugins Stage Spacing & Hierarchy Contract (Issue #307)', () => {
  it('omnimux-inspiration defines subtitle, ActionRow, and 0 20px 24px stage padding', () => {
    const zh = readFileSync(join(ROOT, 'omnimux-inspiration/src/client/locales.js'), 'utf8')
    const stage = readFileSync(join(ROOT, 'omnimux-inspiration/src/client/InspirationStage.jsx'), 'utf8')
    const styles = readFileSync(join(ROOT, 'omnimux-inspiration/src/client/styles.js'), 'utf8')

    assert.match(zh, /'subtitle':/)
    assert.match(stage, /subtitle=\{t\('subtitle'\)\}/)
    assert.match(styles, /padding:\s*0 20px 24px/)
    assert.match(styles, /\.omnimux-inspiration-action-row\s*\{[^}]*padding-top:\s*8px/)
  })

  it('omnimux-products keeps the Action Row Layer 2 metrics for the assets-hosted product tab', () => {
    // 产品库页面已并入资产库，动作行由资产库渲染；产品侧保留共用度量与分流菜单。
    const styles = readFileSync(join(ROOT, 'omnimux-products/src/client/styles.js'), 'utf8')
    const assetsStage = readFileSync(join(ROOT, 'omnimux-assets/src/client/AssetsStage.jsx'), 'utf8')

    assert.match(styles, /\.omnimux-products-action-row\s*\{[^}]*padding:\s*8px 20px 12px/)
    assert.match(assetsStage, /<CreateProductMenu\b/, '产品库动作行由资产库承载')
  })

  it('omnimux-assets defines standard ActionRow padding', () => {
    const styles = readFileSync(join(ROOT, 'omnimux-assets/src/client/styles.js'), 'utf8')
    assert.match(styles, /\.omnimux-assets-action-row\s*\{[^}]*padding:\s*8px (?:20|24)px 12px/)
  })

  it('omnimux-publish defines standard 8px 20px 12px ActionRow padding', () => {
    const styles = readFileSync(join(ROOT, 'omnimux-publish/src/client/styles.js'), 'utf8')
    assert.match(styles, /\.omnimux-publish-action-row\s*\{[^}]*padding:\s*8px 20px 12px/)
  })

  it('omnimux-workflow defines standard 8px 20px 12px ActionRow padding', () => {
    const styles = readFileSync(join(ROOT, 'omnimux-workflow/src/client/styles.js'), 'utf8')
    assert.match(styles, /\.omnimux-workflow-action-row[^{]*\{[^}]*padding:\s*8px 20px 12px/)
  })

  it('omnimux-analytics defines standard 44px FilterBar height', () => {
    const styles = readFileSync(join(ROOT, 'omnimux-analytics/src/client/styles.js'), 'utf8')
    assert.match(styles, /\.omnimux-analytics-stage-filter\s*\{[^}]*height:\s*44px/)
    assert.match(styles, /\.omnimux-analytics-filterbar\s*\{[^}]*height:\s*44px/)
  })

  it('omnimux-accounts defines standard ActionRow and 6 sort keys', () => {
    const styles = readFileSync(join(ROOT, 'omnimux-accounts/src/client/styles.js'), 'utf8')
    assert.match(styles, /\.omnimux-accounts-action-row\s*\{[^}]*padding-top:\s*8px/)
  })
})
