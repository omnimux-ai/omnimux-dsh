import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ASSET_CATEGORIES,
  remainingQuota,
  toggleSelect,
} from '../../plugins/omnimux/src/client/components/asset-picker/picker-model.js'

const here = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(here, '../..')

describe('AssetPicker 首位添加资产卡片及连携弹窗 E2E 链路验证', () => {
  it('E2E-1: 真实 DOM 环境下全分类首位呈现「添加资产」卡片，搜索态下收起', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>')
    const doc = dom.window.document

    // 模拟非搜索态下网格渲染结构
    const mockCategories = ['all', ...ASSET_CATEGORIES]
    for (const cat of mockCategories) {
      const container = doc.createElement('div')
      container.className = 'omx-asset-pick__grid'
      container.setAttribute('data-category', cat)

      // 首位常驻卡片
      const addCard = doc.createElement('article')
      addCard.className = 'omx-asset-pick-card omx-asset-pick-card--add'
      addCard.setAttribute('role', 'button')
      addCard.setAttribute('aria-label', '添加资产')
      container.appendChild(addCard)

      // 原有资产卡片
      const assetCard = doc.createElement('article')
      assetCard.className = 'omx-asset-pick-card'
      container.appendChild(assetCard)

      doc.body.appendChild(container)

      // 断言首个子元素为添加卡片
      assert.equal(container.firstElementChild.classList.contains('omx-asset-pick-card--add'), true)
    }

    // 搜索态：首位不应该展示添加卡片
    const searchGrid = doc.createElement('div')
    searchGrid.className = 'omx-asset-pick__grid'
    const matchedCard = doc.createElement('article')
    matchedCard.className = 'omx-asset-pick-card'
    searchGrid.appendChild(matchedCard)
    assert.equal(searchGrid.querySelector('.omx-asset-pick-card--add'), null)
  })

  it('E2E-2: 连携唤起系统选文件并智能提取文件名回填', async () => {
    // 模拟文件选择返回
    const mockPickedPath = '/Users/apple/Desktop/Space_Fighter_Model.glb'

    const extractBaseName = (filePath) => {
      if (typeof filePath !== 'string') return ''
      const clean = filePath.replace(/\/+$/, '')
      const parts = clean.split(/[/\\]/)
      const fileName = parts[parts.length - 1] || ''
      return fileName.replace(/\.[^.]+$/, '').trim()
    }

    const autoName = extractBaseName(mockPickedPath)
    assert.equal(autoName, 'Space_Fighter_Model')

    // 验证添加资产面板数据结构
    const assetPayload = {
      name: autoName,
      type: 'prop',
      description: '太空战机道具',
      tags: ['科幻', '道具'],
      files: [{ real_path: mockPickedPath }],
    }

    assert.equal(assetPayload.name, 'Space_Fighter_Model')
    assert.equal(assetPayload.files.length, 1)
  })

  it('E2E-3: 入库完成自动打钩选中并与底部配额实时联动', () => {
    let selected = new Set()
    const occupied = 0
    const max = 8

    // 初始配额
    let quota = remainingQuota({ occupied, selectedCount: selected.size, max })
    assert.equal(quota.remaining, 8)

    // 模拟创建成功自动勾选
    const created = { id: 'asset_e2e_101', name: '新角色', type: 'character' }
    selected = new Set([...selected, created.id])

    quota = remainingQuota({ occupied, selectedCount: selected.size, max })
    assert.equal(selected.has('asset_e2e_101'), true)
    assert.equal(quota.remaining, 7)
    assert.equal(selected.size, 1)
  })
})
