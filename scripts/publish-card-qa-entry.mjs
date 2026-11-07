/**
 * @file scripts/publish-card-qa-entry.mjs
 * @description omnimux-publish 资产卡片的工作树隔离验收入口（真实浏览器内核）。
 *
 * 为什么单独一个入口：发布卡片改动的验收面是「资产卡片网格」本身，而 worktree-web-qa
 * 的既有 Stage 分支是模拟宿主夹具，只渲染占位文案、不渲染真实发布库。这里用真实
 * `AssetCard` 组件 + 真实 `injectPublishStyles()` 渲染一组代表性记录，并由驱动侧读
 * `window.__publishCardQa` 做行为断言（封面 src 映射、视频/坏图回退、等高、无乱码）。
 */

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AssetCard } from '../plugins/omnimux-publish/src/client/views/AssetCard.jsx'
import { injectPublishStyles } from '../plugins/omnimux-publish/src/client/styles.js'

injectPublishStyles()

const t = (key) => ({ 'type.image': '图文', 'type.video': '视频' }[key] || key)

const state = {
  ok: false, done: false, error: null,
  cardCount: 0, heights: [], equalHeights: false,
  hasExempt: false, hasEmoji: false,
  imgSrcs: [], typeIconCount: 0, onErrorFellBack: false, text: '',
}
globalThis.__publishCardQa = state
globalThis.addEventListener?.('error', (event) => {
  if (!state.error) state.error = String(event?.message || event)
})

const base = (over) => Object.assign({
  id: 'r', type: 'image', status: 'submitted', title: '短标题', description: '',
  media_ids: [], cover_media_id: null,
  created_at: '2026-11-07T08:00:00Z', updated_at: '2026-11-07T08:00:00Z', submitted_at: '2026-11-07T08:00:00Z',
  subtasks: [{ id: 'task', platform: 'tiktok', status: 'submitted' }],
}, over)

const records = [
  base({ id: 'cover', cover_media_id: 'cover-1', title: 'OmniMux PNG 格式验证' }),
  base({ id: 'first', media_ids: ['first-img'], title: '一条会被两行截断的比较长的标题用来验证等高与首图兜底' }),
  base({ id: 'video', type: 'video', title: '视频发布：三平台同步', subtasks: [{ id: 'v', platform: 'wechat_channels', status: 'reviewing' }] }),
  base({ id: 'bad', cover_media_id: 'bad-cover', title: '坏封面应回退类型图标' }),
]

try {
  const container = document.getElementById('card-root')
  if (container === null) throw new Error('缺少 #card-root 容器')
  createRoot(container).render(createElement(
    'div',
    { className: 'omnimux-publish-grid-container' },
    records.map((record) => createElement(AssetCard, {
      key: record.id, t, record, isSelected: false, isBatchMode: false,
      onToggleSelect() {}, onOpen() {}, onEdit() {}, onDelete() {}, onRetry() {},
    })),
  ))

  const imgEls = () => [...document.querySelectorAll('.omnimux-publish-card-thumb-img')]
  const imgSrcs = () => imgEls().map((node) => node.getAttribute('src') || '')
  let attempts = 0
  let fired = false
  const settle = () => {
    attempts += 1
    const cards = [...document.querySelectorAll('.omnimux-publish-asset-card')]
    state.cardCount = cards.length
    state.heights = cards.map((card) => Math.round(card.getBoundingClientRect().height))
    state.equalHeights = state.heights.length > 0 && state.heights.every((h) => Math.abs(h - state.heights[0]) <= 1)
    state.imgSrcs = imgSrcs()
    state.typeIconCount = document.querySelectorAll('.omnimux-publish-card-thumb-icon').length
    const grid = document.querySelector('.omnimux-publish-grid-container')
    const text = grid ? grid.innerText : ''
    state.hasExempt = /exempt-ui04/.test(text)
    state.hasEmoji = /\p{Extended_Pictographic}/u.test(text)
    state.text = text.replace(/\s+/g, ' ').slice(0, 200)
    const stillBad = imgSrcs().some((src) => src.includes('bad-cover'))
    if (!fired) {
      const badImg = imgEls().find((node) => (node.getAttribute('src') || '').includes('bad-cover'))
      if (badImg) { fired = true; badImg.dispatchEvent(new Event('error')) }
    }
    // 坏封面回退判据：坏图不再存在、且类型图标数 = 2（视频 + 坏封面回退）；不依赖手动 dispatch 时序。
    state.onErrorFellBack = stillBad === false && state.typeIconCount >= 2 && state.cardCount === 4
    if (state.onErrorFellBack || attempts >= 60) { finish(); return }
    setTimeout(settle, 100)
  }
  const finish = () => {
    state.ok = state.error === null
      && state.cardCount === 4
      && state.equalHeights === true
      && state.hasExempt === false
      && state.hasEmoji === false
      && state.imgSrcs.includes('/omnimux/publish/media/content?id=cover-1')
      && state.imgSrcs.includes('/omnimux/publish/media/content?id=first-img')
      && state.onErrorFellBack === true
    state.done = true
  }
  requestAnimationFrame(settle)
} catch (error) {
  state.error = String(error?.message || error)
  state.done = true
}
