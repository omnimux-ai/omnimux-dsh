import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)

async function loadComponent(entry) {
  const output = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
  })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  dom.window.HTMLMediaElement.prototype.play = async () => {}
  dom.window.HTMLMediaElement.prototype.pause = () => {}

  dom.window.__omnimuxInspirationPreview = {
    open({ row, onClose, onReplicate }) {
      const modal = dom.window.document.createElement('div')
      modal.className = 'omnimux-trending-modal-overlay'
      modal.innerHTML = `
        <div class="omnimux-trending-modal-title">${row.title || ''}</div>
        <div class="omnimux-trending-modal-video"></div>
        <div class="omnimux-trending-modal-script-body">前3秒黄金Hook + 痛点反转</div>
        <button class="omnimux-trending-modal-btn is-primary">复刻</button>
      `
      const handleKey = (e) => {
        if (e.key === 'Escape') close()
      }
      dom.window.addEventListener('keydown', handleKey)
      const close = () => {
        dom.window.removeEventListener('keydown', handleKey)
        modal.remove()
        onClose?.()
      }
      const btn = modal.querySelector('.omnimux-trending-modal-btn')
      btn.onclick = () => {
        close()
        onReplicate?.()
      }
      dom.window.document.body.appendChild(modal)
      return close
    },
  }

  const host = dom.window.document.getElementById('root')
  const root = createRoot(host)

  return {
    dom,
    host,
    root,
    cleanup() {
      try {
        root.unmount()
      } catch {}
      dom.window.close()
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    },
  }
}

test('E2E: 爆款趋势卡片全流程交互测试（平台Badge、详情弹窗与复刻入框）', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingVideoCard } = await loadComponent('../../../../omnimux/src/client/session-guide/trending/TrendingVideoCard.jsx')

  try {
    const item = {
      id: 'e2e_trend_1',
      title: '爆款跨境短视频',
      views: 890000,
      engagement: 4.8,
      region: 'US',
      platform: 'TikTok',
      cover: 'https://example.com/cover.jpg',
      videoUrl: 'https://example.com/video.mp4',
    }

    let recreatedItem = null

    await act(async () => {
      root.render(React.createElement(TrendingVideoCard, {
        item,
        t: (k, fb) => fb || k,
        onRecreate: (target) => {
          recreatedItem = target
        },
      }))
    })

    const card = host.querySelector('.omnimux-trending-card')
    assert.ok(card, '卡片已渲染')

    // 1. 验证平台 Badge 与中心播放键
    const badge = host.querySelector('.omnimux-trending-card-platform-badge')
    assert.equal(badge?.textContent?.trim(), 'TikTok', '平台 Badge 显示为 TikTok')
    const centerPlay = host.querySelector('.omnimux-trending-card-center-play')
    assert.ok(centerPlay, '居中播放按钮存在')

    // 2. 验证操作栏浮层与双按钮对称文案
    const detailBtn = host.querySelector('.omnimux-trending-detail-btn')
    const recreateBtn = host.querySelector('.omnimux-trending-recreate-btn')
    assert.ok(detailBtn, '详情按钮存在')
    assert.ok(recreateBtn, '复刻按钮存在')
    assert.equal(detailBtn.textContent.trim(), '详情', '次按钮文案为“详情”')
    assert.equal(recreateBtn.textContent.trim(), '复刻', '主按钮文案为“复刻”')

    // 3. 点击复刻按钮
    await act(async () => {
      recreateBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(recreatedItem?.id, 'e2e_trend_1', '点击复刻触发回调且传参正确')

    // 4. 点击详情按钮唤起弹窗
    await act(async () => {
      detailBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    const modal = document.querySelector('.omnimux-trending-modal-overlay')
    assert.ok(modal, '点击详情后唤起弹窗')

    // 5. 按 ESC 关闭弹窗
    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
    })
    assert.equal(document.querySelector('.omnimux-trending-modal-overlay'), null, 'ESC 能正常关闭弹窗')
  } finally {
    cleanup()
  }
})
