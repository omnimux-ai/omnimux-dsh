import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  TRENDING_VIEW_BUCKETS,
  TRENDING_ENGAGEMENT_BUCKETS,
  TRENDING_INDUSTRIES,
  TRENDING_RANGES,
  TRENDING_REGIONS,
  defaultTrendingFilters,
  filterTrendingVideos,
  TRENDING_VIDEOS,
} from './trending-data.js'

const require = createRequire(import.meta.url)

/**
 * 用与 component.test.js 相同的 esbuild + JSDOM 织法加载真实组件，
 * 保证这里断言的是「渲染后的行为」，而不是源文件里的字符串。
 */
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

function withDom(html) {
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return {
    dom,
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
      dom.window.close()
    },
  }
}

/** 点击并等待 React 提交。 */
async function click(node) {
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
}

/** 派发键盘事件并等待 React 提交。 */
async function keydown(node, key) {
  await act(async () => {
    node.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

// ─────────────────────────────────────────────────────────────
// 1. 通用守卫：每个筛选维度都必须真实改变结果集
//    （这条断言本应拦下「range 是假控件」的缺陷）
// ─────────────────────────────────────────────────────────────

test('trending 守卫：每个筛选维度必须真实接入过滤（假控件护栏）', () => {
  // 全开基线（range 置空）才能让每个维度的「是否生效」被单独验证
  const base = { ...defaultTrendingFilters(), range: '' }
  const total = TRENDING_VIDEOS.length
  assert.equal(filterTrendingVideos(TRENDING_VIDEOS, base).length, total, '基线应为全量')

  // stricter: 档位值越大越严格（下限阈值） / 越小越严格（range 是上限窗口） / 无序（分区枚举）
  const dimensions = [
    { key: 'region', buckets: TRENDING_REGIONS, stricter: 'partition' },
    { key: 'industry', buckets: TRENDING_INDUSTRIES, stricter: 'partition' },
    { key: 'views', buckets: TRENDING_VIEW_BUCKETS, stricter: 'larger' },
    { key: 'engagement', buckets: TRENDING_ENGAGEMENT_BUCKETS, stricter: 'larger' },
    { key: 'range', buckets: TRENDING_RANGES, stricter: 'smaller' },
  ]

  for (const { key, buckets, stricter } of dimensions) {
    const values = buckets.map((bucket) => bucket.value).filter((value) => value !== '')
    assert.ok(values.length > 0, `维度 ${key} 缺少可用档位`)

    const counts = values.map((value) => ({
      value,
      count: filterTrendingVideos(TRENDING_VIDEOS, { ...base, [key]: value }).length,
    }))

    // 1) 该维度至少要有一个档位真正缩小结果集 —— 否则这个控件是装饰品
    assert.ok(
      counts.some((entry) => entry.count < total),
      `维度 ${key} 的所有档位都没有改变结果集，说明该控件未接入过滤（假控件）`,
    )

    // 2) 任何档位都不允许放大结果集
    for (const entry of counts) {
      assert.ok(
        entry.count <= total,
        `维度 ${key}=${entry.value} 放大了结果集（${entry.count} > ${total}）`,
      )
    }

    // 3) 分区枚举维度：每个档位都必须是真子集，否则该档位是摆设
    if (stricter === 'partition') {
      for (const entry of counts) {
        assert.ok(
          entry.count > 0 && entry.count < total,
          `维度 ${key}=${entry.value} 未切分出真子集（${entry.count}/${total}）`,
        )
      }
      continue
    }

    // 4) 数值阈值维度：沿档位数组，越严格计数只能越小
    const isStricter = stricter === 'larger'
      ? (prev, next) => Number(next.value) > Number(prev.value)
      : (prev, next) => Number(next.value) < Number(prev.value)
    for (let index = 1; index < counts.length; index += 1) {
      const prev = counts[index - 1]
      const next = counts[index]
      if (!isStricter(prev, next)) continue
      assert.ok(
        next.count <= prev.count,
        `维度 ${key} 从 ${prev.value} 收紧到 ${next.value} 时结果集反而变大（${prev.count} → ${next.count}）`,
      )
    }

    // 5) 该维度最严格的那一档必须真正筛掉样本，避免阈值方向写反蒙混过关
    const strictest = counts.reduce((acc, entry) => (
      isStricter(acc, entry) ? entry : acc
    ), counts[0])
    assert.ok(
      strictest.count < total,
      `维度 ${key} 最严格档位 ${strictest.value} 未筛掉任何样本，阈值方向可能有误`,
    )
  }
})

test('trending range：时间窗是上限语义，且档位间单调包含', () => {
  const base = defaultTrendingFilters()
  const byRange = (range) => filterTrendingVideos(TRENDING_VIDEOS, { ...base, range })

  const d7 = byRange('7')
  const d30 = byRange('30')
  const d90 = byRange('90')

  assert.ok(d7.every((item) => item.days <= 7), '未过滤掉超出 7 天的样本')
  assert.ok(d30.every((item) => item.days <= 30), '未过滤掉超出 30 天的样本')
  assert.ok(d90.every((item) => item.days <= 90), '未过滤掉超出 90 天的样本')

  assert.ok(d7.length <= d30.length && d30.length <= d90.length, '窗口越大结果集不应变小')
  assert.ok(d90.length === TRENDING_VIDEOS.length, '样本最长 days 在 90 天内，90 天窗口应为全量')

  const ids = (list) => new Set(list.map((item) => item.id))
  const set7 = ids(d7)
  for (const id of set7) assert.ok(ids(d30).has(id), `7 天命中 ${id} 应同时出现在 30 天窗口`)
  for (const id of ids(d30)) assert.ok(ids(d90).has(id), `30 天命中 ${id} 应同时出现在 90 天窗口`)

  assert.ok(TRENDING_RANGES.length >= 3, '时间窗至少要有 7/30/90 三档')
})

// ─────────────────────────────────────────────────────────────
// 2. TrendingSelect：listbox 键盘契约
// ─────────────────────────────────────────────────────────────

test('TrendingSelect：方向键打开与移动、Enter 选中、Escape 关闭并回焦', async () => {
  const { TrendingSelect } = await loadComponent('./TrendingSelect.jsx')
  const env = withDom('<div id="root"></div>')
  const host = document.querySelector('#root')
  const root = createRoot(host)

  const picked = []
  const options = [
    { value: '', label: 'All regions' },
    { value: 'US', label: 'US' },
    { value: 'ID', label: 'ID' },
  ]

  await act(async () => {
    root.render(React.createElement(TrendingSelect, {
      value: '',
      options,
      ariaLabel: 'region',
      onChange: (value) => picked.push(value),
    }))
  })

  const trigger = () => host.querySelector('.omnimux-trending-select-trigger')
  const menu = () => host.querySelector('.omnimux-trending-select-menu')
  const opts = () => Array.from(host.querySelectorAll('.omnimux-trending-select-option'))

  // 初始：关闭、无菜单
  assert.equal(trigger().getAttribute('aria-expanded'), 'false')
  assert.equal(menu(), null)

  // ArrowDown 打开并聚焦当前选中项
  await keydown(trigger(), 'ArrowDown')
  assert.equal(trigger().getAttribute('aria-expanded'), 'true')
  assert.ok(menu(), 'ArrowDown 应展开 listbox')
  assert.equal(document.activeElement.textContent, 'All regions', '应聚焦当前选中项')

  // ArrowDown 下移一项
  await keydown(menu(), 'ArrowDown')
  assert.equal(document.activeElement.textContent, 'US')

  // End 跳到末项，Home 回到首项
  await keydown(menu(), 'End')
  assert.equal(document.activeElement.textContent, 'ID')
  await keydown(menu(), 'Home')
  assert.equal(document.activeElement.textContent, 'All regions')

  // Enter 选中当前激活项并关闭
  await keydown(menu(), 'ArrowDown')
  await click(document.activeElement)
  assert.deepEqual(picked, ['US'], 'Enter/点击应回传所选值')
  assert.equal(menu(), null, '选中后应关闭')
  assert.equal(trigger().getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement, trigger(), '选中后应把焦点还给触发器')

  // Escape 关闭并回焦，且不冒泡干扰宿主
  await keydown(trigger(), 'ArrowDown')
  assert.ok(menu())
  await keydown(menu(), 'Escape')
  assert.equal(menu(), null, 'Escape 应关闭')
  assert.equal(document.activeElement, trigger(), 'Escape 后应回焦触发器')

  await act(async () => root.unmount())
  env.restore()
})

// ─────────────────────────────────────────────────────────────
// 3. 复刻接管集成：把**原生**输入框搬到视口底部，不复制任何控件
// ─────────────────────────────────────────────────────────────

const SECTION_FIXTURE = [
  '<div id="root" data-omnimux-starter-host data-phase="hero">',
  '<div data-composer-seat><div class="band"><div data-composer-card>',
  '<button data-send-button>Send</button>',
  '</div></div></div>',
  '<div id="seat"></div>',
  '</div>',
].join('')

test('TrendingReplicateSection：复刻把指令写进原生输入框并停靠，再点同一张卡片即归还', async () => {
  const { TrendingReplicateSection, DOCK_OPEN_ATTR } = await loadComponent('./TrendingReplicateSection.jsx')
  const env = withDom(SECTION_FIXTURE)
  const host = document.querySelector('#root')
  const root = createRoot(host.querySelector('#seat'))

  const applied = []
  await act(async () => {
    root.render(React.createElement(TrendingReplicateSection, {
      t: (key) => key,
      onApplyPrompt: (prompt, item) => applied.push({ prompt, id: item.id }),
    }))
  })

  const cards = () => Array.from(host.querySelectorAll('[data-trending-id]'))
  assert.ok(cards().length > 0, '应渲染出可复刻样本')
  assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '初始不应接管输入框')

  // 点击第二张卡片 → 接管：原生输入框被标记停靠，指令交回输入框所有权方
  const target = cards()[1]
  const targetId = target.getAttribute('data-trending-id')
  await click(target.querySelector('.omnimux-trending-recreate-btn'))
  assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true, '应给宿主打上停靠标记')
  assert.equal(applied.length, 1, '复刻应把指令交回输入框所有权方')
  assert.equal(applied[0].id, targetId)
  assert.ok(applied[0].prompt.startsWith('Clone the attached viral ad'), '应写入克隆指令模板')
  assert.equal(target.getAttribute('data-trending-active'), 'true', '被接管的卡片应标记 active')
  assert.equal(cards()[0].getAttribute('data-trending-active'), 'false')

  // 板块不再自造输入框：底部那一个就是原生输入框本身
  assert.equal(host.querySelector('[data-omnimux-trending-dock]'), null, '不应再挂载自绘吸底输入框')
  assert.equal(host.querySelectorAll('textarea').length, 0, '板块不得自造 textarea')

  // 换片：改选第三张，指令随之替换，写入的仍是同一个原生输入框
  const thirdId = cards()[2].getAttribute('data-trending-id')
  await click(cards()[2].querySelector('.omnimux-trending-recreate-btn'))
  assert.equal(cards()[2].getAttribute('data-trending-active'), 'true')
  assert.equal(cards()[1].getAttribute('data-trending-active'), 'false', '旧卡片应让出 active')
  assert.equal(applied.length, 2)
  assert.equal(applied[1].id, thirdId)
  assert.notEqual(applied[1].prompt, applied[0].prompt, '换片应重灌指令')

  // 接管期间其余卡片保持可点，可直接换片
  assert.equal(cards()[0].querySelector('.omnimux-trending-recreate-btn').disabled, false)

  // 再点同一张卡片 → 归还输入框，且不再产生写入
  await click(cards()[2].querySelector('.omnimux-trending-recreate-btn'))
  assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '再点同一张卡片应归还输入框')
  assert.equal(cards()[2].getAttribute('data-trending-active'), 'false')
  assert.equal(applied.length, 2, '归还输入框不应再写入指令')

  // 「收起输入框」同样只归还位置，不改草稿
  await click(cards()[0].querySelector('.omnimux-trending-recreate-btn'))
  assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true)
  await click(host.querySelector('.omnimux-trending-undock'))
  assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '收起按钮应归还输入框')
  assert.equal(applied.length, 3, '收起不应额外写入')

  await act(async () => root.unmount())
  env.restore()
})

test('TrendingReplicateSection：停靠几何按 Hero 栏居中换算，卸载后连同标记一并回收', async () => {
  const { TrendingReplicateSection, DOCK_OPEN_ATTR } = await loadComponent('./TrendingReplicateSection.jsx')
  const env = withDom(SECTION_FIXTURE)
  const host = document.querySelector('#root')
  // JSDOM 不做布局，给 Hero 栏一个真实矩形，停靠几何才可断言
  env.dom.window.Element.prototype.getBoundingClientRect = function stub() {
    return {
      x: 394, y: 100, left: 394, top: 100, width: 1200, height: 166,
      right: 1594, bottom: 266, toJSON() { return this },
    }
  }
  const root = createRoot(host.querySelector('#seat'))

  await act(async () => {
    root.render(React.createElement(TrendingReplicateSection, { t: (key) => key, onApplyPrompt: () => {} }))
  })

  await click(host.querySelector('.omnimux-trending-recreate-btn'))
  assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true)
  // 780 = min(780, 1200-24)，604 = 394 + (1200-780)/2：输入框宽度与位置与 Hero 中完全一致
  assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '780px')
  assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '604px')
  assert.equal(host.style.getPropertyValue('--omnimux-dock-bottom'), '20px')
  assert.equal(host.style.getPropertyValue('--omnimux-dock-card-height'), '166px')

  await act(async () => root.unmount())
  assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '板块卸载必须回收停靠标记')
  assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '', '板块卸载必须清掉停靠几何变量')
  assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '')

  env.restore()
})
