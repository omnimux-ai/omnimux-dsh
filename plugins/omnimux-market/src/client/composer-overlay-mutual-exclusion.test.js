import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

describe('契约测试：输入框底栏浮层单例互斥规范与协同总线', () => {
  const skillPickerSrc = readFileSync(join(here, 'skill-picker.js'), 'utf8')
  const modelPickerSrc = readFileSync(
    join(here, '../../../omnimux/src/client/composer-quick-shortcuts/ModelPicker.jsx'),
    'utf8'
  )
  const composerI18nSrc = readFileSync(
    join(here, '../../../omnimux/src/client/composer-commands-i18n.js'),
    'utf8'
  )

  it('契约 1: skill-picker 打开时广播互斥事件，并监听外部互斥事件收起自身', () => {
    assert.match(
      skillPickerSrc,
      /dispatchEvent\(new CustomEvent\("omnimux:composer:overlay:open"/,
      '技能按钮展开时必须派发 omnimux:composer:overlay:open 事件'
    )
    assert.match(
      skillPickerSrc,
      /detail:\s*\{\s*id:\s*"skill-picker"\s*\}/,
      '广播事件 payload 必须指明 id: "skill-picker"'
    )
    assert.match(
      skillPickerSrc,
      /addEventListener\("omnimux:composer:overlay:open"/,
      '技能选择器必须监听全局浮层打开事件'
    )
    assert.match(
      skillPickerSrc,
      /if\s*\(e\?\.detail\?\.id\s*!==\s*"skill-picker"\)\s*\{\s*close\(\);\s*\}/,
      '非技能浮层激活时，技能面板必须自动收起'
    )
  })

  it('契约 2: model-picker 打开时广播互斥事件，并监听外部互斥事件收起自身', () => {
    assert.match(
      modelPickerSrc,
      /dispatchEvent\(new CustomEvent\(['"]omnimux:composer:overlay:open['"]/,
      '模型选择器展开时必须派发 omnimux:composer:overlay:open 事件'
    )
    assert.match(
      modelPickerSrc,
      /detail:\s*\{\s*id:\s*['"]model-picker['"]\s*\}/,
      '广播事件 payload 必须指明 id: "model-picker"'
    )
    assert.match(
      modelPickerSrc,
      /addEventListener\(['"]omnimux:composer:overlay:open['"]/,
      '模型选择器必须监听全局浮层打开事件'
    )
    assert.match(
      modelPickerSrc,
      /if\s*\(e\?\.detail\?\.id\s*!==\s*['"]model-picker['"]\)\s*\{\s*setOpen\(false\);\s*\}/,
      '非模型浮层激活时，模型面板必须自动收起'
    )
  })

  it('契约 3: composer-commands-i18n 暴露标准收起器 dismissPlusMenu 且集成互斥总线', () => {
    assert.match(
      composerI18nSrc,
      /export function dismissPlusMenu/,
      '必须导出 dismissPlusMenu 标准收起函数'
    )
    assert.match(
      composerI18nSrc,
      /button\[aria-haspopup="listbox"\]\[aria-expanded="true"\]/,
      'dismissPlusMenu 必须精准匹配当前正处于展开态的加号按钮'
    )
    assert.match(
      composerI18nSrc,
      /COMPOSER_OVERLAY_OPEN_EVENT = 'omnimux:composer:overlay:open'/,
      '必须对齐全局统一的浮层协调事件常量'
    )
    assert.match(
      composerI18nSrc,
      /dismissPlusMenu\(doc\)/,
      '在捕获到用户点击技能按钮或收到外部打开通知时，必须安全触发加号菜单收起'
    )
  })

  it('契约 4: 完整互斥状态机流转 (Plus -> Skill -> Model -> Plus)', () => {
    const openOverlays = new Set()
    const handleOverlayOpen = (id) => {
      for (const openId of openOverlays) {
        if (openId !== id) openOverlays.delete(openId)
      }
      openOverlays.add(id)
    }

    // 1. 用户打开加号菜单
    handleOverlayOpen('plus-menu')
    assert.deepEqual(Array.from(openOverlays), ['plus-menu'], '当前仅加号菜单激活')

    // 2. 用户点击技能按钮 -> 广播 skill-picker
    handleOverlayOpen('skill-picker')
    assert.deepEqual(Array.from(openOverlays), ['skill-picker'], '加号菜单自动收起，当前仅技能选择器激活')

    // 3. 用户点击模型按钮 -> 广播 model-picker
    handleOverlayOpen('model-picker')
    assert.deepEqual(Array.from(openOverlays), ['model-picker'], '技能选择器自动收起，当前仅模型选择器激活')

    // 4. 用户再次点击加号按钮 -> 广播 plus-menu
    handleOverlayOpen('plus-menu')
    assert.deepEqual(Array.from(openOverlays), ['plus-menu'], '模型选择器自动收起，当前仅加号菜单激活')
  })
})
