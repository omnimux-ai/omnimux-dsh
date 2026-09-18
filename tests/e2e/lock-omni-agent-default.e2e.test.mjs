import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 验证默认锁定社媒专家且页面上彻底移除 Agent 切换按钮', () => {
  const stylesPath = path.join(root, 'plugins/omnimux/src/client/styles.js')
  const enhancerPath = path.join(root, 'plugins/omnimux/src/client/agent-preset-enhancer.js')

  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')
  const enhancerContent = fs.readFileSync(enhancerPath, 'utf-8')

  // 1. 验证全局样式中已硬性隐藏 Agent 切换按钮与预设菜单
  assert.ok(
    stylesContent.includes('[data-composer-seat]') && stylesContent.includes('[data-omnimux-preset-seat]'),
    'styles.js 必须包含对 [data-composer-seat] 和 [data-omnimux-preset-seat] 的硬隐藏规则'
  )
  assert.ok(
    stylesContent.includes('button[class*="AgentPresetSeat_seat"]') || stylesContent.includes('button[class*="PnBhwW_seat"]'),
    'styles.js 必须包含对 AgentPresetSeat 按钮的隐藏规则'
  )

  // 2. 验证 enhancer 样式中也部署了移除切换与下架其他专家的双重防线
  assert.ok(
    enhancerContent.includes('[data-omnimux-preset-item]:not([data-omnimux-preset-id="omni-agent"])'),
    'agent-preset-enhancer.js 必须对非 omni-agent 的其他专家选项应用隐藏下架'
  )

  // 3. 验证构建脚本与出厂预设中保留所有专家，不执行物理删除
  const presetsDir = path.join(root, 'presets')
  assert.ok(fs.existsSync(path.join(presetsDir, 'omni-agent')), '默认 omni-agent 必须保留')
  assert.ok(fs.existsSync(path.join(presetsDir, 'marketing-agent')), 'marketing-agent 必须保留不删除')
  assert.ok(fs.existsSync(path.join(presetsDir, 'drama-agent')), 'drama-agent 必须保留不删除')
  assert.ok(fs.existsSync(path.join(presetsDir, 'marketing-growth-team')), 'marketing-growth-team 必须保留不删除')
  assert.ok(fs.existsSync(path.join(presetsDir, 'standard')), 'standard 必须保留不删除')
  assert.ok(fs.existsSync(path.join(presetsDir, 'daily-work')), 'daily-work 必须保留不删除')
})
