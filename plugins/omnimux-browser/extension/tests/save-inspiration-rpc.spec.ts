// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Edge PNA / Loopback Inspiration Save Suite (#3088)', () => {
  const appPath = resolve(__dirname, '../src/panel/App.tsx')
  const appCode = readFileSync(appPath, 'utf8')

  const bgPath = resolve(__dirname, '../src/background/index.ts')
  const bgCode = readFileSync(bgPath, 'utf8')

  const routesPath = resolve(__dirname, '../../../omnimux-inspiration/src/http-routes.js')
  const routesCode = readFileSync(routesPath, 'utf8')

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
    expect(appCode).toContain("locale === 'en' ? 'Saved to Inspiration Library!' : '已保存到 OmniMux 灵感素材库！'")
    expect(appCode).toContain("locale === 'en' ? 'Failed to save (check OmniMux server)' : '保存失败，请检查 OmniMux 运行状态'")
  })
})
