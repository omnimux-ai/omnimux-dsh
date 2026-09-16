/**
 * E2E: 新用户机器上的创意预设媒体解析（产品基线）
 *
 * 断言用户可见结果：没有显式配置素材来源时，卡片拿不到任何预览地址（不会指向
 * 某个开发机专有目录）；显式配置后按配置解析。合同：docs/contracts/product-baseline.md
 */
import assert from 'node:assert/strict'
import { describe, it, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'

const MODULE = '../../src/client/presets/media-resolver.js'

/** 每个用例都在真实 DOM 全局下导入生产解析器（与浏览器里同一份代码）。 */
async function withBrowserWindow(config) {
  const dom = new JSDOM('<!doctype html><html><body><div id="card"></div></body></html>', {
    url: 'http://127.0.0.1:43128/',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  if (config) dom.window.__OMNIMUX_CONFIG__ = config
  const mod = await import(`${MODULE}?t=${Date.now()}`)
  return { dom, resolveMediaUrl: mod.resolveMediaUrl }
}

afterEach(() => {
  delete globalThis.window
  delete globalThis.document
})

describe('E2E: 创意预设媒体解析 · 新用户基线', () => {
  it('未配置任何素材来源时，相对路径解析为空（不产出指向开发机目录的预览地址）', async () => {
    const { resolveMediaUrl } = await withBrowserWindow(undefined)
    const url = resolveMediaUrl('hooks/eye-catching-visuals/01_crash.mp4')

    assert.equal(url, '', '新用户机器上不得猜测本机素材库路径')
    assert.ok(!url.includes('/Users/'), '解析结果不得含开发机绝对路径')
    assert.ok(!url.includes('local-file'), '未配置时不得产出本地文件流地址')
  })

  it('显式配置网关素材源时，相对路径解析到该源', async () => {
    const { resolveMediaUrl } = await withBrowserWindow({ gatewayMediaOrigin: 'https://cdn.example.com/base/' })
    assert.equal(
      resolveMediaUrl('hooks/eye-catching-visuals/01_crash.mp4'),
      'https://cdn.example.com/base/hooks/eye-catching-visuals/01_crash.mp4',
    )
  })

  it('显式配置预设素材根目录时，解析到本机文件流（既有开发用法，需显式开启）', async () => {
    const { resolveMediaUrl } = await withBrowserWindow({ presetAssetRoot: '/srv/preset-media/' })
    const url = resolveMediaUrl('hooks/eye-catching-visuals/01_crash.mp4')

    assert.ok(url.startsWith('/omnimux-workflow/api/local-file?path='))
    assert.ok(url.includes(encodeURIComponent('/srv/preset-media/hooks/eye-catching-visuals/01_crash.mp4')))
  })

  it('已存在的绝对地址原样返回，不受本机配置影响', async () => {
    const { resolveMediaUrl } = await withBrowserWindow(undefined)
    assert.equal(resolveMediaUrl('https://cdn.example.com/x.mp4'), 'https://cdn.example.com/x.mp4')
  })
})
