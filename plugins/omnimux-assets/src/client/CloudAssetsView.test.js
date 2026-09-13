import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'
import { ASSETS_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const viewJsx = readFileSync(join(here, 'CloudAssetsView.jsx'), 'utf8')
const feedJs = readFileSync(join(here, 'use-cloud-assets-feed.js'), 'utf8')

/** The save control's own handler, isolated from the rest of the card. */
const saveHandler = viewJsx.slice(
  viewJsx.indexOf('const handleSave'),
  viewJsx.indexOf('const handlePlayClick'),
)

/**
 * The declaration block of the first rule whose selector matches `selector`,
 * including grouped selector lists.
 * @param {string} css
 * @param {string} selector
 */
function ruleBody(css, selector) {
  const index = css.indexOf(selector)
  if (index === -1) return ''
  const open = css.indexOf('{', index)
  const close = css.indexOf('}', open)
  if (open === -1 || close === -1) return ''
  return css.slice(open + 1, close)
}

/**
 * 二级分类栏只属于声音。
 *
 * 知识包、角色等分类在清单里同样带 sub_categories（脚本提示词 / 知识笔记 /
 * 短剧拆镜 / 实景数字人），旧版据此展开二级栏，于是在选中的「知识包」下面
 * 出现了「全部声音」。这些断言把「只有声音展开」钉死在数据流两端：导航不再
 * 带分类专属文案，feed 的 hasSecondLevel 只在 audio 上成立。
 */
describe('Cloud second level is audio-only', () => {
  it('gates hasSecondLevel on the audio category in the feed', () => {
    assert.match(feedJs, /import \{[\s\S]*?CLOUD_SUBNAV_CATEGORY[\s\S]*?\} from '\.\/cloud-feed-helpers\.js'/)
    assert.match(feedJs, /const hasSecondLevel = category === CLOUD_SUBNAV_CATEGORY && tabs\.hasSecondLevel/)
  })

  it('labels the first chip generically instead of naming audio', () => {
    assert.match(viewJsx, /\{row\.id === '' \? t\('cloud\.subnav\.all'\) : t\(`cloud\.subcategory\.\$\{row\.id\}`\)\}/)
    assert.doesNotMatch(viewJsx, /cloud\.audio\.all/)
    assert.doesNotMatch(viewJsx, /全部声音/)
  })

  it('keeps the generic key in both dictionaries and drops the audio-only one', () => {
    assert.equal(zh['cloud.subnav.all'], '全部')
    assert.equal(en['cloud.subnav.all'], 'All')
    assert.equal(zh['cloud.audio.all'], undefined)
    assert.equal(en['cloud.audio.all'], undefined)
  })

  it('renders the sub-navigation only when the feed reports a second level', () => {
    assert.match(viewJsx, /hasSecondLevel \? \(\n        <div className="omnimux-assets-cloud-subnav"/)
    assert.match(viewJsx, /tabs=\{feed\.tabs\.items\}/)
    assert.match(viewJsx, /hasSecondLevel=\{feed\.hasSecondLevel\}/)
  })
})

/**
 * 文本类卡片：知识包全是文字资产（脚本、分镜提示词、笔记），旧版给它们画一块
 * 4:3 的灰色占位图加一个文档图标，标题和描述被挤成一行省略。这类卡片现在直接
 * 是「标题 + 描述」的阅读版式，没有占位图。
 */
describe('Cloud text card renders the text, not a placeholder plate', () => {
  it('branches the card body on the row kind', () => {
    assert.match(viewJsx, /import \{ cloudCardKind \} from '\.\/cloud-feed-helpers\.js'/)
    assert.match(viewJsx, /const kind = cloudCardKind\(asset\)/)
    assert.match(viewJsx, /className=\{`omnimux-assets-card omnimux-assets-cloud-card omnimux-assets-cloud-card--\$\{kind\}`\}/)
    assert.match(viewJsx, /data-kind=\{kind\}/)
  })

  it('mounts no media plate and requests no image for a text row', () => {
    assert.match(viewJsx, /\{kind === 'text' \? null : \(/)
    assert.match(viewJsx, /<CloudTileMedia asset=\{asset\} broken=\{broken\} onBroken=\{handleBroken\} \/>/)
  })

  it('shows the description on text and voice rows only', () => {
    assert.match(viewJsx, /\{kind === 'media' \|\| asset\.description === '' \? null : \(/)
    assert.match(viewJsx, /<p className="omnimux-assets-cloud-desc" title=\{asset\.description\}>\{asset\.description\}<\/p>/)
    assert.doesNotMatch(viewJsx, /showsDescription/)
  })

  it('lays the text card out as a 2-line title over a 4-line description', () => {
    const title = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-card--text .omnimux-assets-card-title')
    assert.match(title, /font-size: 14px/)
    assert.match(title, /font-weight: 600/)
    assert.match(title, /-webkit-line-clamp: 2/)
    assert.match(title, /white-space: normal/)
    // The hover plates are 28px each, 6px apart, 8px from the edge: the title
    // keeps clear of them instead of running underneath.
    assert.match(title, /padding-right: 64px/)

    const desc = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-card--text .omnimux-assets-cloud-desc')
    assert.match(desc, /-webkit-line-clamp: 4/)
  })

  it('gives a text card no thumbnail rule at all', () => {
    assert.doesNotMatch(ASSETS_CSS, /\.omnimux-assets-cloud-card--text[^{]*\.omnimux-assets-cloud-thumb/)
    const body = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-card--text .omnimux-assets-card-body')
    assert.match(body, /flex: 1/)
    assert.match(body, /padding: 14px/)
  })
})

/**
 * 图片类卡片（角色 / 场景 / 道具 / 风格）：缩略图加一行标题，没有别的。
 */
describe('Cloud picture card is a thumbnail and one line of title', () => {
  it('fixes the media thumbnail at a 160-170px height', () => {
    const body = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-card--media .omnimux-assets-cloud-thumb')
    const height = Number(/height:\s*(\d+)px/.exec(body)?.[1])
    assert.ok(Number.isFinite(height), 'the media thumbnail needs a pixel height')
    assert.ok(height >= 160 && height <= 170, `expected a 160-170px thumbnail, got ${height}px`)
  })

  it('keeps the picture title to one line', () => {
    const title = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-card--media .omnimux-assets-card-title')
    assert.match(title, /white-space: nowrap/)
    assert.match(title, /text-overflow: ellipsis/)
  })

  it('leaves no per-media-type aspect-ratio rule behind', () => {
    assert.doesNotMatch(ASSETS_CSS, /data-media-type="(video|image|document|other)"\] \.omnimux-assets-cloud-thumb/)
  })
})

/**
 * 声音类卡片（配音 / 音效 / BGM）：波形预览区点击即播即停，下面标题加一句音色
 * 描述，没有底部大按钮条。
 */
describe('Cloud voice card plays from its waveform plate', () => {
  it('makes the waveform plate the play control', () => {
    assert.match(viewJsx, /const canPlay = kind === 'audio'/)
    assert.match(viewJsx, /\{canPlay \? <CloudWaveform seed=\{asset\.id\} \/> : <CloudTileMedia/)
    assert.match(viewJsx, /role=\{canPlay \? 'button' : undefined\}/)
    assert.match(viewJsx, /aria-pressed=\{canPlay \? \(playing \? 'true' : 'false'\) : undefined\}/)
    assert.match(viewJsx, /onKeyDown=\{canPlay \? activateRowKeydown\(togglePlay\) : undefined\}/)
    assert.match(viewJsx, /onClick=\{canPlay \? handlePlayClick : undefined\}/)
    assert.match(viewJsx, /<PauseIcon size=\{16\} \/>/)
    assert.match(viewJsx, /<PlayIcon size=\{16\} \/>/)
  })

  it('draws a deterministic waveform, so a card never changes shape between renders', () => {
    const waveform = viewJsx.slice(viewJsx.indexOf('function waveBars'), viewJsx.indexOf('function CloudTileMedia'))
    assert.match(waveform, /const bars = \[\]/)
    assert.match(viewJsx, /const bars = useMe[m]o\(\(\) => waveBars\(seed\), \[seed\]\)/)
    const wave = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-wave {')
    assert.match(wave, /display: flex/)
    assert.match(wave, /pointer-events: none/)
    assert.match(ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-wave-bar'), /background: currentColor/)
  })

  it('stops the plate from swallowing the row preview click', () => {
    assert.match(viewJsx, /const handlePlayClick = \(event\) => \{\n    event\.stopPropagation\(\)\n    togglePlay\(\)\n  \}/)
  })

  it('keeps no labelled bottom action bar on any card', () => {
    assert.doesNotMatch(viewJsx, /<Badge\b/)
    assert.doesNotMatch(viewJsx, /mediaLabelOf/)
    assert.doesNotMatch(viewJsx, /omnimux-assets-cloud-tags?["'\s]/)
    assert.doesNotMatch(viewJsx, /omnimux-assets-overlay-btn/)
    assert.match(viewJsx, /className="omnimux-assets-cloud-actions"/)
  })
})

/**
 * 双操作按钮：右上角绝对定位，悬停白底黑字高对比反色，零紫色。
 */
describe('Cloud card hover controls are pinned to the top-right corner', () => {
  const actions = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-actions {')

  it('positions the cluster absolutely in the corner, above the card body', () => {
    assert.match(actions, /position: absolute/)
    assert.match(actions, /top: 8px/)
    assert.match(actions, /right: 8px/)
    assert.match(actions, /z-index: 5/)
  })

  it('mounts a card into the conversation through the shared attachment path', () => {
    assert.match(viewJsx, /import \{ addAssetToConversation \} from '\.\/add-to-chat\.js'/)
    assert.match(viewJsx, /addAssetToConversation\(asset\)/)
    assert.match(viewJsx, /<ChatIcon size=\{16\} \/>/)
    assert.match(viewJsx, /t\('card\.addToConversation'\)/)
    assert.match(viewJsx, /className="omnimux-assets-cloud-chat"/)
    assert.match(viewJsx, /title=\{addLabel\}/)
  })

  it('inverts both plates on hover, with no brand hue anywhere in the cluster', () => {
    const plates = ASSETS_CSS.slice(
      ASSETS_CSS.indexOf('.omnimux-assets-cloud-card .omnimux-assets-cloud-chat'),
      ASSETS_CSS.indexOf('.omnimux-assets-cloud-desc'),
    )
    assert.match(plates, /background: var\(--dsw-alias-bg-elevated\)/)
    assert.match(plates, /transition: opacity/)
    assert.match(plates, /background: var\(--dsw-alias-label-primary\)/)
    assert.match(plates, /color: var\(--dsw-alias-label-primary-foreground\)/)
    assert.doesNotMatch(plates, /brand-primary|interactive-bg-hover-accent/)
    assert.doesNotMatch(plates, /#[0-9a-fA-F]{3,8}\b/)
    assert.doesNotMatch(plates, /rgba\(/)
  })

  it('runs the card control through the feed save, not a private request', () => {
    assert.match(viewJsx, /onSave=\{feed\.saveToLocal\}/)
    assert.match(saveHandler, /if \(saved \|\| saving\) return/)
    assert.match(saveHandler, /event\.stopPropagation\(\)/)
    assert.match(saveHandler, /onSave\?\.\(asset\)/)
    assert.match(viewJsx, /className="omnimux-assets-cloud-save"/)
  })

  it('swaps 收藏到本地 for 已收藏 once the row is saved, and keeps it on screen at rest', () => {
    assert.match(viewJsx, /const saveLabel = saved \? t\('cloud\.action\.saved'\) : t\('cloud\.action\.save'\)/)
    assert.match(viewJsx, /title=\{saveLabel\}/)
    assert.match(viewJsx, /aria-pressed=\{saved \? 'true' : 'false'\}/)
    assert.match(viewJsx, /\{saved \? <CheckIcon size=\{16\} \/> : <PlusIcon size=\{16\} \/>\}/)
    assert.match(viewJsx, /saved=\{feed\.savedIds\.has\(asset\.id\)\}/)
    assert.match(viewJsx, /saving=\{feed\.savingId === asset\.id\}/)
    assert.match(viewJsx, /disabled=\{saved \|\| saving\}/)

    const saved = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-card .omnimux-assets-cloud-save[aria-pressed="true"]')
    assert.match(saved, /opacity: 1/)
    assert.match(saved, /background: var\(--dsw-alias-label-primary\)/)
  })

  it('marks the card itself, so the saved state is readable without a hover', () => {
    assert.match(viewJsx, /data-saved=\{saved \? 'true' : 'false'\}/)
  })
})

describe('Cloud card opens the preview', () => {
  it('opens the row preview from the card and from its body', () => {
    assert.match(viewJsx, /const openPreview = useCallback\(\(\) => \{ onPreview\?\.\(asset\) \}, \[asset, onPreview\]\)/)
    assert.match(viewJsx, /onClick=\{openPreview\}/)
    assert.match(viewJsx, /aria-label=\{previewLabel\}/)
    assert.match(viewJsx, /onKeyDown=\{activateRowKeydown\(openPreview\)\}/)
    assert.match(viewJsx, /const previewLabel = `\$\{asset\.name\} · \$\{t\('card\.view'\)\}`/)
  })

  it('hands the preview handler down from the view to every card', () => {
    assert.match(viewJsx, /const \{ t, open = true, onPreview, save \} = props/)
    assert.match(viewJsx, /useCloudAssetsFeed\(\{ t, open, save \}\)/)
    assert.match(viewJsx, /onPreview=\{onPreview\}/)
  })
})

describe('Cloud chrome stays neutral', () => {
  it('inks the selected chip with the label colour and inverts the label on it', () => {
    const selected = ASSETS_CSS.slice(ASSETS_CSS.indexOf('.omnimux-assets-cloud-chip[aria-pressed="true"]'))
    assert.match(selected, /background: var\(--dsw-alias-label-primary\)/)
    assert.match(selected, /color: var\(--dsw-alias-label-primary-foreground\)/)
    assert.doesNotMatch(selected.slice(0, selected.indexOf('}')), /brand-primary|interactive-bg-hover-accent/)
  })

  it('inverts the add-to-conversation control on its own hover', () => {
    const hover = ASSETS_CSS.slice(ASSETS_CSS.indexOf('.omnimux-assets-cloud-chat:hover'))
    assert.match(hover, /background: var\(--dsw-alias-label-primary\)/)
    assert.match(hover, /color: var\(--dsw-alias-label-primary-foreground\)/)
  })

  it('leaves no orphaned tag styling behind', () => {
    assert.doesNotMatch(ASSETS_CSS, /\.omnimux-assets-cloud-tag\b/)
  })
})
