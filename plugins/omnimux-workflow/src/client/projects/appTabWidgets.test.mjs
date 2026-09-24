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
  isAspectRatioSupported,
  resolveModelDurations,
  resolveModelResolutions,
  sanitizeModelDuration,
  sanitizeModelResolution,
  isAspectRatioField,
  isDurationField,
  isResolutionField,
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

  describe('isAspectRatioSupported() (Issue #2642)', () => {
    const model = {
      parameters: {
        aspectRatio: {
          options: [
            { label: '16:9 横屏', value: '16:9' },
            { label: '9:16 竖屏', value: '9:16' },
          ],
        },
      },
    }

    it('returns true when ratio is present in model options', () => {
      assert.equal(isAspectRatioSupported(model, '16:9'), true)
      assert.equal(isAspectRatioSupported(model, '9:16'), true)
    })

    it('returns false when ratio is not supported by model', () => {
      assert.equal(isAspectRatioSupported(model, '1:1'), false)
      assert.equal(isAspectRatioSupported(model, '4:3'), false)
    })

    it('returns false for falsy or empty ratio values', () => {
      assert.equal(isAspectRatioSupported(model, ''), false)
      assert.equal(isAspectRatioSupported(model, null), false)
      assert.equal(isAspectRatioSupported(model, undefined), false)
    })

    it('returns true when model has no aspect ratio constraints', () => {
      assert.equal(isAspectRatioSupported({}, '16:9'), true)
      assert.equal(isAspectRatioSupported(null, '9:16'), true)
    })
  })

  describe('resolveModelDurations() (Issue #2642)', () => {
    it('resolves discrete duration options from model contract', () => {
      const activeModel = {
        parameters: {
          duration: {
            options: [
              { label: '5s', value: 5 },
              { label: '10s', value: 10 },
            ],
            defaultValue: 5,
          },
        },
      }
      const res = resolveModelDurations(activeModel, {})
      assert.equal(res.type, 'options')
      assert.deepEqual(res.options, [
        { label: '5s', value: 5 },
        { label: '10s', value: 10 },
      ])
      assert.equal(res.defaultValue, 5)
    })

    it('resolves numeric range duration from model contract', () => {
      const activeModel = {
        parameters: {
          duration: {
            range: { min: 4, max: 15, step: 1 },
            defaultValue: 5,
          },
        },
      }
      const res = resolveModelDurations(activeModel, {})
      assert.equal(res.type, 'range')
      assert.deepEqual(res.range, { min: 4, max: 15, step: 1 })
      assert.equal(res.min, 4)
      assert.equal(res.max, 15)
      assert.equal(res.step, 1)
      assert.equal(res.defaultValue, 5)
    })

    it('falls back to prop options or range when model has no duration spec', () => {
      const propWithOptions = {
        options: [
          { label: '5s', value: 5 },
          { label: '15s', value: 15 },
        ],
        defaultValue: 5,
      }
      const res1 = resolveModelDurations(null, propWithOptions)
      assert.equal(res1.type, 'options')
      assert.equal(res1.options.length, 2)

      const propWithRange = {
        minimum: 3,
        maximum: 30,
        step: 1,
        defaultValue: 10,
      }
      const res2 = resolveModelDurations(null, propWithRange)
      assert.equal(res2.type, 'range')
      assert.equal(res2.min, 3)
      assert.equal(res2.max, 30)
      assert.equal(res2.defaultValue, 10)
    })

    it('returns none when neither model nor prop defines duration', () => {
      const res = resolveModelDurations(null, null)
      assert.equal(res.type, 'none')
      assert.deepEqual(res.options, [])
    })

    it('preserves numeric range when model defines both range and auto sentinel options (-1)', () => {
      const seedance25LikeModel = {
        parameters: {
          duration: {
            range: { min: 4, max: 30, step: 1 },
            options: [{ value: -1, label: '自适应 (-1)' }],
            defaultValue: 5,
          },
        },
      }
      const res = resolveModelDurations(seedance25LikeModel, {})
      assert.equal(res.type, 'range', '同时声明 range 与 options 时绝不能吞噬 range')
      assert.deepEqual(res.range, { min: 4, max: 30, step: 1 })
      assert.equal(res.allowAuto, true)
      assert.equal(res.options.length, 1)
      assert.equal(res.options[0].value, -1)
    })
  })

  describe('resolveModelResolutions() (Issue #2642)', () => {
    it('resolves resolution options from activeModel contract', () => {
      const activeModel = {
        parameters: {
          resolution: {
            options: [
              { label: '480p', value: '480p' },
              { label: '720p', value: '720p' },
              { label: '1080p', value: '1080p' },
            ],
            defaultValue: '720p',
          },
        },
      }
      const opts = resolveModelResolutions(activeModel, {})
      assert.deepEqual(opts, [
        { label: '480p', value: '480p' },
        { label: '720p', value: '720p' },
        { label: '1080p', value: '1080p' },
      ])
    })

    it('falls back to prop options when activeModel has no resolution spec', () => {
      const prop = {
        options: [
          { label: '高清 720p', value: '720p' },
          { label: '超清 1080p', value: '1080p' },
        ],
      }
      const opts = resolveModelResolutions(null, prop)
      assert.deepEqual(opts, [
        { label: '高清 720p', value: '720p' },
        { label: '超清 1080p', value: '1080p' },
      ])
    })
  })

  describe('sanitizeModelDuration() (Issue #2642)', () => {
    it('clamps duration to max when current value exceeds discrete options maximum', () => {
      const activeModel = {
        parameters: {
          duration: {
            options: [5, 10],
            defaultValue: 5,
          },
        },
      }
      // 传入 15 超出 [5, 10]，应收敛到上限 10
      assert.equal(sanitizeModelDuration(activeModel, 15), 10)
      assert.equal(sanitizeModelDuration(activeModel, '15'), 10)
      // 传入 5 在支持范围内，保持 5
      assert.equal(sanitizeModelDuration(activeModel, 5), 5)
      // 传入 10 在支持范围内，保持 10
      assert.equal(sanitizeModelDuration(activeModel, 10), 10)
    })

    it('clamps duration to range boundary [min, max]', () => {
      const activeModel = {
        parameters: {
          duration: {
            range: { min: 4, max: 15, step: 1 },
            defaultValue: 5,
          },
        },
      }
      assert.equal(sanitizeModelDuration(activeModel, 20), 15)
      assert.equal(sanitizeModelDuration(activeModel, 2), 4)
      assert.equal(sanitizeModelDuration(activeModel, 8), 8)
    })

    it('recovers with defaultValue when currentVal is invalid or omitted', () => {
      const activeModel = {
        parameters: {
          duration: {
            range: { min: 4, max: 15, step: 1 },
            defaultValue: 5,
          },
        },
      }
      assert.equal(sanitizeModelDuration(activeModel, NaN), 5)
      assert.equal(sanitizeModelDuration(activeModel, ''), 5)
    })

    it('snaps non-matching values to closest discrete option and protects -1 sentinel', () => {
      const discreteModel = {
        parameters: {
          duration: {
            options: [5, 10],
            defaultValue: 5,
          },
        },
      }
      assert.equal(sanitizeModelDuration(discreteModel, 7), 5, '7s 应吸附到最接近的 5s')
      assert.equal(sanitizeModelDuration(discreteModel, 9), 10, '9s 应吸附到最接近的 10s')
      assert.equal(sanitizeModelDuration(discreteModel, -1), 5, '不支持自适应的模型收到 -1 应回退到默认值 5s')

      const autoCapableRangeModel = {
        parameters: {
          duration: {
            range: { min: 2, max: 30, step: 1 },
            allowAuto: true,
            defaultValue: 5,
          },
        },
      }
      assert.equal(sanitizeModelDuration(autoCapableRangeModel, -1), -1, 'allowAuto 模型收到 -1 必须原样放行')
      assert.equal(sanitizeModelDuration(autoCapableRangeModel, 10), 10, '正常 10s 绝不能被抹平为 -1')
    })
  })

  describe('Field classification predicates (Issue #2642 Review)', () => {
    it('classifies aspectRatio, duration, and resolution fields without misclassifying quality', () => {
      assert.equal(isAspectRatioField('aspectRatio', {}), true)
      assert.equal(isAspectRatioField('aspect_ratio', {}), true)
      assert.equal(isAspectRatioField('custom_key', { widget: 'ratio-cards' }), true)
      assert.equal(isAspectRatioField('topic', { type: 'string' }), false)
      assert.equal(isAspectRatioField('duration', {}), false, 'duration 含子串 ratio，严禁误归类为比例字段')

      assert.equal(isDurationField('duration', {}), true)
      assert.equal(isDurationField('video_duration', {}), true)
      assert.equal(isDurationField('duration_unit', {}), false, '排除 duration_unit 等修饰字段')

      assert.equal(isResolutionField('resolution', {}), true)
      assert.equal(isResolutionField('videoResolution', {}), true)
      assert.equal(isResolutionField('quality', {}), false, '严禁将独立画质字段 quality 误归类为分辨率')
      assert.equal(isResolutionField('resolutionMode', {}), false, '排除 resolutionMode 修饰字段')
    })
  })

  describe('sanitizeModelResolution() (Issue #2642)', () => {
    const activeModel = {
      parameters: {
        resolution: {
          options: [
            { label: '768p', value: '768p' },
            { label: '1080p', value: '1080p' },
          ],
          defaultValue: '768p',
        },
      },
    }

    it('preserves valid resolution matching model options (case-insensitive)', () => {
      assert.equal(sanitizeModelResolution(activeModel, '1080p'), '1080p')
      assert.equal(sanitizeModelResolution(activeModel, '768P'), '768p')
    })

    it('smoothly resets unsupported resolution to new model defaultValue', () => {
      assert.equal(sanitizeModelResolution(activeModel, '4k'), '768p')
      assert.equal(sanitizeModelResolution(activeModel, '480p'), '768p')
    })

    it('returns current value intact when model has no resolution constraints', () => {
      assert.equal(sanitizeModelResolution({}, '4k'), '4k')
      assert.equal(sanitizeModelResolution(null, '720p'), '720p')
    })
  })

  describe('resolveWidget()', () => {
    it('auto-heals product_image fields from legacy media widgets to product-link without misidentifying text fields (Issue #2631)', () => {
      // 1. 严格匹配 key === 'product_image' 且原控件为 legacy media-uploader / library-picker
      assert.equal(
        resolveWidget('product_image', { widget: 'media-uploader' }),
        'product-link',
      )
      assert.equal(
        resolveWidget('product_image', { widget: 'library-picker' }),
        'product-link',
      )
      assert.equal(
        resolveWidget('product_image', {}, { widget: 'media-uploader' }),
        'product-link',
      )

      // 2. 包含 product_image 且类型为 string 且为 legacy widget
      assert.equal(
        resolveWidget('main_product_image', { type: 'string', widget: 'media-uploader' }),
        'product-link',
      )

      // 3. 防御：商品名称、商品规格等文本字段严禁误伤
      assert.equal(
        resolveWidget('product_name', { title: '商品名称', type: 'string' }),
        'input-text',
      )
      assert.equal(
        resolveWidget('product_spec', { title: '商品规格', type: 'string' }),
        'input-text',
      )

      // 4. 无 legacy widget 的 product_image 字段不触发自愈
      assert.equal(
        resolveWidget('product_image', { type: 'string' }),
        'input-text',
      )
      assert.equal(
        resolveWidget('product_image', { widget: 'select-single' }),
        'select-single',
      )

      // 5. 非商品字段保持自身形态
      assert.equal(
        resolveWidget('user_avatar', { title: '用户头像', widget: 'media-uploader' }),
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
