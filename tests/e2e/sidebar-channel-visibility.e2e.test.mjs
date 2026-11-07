import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXPLORE_MENU_ITEMS,
  RELEASE_CHANNEL,
  filterExploreItemsForChannel,
  isPinnedSidebarEntry,
} from '../../plugins/omnimux/src/client/sidebar-coordinator.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')

/**
 * 侧栏入口按发布渠道显隐（Issue #3971）端到端契约。
 *
 * 开发版（development）恢复核心常驻行与完整「更多」菜单；正式版（production）
 * 只过滤 plugin-lifecycle 标记的 Alpha 测试版四项（账号/发布/数据分析/任务表单）。
 * 判定真源：release-channel.json + plugin-lifecycle.json，不得有第二份名单。
 */
test('E2E: 开发版「更多」菜单恢复全部 8 项，正式版只过滤 Alpha 四项', () => {
  const dev = filterExploreItemsForChannel(EXPLORE_MENU_ITEMS, 'development').map((item) => item.label)
  assert.deepEqual(dev, ['应用', '视频剪辑', '发布', '账号', '手机管理', '数据分析', '任务表单', '社交采收'])

  const prod = filterExploreItemsForChannel(EXPLORE_MENU_ITEMS, 'production').map((item) => item.label)
  assert.deepEqual(prod, ['应用', '视频剪辑', '手机管理', '社交采收'])
  assert.equal(prod.includes('账号'), false)
  assert.equal(prod.includes('发布'), false)
  assert.equal(prod.includes('数据分析'), false)
  assert.equal(prod.includes('任务表单'), false)
})

test('E2E: 核心常驻白名单恢复为 项目/技能专家/资产库/灵感社区/AI网红工作室', () => {
  for (const id of [
    'omnimux-workflow-entry',
    'omnimux-market-entry',
    'omnimux-assets-entry',
    'omnimux-inspiration-entry',
    'omnimux-avatar-entry',
  ]) {
    assert.equal(isPinnedSidebarEntry(id), true, `${id} 必须回到核心常驻白名单`)
  }
  for (const id of ['omnimux-accounts-entry', 'omnimux-publish-entry', 'omnimux-clip-entry']) {
    assert.equal(isPinnedSidebarEntry(id), false, `${id} 不得常驻侧栏`)
  }
})

test('E2E: 渠道过滤读单一真源，正式版对 Alpha 行有兜底不挂载', () => {
  const content = fs.readFileSync(coordinatorPath, 'utf8')
  assert.match(content, /import releaseChannel from '\.\.\/release-channel\.json'/, '必须读发布渠道单一真源')
  assert.match(content, /export function filterExploreItemsForChannel/, '必须提供纯过滤函数')
  assert.match(content, /isAlphaEntry\(item\?\.entryId\)/, '过滤必须复用 isAlphaEntry，不得自建名单')
  assert.match(content, /RELEASE_CHANNEL === 'production' && isAlphaEntry\(id\)/, '正式版还须兜底不挂 Alpha 行')
  assert.equal(content.includes('omnimux-explore-entry'), false, '自绘探索行不得回流')
})

test('E2E: 源码渠道为 development，开发版默认展示全部入口', () => {
  assert.equal(RELEASE_CHANNEL, 'development', '本仓源码/开发目标渠道必须是 development')
  assert.equal(filterExploreItemsForChannel(EXPLORE_MENU_ITEMS).length, EXPLORE_MENU_ITEMS.length)
})
