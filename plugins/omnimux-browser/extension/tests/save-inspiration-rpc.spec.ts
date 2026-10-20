// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Edge PNA / Loopback Inspiration Save Suite (#3088)', () => {
  const appPath = resolve(__dirname, '../src/panel/App.tsx')
  const appCode = readFileSync(appPath, 'utf8')

  const bgPath = resolve(__dirname, '../src/background/index.ts')
  const bgCode = readFileSync(bgPath, 'utf8')

  const routesPath = resolve(__dirname, '../../../omnimux-inspiration/src/http-routes.js')
  const routesCode = readFileSync(routesPath, 'utf8')

  const copyPath = resolve(__dirname, '../src/panel/save-target-copy.ts')
  const copyCode = readFileSync(copyPath, 'utf8')

  it('delegates panel inspiration saving to background service worker via DSH_SAVE_INSPIRATION_PANEL', () => {
    expect(appCode).toContain("type: 'DSH_SAVE_INSPIRATION_PANEL'")
    expect(appCode).toContain('chrome.runtime.sendMessage')

    // Verify handleSaveToInspiration extracts heroImage as cover fallback
    const saveFnBlock = appCode.slice(
      appCode.indexOf('const handleSaveToInspiration'),
      appCode.indexOf('const updateThemeSetting'),
    )
    expect(saveFnBlock).toContain('pageScene?.heroImage')
    expect(saveFnBlock).toContain('DSH_SAVE_INSPIRATION_PANEL')
  })

  it('background service worker listens for DSH_SAVE_INSPIRATION_PANEL and falls back to direct store on 499/abort', () => {
    expect(bgCode).toContain("m?.type === 'DSH_SAVE_INSPIRATION_PANEL'")
    expect(bgCode).toContain('/omnimux/inspiration/local/import-url')
    expect(bgCode).toContain('/omnimux/inspiration/local')
    expect(bgCode).toContain('appendMediaInspiration')
  })

  it('inspiration server endpoints explicitly allow Private Network Access preflights', () => {
    expect(routesCode).toContain("'Access-Control-Allow-Private-Network': 'true'")
  })

  it('preserves user feedback on success and failure without throwing uncaught rejections', () => {
    // 文案已抽到 save-target-copy 模块；面板只调用纯函数，成功/失败语义保持不变。
    assert.equal(copyCode.includes('Saved to Inspiration Library!'), true)
    assert.equal(copyCode.includes('已保存到 OmniMux 灵感素材库！'), true)
    assert.equal(copyCode.includes('Failed to save (check OmniMux server)'), true)
    assert.equal(copyCode.includes('保存失败，请检查 OmniMux 运行状态'), true)
    assert.equal(appCode.includes('saveSuccessToast('), true)
    assert.equal(appCode.includes('saveFailureToast('), true)
  })

  it('classifies the save target before writing (#3454)', () => {
    assert.equal(appCode.includes("type: 'DSH_CLASSIFY_SAVE_TARGET'"), true)
    assert.equal(bgCode.includes("m?.type === 'DSH_CLASSIFY_SAVE_TARGET'"), true)
    assert.equal(bgCode.includes('/omnimux/inspiration/local/rival-accounts/classify'), true)
    assert.equal(bgCode.includes('background: true })'), true)
    assert.equal(bgCode.includes("target: 'account'"), true)
    assert.equal(bgCode.includes("target: 'inspiration'"), true)
  })
})
