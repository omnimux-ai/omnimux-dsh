import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CLOUD_AUDIO_THEMES } from './cloud-feed-helpers.js'
import { en, zh } from './locales.js'
import { ASSETS_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const viewJsx = readFileSync(join(here, 'CloudAssetsView.jsx'), 'utf8')
const feedJs = readFileSync(join(here, 'use-cloud-assets-feed.js'), 'utf8')
const saveJs = readFileSync(join(here, 'use-cloud-save.js'), 'utf8')

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
 * 二级分类栏属于数据，不属于某一个 Tab。
 *
 * 旧版把二级栏钉死在声音上，其余大类的 sub_categories 只当计数桶用，于是选中别的
 * 大类时那一行写着「全部声音」。现在凡是清单里带非空子分类的大类都展开二级栏，首个
 * Tab 统一是「全部」并带该大类总数；只有最左侧的「全部」不展开。
 */
describe('Cloud second level follows the catalog data', () => {
  it('reads hasSecondLevel from the tabs instead of naming one category', () => {
    assert.doesNotMatch(feedJs, /CLOUD_SUBNAV_CATEGORY/)
    assert.match(feedJs, /const hasSecondLevel = tabs\.hasSecondLevel/)
  })

  it('labels the first chip generically in every category', () => {
    assert.match(viewJsx, /\{row\.id === '' \? t\('cloud\.subnav\.all'\) : t\(`cloud\.subcategory\.\$\{row\.id\}`\)\}/)
    assert.doesNotMatch(viewJsx, /cloud\.audio\.all/)
    assert.doesNotMatch(viewJsx, /全部声音/)
  })

  it('keeps the generic keys in both dictionaries and drops the audio-only wording', () => {
    assert.equal(zh['cloud.subnav.all'], '全部')
    assert.equal(en['cloud.subnav.all'], 'All')
    assert.equal(zh['cloud.subnav.label'], '二级分类')
    assert.equal(en['cloud.subnav.label'], 'Sub-categories')
    assert.equal(zh['cloud.audio.all'], undefined)
    assert.equal(en['cloud.audio.all'], undefined)
  })

  it('renders the sub-navigation only when the feed reports a second level', () => {
    // 角色 hands its second level to the eight-dimension filter bar, so the chip
    // row is rendered when the feed reports one *and* no filter bar took over.
    assert.match(viewJsx, /const filterBarOwnsSecondLevel = characterFilters\.dimensions\.length > 0/)
    assert.match(viewJsx, /hasSecondLevel && !filterBarOwnsSecondLevel \? \(\n        <div className="omnimux-assets-cloud-subnav"/)
    assert.match(viewJsx, /tabs=\{feed\.tabs\.items\}/)
    assert.match(viewJsx, /hasSecondLevel=\{feed\.hasSecondLevel\}/)
  })

  it('opens every category on 全部', () => {
    assert.match(feedJs, /const \[subCategory, setSubCategory\] = useState\(''\)/)
    assert.match(feedJs, /setCategory\(next\)\n    \/\/ Every category opens on 全部[\s\S]*?setSubCategory\(''\)/)
  })

  it('removes 知识包 and opens the nav on 全部 in both dictionaries', () => {
    assert.equal(zh['cloud.category.all'], '全部')
    assert.equal(en['cloud.category.all'], 'All')
    assert.equal(zh['cloud.category.knowledge'], undefined)
    assert.equal(en['cloud.category.knowledge'], undefined)
    assert.equal(zh['cloud.subcategory.prompt'], undefined)
    assert.equal(en['cloud.subcategory.prompt'], undefined)
    assert.equal(zh['cloud.subcategory.storyboard'], undefined)
    assert.equal(en['cloud.subcategory.storyboard'], undefined)
  })

  it('opens the tab on 全部 and leads the nav with it', () => {
    assert.match(feedJs, /const \{ t, open, defaultCategory = CLOUD_ALL_CATEGORY \} = options/)
    assert.match(feedJs, /return \[allCategoryEntry\(manifest, t\), \.\.\.listed\]/)
    assert.match(feedJs, /if \(manifest === null\) return \[\]/)
    // The chip label comes from the dictionary, never from a hard-coded string.
    assert.match(viewJsx, /\{t\(`cloud\.category\.\$\{row\.id\}`\)\}/)
  })

  it('names the new 素材 category in both dictionaries', () => {
    assert.equal(zh['cloud.category.material'], '素材')
    assert.equal(en['cloud.category.material'], 'Material')
    assert.equal(zh['cloud.subcategory.green-screen'], '绿幕')
    assert.equal(zh['cloud.subcategory.hook'], '钩子')
    assert.equal(zh['cloud.subcategory.meme'], '表情包')
    assert.equal(zh['cloud.subcategory.female'], '女性角色')
    assert.equal(zh['cloud.subcategory.male'], '男性角色')
    assert.equal(zh['cloud.subcategory.lifestyle'], '生活居家')
    assert.equal(zh['cloud.subcategory.business'], '职场商务')
  })

  it('names the Loomi shelves in both dictionaries', () => {
    assert.equal(zh['cloud.subcategory.object'], '实物道具')
    assert.equal(en['cloud.subcategory.object'], 'Props & Objects')
    assert.equal(zh['cloud.subcategory.environment'], '实景环境')
    assert.equal(en['cloud.subcategory.environment'], 'Environments')
    assert.equal(zh['cloud.subcategory.pet'], '萌宠动物')
    assert.equal(en['cloud.subcategory.pet'], 'Pets & Animals')
    assert.equal(zh['cloud.subcategory.clothing'], '服饰穿搭')
    assert.equal(en['cloud.subcategory.clothing'], 'Fashion & Outfits')
    assert.equal(zh['cloud.subcategory.portrait'], '人像写真')
    assert.equal(en['cloud.subcategory.portrait'], 'Portraits')
  })

  it('drops the shelves the catalog no longer has', () => {
    for (const gone of ['note', 'digital-human', 'virtual-influencer', 'hook-video', 'prompt', 'storyboard']) {
      assert.equal(zh[`cloud.subcategory.${gone}`], undefined, `${gone} should be gone from zh`)
      assert.equal(en[`cloud.subcategory.${gone}`], undefined, `${gone} should be gone from en`)
    }
  })
})

/**
 * 文本类卡片：没有封面、也没有可播媒体，只有一段描述。旧版给它们画一块 4:3 的灰色
 * 占位图加一个文档图标，标题和描述被挤成一行省略。这类卡片现在直接是「标题 2 行、
 * 描述 4 行」的阅读版式，没有占位图。
 */
describe('Cloud text card renders the text, not a placeholder plate', () => {
  it('branches the card body on the row kind', () => {
    assert.match(viewJsx, /import \{ cloudAudioTheme, cloudCardKind \} from '\.\/cloud-feed-helpers\.js'/)
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
    // The one hover plate is 28px, 8px from the edge: the title keeps clear of it
    // instead of running underneath.
    assert.match(title, /padding-right: 32px/)

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
 * 图片类卡片（角色 / 场景 / 道具 / 素材 / 风格）：缩略图加一行标题，没有别的。
 */
describe('Cloud picture card is a thumbnail and one line of title', () => {
  it('fixes the media thumbnail at a 160-170px height', () => {
    const body = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-card--media .omnimux-assets-cloud-thumb')
    const height = Number(/height:\s*(\d+)px/.exec(body)?.[1])
    assert.ok(Number.isFinite(height), 'the media thumbnail needs a pixel height')
    assert.ok(height >= 160 && height <= 170, `expected a 160-170px thumbnail, got ${height}px`)
    assert.equal(height, 164)
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
 * 声音类卡片（配音 / 音效 / 背景音）：一块暗调微彩底板，正中间一个居中的播放/暂停键，
 * 点一下即播即停；下面标题加一句音色描述，没有底部大按钮条。
 *
 * 底板上不画任何波形竖条：几十张音色卡片同时出现细密竖线会变成视觉噪点，行与行的
 * 区别只交给颜色本身。
 */
describe('Cloud voice card plays from its colour plate', () => {
  it('makes the colour plate the play control', () => {
    assert.match(viewJsx, /const canPlay = kind === 'audio'/)
    assert.match(viewJsx, /\{canPlay \? null : <CloudTileMedia asset=\{asset\} broken=\{broken\} onBroken=\{handleBroken\} \/>\}/)
    assert.match(viewJsx, /role=\{canPlay \? 'button' : undefined\}/)
    assert.match(viewJsx, /aria-pressed=\{canPlay \? \(playing \? 'true' : 'false'\) : undefined\}/)
    assert.match(viewJsx, /onKeyDown=\{canPlay \? activateRowKeydown\(togglePlay\) : undefined\}/)
    assert.match(viewJsx, /onClick=\{canPlay \? handlePlayClick : undefined\}/)
    assert.match(viewJsx, /<PauseIcon size=\{16\} \/>/)
    assert.match(viewJsx, /<PlayIcon size=\{16\} \/>/)
  })

  it('draws no waveform bars anywhere in the card or the stylesheet', () => {
    assert.doesNotMatch(viewJsx, /waveBars|CloudWaveform|WAVE_BAR_COUNT/)
    assert.doesNotMatch(viewJsx, /cloud-wave/)
    assert.doesNotMatch(ASSETS_CSS, /omnimux-assets-cloud-wave/)
    assert.doesNotMatch(ASSETS_CSS, /cloud-wave-bar/)
  })

  it('centres one play control instead of a strip of bars', () => {
    const play = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-play {')
    assert.match(play, /position: absolute/)
    assert.match(play, /top: 50%/)
    assert.match(play, /left: 50%/)
    assert.match(play, /transform: translate\(-50%, -50%\)/)
    assert.match(play, /border-radius: 999px/)
    assert.match(play, /pointer-events: none/)
  })

  it('stops the plate from swallowing the row preview click', () => {
    assert.match(viewJsx, /const handlePlayClick = \(event\) => \{\n    event\.stopPropagation\(\)\n    togglePlay\(\)\n  \}/)
  })

  it('carries one of the five restrained dark washes, chosen from the row id', () => {
    assert.match(viewJsx, /const theme = canPlay \? cloudAudioTheme\(asset\.id\) : undefined/)
    assert.match(viewJsx, /data-theme=\{theme\}/)

    const plate = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-card--audio .omnimux-assets-cloud-thumb')
    assert.match(plate, /height: 112px/)
    // The wash is an overlay on the official token, not a replacement for it.
    assert.match(plate, /background-color: var\(--dsw-alias-bg-elevated\)/)
    assert.match(plate, /background-image: linear-gradient/)

    assert.equal(CLOUD_AUDIO_THEMES.length, 5)
    for (const theme of CLOUD_AUDIO_THEMES) {
      const rule = ruleBody(ASSETS_CSS, `.omnimux-assets-cloud-card--audio[data-theme="${theme}"]`)
      assert.match(rule, /background-image: linear-gradient/, `${theme} needs its own wash`)
    }
  })

  it('keeps the voice description to one line and no labelled bottom bar', () => {
    const desc = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-desc {')
    assert.match(desc, /-webkit-line-clamp: 1/)
    assert.doesNotMatch(viewJsx, /<Badge\b/)
    assert.doesNotMatch(viewJsx, /mediaLabelOf/)
    assert.doesNotMatch(viewJsx, /omnimux-assets-cloud-tags?["'\s]/)
    assert.doesNotMatch(viewJsx, /omnimux-assets-overlay-btn/)
    assert.match(viewJsx, /className="omnimux-assets-cloud-actions"/)
  })
})

/**
 * 卡片右上角只留一个操作：加入对话。收藏（+ 号）连同它的悬浮条与状态一并删除。
 */
describe('Cloud card keeps exactly one hover control', () => {
  const actions = ruleBody(ASSETS_CSS, '.omnimux-assets-cloud-actions {')

  it('positions the control absolutely in the corner, above the card body', () => {
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

  it('renders the bubble icon and nothing else in that corner', () => {
    const start = viewJsx.indexOf('className="omnimux-assets-cloud-actions"')
    const end = viewJsx.indexOf('className="omnimux-assets-card-body"', start)
    const cluster = viewJsx.slice(start, end)
    assert.equal((cluster.match(/<IconButton/g) ?? []).length, 1)
    assert.match(cluster, /<ChatIcon size=\{16\} \/>/)
  })

  it('removes the save control and its state from the card, the feed and the stylesheet', () => {
    assert.doesNotMatch(viewJsx, /PlusIcon/)
    assert.doesNotMatch(viewJsx, /cloud-save/)
    assert.doesNotMatch(viewJsx, /handleSave/)
    assert.doesNotMatch(viewJsx, /saveToLocal/)
    assert.doesNotMatch(viewJsx, /data-saved/)
    assert.doesNotMatch(viewJsx, /savedIds|savingId/)
    assert.doesNotMatch(feedJs, /useCloudSave/)
    assert.doesNotMatch(feedJs, /saveToLocal/)
    assert.doesNotMatch(ASSETS_CSS, /omnimux-assets-cloud-save/)
  })

  it('drops the cloud-only save wording from both dictionaries', () => {
    assert.equal(zh['cloud.action.save'], undefined)
    assert.equal(zh['cloud.action.saved'], undefined)
    assert.equal(zh['cloud.save.saved'], undefined)
    assert.equal(en['cloud.action.save'], undefined)
    assert.equal(en['cloud.action.saved'], undefined)
    assert.equal(en['cloud.save.saved'], undefined)
  })

  it('re-points the surviving save notice at a modal-scoped key', () => {
    // The preview modal is the only remaining saver, so the notice it shows must
    // not be worded as a card action.
    assert.match(saveJs, /setNotice\(t\('modal\.save\.notice'\)\.replace\('\{name\}'/)
    assert.match(saveJs, /import \{ saveCloudAssetToLocal \} from '\.\/cloud-save\.js'/)
    assert.ok(zh['modal.save.notice'].includes('{name}'))
    assert.ok(en['modal.save.notice'].includes('{name}'))
    assert.equal(zh['modal.saveToLocal'], '收藏到本地')
  })

  it('inverts the plate on hover, with no brand hue anywhere in the control', () => {
    // Bounded at the description rule: everything above it is the fixed dark media
    // plate, which is exempted, while this control is chrome and is not.
    const plates = ASSETS_CSS.slice(
      ASSETS_CSS.indexOf('.omnimux-assets-cloud-card .omnimux-assets-cloud-chat'),
      ASSETS_CSS.indexOf('.omnimux-assets-cloud-desc {'),
    )
    assert.match(plates, /background: var\(--dsw-alias-bg-elevated\)/)
    assert.match(plates, /transition: opacity/)
    assert.match(plates, /background: var\(--dsw-alias-label-primary\)/)
    assert.match(plates, /color: var\(--dsw-alias-label-primary-foreground\)/)
    assert.doesNotMatch(plates, /brand-primary|interactive-bg-hover-accent/)
    assert.doesNotMatch(plates, /#[0-9a-fA-F]{3,8}\b/)
    assert.doesNotMatch(plates, /rgba\(/)
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
    assert.match(viewJsx, /const \{ t, open = true, onPreview \} = props/)
    assert.match(viewJsx, /useCloudAssetsFeed\(\{ t, open \}\)/)
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

/**
 * 角色的八维筛选栏：一排药丸，点开是自己的选项清单，每项带条数，选中有高亮，
 * 有筛选时才出现「重置筛选」。它只属于角色，其他大类的二级分类行原样保留。
 */
describe('Cloud character filter bar', () => {
  /** @param {string} selector */
  const ruleOf = (selector) => {
    const start = ASSETS_CSS.indexOf(selector)
    assert.notEqual(start, -1, `${selector} must exist`)
    return ASSETS_CSS.slice(start, ASSETS_CSS.indexOf('}', start))
  }

  it('renders one pill per catalog dimension, in the catalog order', () => {
    assert.match(viewJsx, /const CloudDimensionBar = \(props\)|function CloudDimensionBar\(props\)/)
    assert.match(viewJsx, /\{dimensions\.map\(\(dimension\) => \(\n        <CloudDimensionFilter/)
    assert.match(viewJsx, /const \{ t, dimensions, filters, active, onSelect, onReset \} = props/)
  })

  it('shows the value in the pill label once a dimension is narrowed', () => {
    assert.match(viewJsx, /const label = dimensionLabelOf\(\{ t, dimension, value \}\)/)
    assert.match(viewJsx, /<span className="omnimux-assets-cloud-dimension-label">\{label\}<\/span>/)
  })

  it('mounts the option list only while the pill is open, and closes it on outside input', () => {
    assert.match(viewJsx, /const \[open, setOpen\] = useState\(false\)/)
    assert.match(viewJsx, /\{open \? \(\n        <div className="omnimux-assets-cloud-dimension-menu"/)
    assert.match(viewJsx, /if \(node && !node\.contains\(event\.target\)\) setOpen\(false\)/)
    assert.match(viewJsx, /document\.removeEventListener\('mousedown', onPointerDown\)/)
  })

  it('carries the row count on 全部 and on every option', () => {
    assert.match(viewJsx, /\{renderOption\(\{ value: '', total: dimension\.total \}\)\}/)
    assert.match(viewJsx, /\{dimension\.options\.map\(\(option\) => renderOption\(option\)\)\}/)
    assert.match(viewJsx, /<span className="omnimux-assets-cloud-count">\{option\.total\}<\/span>/)
  })

  it('marks the chosen option as pressed, and nothing else', () => {
    assert.match(viewJsx, /aria-pressed=\{option\.value === value \? 'true' : 'false'\}/)
  })

  it('offers one reset control, and only while a dimension is narrowed', () => {
    assert.match(viewJsx, /\{active > 0 \? \(/)
    assert.match(viewJsx, /className="omnimux-assets-cloud-dimension-reset"/)
    assert.match(viewJsx, /\{t\('dim\.reset'\)\}/)
    assert.match(viewJsx, /onResetDimensions=\{feed\.resetDimensions\}/)
  })

  it('replaces the sub-category row for 角色 and leaves it for every other category', () => {
    assert.match(viewJsx, /const filterBarOwnsSecondLevel = characterFilters\.dimensions\.length > 0/)
    assert.match(viewJsx, /<CloudDimensionBar\n        t=\{t\}/)
    assert.match(viewJsx, /characterFilters=\{feed\.characterFilters\}/)
  })

  it('paints the bar with label tokens only: no brand hue, no literal colour', () => {
    const bar = ASSETS_CSS.slice(
      ASSETS_CSS.indexOf('.omnimux-assets-cloud-dimensions {'),
      ASSETS_CSS.indexOf('.omnimux-assets-cloud-scroll {'),
    )
    assert.match(bar, /border-radius: 999px/)
    assert.match(bar, /background: var\(--dsw-alias-label-primary\)/)
    assert.match(bar, /color: var\(--dsw-alias-label-primary-foreground\)/)
    assert.match(bar, /background: var\(--dsw-alias-bg-elevated\)/)
    assert.doesNotMatch(bar, /brand-primary/)
    assert.doesNotMatch(bar, /#[0-9a-fA-F]{3,8}\b/)
    assert.doesNotMatch(bar, /rgba?\(/)
  })

  it('stacks the option list above the grid instead of inside its flow', () => {
    const menu = ruleOf('.omnimux-assets-cloud-dimension-menu {')
    assert.match(menu, /position: absolute/)
    assert.match(menu, /top: calc\(100% \+ 6px\)/)
    assert.match(menu, /z-index: 20/)
    assert.match(menu, /max-height: 264px/)
    assert.match(menu, /overflow-y: auto/)
  })

  it('turns the caret to point at the open list, and inverts it on a selected pill', () => {
    const caret = ruleOf('.omnimux-assets-cloud-dimension-caret {')
    assert.match(caret, /transform: rotate\(90deg\)/)
    assert.match(caret, /var\(--dsw-alias-label-tertiary\)/)
    assert.match(ruleOf('.omnimux-assets-cloud-dimension-btn[aria-expanded="true"]'), /rotate\(-90deg\)/)
    assert.match(ruleOf('.omnimux-assets-cloud-dimension-btn[aria-pressed="true"] .omnimux-assets-cloud-dimension-caret'), /color: inherit/)
  })

  it('names the empty result after the filter that caused it', () => {
    assert.match(viewJsx, /const filtered = feed\.characterFilters\.active > 0/)
    assert.match(viewJsx, /t\('dim\.empty\.title'\)/)
    assert.equal(zh['dim.empty.title'], '没有符合这组条件的角色')
  })
})
