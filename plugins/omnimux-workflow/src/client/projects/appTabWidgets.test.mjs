/**
 * plugins/omnimux-workflow/src/client/projects/appTabWidgets.test.mjs
 *
 * Unit tests for Issue #2607:
 * Upgraded form widgets in AppTab (ratio-cards, select-single, segmented-tabs,
 * multi-tags, library-picker, media-extractor, product-link, media-uploader).
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveOptions,
  resolveModelAspectRatios,
  resolveWidget,
  resolveSourceLabel,
  displayValueOf,
  sanitizePreviewUrl,
} from './appTabWidgets.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('AppTab Form Widgets Engine (Issue #2607)', () => {
  describe('resolveOptions()', () => {
    it('parses array of { label, value } objects', () => {
      const prop = {
        options: [
          { label: '竖屏 9:16', value: '9:16' },
          { label: '横屏 16:9', value: '16:9' },
        ],
      }
      const opts = resolveOptions(prop)
      assert.deepEqual(opts, [
        { label: '竖屏 9:16', value: '9:16' },
        { label: '横屏 16:9', value: '16:9' },
      ])
    })

    it('parses array of primitive values in options', () => {
      const prop = { options: ['1:1', '16:9'] }
      const opts = resolveOptions(prop)
      assert.deepEqual(opts, [
        { label: '1:1', value: '1:1' },
        { label: '16:9', value: '16:9' },
      ])
    })

    it('falls back to prop.enum if prop.options is missing', () => {
      const prop = { enum: ['zh_female_energetic', 'zh_male_calm'] }
      const opts = resolveOptions(prop)
      assert.deepEqual(opts, [
        { label: 'zh_female_energetic', value: 'zh_female_energetic' },
        { label: 'zh_male_calm', value: 'zh_male_calm' },
      ])
    })

    it('returns empty array when neither options nor enum are provided', () => {
      assert.deepEqual(resolveOptions(null), [])
      assert.deepEqual(resolveOptions({}), [])
      assert.deepEqual(resolveOptions({ type: 'string' }), [])
    })
  })

  describe('resolveModelAspectRatios()', () => {
    it('returns options from activeModel when present', () => {
      const activeModel = {
        parameters: {
          aspectRatio: {
            options: [
              { label: '9:16 竖屏', value: '9:16' },
              { label: '16:9 横屏', value: '16:9' },
            ],
          },
        },
      }
      const opts = resolveModelAspectRatios(activeModel, {})
      assert.deepEqual(opts, [
        { label: '9:16 竖屏', value: '9:16' },
        { label: '16:9 横屏', value: '16:9' },
      ])
    })

    it('handles primitive values in activeModel options', () => {
      const activeModel = {
        parameters: {
          aspectRatio: {
            options: ['1:1', '21:9'],
          },
        },
      }
      const opts = resolveModelAspectRatios(activeModel, {})
      assert.deepEqual(opts, [
        { label: '1:1', value: '1:1' },
        { label: '21:9', value: '21:9' },
      ])
    })

    it('falls back to resolveOptions(prop) when activeModel has no aspectRatio options', () => {
      const prop = {
        options: [
          { label: '4:3', value: '4:3' },
          { label: '16:9', value: '16:9' },
        ],
      }
      assert.deepEqual(resolveModelAspectRatios(null, prop), [
        { label: '4:3', value: '4:3' },
        { label: '16:9', value: '16:9' },
      ])
      assert.deepEqual(resolveModelAspectRatios({}, prop), [
        { label: '4:3', value: '4:3' },
        { label: '16:9', value: '16:9' },
      ])
      assert.deepEqual(resolveModelAspectRatios({ parameters: {} }, prop), [
        { label: '4:3', value: '4:3' },
        { label: '16:9', value: '16:9' },
      ])
    })
  })

  describe('resolveWidget()', () => {
    it('auto-heals product_image or product-titled fields from legacy widgets to product-link (Issue #2631)', () => {
      assert.equal(
        resolveWidget('product_image', { widget: 'media-uploader' }),
        'product-link',
      )
      assert.equal(
        resolveWidget('product_image', { widget: 'library-picker' }),
        'product-link',
      )
      assert.equal(
        resolveWidget('product_image', { type: 'string' }),
        'product-link',
      )
      assert.equal(
        resolveWidget('product_image', { widget: 'media-uploader' }, { widget: 'media-uploader' }),
        'product-link',
      )
      assert.equal(
        resolveWidget('img', { title: '商品主图', widget: 'media-uploader' }),
        'product-link',
      )
      assert.equal(
        resolveWidget('other_file', { title: '用户头像', widget: 'media-uploader' }),
        'media-uploader',
      )
    })

    it('prefers mapping.widget over prop.widget', () => {
      const widget = resolveWidget('test', { widget: 'select-single' }, { widget: 'ratio-cards' })
      assert.equal(widget, 'ratio-cards')
    })

    it('recognizes explicit widgets on property', () => {
      assert.equal(resolveWidget('f', { widget: 'ratio-cards' }), 'ratio-cards')
      assert.equal(resolveWidget('f', { widget: 'select-single' }), 'select-single')
      assert.equal(resolveWidget('f', { widget: 'segmented-tabs' }), 'segmented-tabs')
      assert.equal(resolveWidget('f', { widget: 'multi-tags' }), 'multi-tags')
      assert.equal(resolveWidget('f', { widget: 'library-picker' }), 'library-picker')
      assert.equal(resolveWidget('f', { widget: 'media-extractor' }), 'media-extractor')
      assert.equal(resolveWidget('f', { widget: 'product-link' }), 'product-link')
      assert.equal(resolveWidget('f', { widget: 'media-uploader' }), 'media-uploader')
    })

    it('infers ratio-cards when options contain colon aspect ratios', () => {
      const prop = {
        options: [
          { label: '9:16 竖屏', value: '9:16' },
          { label: '16:9 横屏', value: '16:9' },
        ],
      }
      assert.equal(resolveWidget('aspect_ratio', prop), 'ratio-cards')
    })

    it('infers select-single when options are non-ratio list', () => {
      const prop = {
        options: [
          { label: '活力女声', value: 'v1' },
          { label: '沉稳男声', value: 'v2' },
        ],
      }
      assert.equal(resolveWidget('voice', prop), 'select-single')
    })

    it('infers multi-tags when type is array with options', () => {
      const prop = {
        type: 'array',
        options: [
          { label: 'TikTok', value: 'tiktok' },
          { label: 'YouTube', value: 'youtube' },
        ],
      }
      assert.equal(resolveWidget('platforms', prop), 'multi-tags')
    })

    it('infers multi-tags when type is array with enum', () => {
      const prop = {
        type: 'array',
        enum: ['tiktok', 'youtube'],
      }
      assert.equal(resolveWidget('platforms', prop), 'multi-tags')
    })

    it('infers switch-boolean for boolean type', () => {
      assert.equal(resolveWidget('enabled', { type: 'boolean' }), 'switch-boolean')
    })

    it('infers textarea for prompt or long text', () => {
      assert.equal(resolveWidget('prompt', { type: 'string' }), 'textarea')
      assert.equal(resolveWidget('desc', { type: 'string', title: '用户提示词' }), 'textarea')
      assert.equal(resolveWidget('bio', { type: 'string', maxLength: 200 }), 'textarea')
    })

    it('falls back to input-text for plain strings', () => {
      assert.equal(resolveWidget('name', { type: 'string' }), 'input-text')
    })
  })

  describe('resolveSourceLabel() (Issue #2622 Review Fix)', () => {
    it('maps known sources to friendly labels', () => {
      assert.equal(resolveSourceLabel('product'), '商品库')
      assert.equal(resolveSourceLabel('upload'), '本地上传')
      assert.equal(resolveSourceLabel('custom-source'), '来源: custom-source')
    })

    it('returns empty string for falsy or non-string values', () => {
      assert.equal(resolveSourceLabel(''), '')
      assert.equal(resolveSourceLabel(null), '')
      assert.equal(resolveSourceLabel(undefined), '')
      assert.equal(resolveSourceLabel(123), '')
    })
  })

  describe('displayValueOf()', () => {
    it('decodes JSON-encoded picked cards', () => {
      const raw = JSON.stringify({
        name: 'test-product.png',
        sub: '120 KB · 资产库',
        source: 'asset',
        url: 'https://example.com/asset.png',
      })
      const res = displayValueOf(raw)
      assert.equal(res.name, 'test-product.png')
      assert.equal(res.sub, '120 KB · 资产库')
      assert.equal(res.source, 'asset')
    })

    it('infers source label via resolveSourceLabel when sub is omitted', () => {
      const fromObj = displayValueOf({ name: '商品A', source: 'product', url: 'https://example.com/a.jpg' })
      assert.equal(fromObj.sub, '商品库')

      const fromUploadObj = displayValueOf({ name: '上传A', source: 'upload', url: 'blob:...' })
      assert.equal(fromUploadObj.sub, '本地上传')

      const fromJson = displayValueOf(JSON.stringify({ name: '商品B', source: 'product', url: 'https://example.com/b.jpg' }))
      assert.equal(fromJson.sub, '商品库')
    })

    it('handles raw url string gracefully', () => {
      const res = displayValueOf('https://cdn.example.com/images/hero_banner.webp?w=800')
      assert.equal(res.name, 'hero_banner.webp')
      assert.equal(res.sub, '网络链接')
      assert.equal(res.source, 'link')
    })

    it('handles empty or null values', () => {
      assert.deepEqual(displayValueOf(''), { name: '', sub: '', source: 'link', url: '' })
      assert.deepEqual(displayValueOf(null), { name: '', sub: '', source: 'link', url: '' })
    })
  })

  describe('sanitizePreviewUrl()', () => {
    it('allows http, https, blob, relative paths and data:image/*', () => {
      assert.equal(sanitizePreviewUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg')
      assert.equal(sanitizePreviewUrl('http://example.com/b.png'), 'http://example.com/b.png')
      assert.equal(sanitizePreviewUrl('blob:http://localhost/123-456'), 'blob:http://localhost/123-456')
      assert.equal(sanitizePreviewUrl('/assets/preview.png'), '/assets/preview.png')
      assert.equal(sanitizePreviewUrl('./preview.png'), './preview.png')
      assert.equal(sanitizePreviewUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=')
    })

    it('blocks dangerous schemes like javascript:, data:text/html, etc.', () => {
      assert.equal(sanitizePreviewUrl('javascript:alert(1)'), '')
      assert.equal(sanitizePreviewUrl('javascript://test'), '')
      assert.equal(sanitizePreviewUrl('data:text/html;base64,PHNjcmlwdD4='), '')
      assert.equal(sanitizePreviewUrl('file:///etc/passwd'), '')
      assert.equal(sanitizePreviewUrl('vbscript:msgbox'), '')
      assert.equal(sanitizePreviewUrl(''), '')
      assert.equal(sanitizePreviewUrl(null), '')
    })
  })

  describe('Source Code Contract & CSS Compliance', () => {
    it('AppTab.jsx implements all compound form widgets and handles interactions', () => {
      const src = readFileSync(join(here, 'AppTab.jsx'), 'utf8')
      assert.match(src, /omx-apptab-ratio-grid/, 'ratio-cards container mounted')
      assert.match(src, /omx-apptab-ratio-card/, 'ratio-cards button mounted')
      assert.match(src, /omx-apptab-select-single/, 'select-single mounted')
      assert.match(src, /omx-apptab-select-trigger/, 'select-single trigger mounted')
      assert.match(src, /omx-apptab-select-options/, 'select-single dropdown panel mounted')
      assert.match(src, /omx-apptab-seg-tabs/, 'segmented-tabs mounted')
      assert.match(src, /omx-apptab-seg-tab/, 'segmented-tab button mounted')
      assert.match(src, /omx-apptab-multi-tags/, 'multi-tags mounted')
      assert.match(src, /omx-apptab-mtag/, 'multi-tag button mounted')
      assert.match(src, /omx-apptab-library-trigger/, 'library-picker trigger mounted')
      assert.match(src, /omx-apptab-picked/, 'picked card mounted')
      assert.match(src, /omx-apptab-extractor/, 'media-extractor mounted')
      assert.match(src, /omx-apptab-uploader/, 'media-uploader mounted')
    })

    it('AppTab.jsx implements Issue #2622 review fixes (operator precedence, url sanitization, memory release, and error handling)', () => {
      const src = readFileSync(join(here, 'AppTab.jsx'), 'utf8')
      // 1. 运算符优先级修复，杜绝 "规格: undefined"
      assert.match(src, /sub:\s*p\.sub\s*\|\|\s*\(p\.sku\s*\|\|\s*p\.price\s*\?/, '运算符优先级加括号')
      // 2. 弹窗提交链接增加协议安全清洗
      assert.match(src, /const\s+safeUrl\s*=\s*sanitizePreviewUrl\(trimmed\)/, '弹窗提交链接执行 sanitizePreviewUrl 清洗')
      // 3 & 4. 选择商品与弹窗提交链接均调用 revokeCreatedUrl 释放内存
      assert.match(src, /handleSelectProduct[\s\S]*?revokeCreatedUrl\(key\)/, '选择商品前释放旧 Object URL')
      assert.match(src, /handleProductModalSubmitLink[\s\S]*?revokeCreatedUrl\(key\)/, '提交链接覆盖前释放旧 Object URL')
      // 5. 远程商品接口异常处理输出警告日志
      assert.match(src, /console\.warn\('\[omnimux-workflow\] 获取商品列表失败:'/, '接口异常捕获并输出 console.warn')
    })

    it('styles.js provides full CSS for AppTab widgets using official tokens', () => {
      const css = readFileSync(join(here, '../styles.js'), 'utf8')
      assert.match(css, /\.omx-apptab-ratio-grid\s*\{/)
      assert.match(css, /\.omx-apptab-ratio-card\s*\{/)
      assert.match(css, /\.omx-apptab-select-single\s*\{/)
      assert.match(css, /\.omx-apptab-seg-tabs\s*\{/)
      assert.match(css, /\.omx-apptab-multi-tags\s*\{/)
      assert.match(css, /\.omx-apptab-picked\s*\{/)
      assert.match(css, /\.omx-apptab-library-trigger\s*\{/)
      assert.match(css, /\.omx-apptab-extractor\s*\{/)
      assert.match(css, /\.omx-apptab-uploader\s*\{/)

      // 验证无任何私造变量与裸硬编码色
      assert.doesNotMatch(css, /--omx-[a-z0-9_-]+/, '禁止私造 --omx-* 变量')
    })
  })
})
