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

test('TrendingVideoCard & TrendingDetailModal: 悬停呈现操作栏、平台Badge与居中播放按钮', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingVideoCard } = await loadComponent('./TrendingVideoCard.jsx')

  try {
    const item = {
      id: 'card_demo_1',
      title: '高转化跨境爆款视频',
      views: 520000,
      engagement: 3.4,
      region: 'US',
      platform: 'TikTok',
      cover: 'https://example.com/cover.jpg',
      videoUrl: 'https://example.com/video.mp4',
      structure: '前3秒黄金Hook + 痛点反转 + 购物车引导',
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
    assert.ok(card, '卡片必须正常渲染')

    // 平台标签
    const badge = host.querySelector('.omnimux-trending-card-platform-badge')
    assert.ok(badge, '必须渲染平台标签 Badge')
    assert.equal(badge.textContent.trim(), 'TikTok', '平台 Badge 内容正确')

    // 居中播放按钮
    const centerPlay = host.querySelector('.omnimux-trending-card-center-play')
    assert.ok(centerPlay, '必须渲染居中播放按钮')

    // 悬停操作浮层与双按钮
    const overlay = host.querySelector('.omnimux-trending-card-overlay')
    assert.ok(overlay, '必须存在悬停操作栏浮层')
    const detailBtn = host.querySelector('.omnimux-trending-detail-btn')
    assert.ok(detailBtn, '必须存在详情按钮')
    const recreateBtn = host.querySelector('.omnimux-trending-recreate-btn')
    assert.ok(recreateBtn, '必须存在复刻按钮')
    assert.equal(detailBtn.textContent.trim(), '详情', '详情按钮文案必须为“详情”')
    assert.equal(recreateBtn.textContent.trim(), '复刻', '复刻按钮文案必须为“复刻”（2个字对称）')

    // 验证复刻点击触发 onRecreate 回调
    await act(async () => {
      recreateBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(recreatedItem?.id, 'card_demo_1', '点击复刻必须触发 onRecreate')

    // 点击详情按钮，唤起 TrendingDetailModal
    assert.equal(document.querySelector('.omnimux-trending-modal-overlay'), null, '初始未打开弹窗')
    await act(async () => {
      detailBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    const modal = document.querySelector('.omnimux-trending-modal-overlay')
    assert.ok(modal, '点击详情后必须展示视频详情弹窗 TrendingDetailModal')
    const modalTitle = document.querySelector('.omnimux-trending-modal-title')
    assert.ok(modalTitle, '弹窗标题存在')

    // 验证弹窗内包含播放器与元数据
    const modalVideo = document.querySelector('.omnimux-trending-modal-video')
    assert.ok(modalVideo, '弹窗内包含视频播放器')
    const scriptSection = document.querySelector('.omnimux-trending-modal-script-body')
    assert.ok(scriptSection, '弹窗内包含文案脚本展示区')
    assert.ok(scriptSection.textContent.includes('黄金Hook'), '文案脚本渲染完整')

    // 点击弹窗内底部“复刻”按钮
    recreatedItem = null
    const modalRecreateBtn = document.querySelector('.omnimux-trending-modal-btn.is-primary')
    assert.ok(modalRecreateBtn, '弹窗底部主要按钮复刻存在')
    assert.equal(modalRecreateBtn.textContent.trim(), '复刻', '弹窗底部主要按钮文案必须为“复刻”')
    await act(async () => {
      modalRecreateBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(recreatedItem?.id, 'card_demo_1', '弹窗内复刻触发回调')
    assert.equal(document.querySelector('.omnimux-trending-modal-overlay'), null, '触发后弹窗自动关闭')
  } finally {
    cleanup()
  }
})

test('TrendingCarousel: 轮播模式同样支持详情弹窗与复刻流转', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingCarousel } = await loadComponent('./TrendingCarousel.jsx')

  try {
    let recreated = null
    const items = [
      { id: 'c1', title: '轮播视频1', views: 1000, platform: 'TikTok', videoUrl: 'https://example.com/1.mp4' },
      { id: 'c2', title: '轮播视频2', views: 2000, platform: 'YouTube', videoUrl: 'https://example.com/2.mp4' },
    ]

    await act(async () => {
      root.render(React.createElement(TrendingCarousel, {
        items,
        t: (k, fb) => fb || k,
        onRecreate: (it) => {
          recreated = it
        },
      }))
    })

    const cards = host.querySelectorAll('.omnimux-trending-card')
    assert.equal(cards.length, 2, '轮播渲染 2 张卡片')

    // 第一张卡片点击居中播放按钮
    const centerPlay = cards[0].querySelector('.omnimux-trending-card-center-play')
    assert.ok(centerPlay, '轮播卡片内必须有居中播放按钮')
    await act(async () => {
      centerPlay.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    assert.ok(document.querySelector('.omnimux-trending-modal-overlay'), '轮播模式下居中播放按钮亦能唤起详情弹窗')

    // 按 ESC 关闭弹窗
    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
    })
    assert.equal(document.querySelector('.omnimux-trending-modal-overlay'), null, 'ESC 键成功关闭弹窗')
  } finally {
    cleanup()
  }
})
