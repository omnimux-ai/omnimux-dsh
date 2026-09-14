/**
 * E2E：社媒账号连接弹窗（ConnectModal）完整用户旅程（浏览平台列表 → 选择可用渠道 → 状态流转与轮询）。
 *
 * 验证核心改进（Issue #1769 / 方案 A）：
 * 1. 核心可用平台（TikTok, Instagram, YouTube）平铺于整齐 3 列网格，卡片为标准横向左图右文结构；
 * 2. 筹备中渠道（X, Facebook）移至底部轻量收纳栏，彻底消除原版 5 个卡片排成双列造成的右下角空白；
 * 3. 卡片点击正确触发授权启动流程。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STYLES } from '../../src/client/styles.js'
import { zh, en } from '../../src/client/locales.js'
import { SUPPORTED_PLATFORMS, COMING_PLATFORMS } from '../../src/client/platforms.js'

const here = dirname(fileURLToPath(import.meta.url))
const modalJsx = readFileSync(join(here, '../../src/client/ConnectModal.jsx'), 'utf8')

describe('ConnectModal E2E & Visual Hierarchy Flow', () => {
  it('renders 3-column grid for primary supported platforms without single-item blank', () => {
    assert.match(STYLES, /\.omnimux-accounts-platform-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/)
    assert.equal(SUPPORTED_PLATFORMS.length, 3, 'exactly 3 primary supported platforms')
    assert.deepEqual([...SUPPORTED_PLATFORMS], ['tiktok', 'instagram', 'youtube'])
  })

  it('renders dedicated coming channels strip for secondary channels', () => {
    assert.match(modalJsx, /omnimux-accounts-coming-section/)
    assert.match(modalJsx, /omnimux-accounts-coming-strip/)
    assert.match(modalJsx, /omnimux-accounts-coming-icons/)
    assert.match(modalJsx, /omnimux-accounts-mini-icon/)
    assert.match(STYLES, /\.omnimux-accounts-coming-strip\s*\{/)
    assert.equal(COMING_PLATFORMS.length, 2, 'exactly 2 coming platforms')
    assert.deepEqual([...COMING_PLATFORMS], ['x', 'facebook'])
  })

  it('ensures platform button cards preserve direct horizontal row layout without inner wrappers', () => {
    assert.match(STYLES, /\.omnimux-accounts-platform-btn\s*\{[^}]*flex-direction:\s*row;/)
    assert.match(modalJsx, /<button\s+\/\/\s*exempt-ui01/)
    assert.match(modalJsx, /omnimux-accounts-brand-icon/)
    assert.match(modalJsx, /omnimux-accounts-platform-info/)
    assert.match(modalJsx, /omnimux-accounts-platform-action/)
  })

  it('provides bilingual strings for coming channels hint and platform descriptions', () => {
    assert.equal(zh['connect.comingChannels'], 'X (推特)、Facebook (脸书) 等官方渠道接入中')
    assert.equal(en['connect.comingChannels'], 'X (Twitter), Facebook and more official channels are coming soon')

    for (const p of [...SUPPORTED_PLATFORMS, ...COMING_PLATFORMS]) {
      assert.ok(zh[`platform.desc.${p}`], `missing zh description for ${p}`)
      assert.ok(en[`platform.desc.${p}`], `missing en description for ${p}`)
    }
  })
})
