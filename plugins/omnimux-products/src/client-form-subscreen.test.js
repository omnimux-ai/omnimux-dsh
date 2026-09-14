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

  it('the action bar sits outside the scroll container so it stays visible', () => {
    const scrollIndex = pageJsx.indexOf('className="omnimux-products-form-scroll"')
    const footerIndex = pageJsx.indexOf('className="omnimux-products-form-footer"')
    assert.ok(scrollIndex > 0, 'missing scroll container')
    assert.ok(footerIndex > scrollIndex, 'the footer must follow the scroll container, not live inside it')
    assert.match(pageJsx, /\{isDirty \? t\('page\.unsavedHint'\) : ''\}/)
    assert.match(pageJsx, /\{t\('add\.cancel'\)\}/)
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
    assert.match(stageJsx, /key=\{view\.mode === 'edit' \? String\(view\.product\?\.id \?\? ''\) : 'create'\}/)
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
    assert.equal([...fieldsJsx.matchAll(/<CategoriesEditor/g)].length, 1)
    assert.equal([...fieldsJsx.matchAll(/<CoverDropzone/g)].length, 1)
    assert.equal([...fieldsJsx.matchAll(/<MediaList/g)].length, 1)
    assert.equal([...fieldsJsx.matchAll(/<UrlImportBar/g)].length, 1)
    assert.equal([...fieldsJsx.matchAll(/<ShotsSection/g)].length, 1)
    assert.equal([...fieldsJsx.matchAll(/<FormSection\b/g)].length, 6)
  })

  it('uses vector icons instead of character glyphs for every remove control', () => {
    assert.match(mediaJsx, /<CloseIcon size=\{12\} \/>/)
    assert.match(mediaJsx, /<CloseIcon size=\{10\} \/>/)
    assert.doesNotMatch(mediaJsx, /exempt-ui04/)
    assert.doesNotMatch(mediaJsx, /[\u00d7\u2715]/)
    assert.doesNotMatch(fieldsJsx, /[\u00d7\u2715]/)
  })
})
