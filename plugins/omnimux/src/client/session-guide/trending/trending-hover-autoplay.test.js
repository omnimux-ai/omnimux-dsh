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

  const host = dom.window.document.getElementById('root')
  const root = createRoot(host)
  return {
    dom,
    host,
    root,
    cleanup: () => {
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

test('TrendingCover: 未悬停时不渲染 video 标签，仅渲染封面或矢量底图', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingCover } = await loadComponent('./TrendingCover.jsx')

  try {
    const item = {
      id: 'test_1',
      cover: 'https://example.com/cover.jpg',
      videoUrl: 'https://example.com/video.mp4',
    }

    await act(async () => {
      root.render(React.createElement(TrendingCover, { item, isHovered: false }))
    })

    const video = host.querySelector('video')
    assert.equal(video, null, '未悬停时绝不渲染 video 元素')
    const img = host.querySelector('img')
    assert.ok(img, '必须渲染封面图')
    assert.equal(img.getAttribute('src'), 'https://example.com/cover.jpg')
  } finally {
    cleanup()
  }
})

test('TrendingCover: 悬停且存在 videoUrl 时挂载静音循环自动播放 video', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingCover } = await loadComponent('./TrendingCover.jsx')

  try {
    const item = {
      id: 'test_2',
      cover: 'https://example.com/cover.jpg',
      videoUrl: 'https://example.com/preview.mp4',
    }

    await act(async () => {
      root.render(React.createElement(TrendingCover, { item, isHovered: true }))
    })

    const video = host.querySelector('video')
    assert.ok(video, '悬停时必须挂载 video 标签')
    assert.equal(video.getAttribute('src'), 'https://example.com/preview.mp4')
    assert.ok(video.muted === true, '必须包含 muted 属性保证自动播放')
    assert.ok(video.hasAttribute('playsinline'), '必须包含 playsinline 属性')
    assert.ok(video.hasAttribute('loop'), '必须包含 loop 循环播放属性')
    assert.ok(video.hasAttribute('autoplay'), '必须包含 autoplay 自动播放属性')
    assert.equal(video.getAttribute('data-testid'), 'trending-card-video')
  } finally {
    cleanup()
  }
})

test('TrendingCover: 视频加载失败触发 onError 时自动降级，卸载 video 并保留封面', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingCover } = await loadComponent('./TrendingCover.jsx')

  try {
    const item = {
      id: 'test_err',
      cover: 'https://example.com/cover.jpg',
      videoUrl: 'https://example.com/bad.mp4',
    }

    await act(async () => {
      root.render(React.createElement(TrendingCover, { item, isHovered: true }))
    })

    const video = host.querySelector('video')
    assert.ok(video, '初始化悬停挂载 video')

    // 触发视频错误
    await act(async () => {
      video.dispatchEvent(new window.Event('error'))
    })

    assert.equal(host.querySelector('video'), null, '报错后 video 必须平滑卸载')
    assert.ok(host.querySelector('img'), '封面依然完整展示，不破图')
  } finally {
    cleanup()
  }
})

test('TrendingVideoCard: 指针悬停 150ms 防抖激活并在移出时立即复位', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingVideoCard } = await loadComponent('./TrendingVideoCard.jsx')

  try {
    const item = {
      id: 'test_card',
      title: '高潜爆款对标视频',
      views: 88000,
      engagement: 3.2,
      cover: 'https://example.com/cover.jpg',
      videoUrl: 'https://example.com/video.mp4',
      region: 'US',
    }

    await act(async () => {
      root.render(React.createElement(TrendingVideoCard, {
        item,
        t: (k) => k,
        onRecreate: () => {},
      }))
    })

    const card = host.querySelector('.omnimux-trending-card')
    assert.ok(card, '卡片必须成功渲染')
    assert.equal(card.getAttribute('data-trending-hover'), 'false')

    // 模拟光标进入
    await act(async () => {
      card.dispatchEvent(new window.Event('mouseenter'))
    })

    // 防抖时间内尚未激活
    assert.equal(card.getAttribute('data-trending-hover'), 'false')

    // 经过 200ms 防抖
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    assert.equal(card.getAttribute('data-trending-hover'), 'true', '150ms 后必须激活悬停态')
    const video = host.querySelector('video')
    assert.ok(video, '悬停激活后 video 必须就绪')

    // 模拟光标移出
    await act(async () => {
      card.dispatchEvent(new window.Event('mouseleave'))
    })

    assert.equal(card.getAttribute('data-trending-hover'), 'false', '光标移出后立即取消悬停态')
    assert.equal(host.querySelector('video'), null, '光标移出后 video 必须停止并卸载')
  } finally {
    cleanup()
  }
})

test('TrendingVideoCard: 悬停态下复刻按钮与卡片交互保持 100% 灵敏', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingVideoCard } = await loadComponent('./TrendingVideoCard.jsx')

  try {
    let recreateItem = null
    const item = {
      id: 'test_action',
      title: '复刻测试视频',
      views: 120000,
      cover: 'https://example.com/cover.jpg',
      videoUrl: 'https://example.com/video.mp4',
    }

    await act(async () => {
      root.render(React.createElement(TrendingVideoCard, {
        item,
        t: (k) => k,
        onRecreate: (target) => {
          recreateItem = target
        },
      }))
    })

    const card = host.querySelector('.omnimux-trending-card')
    await act(async () => {
      card.dispatchEvent(new window.Event('mouseenter'))
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    const btn = host.querySelector('.omnimux-trending-recreate-btn')
    assert.ok(btn, '复刻按钮必须存在')

    await act(async () => {
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    assert.equal(recreateItem?.id, 'test_action', '复刻点击回调必须精准触发')
  } finally {
    cleanup()
  }
})

test('TrendingCarousel: 渲染横向轮播轨道与左右切换按钮', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingCarousel } = await loadComponent('./TrendingCarousel.jsx')

  try {
    const items = [
      { id: 'item_1', title: '视频1', views: 1000, cover: 'https://example.com/1.jpg' },
      { id: 'item_2', title: '视频2', views: 2000, cover: 'https://example.com/2.jpg' },
      { id: 'item_3', title: '视频3', views: 3000, cover: 'https://example.com/3.jpg' },
    ]

    await act(async () => {
      root.render(React.createElement(TrendingCarousel, {
        items,
        t: (k) => k,
        onRecreate: () => {},
      }))
    })

    const wrapper = host.querySelector('.omnimux-trending-carousel-wrapper')
    assert.ok(wrapper, '必须渲染轮播容器')
    const track = host.querySelector('.omnimux-trending-carousel-track')
    assert.ok(track, '必须包含横向滚动轨道')
    const prevBtn = host.querySelector('.omnimux-trending-carousel-nav.is-prev')
    const nextBtn = host.querySelector('.omnimux-trending-carousel-nav.is-next')
    assert.ok(prevBtn, '必须包含左切换按钮')
    assert.ok(nextBtn, '必须包含右切换按钮')
    assert.equal(host.querySelectorAll('.omnimux-trending-carousel-slide').length, 3, '每张卡片对应独立滑动列')
  } finally {
    cleanup()
  }
})

test('TrendingFilterBar: 渲染网格与轮播图格式切换控件', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingFilterBar } = await loadComponent('./TrendingFilterBar.jsx')

  try {
    let currentMode = 'grid'
    await act(async () => {
      root.render(React.createElement(TrendingFilterBar, {
        filters: { sort: 'recommend' },
        t: (k) => k,
        onChange: () => {},
        onReset: () => {},
        layoutMode: currentMode,
        onLayoutModeChange: (mode) => {
          currentMode = mode
        },
      }))
    })

    const switcher = host.querySelector('.omnimux-trending-view-switch')
    assert.ok(switcher, '必须渲染视图格式切换器')
    const buttons = host.querySelectorAll('.omnimux-trending-view-btn')
    assert.equal(buttons.length, 2, '包含网格与轮播两档切换')

    // 默认网格高亮
    assert.equal(buttons[0].classList.contains('is-active'), true)
    assert.equal(buttons[1].classList.contains('is-active'), false)

    // 点击轮播切换
    await act(async () => {
      buttons[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    assert.equal(currentMode, 'carousel', '点击切换必须回传 carousel 模式')
  } finally {
    cleanup()
  }
})

test('TrendingCover: 多图卡片在卡内叠放图集并渲染左右翻图按钮与页码', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingCover } = await loadComponent('./TrendingCover.jsx')

  try {
    const images = [
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
      'https://example.com/c.jpg',
    ]

    await act(async () => {
      root.render(React.createElement(TrendingCover, {
        item: { id: 'album_1', title: '多图卡', images, cover: images[0] },
        isHovered: false,
        t: (k) => k,
      }))
    })

    const layers = host.querySelectorAll('.omnimux-trending-cover-img.is-carousel-layer')
    assert.equal(layers.length, 3, '三张图必须全部叠放，靠透明度切换')
    assert.equal(layers[0].classList.contains('is-loaded'), true, '首图默认可见')
    assert.equal(layers[1].classList.contains('is-loaded'), false)

    const prev = host.querySelector('.omnimux-trending-card-carousel-nav.is-prev')
    const next = host.querySelector('.omnimux-trending-card-carousel-nav.is-next')
    assert.ok(prev, '必须渲染上一张按钮')
    assert.ok(next, '必须渲染下一张按钮')

    assert.equal(
      host.querySelector('.omnimux-trending-card-carousel-count'),
      null,
      '多图卡不得显示页码序号（页码胶囊已按用户要求移除）',
    )

    assert.equal(host.querySelectorAll('.omnimux-trending-carousel-dot').length, 3, '分页圆点与图数一致')
  } finally {
    cleanup()
  }
})

test('TrendingCover: 点击右翻切到下一张并循环回到首张，且不冒泡触发卡片点击', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingCover } = await loadComponent('./TrendingCover.jsx')

  try {
    const images = ['https://example.com/a.jpg', 'https://example.com/b.jpg']
    let cardClicks = 0
    const dom = host.ownerDocument

    // 外层父级持有 onClick：它就是卡片点击（复刻/选择）在 React 树上的真实位置
    const Wrapper = ({ children }) =>
      React.createElement('div', {
        onClick: () => {
          cardClicks += 1
        },
      }, children)

    await act(async () => {
      root.render(
        React.createElement(
          Wrapper,
          null,
          React.createElement(TrendingCover, {
            item: { id: 'album_2', title: '多图卡', images, cover: images[0] },
            isHovered: true,
            t: (k) => k,
          }),
        ),
      )
    })

    const layers = () => Array.from(host.querySelectorAll('.omnimux-trending-cover-img.is-carousel-layer'))
    const activeIndex = () => layers().findIndex((el) => el.classList.contains('is-loaded'))

    assert.equal(activeIndex(), 0)

    const next = host.querySelector('.omnimux-trending-card-carousel-nav.is-next')
    await act(async () => {
      next.dispatchEvent(new dom.defaultView.MouseEvent('click', { bubbles: true }))
    })

    assert.equal(activeIndex(), 1, '点击下一张必须切到第二张')
    assert.equal(cardClicks, 0, '翻图按钮不得冒泡触发卡片自身的点击')

    // 再点一次：两张图必须循环回首张，而不是卡在末尾
    await act(async () => {
      next.dispatchEvent(new dom.defaultView.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(activeIndex(), 0, '两张图必须循环切换')
    assert.equal(cardClicks, 0, '循环切换同样不得触发卡片点击')
  } finally {
    cleanup()
  }
})

test('TrendingCover: 单图卡片不出现任何翻图控件，也不误解锁视频预览', async () => {
  const { host, root, cleanup } = setupDom()
  const { TrendingCover } = await loadComponent('./TrendingCover.jsx')

  try {
    await act(async () => {
      root.render(React.createElement(TrendingCover, {
        item: {
          id: 'single_1',
          title: '单图卡',
          cover: 'https://example.com/only.jpg',
          videoUrl: 'https://example.com/clip.mp4',
        },
        isHovered: true,
        t: (k) => k,
      }))
    })

    assert.equal(host.querySelector('.omnimux-trending-card-carousel-nav'), null, '单图卡不得出现翻图按钮')
    assert.equal(host.querySelector('.omnimux-trending-card-carousel-count'), null, '单图卡不得出现页码标记')
    assert.ok(host.querySelector('video'), '单图卡悬停仍然走视频预览')
  } finally {
    cleanup()
  }
})
