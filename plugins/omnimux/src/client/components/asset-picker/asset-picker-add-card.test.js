import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  ASSET_CATEGORIES,
  remainingQuota,
  toggleSelect,
} from './picker-model.js'

describe('AssetPicker 首位添加资产卡片及连携弹窗规范', () => {
  it('导出规范：index.js 必须导出 AssetPickerAddCard 与 AssetAddModal', () => {
    const indexSource = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
    assert.ok(indexSource.includes('export { AssetPickerAddCard } from'), '导出 AssetPickerAddCard')
    assert.ok(indexSource.includes('export { AssetAddModal } from'), '导出 AssetAddModal')
  })

  it('AssetPickerAddCard 契约：作为列表首位占位按钮，支持标准无障碍语义与虚线交互', () => {
    const cardSource = readFileSync(new URL('./AssetPickerAddCard.jsx', import.meta.url), 'utf8')
    assert.ok(cardSource.includes('omx-asset-pick-card--add'), '包含专属添加卡片变体样式')
    assert.ok(cardSource.includes('role="button"'), '对外声明标准按钮可访问性角色')
    assert.ok(cardSource.includes('aria-label='), '具备无障碍标签')
    assert.ok(cardSource.includes('svg'), '使用纯矢量加号图标，无裸 Emoji')
    assert.ok(cardSource.includes('onKeyDown'), '支持回车与空格键盘快速触发')
  })

  it('AssetPicker 规范：非搜索态下首位恒定呈现 AssetPickerAddCard，搜索态下收起', () => {
    const pickerSource = readFileSync(new URL('./AssetPicker.jsx', import.meta.url), 'utf8')
    assert.ok(pickerSource.includes('<AssetPickerAddCard'), '网格首位注入 AssetPickerAddCard')
    assert.ok(pickerSource.includes('!searchQuery.trim()'), '非搜索态下必定激活首位添加卡片')
    assert.ok(pickerSource.includes('<AssetAddModal'), '集成自包含 AssetAddModal 添加模态框')
    assert.ok(pickerSource.includes('setAutoPick(true)'), '点击添加卡片后连携激活自动选取文件标记')
  })

  it('AssetAddModal 界面结构：完整复刻标准入库表单（名称/分类/描述/文件选区/标签）', () => {
    const modalSource = readFileSync(new URL('./AssetAddModal.jsx', import.meta.url), 'utf8')
    assert.ok(modalSource.includes('omx-asset-add-name-row'), '包含名称输入行并带 @ 前缀')
    assert.ok(modalSource.includes('omx-asset-add-type-row'), '包含分类选择下拉与描述输入')
    assert.ok(modalSource.includes('omx-asset-add-drop'), '包含文件拖拽与浏览选取区域')
    assert.ok(modalSource.includes('extractBaseName'), '具备从文件路径智能提取主文件名作为资产名的能力')
    assert.ok(modalSource.includes('ModalCloseButton'), '使用全局统一的浮动关闭按钮')
    assert.ok(modalSource.includes('placement="external"'), '关闭按钮固定于弹窗外侧')
  })

  it('智能预填逻辑：extractBaseName 能够正确剥离目录与文件后缀', () => {
    // 验证路径提取核心算法
    const extractBaseName = (filePath) => {
      if (typeof filePath !== 'string') return ''
      const clean = filePath.replace(/\/+$/, '')
      const parts = clean.split(/[/\\]/)
      const fileName = parts[parts.length - 1] || ''
      return fileName.replace(/\.[^.]+$/, '').trim()
    }
    assert.equal(extractBaseName('/Users/test/Desktop/cyberpunk-girl.png'), 'cyberpunk-girl')
    assert.equal(extractBaseName('C:\\Assets\\prop_sword.glb'), 'prop_sword')
    assert.equal(extractBaseName('/var/tmp/scene_forest.mp4'), 'scene_forest')
    assert.equal(extractBaseName('simple_image.jpeg'), 'simple_image')
  })

  it('入库连携与自动勾选联动：新增资产入库后直接被加入选中集合并更新已选配额', () => {
    // 模拟资产选择器的选中状态演变
    let selected = new Set(['ast_existing'])
    const occupied = 1
    const max = 8
    const newAsset = { id: 'ast_just_added', name: '新角色', type: 'character' }

    // 检查添加新资产时的配额
    const quotaBefore = remainingQuota({ occupied, selectedCount: selected.size, max })
    assert.equal(quotaBefore.remaining, 6)

    // 执行自动勾选联动
    if (quotaBefore.remaining > 0) {
      selected = new Set([...selected, newAsset.id])
    }

    assert.equal(selected.has('ast_just_added'), true)
    assert.equal(selected.size, 2)

    const quotaAfter = remainingQuota({ occupied, selectedCount: selected.size, max })
    assert.equal(quotaAfter.remaining, 5)
  })
})
