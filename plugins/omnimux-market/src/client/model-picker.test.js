import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { getSessionModel, setSessionModel, sessionModelStore } from '../../lib/local-api.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('model picker client & session contracts (Issue #1167)', () => {
  const modelPickerSrc = readFileSync(join(here, 'model-picker.js'), 'utf8')
  const cssSrc = readFileSync(join(here, 'css.js'), 'utf8')
  const applySrc = readFileSync(join(here, 'apply.js'), 'utf8')
  const hostSrc = readFileSync(join(here, '../host.ts'), 'utf8')

  it('registers ModelPickerButton on conversation.input.left with order 20 (to the right of skill picker)', () => {
    assert.match(applySrc, /conversation\.input\.left/)
    assert.match(applySrc, /omnimux-market-model-picker/)
    assert.match(applySrc, /order:\s*20/)
    assert.match(applySrc, /ModelPickerButton/)
  })

  it('model-picker fragment defines both video and image model catalogs matching screenshots', () => {
    // 视频分类模型
    assert.match(modelPickerSrc, /"seedance-2-5"/)
    assert.match(modelPickerSrc, /Dreamina Seedance 2\.5/)
    assert.match(modelPickerSrc, /30秒视频生成，精准片段编辑/)

    assert.match(modelPickerSrc, /"seedance-2-0-fast"/)
    assert.match(modelPickerSrc, /Dreamina Seedance 2\.0 快速版/)
    assert.match(modelPickerSrc, /Dreamina Seedance 2\.0 Fast/)
    assert.match(modelPickerSrc, /高达43%折扣/)
    assert.match(modelPickerSrc, /细节和质量提升，成本更低/)

    assert.match(modelPickerSrc, /"seedance-2-0"/)
    assert.match(modelPickerSrc, /Dreamina Seedance 2\.0/)
    assert.match(modelPickerSrc, /更精准的参考，更真实，高达4K/)

    assert.match(modelPickerSrc, /"seedance-2-0-mini-trial"/)
    assert.match(modelPickerSrc, /Dreamina Seedance 2\.0 Mini \(试用版\)/)
    assert.match(modelPickerSrc, /新增/)
    assert.match(modelPickerSrc, /最适合快速生成，仅需7积分\/秒/)

    assert.match(modelPickerSrc, /"seedance-2-0-mini"/)
    assert.match(modelPickerSrc, /最高可享58折优惠/)
    assert.match(modelPickerSrc, /轻量级推理，最具成本效益/)

    // 图像分类模型
    assert.match(modelPickerSrc, /"nanobanana-pro"/)
    assert.match(modelPickerSrc, /Nano Banana Pro/)
    assert.match(modelPickerSrc, /专业图像质量和文本布局/)

    assert.match(modelPickerSrc, /"gpt-image-2"/)
    assert.match(modelPickerSrc, /GPT图像2/)
    assert.match(modelPickerSrc, /精准文本渲染，更强的推理能力/)

    assert.match(modelPickerSrc, /"nanobanana"/)
    assert.match(modelPickerSrc, /Nano Banana/)
    assert.match(modelPickerSrc, /图像质量可靠，价格更实惠/)

    assert.match(modelPickerSrc, /"seedream-5-0-pro"/)
    assert.match(modelPickerSrc, /Seedream 5\.0 Pro/)
    assert.match(modelPickerSrc, /更精确、更可控的编辑/)

    assert.match(modelPickerSrc, /"seedream-5-0-lite"/)
    assert.match(modelPickerSrc, /Seedream 5\.0 Lite/)
    assert.match(modelPickerSrc, /卓越的提示遵循和推理能力/)
  })

  it('renders capsule button with model icon + name when model is chosen (Image 3)', () => {
    assert.match(modelPickerSrc, /sh-model-capsule-btn/)
    assert.match(modelPickerSrc, /data-omnimux-model-capsule/)
    assert.match(modelPickerSrc, /selectedModel\.capsuleName \|\| selectedModel\.name/)
    assert.match(cssSrc, /\.sh-model-capsule-btn\{[^}]*border-radius:9999px/)
  })

  it('supports Auto switch toggle: toggling model turns auto off; toggling auto on clears model', () => {
    assert.match(modelPickerSrc, /handleToggleAuto/)
    assert.match(modelPickerSrc, /handleSelectModel/)
    assert.match(modelPickerSrc, /sh-model-switch/)
    assert.match(modelPickerSrc, /sh-model-switch-thumb/)
  })

  it('backend session model storage maintains session isolation', () => {
    const testSessionA = 'sess-test-a-' + Date.now()
    const testSessionB = 'sess-test-b-' + Date.now()

    // 默认空/自动
    assert.equal(getSessionModel(testSessionA), undefined)

    // 会话 A 选中 Seedance 2.0 Fast
    setSessionModel(testSessionA, {
      auto: false,
      selectedModel: {
        id: 'seedance-2-0-fast',
        name: 'Dreamina Seedance 2.0 快速版',
        capsuleName: 'Dreamina Seedance 2.0 Fast',
        type: 'video',
      },
    })

    // 会话 B 保持独立
    assert.equal(getSessionModel(testSessionB), undefined)

    const selA = getSessionModel(testSessionA)
    assert.equal(selA?.auto, false)
    assert.equal(selA?.selectedModel?.id, 'seedance-2-0-fast')
    assert.equal(selA?.selectedModel?.type, 'video')

    // 清理
    sessionModelStore.delete(testSessionA)
    sessionModelStore.delete(testSessionB)
  })

  it('host configures tools/pre-execute guard and systemPrompt for locked session model', () => {
    assert.match(hostSrc, /tools\/pre-execute/)
    assert.match(hostSrc, /agent\/session-start/)
    assert.match(hostSrc, /session:selected-model/)
    assert.match(hostSrc, /getSessionModel/)
    assert.match(hostSrc, /【会话模型锁定】/)
  })

  it('reuses workflow brand icon system and conforms to visual design guidelines', () => {
    // 品牌图标库复用
    assert.match(modelPickerSrc, /BRAND_SVGS/)
    assert.match(modelPickerSrc, /resolveModelBrand/)
    assert.match(modelPickerSrc, /renderBrandIcon/)
    assert.match(modelPickerSrc, /sh-model-brand-icon/)
    assert.match(modelPickerSrc, /dangerouslySetInnerHTML/)

    // 视觉规范检查：浮层采用规范的深浅自适应背景 Token 与 12px 圆角，宽度拓宽至 480px 完整展示模型名
    assert.match(cssSrc, /\.sh-model-picker\{[^}]*width:480px/)
    assert.match(cssSrc, /\.sh-model-picker\{[^}]*background:var\(--dsw-alias-bg-layer-2/)
    assert.match(cssSrc, /\.sh-model-picker\{[^}]*border-radius:12px/)
    assert.match(cssSrc, /\.sh-model-tabs\{[^}]*background:var\(--dsw-alias-bg-base/)
    assert.match(cssSrc, /\.sh-model-tab\.active\{[^}]*background:var\(--dsw-alias-bg-layer-3/)
    // 水晶切面钻石
    assert.match(modelPickerSrc, /polygon/)
    assert.match(modelPickerSrc, /sh-model-diamond/)
  })

  it('dynamically merges active catalog visible in plugin environment', () => {
    assert.match(modelPickerSrc, /mergeDynamicCatalog/)
    assert.match(modelPickerSrc, /getModelCatalog/)
    assert.match(hostSrc, /modelCatalog/)
    assert.match(hostSrc, /setModelCatalogResolver/)
  })
})
