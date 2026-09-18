/**
 * E2E 契约测试：三栏空间重塑与大屏全量自适应（Issue #2316）。
 * 覆盖：
 *  1. 分栏几何算法：中间会话栏定宽 380px 黄金控制台；
 *  2. 大屏反哺机制：在 1280px、1440px、1920px、2560px 视口下多出空间全部反哺给右侧主舞台；
 *  3. 网格样式契约：胜出规则声明中栏 380px 与第三轨 minmax(0px, 1fr)；
 *  4. 输入框容器查询在 380px 宽度下自适应紧凑无重叠。
 */

import assert from 'node:assert/strict'
import test, { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  WORKBENCH_CONVERSATION_TARGET_PX,
  WORKBENCH_CONVERSATION_MIN_PX,
  workbenchDefaultWidthPx,
  workbenchSplitMaxPanelPx,
} from '../../src/client/workbench/geometry.js'
import {
  CONVERSATION_WIDTH_FALLBACK_PX,
} from '../../src/client/sidebar-toggle-topbar.js'
import {
  PRODUCT_STAGE_CHROME,
} from '../../src/client/conversation-box.js'
import {
  COMPOSER_COMPACT_CSS,
} from '../../src/client/composer-compact.js'

describe('E2E: 三栏空间重塑与全分辨率自适应（Issue #2316）', () => {
  it('中栏目标宽度常数与降级常数已收敛为 380px', () => {
    assert.equal(WORKBENCH_CONVERSATION_TARGET_PX, 380, '中栏目标宽度必须为 380px')
    assert.equal(CONVERSATION_WIDTH_FALLBACK_PX, 380, '会话栏降级宽度必须为 380px')
    assert.equal(WORKBENCH_CONVERSATION_MIN_PX, 360, '中栏保底最小宽度维持 360px')
  })

  it('四档典型分辨率下，中栏稳定在 380px，右栏吸收全部大屏多余空间', () => {
    const makeState = (width = 500) => ({
      panelOpen: true,
      width,
      tabs: [{ id: 'omnimux-workflow:canvas', type: 'omnimux-workflow:canvas' }],
    })

    // ① 1280px 标准基准分辨率：左 280 + 中 380 + 右 620（占比 48.4%）
    const w1280 = workbenchDefaultWidthPx(makeState(), { viewportWidth: 1280, officialSidebarWidth: 280 })
    assert.equal(w1280, 1280 - 280 - 380, '1280px 视口下右栏应精确为 620px')

    // ② 1440px 主流宽屏笔记本：左 280 + 中 380 + 右 780（占比 54.2%）
    const w1440 = workbenchDefaultWidthPx(makeState(), { viewportWidth: 1440, officialSidebarWidth: 280 })
    assert.equal(w1440, 1440 - 280 - 380, '1440px 视口下右栏应精确为 780px')

    // ③ 1920px 全高清桌面大屏：左 280 + 中 380 + 右 1260（占比 65.6%）
    const w1920 = workbenchDefaultWidthPx(makeState(), { viewportWidth: 1920, officialSidebarWidth: 280 })
    assert.equal(w1920, 1920 - 280 - 380, '1920px 视口下右栏应精确为 1260px')

    // ④ 2560px 2K / 4K 专业创作大屏：左 280 + 中 380 + 右 1900（占比 74.2%）
    const w2560 = workbenchDefaultWidthPx(makeState(), { viewportWidth: 2560, officialSidebarWidth: 280 })
    assert.equal(w2560, 2560 - 280 - 380, '2560px 视口下右栏应精确为 1900px')
  })

  it('分栏网格样式声明包含 380px 会话栏与 minmax(0px, 1fr) 弹性第三轨', () => {
    // 验证三栏展开态下会话栏锁定 380px，右侧弹性吃满
    assert.match(
      PRODUCT_STAGE_CHROME,
      /grid-template-columns:\s*var\(--omnimux-sidebar-width,\s*280px\)\s+var\(--omnimux-conversation-width,\s*380px\)\s+minmax\(0px,\s*1fr\)\s*!important/,
      '三分栏展开且右栏打开时必须将中栏定宽为 380px，右栏弹性铺满'
    )

    // 验证左栏收起态下会话栏保宽 380px，右栏弹性吃满
    assert.match(
      PRODUCT_STAGE_CHROME,
      /grid-template-columns:\s*0px\s+var\(--omnimux-conversation-width,\s*380px\)\s+minmax\(0px,\s*1fr\)\s*!important/,
      '左栏收起态下会话栏必须为 380px 并反哺右栏'
    )
  })

  it('输入框组件在 380px 紧凑宽度下具备原生容器查询纯图标收敛与防溢出兜底', () => {
    assert.match(
      COMPOSER_COMPACT_CSS,
      /container-type:\s*inline-size;/,
      '输入卡片根部必须声明容器查询'
    )
    assert.match(
      COMPOSER_COMPACT_CSS,
      /@container composer-card \(max-width:\s*459px\)\{/,
      '必须声明 459px 容器查询，确保 380px 下按钮即时折叠为 28px 纯图标'
    )
    assert.match(
      COMPOSER_COMPACT_CSS,
      /\[data-composer-card\] \[class\*="tools"\]\{[^}]*overflow:\s*hidden;/,
      '工具栏必须声明 overflow: hidden 防溢出'
    )
  })
})
