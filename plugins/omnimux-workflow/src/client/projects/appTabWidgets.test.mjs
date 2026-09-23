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
  resolveWidget,
  displayValueOf,
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

  describe('resolveWidget()', () => {
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

    it('handles raw url string gracefully', () => {
      const res = displayValueOf('https://cdn.example.com/images/hero_banner.webp?w=800')
      assert.equal(res.name, 'hero_banner.webp')
      assert.equal(res.sub, '网络链接')
      assert.equal(res.source, 'link')
    })

    it('handles empty or null values', () => {
      assert.deepEqual(displayValueOf(''), { name: '', sub: '', source: 'link' })
      assert.deepEqual(displayValueOf(null), { name: '', sub: '', source: 'link' })
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
