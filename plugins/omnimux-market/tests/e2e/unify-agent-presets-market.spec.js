/**
 * @file plugins/omnimux-market/tests/e2e/unify-agent-presets-market.spec.js
 * E2E：Agent 预设与专家插件市场数据源统一、出海专家精简与官方预设动态聚合完整旅程。
 */

import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { DEFAULT_MARKET_EXPERTS, reconcileMarketExperts } from '../../lib/expert-market.js'
import * as plazaUtils from '../../src/client/plaza/plazaUtils.js'

function buildCardRenderer() {
  const cardJsxCode = readFileSync(new URL('../../src/client/plaza/ExpertCard.jsx', import.meta.url), 'utf8')
    .replace(/^import React.*$/m, '')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/plazaUtils\.js['"];/m, '')
    .replaceAll('export function', 'function')

  const sandbox = {
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props || {},
        children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
      }),
    },
    EXPERT_STATUS_CONFIG: plazaUtils.EXPERT_STATUS_CONFIG,
    getExpertButtonText: plazaUtils.getExpertButtonText,
    getExpertLocalizedNames: plazaUtils.getExpertLocalizedNames,
    getExpertStatusText: plazaUtils.getExpertStatusText,
    resolveExpertAvatar: plazaUtils.resolveExpertAvatar,
    resolveIconSrc: plazaUtils.resolveIconSrc,
    resolveInitials: plazaUtils.resolveInitials,
    exports: {},
  }

  runInNewContext(`${cardJsxCode}\nexports.renderExpertCard = renderExpertCard;`, sandbox)
  return sandbox.exports.renderExpertCard
}

test('E2E 旅程一：出海专精专家收敛为 5 位，彻底杜绝 HTML 生成器与双胞胎冗余', () => {
  assert.equal(DEFAULT_MARKET_EXPERTS.length, 5)
  const ids = DEFAULT_MARKET_EXPERTS.map((e) => e.id)
  assert.deepEqual(ids, [
    'shopee-ops-expert',
    'youtube-creator-expert',
    'amazon-operations-expert',
    'tiktok-ecommerce-expert',
    'media-creator',
  ])

  // 严禁存在非 Agent 的 HTML 生成器与粗糙版冗余项
  assert.ok(!ids.includes('html-generator'), 'HTML 生成器严禁出现在专家阵容')
  assert.ok(!ids.includes('amazon-ops-expert'), '粗糙版亚马逊专家已淘汰')
  assert.ok(!ids.includes('tiktok-shop-ops-expert'), '粗糙版 TikTok Shop 专家已淘汰')

  const renderCard = buildCardRenderer()
  const dummyOpts = {
    tr: (k) => k,
    isEn: false,
    expertMarketToggling: null,
    onToggle: () => {},
  }

  for (const exp of DEFAULT_MARKET_EXPERTS) {
    const vnode = renderCard(exp, dummyOpts)
    assert.ok(vnode, `出海专精卡片 ${exp.id} 正常渲染`)
    const avatarWrap = vnode.children.find((c) => c?.props?.className === 'expert-card-avatar-wrap')
    assert.ok(avatarWrap, `${exp.id} 包含头像容器`)
    const imgNode = avatarWrap.children.find((c) => c?.type === 'img')
    assert.ok(imgNode, `${exp.id} 包含像素头像 img`)
    assert.match(imgNode.props.src, /^data:image\/svg\+xml/, '像素头像必须为 svg')
  }
})

test('E2E 旅程二：官方系统团队与用户自建 Agent 动态聚合至专家市场全息视图', () => {
  const home = mkdtempSync(join(tmpdir(), 'e2e-unify-market-'))
  try {
    const mockOfficialPresets = [
      { id: 'standard', trust: 'system', name: '代码开发' },
      { id: 'tiktok-agent', trust: 'system', name: 'TikTok运营专家团' },
      { id: 'drama-agent', trust: 'system', name: '短剧专家' },
      { id: 'user-custom-marketer', trust: 'user', name: '出海营销助理', description: '自建私有营销 Agent' },
    ]

    const reconciled = reconcileMarketExperts(home, mockOfficialPresets)
    assert.ok(reconciled.length >= 9, '聚合后专家数量必须包含出海专精、系统预置与自建 Agent')

    // 1. 验证系统预置 Agent 投影
    const codeDev = reconciled.find((it) => it.id === 'standard')
    assert.ok(codeDev, '系统级代码开发必须出现在专家市场')
    assert.equal(codeDev.group, 'system')
    assert.equal(codeDev.status, 'enabled')

    // 2. 验证用户自建 Agent 投影
    const customAgent = reconciled.find((it) => it.id === 'user-custom-marketer')
    assert.ok(customAgent, '用户自建 Agent 必须实时亮相专家市场')
    assert.equal(customAgent.group, 'custom')
    assert.equal(customAgent.status, 'enabled')

    // 3. 验证卡片渲染和徽章
    const renderCard = buildCardRenderer()
    const trMap = {
      'expertMarket.system': '系统预置',
      'expertMarket.custom': '用户自建',
      'expertMarket.enabled': '已入职',
    }
    const renderOpts = {
      tr: (k) => trMap[k] || k,
      isEn: false,
      expertMarketToggling: null,
      onToggle: () => {},
    }

    // 渲染系统预置卡片
    const sysCardVNode = renderCard({ ...codeDev, status: 'system' }, renderOpts)
    const sysStatusNode = sysCardVNode.children.find((c) => c?.props?.className?.includes('expert-card-status'))
    assert.ok(sysStatusNode, '必须渲染状态标签')
    assert.equal(sysStatusNode.children[0], '[ 系统预置 ]', '系统级 Agent 必须呈现 [系统预置] 徽章')

    // 渲染用户自建卡片
    const customCardVNode = renderCard({ ...customAgent, status: 'custom' }, renderOpts)
    const customStatusNode = customCardVNode.children.find((c) => c?.props?.className?.includes('expert-card-status'))
    assert.ok(customStatusNode, '必须渲染自建状态标签')
    assert.equal(customStatusNode.children[0], '[ 用户自建 ]', '自建 Agent 必须呈现 [用户自建] 徽章')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
