import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(here, 'client', name), 'utf8')

const pageJsx = read('ProductFormPage.jsx')
const dialogJsx = read('UnsavedChangesDialog.jsx')
const stageJsx = read('ProductsStage.jsx')
const stylesJs = read('styles.js')
const mediaJsx = read('ProductMediaSection.jsx')
const fieldsJsx = read('ProductFormFields.jsx')
const physicalJsx = read('PhysicalProductForm.jsx')
const digitalJsx = read('DigitalProductForm.jsx')
const menuJsx = read('CreateProductMenu.jsx')

/** 二级页的样式契约：类名必须真的在样式表里有定义，不只是写在 JSX 里。 */
const REQUIRED_SUBSCREEN_CLASSES = [
  'omnimux-products-subscreen',
  'omnimux-products-form-view',
  'omnimux-products-form-scroll',
  'omnimux-products-form-columns',
  'omnimux-products-form-col-left',
  'omnimux-products-form-col-right',
  'omnimux-products-form-footer',
  'omnimux-products-form-actions',
  'omnimux-products-back-path',
  'omnimux-products-dirty-dot',
  'omnimux-products-shot-grid',
  'omnimux-products-shot-cell',
  'omnimux-products-media-thumb',
  'omnimux-products-unsaved-actions',
]

const REMOVED_MODAL_CLASSES = [
  'omnimux-products-modal-backdrop',
  'omnimux-products-modal-wrapper',
  'omnimux-products-modal-close',
  'omnimux-products-modal-container',
]

describe('OmniMux Products secondary form sub-screen contract', () => {
  it('styles.js declares every sub-screen class and no modal shell survives', () => {
    for (const className of REQUIRED_SUBSCREEN_CLASSES) {
      assert.match(stylesJs, new RegExp(`\\.${className}\\b`), `missing .${className}`)
    }
    for (const className of REMOVED_MODAL_CLASSES) {
      assert.doesNotMatch(stylesJs, new RegExp(`\\.${className}\\b`), `modal style survived: .${className}`)
    }
    assert.match(stylesJs, /@keyframes omnimux-products-fade-in/)
  })

  it('the sub-screen covers the tab in place — absolute, full-bleed, above the list', () => {
    const block = stylesJs.match(/\.omnimux-products-subscreen \{[\s\S]*?\n\}/)
    assert.ok(block, 'missing .omnimux-products-subscreen rule')
    assert.match(block[0], /position:\s*absolute;/)
    assert.match(block[0], /inset:\s*0;/)
    assert.match(block[0], /z-index:\s*300;/)

    const root = pageJsx.match(/className="omnimux-products-subscreen omnimux-products-form-view"/)
    assert.ok(root, 'ProductFormPage must root on the sub-screen class pair')
  })

  it('the action bar sits in PageHeader actions outside the scroll container so it stays visible', () => {
    const scrollIndex = pageJsx.indexOf('className="omnimux-products-form-scroll"')
    const actionsIndex = pageJsx.indexOf('className="omnimux-products-form-actions"')
    assert.ok(scrollIndex > 0, 'missing scroll container')
    assert.ok(actionsIndex > 0 && actionsIndex < scrollIndex, 'actions must be mounted before the scroll container in PageHeader')
    assert.match(pageJsx, /actions=\{\(\s*<div className="omnimux-products-form-actions">/)
    assert.match(pageJsx, /\{t\('add\.cancel'\)\}/)
    assert.doesNotMatch(pageJsx, /className="omnimux-products-form-footer"/)
  })

  it('keeps one leave guard behind every exit path', () => {
    assert.match(pageJsx, /const requestLeave = \(\) => \{/)
    assert.match(pageJsx, /if \(isDirty\) \{\n\s*setPendingLeave\(true\)/)
    // 返回按钮 / 面包屑「产品库」/ 取消 都指向同一个守卫。
    assert.equal([...pageJsx.matchAll(/onClick=\{requestLeave\}/g)].length, 3)
    // Esc 也走同一条守卫，且确认框打开时不抢键盘。
    assert.match(pageJsx, /if \(event\.key !== 'Escape' \|\| pendingLeave\) return/)
  })

  it('delegates the modal to the kit and offers three ordered choices', () => {
    assert.match(dialogJsx, /import \{ Button, ModalDialog, focusFirstDescendant, trapFocus \} from 'dsh-ui-kit'/)
    assert.match(dialogJsx, /<ModalDialog\n\s*open=\{open\}/)
    assert.match(dialogJsx, /onClose=\{onKeep\}/)
    assert.match(dialogJsx, /closeLabel=\{t\('unsaved\.keep'\)\}/)
    assert.match(dialogJsx, /variant="ghost"/)
    assert.match(dialogJsx, /variant="danger"/)
    assert.match(dialogJsx, /variant="primary"/)
    // 默认焦点落在安全项上；Tab 循环不逃逸。
    assert.match(dialogJsx, /focusFirstDescendant\(panelRef\.current\)/)
    assert.match(dialogJsx, /trapFocus\(panelRef\.current, event\)/)
    assert.equal([...dialogJsx.matchAll(/variant="(ghost|danger|primary)"/g)].length, 3)
  })

  it('saving from the confirmation validates first and only then leaves', () => {
    assert.match(pageJsx, /const handleSave = async \(\) => \{/)
    assert.match(pageJsx, /if \(!canSubmit\) return false/)
    assert.match(pageJsx, /canSave=\{canSubmit\}/)
    // 保存失败：关掉确认框留在二级页（错误条可见、输入零丢失），不静默离开。
    assert.match(pageJsx, /setPendingLeave\(false\)\n\s*if \(ok\) onLeave\(\)/)
  })

  it('mirrors the dirty flag upward and never reads it back', () => {
    assert.match(pageJsx, /onDirtyChange\(isDirty\)/)
    assert.match(pageJsx, /onDirtyChange\?\.\(false\)/)
    assert.doesNotMatch(pageJsx, /setIsDirty/)
    assert.match(stageJsx, /onDirtyChange=\{handleDirtyChange\}/)
  })

  it('renders the breadcrumb path and the unsaved dot on the page header', () => {
    assert.match(pageJsx, /breadcrumb=\{\(/)
    assert.match(pageJsx, /aria-label=\{t\('page\.back'\)\}/)
    assert.match(pageJsx, /aria-current="page"/)
    assert.match(pageJsx, /className="omnimux-products-dirty-dot"/)
    // 表单页不提供刷新与关闭：刷新会丢输入，关闭是退出整个 Tab 的语义。
    assert.doesNotMatch(pageJsx, /onRefresh=/)
    assert.doesNotMatch(pageJsx, /onClose=/)
  })

  it('the list view stays mounted underneath so scroll and filters survive', () => {
    assert.match(stageJsx, /className="omnimux-products-list-view"/)
    assert.match(stageJsx, /const formOpen = view\.name === 'form'/)
    assert.match(stageJsx, /key=\{`\$\{view\.mode === 'edit' \? String\(view\.product\?\.id \?\? ''\) : 'create'\}:\$\{view\.kind\}`\}/)
    assert.match(stageJsx, /initial=\{view\.mode === 'edit' \? view\.product : null\}/)
    // 列表不是 display:none —— 那会重置滚动位置，等于把保活做成了摆设。
    assert.doesNotMatch(stageJsx, /data-hidden/)
  })

  it('drops the dialog component and its dead dirty plumbing for good', () => {
    for (const source of [stageJsx, pageJsx, fieldsJsx]) {
      assert.doesNotMatch(source, /ProductFormDialog/)
    }
    assert.doesNotMatch(stageJsx, /editingDirty/)
    assert.doesNotMatch(stageJsx, /\bcreating\b/)
    assert.doesNotMatch(stageJsx, /setEditing\(/)
  })

  it('closing the tab never clears what the user typed', () => {
    const closeBlock = stageJsx.match(/const handleCloseTab = \(\) => \{[\s\S]*?\n {2}\}/)
    assert.ok(closeBlock, 'missing handleCloseTab')
    assert.doesNotMatch(closeBlock[0], /leaveForm|setFormError|setView/)
  })

  it('renders every section exactly once — no duplicated editor in the two-column body', () => {
    // 分类标签与素材区曾经同时出现在两个分区里，同一个编辑器会被渲染两遍。
    // 共享构件留在 ProductFormFields，形态各自的取舍写在两个表单文件里。
    const both = `${physicalJsx}\n${digitalJsx}`
    for (const tag of ['<MediaSection', '<UrlImportBar', '<CategoriesEditor', '<ProductNameRow']) {
      const total = [...both.matchAll(new RegExp(tag, 'g'))].length
      assert.equal(total, 2, `${tag} must appear once per form, got ${total}`)
    }
    // 拖拽入口与素材列表只在共享的 MediaSection 里出现一次。
    assert.equal([...fieldsJsx.matchAll(/<CoverDropzone/g)].length, 1)
    assert.equal([...fieldsJsx.matchAll(/<MediaList/g)].length, 1)
    assert.equal([...both.matchAll(/<ShotsSection/g)].length, 1, 'shots are digital-only')
    assert.equal([...digitalJsx.matchAll(/<ShotsSection/g)].length, 1)
    assert.equal([...both.matchAll(/<DigitalStrategyPanel/g)].length, 1, 'the strategy panel is digital-only')
    assert.equal([...physicalJsx.matchAll(/<FormSection\b/g)].length, 5)
    assert.equal([...digitalJsx.matchAll(/<FormSection\b/g)].length, 5)
    // 共享构件自己不再渲染任何分区，也不再按 kind 分支挑字段。
    assert.equal([...fieldsJsx.matchAll(/<FormSection\b/g)].length, 0)
  })

  it('keeps physical and digital fields strictly apart in the two forms', () => {
    // 数字：六维战略 + 官网链接；实物：价格 / SKU / 促销 / 商品链接。
    assert.match(digitalJsx, /<DigitalStrategyPanel/)
    assert.match(digitalJsx, /add\.digitalLinkPlaceholder/)
    assert.doesNotMatch(digitalJsx, /ProductCommerceFields/)
    assert.doesNotMatch(digitalJsx, /add\.pricePlaceholder/)

    assert.match(physicalJsx, /<ProductCommerceFields/)
    assert.doesNotMatch(physicalJsx, /DigitalStrategyPanel/)
    assert.doesNotMatch(physicalJsx, /ShotsSection/)
    assert.doesNotMatch(physicalJsx, /ScreenshotPreview/)

    // 两个表单都不再有形态切换入口。
    for (const source of [physicalJsx, digitalJsx, fieldsJsx, pageJsx]) {
      assert.doesNotMatch(source, /KindSwitcher/)
      assert.doesNotMatch(source, /kind-chip/)
      assert.doesNotMatch(source, /handleSelect(Physical|Digital)/)
    }
    assert.doesNotMatch(stylesJs, /omnimux-products-kind-(row|label|chip)/)
  })

  it('routes every product card by its persisted kind', () => {
    assert.match(stageJsx, /kind: normalizedKind\(kind\), product: null/)
    assert.match(stageJsx, /kind: normalizedKind\(fresh\.kind \|\| product\.kind\)/)
    assert.match(stageJsx, /<ProductFormPage[\s\S]*?kind=\{view\.kind\}/)
  })

  it('uses the hover split menu for both create entry points and never a character glyph', () => {
    assert.match(stageJsx, /<CreateProductMenu t=\{t\} onSelect=\{handleCreate\} \/>/)
    assert.equal([...stageJsx.matchAll(/<CreateProductMenu\b/g)].length, 2, 'action row + empty state')
    assert.match(menuJsx, /leadingIcon=\{<PlusIcon \/>\}/)
    assert.match(menuJsx, /trailingIcon=\{<ChevronDownIcon size=\{12\} \/>\}/)
    assert.match(menuJsx, /onMouseEnter=\{openSoon\}/)
    assert.match(menuJsx, /onMouseLeave=\{closeSoon\}/)
    assert.match(menuJsx, /\}, OPEN_DELAY_MS\)/)
    assert.match(menuJsx, /\}, CLOSE_DELAY_MS\)/)
    assert.match(stylesJs, /\.omnimux-products-create-menu\b/)
    assert.match(stylesJs, /\.omnimux-products-menu-card\b/)
    assert.doesNotMatch(menuJsx, /[\u00d7\u2715\u25be\u25bc]/)
  })

  it('separates page header from the form body with a Divider aligned to form margins', () => {
    assert.match(pageJsx, /import \{[^}]*Divider[^}]*\} from 'dsh-ui-kit'/)
    assert.match(pageJsx, /<PageHeader[\s\S]*?\/>\s*<Divider className="omnimux-products-form-divider" \/>\s*<div className="omnimux-products-form-scroll">/)
    assert.match(stylesJs, /\.omnimux-products-form-divider\b/)
    assert.match(stylesJs, /margin:\s*0\s*20px/)
    assert.match(stylesJs, /width:\s*calc\(100%\s*-\s*40px\)/)
  })

  it('uses vector icons instead of character glyphs for every remove control', () => {
    assert.match(mediaJsx, /<CloseIcon size=\{12\} \/>/)
    assert.match(mediaJsx, /<CloseIcon size=\{10\} \/>/)
    assert.doesNotMatch(mediaJsx, /exempt-ui04/)
    assert.doesNotMatch(mediaJsx, /[\u00d7\u2715]/)
    assert.doesNotMatch(fieldsJsx, /[\u00d7\u2715]/)
  })
})
