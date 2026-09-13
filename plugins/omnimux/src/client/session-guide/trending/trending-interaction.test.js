import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

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
    fetch: globalThis.fetch,
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
      globalThis.fetch = previous.fetch
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

/** 刷新一次微任务队列，让真源拉取的 promise 落地。 */
async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

/** 按 aria-label 找某个筛选下拉的触发器（比按显示文案找稳，文案会随选中值变化）。 */
function triggerByAria(host, ariaLabel) {
  return host.querySelector(`.omnimux-trending-select-trigger[aria-label="${ariaLabel}"]`)
}

/** 打开某个筛选下拉并选中一项。 */
async function chooseOption(host, ariaLabel, optionText) {
  const trigger = triggerByAria(host, ariaLabel)
  assert.ok(trigger, `找不到筛选下拉：${ariaLabel}`)
  await click(trigger)
  const option = Array.from(document.querySelectorAll('.omnimux-trending-select-option'))
    .find((el) => el.textContent.trim() === optionText)
  assert.ok(option, `下拉「${ariaLabel}」里没有选项「${optionText}」`)
  await click(option)
  await flush()
}

/**
 * 灵感库行样本：覆盖两个地区、两个类目、三档播放量与三档互动率，
 * 但**没有发布时间**，因此「发布时间窗」维度必须不出现。
 */
const SOURCE_ROWS = [
  {
    id: 'insp_us_beauty',
    title: 'US beauty hook',
    country_code: 'US',
    category: 'beauty',
    cover_url: '/omnimux/inspiration/local/media/covers/us-beauty.jpg',
    stats: { likes: 300000, comments: 20000, shares: 5000, views: 12000000 },
    deconstruction: { hook_highlight: '开场 3 秒反差' },
  },
  {
    id: 'insp_us_home',
    title: 'US home demo',
    country_code: 'US',
    category: 'home',
    cover_url: '/omnimux/inspiration/local/media/covers/us-home.jpg',
    stats: { likes: 7000, views: 900000 },
    deconstruction: { summary: '桌面整理前后对比' },
  },
  {
    id: 'insp_th_beauty',
    title: 'TH beauty routine',
    country_code: 'TH',
    category: 'beauty',
    cover_url: '/omnimux/inspiration/local/media/covers/th-beauty.jpg',
    stats: { likes: 400000, comments: 1000, shares: 1000, views: 40000000 },
    deconstruction: { summary: '素颜到上妆的完整节奏' },
  },
]

/** 装一个只会返回给定行的 fetch 替身；服务端参数（country / views_min）按真源行为先过滤。 */
function stubFetch(rows, { ok = true, status = 200, fail = false } = {}) {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (fail) throw new Error('network down')
    const params = new URL(String(url), 'http://localhost').searchParams
    let items = rows
    const country = params.get('country')
    if (country) {
      items = items.filter((row) => String(row.country_code || '').toUpperCase() === country.toUpperCase())
    }
    const viewsMin = Number(params.get('views_min'))
    if (Number.isFinite(viewsMin) && viewsMin > 0) {
      items = items.filter((row) => Number(row.stats?.views) >= viewsMin)
    }
    return { ok, status, json: async () => ({ data: { items, total: items.length } }) }
  }
  return { calls, restore: () => { globalThis.fetch = previous } }
}

const SECTION_FIXTURE = [
  '<div id="root" data-omnimux-starter-host data-phase="hero">',
  '<div data-composer-seat><div class="band"><div data-composer-card>',
  '<button data-send-button>Send</button>',
  '</div></div></div>',
  '<div id="seat"></div>',
  '</div>',
].join('')

/**
 * 带滚动容器的宿主骨架。宿主真正的滚动发生在 `scrollBody` 上，
 * 「页面顶部」就是它的 `scrollTop === 0`——归还判定只认这个读数。
 */
const DOCK_FIXTURE = [
  '<div id="root" data-omnimux-starter-host data-phase="hero">',
  '<div class="scrollBody">',
  '<div data-composer-seat><div class="band"><div data-composer-card>',
  '<button data-send-button>Send</button>',
  '</div></div></div>',
  '<div id="seat"></div>',
  '</div>',
  '</div>',
].join('')

/**
 * JSDOM 不做布局，这里给宿主一个可控矩形。
 *
 * @param {{dom: object}} env withDom 返回的环境
 * @param {Element} host 宿主根节点
 * @param {number} slotTop 原位槽位顶边在视口中的位置；默认落在可见区内，
 *   即用户反馈的场景——按「原位可不可见」判归还必然误判。
 * @param {number} [collapse] 吸附后下方内容整体上移的位移，用来复现
 *   「输入框脱离文档流 → 原位塌陷 → 旧实现拿它做滚动补偿把滚动条抽回顶部」。
 */
function stubLayout(env, host, slotTop, collapse = 0) {
  env.dom.window.Element.prototype.getBoundingClientRect = function stub() {
    const shifted = host.hasAttribute('data-omnimux-dock-open') ? -collapse : 0
    const top = slotTop + shifted
    return {
      x: 394, y: top, left: 394, top, width: 1200, height: 166,
      right: 1594, bottom: top + 166, toJSON() { return this },
    }
  }
}

/** 把宿主滚动条移到指定位置并派发一次真实滚动事件（判定走 rAF，需要放行一帧）。 */
async function scrollTo(scroller, top) {
  await act(async () => {
    scroller.scrollTop = top
    scroller.dispatchEvent(new window.Event('scroll'))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** 渲染一个带滚动容器的宿主，返回停靠断言常用的句柄。 */
async function renderDockSection({ slotTop = 100, collapse = 0, onApplyPrompt = () => {} } = {}) {
  const { TrendingReplicateSection, DOCK_OPEN_ATTR } = await loadComponent('./TrendingReplicateSection.jsx')
  const env = withDom(DOCK_FIXTURE)
  const host = document.querySelector('#root')
  const scroller = host.querySelector('.scrollBody')
  const band = host.querySelector('[data-composer-card]').parentElement
  stubLayout(env, host, slotTop, collapse)
  const stub = stubFetch(SOURCE_ROWS)
  const root = createRoot(host.querySelector('#seat'))

  await act(async () => {
    root.render(React.createElement(TrendingReplicateSection, { t: (key) => key, onApplyPrompt }))
  })
  await flush()

  return {
    env,
    host,
    band,
    scroller,
    root,
    stub,
    DOCK_OPEN_ATTR,
    docked: () => host.hasAttribute(DOCK_OPEN_ATTR),
    async recreate(index = 0) {
      await click(host.querySelectorAll('.omnimux-trending-recreate-btn')[index])
    },
    async teardown() {
      await act(async () => root.unmount())
      stub.restore()
      env.restore()
    },
  }
}

async function renderSection({ rows = SOURCE_ROWS, ...stubOptions } = {}) {
  const { TrendingReplicateSection, DOCK_OPEN_ATTR } = await loadComponent('./TrendingReplicateSection.jsx')
  const env = withDom(SECTION_FIXTURE)
  const host = document.querySelector('#root')
  const stub = stubFetch(rows, stubOptions)
  const root = createRoot(host.querySelector('#seat'))

  await act(async () => {
    root.render(React.createElement(TrendingReplicateSection, {
      t: (key) => key,
      onApplyPrompt: () => {},
    }))
  })
  await flush()
  await flush()

  return {
    env,
    host,
    root,
    stub,
    DOCK_OPEN_ATTR,
    cards: () => Array.from(host.querySelectorAll('[data-trending-id]')),
    triggers: () => Array.from(host.querySelectorAll('.omnimux-trending-select-trigger')),
    async settle() {
      await flush()
      await flush()
    },
    async teardown() {
      await act(async () => root.unmount())
      stub.restore()
      env.restore()
    },
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 真源接入：卡片来自灵感库，工具栏只渲染数据支持的维度
// ─────────────────────────────────────────────────────────────

test('trending 真源：卡片渲染真实封面与真实读数，工具栏不出现无数据维度', async () => {
  const view = await renderSection()
  const { host, stub } = view

  try {
    assert.ok(
      stub.calls.some((url) => url.startsWith('/omnimux/inspiration/local?')),
      '必须向灵感库要数据',
    )
    assert.equal(view.cards().length, SOURCE_ROWS.length, '有几条就渲染几张')
    assert.equal(host.querySelector('[data-omnimux-trending]')?.getAttribute('data-omnimux-trending-source'), 'ready')

    // 真实封面：img 直通，且 src 就是灵感库给的媒体路径
    const covers = Array.from(host.querySelectorAll('.omnimux-trending-cover-img')).map((img) => img.getAttribute('src'))
    assert.equal(covers.length, SOURCE_ROWS.length, '每张卡片都必须用真实封面')
    assert.ok(covers.includes('/omnimux/inspiration/local/media/covers/us-beauty.jpg'))

    // 读数来自真实 stats：12M 播放、2.71% 互动率（按 id 定位，不依赖排序）
    const first = view.cards().find((el) => el.getAttribute('data-trending-id') === 'insp_us_beauty')
    const values = Array.from(first.querySelectorAll('.omnimux-trending-card-metric-value')).map((el) => el.textContent.trim())
    assert.deepEqual(values, ['2.7%', '12M'])
    assert.equal(first.querySelector('.omnimux-trending-card-region').textContent.trim(), 'US')

    // 地区 / 类目 / 播放量 / 互动率在册 → 四个下拉都在；无发布时间 → 时间窗不得出现
    for (const ariaLabel of [
      'trending.filter.region',
      'trending.filter.industry',
      'trending.filter.views',
      'trending.filter.engagement',
      'trending.filter.sort',
    ]) {
      assert.ok(triggerByAria(host, ariaLabel), `缺了筛选下拉 ${ariaLabel}`)
    }
    assert.equal(host.querySelectorAll('.omnimux-trending-select-trigger').length, 5, '只应有 4 个维度 + 1 个排序')
    assert.ok(!host.querySelector('.omnimux-trending-range'), '没有发布时间的库不得出现时间窗控件')
  } finally {
    await view.teardown()
  }
})

test('trending 真源：地区与类目档位来自数据，不出现库里没有的档位', async () => {
  const view = await renderSection()
  try {
    await click(triggerByAria(view.host, 'trending.filter.region'))
    const regions = Array.from(document.querySelectorAll('.omnimux-trending-select-option')).map((el) => el.textContent.trim())
    assert.deepEqual(regions, ['trending.region.all', 'TH', 'US'], '档位必须只包含数据里真实存在的地区')
    await keydown(document.querySelector('.omnimux-trending-select-menu'), 'Escape')

    await click(triggerByAria(view.host, 'trending.filter.industry'))
    const categories = Array.from(document.querySelectorAll('.omnimux-trending-select-option')).map((el) => el.textContent.trim())
    assert.deepEqual(categories, ['trending.industry.all', 'beauty', 'home'], '类目档位必须是库里真实出现的类目')
    await keydown(document.querySelector('.omnimux-trending-select-menu'), 'Escape')
  } finally {
    await view.teardown()
  }
})

test('trending 真源：切换筛选真的改变屏幕上的卡片数（假控件护栏）', async () => {
  const view = await renderSection()
  try {
    assert.equal(view.cards().length, 3)

    await chooseOption(view.host, 'trending.filter.region', 'TH')
    assert.equal(view.cards().length, 1, '选 TH 后屏幕上必须只剩 TH 的卡片')
    assert.equal(view.cards()[0].getAttribute('data-trending-id'), 'insp_th_beauty')
    assert.ok(
      view.stub.calls.at(-1).includes('country=TH'),
      `地区是服务端维度，必须把 country 发给真源：${view.stub.calls.at(-1)}`,
    )

    // 回到全部地区 → 结果集复原
    await chooseOption(view.host, 'trending.filter.region', 'trending.region.all')
    assert.equal(view.cards().length, 3)
  } finally {
    await view.teardown()
  }
})

test('trending 真源：服务端过滤条件变化会重取，客户端维度不重取', async () => {
  const view = await renderSection()
  try {
    const before = view.stub.calls.length
    // 客户端维度（互动率）：不触发重取，但必须真的改变结果
    await chooseOption(view.host, 'trending.filter.engagement', 'trending.engagement.2')
    assert.equal(view.stub.calls.length, before, '互动率是客户端过滤，不应重取')
    assert.equal(view.cards().length, 1, '互动率门槛必须真的筛掉屏幕上的卡片（≥2% 只剩 1 条）')

    // 服务端维度（播放量）：必须带上 views_min 重取
    await chooseOption(view.host, 'trending.filter.views', 'trending.views.10m')
    assert.ok(view.stub.calls.length > before, '服务端维度变化必须重取')
    assert.ok(
      view.stub.calls.at(-1).includes('views_min=10000000'),
      `重取必须带上下界：${view.stub.calls.at(-1)}`,
    )
  } finally {
    await view.teardown()
  }
})

// ─────────────────────────────────────────────────────────────
// 2. 降级：库为空 / 真源不可用，都不得回落编造数据
// ─────────────────────────────────────────────────────────────

test('trending 降级：灵感库为空 → 空态话术，卡片数为 0', async () => {
  const view = await renderSection({ rows: [] })
  try {
    assert.equal(view.cards().length, 0, '空库不得渲染任何卡片')
    assert.equal(view.host.querySelector('[data-omnimux-trending]').getAttribute('data-omnimux-trending-source'), 'empty')
    assert.equal(view.host.querySelector('[data-omnimux-trending-empty]').getAttribute('data-omnimux-trending-empty'), 'library')
    assert.match(view.host.textContent, /trending\.library\.empty/)
    assert.equal(view.triggers().length, 0, '没有数据就不该有筛选工具栏')
  } finally {
    await view.teardown()
  }
})

test('trending 降级：真源不可用（未安装 / 未登录 / 网络异常）→ 说清楚，且不展示任何假数据', async () => {
  for (const options of [{ fail: true }, { ok: false, status: 404 }]) {
    const view = await renderSection({ ...options, rows: SOURCE_ROWS })
    try {
      assert.equal(view.cards().length, 0, '真源不可用时不得展示任何卡片')
      assert.equal(
        view.host.querySelector('[data-omnimux-trending]').getAttribute('data-omnimux-trending-source'),
        'unavailable',
      )
      assert.equal(view.host.querySelector('[data-omnimux-trending-empty]').getAttribute('data-omnimux-trending-empty'), 'unavailable')
      assert.match(view.host.textContent, /trending\.library\.unavailable/)
      assert.equal(view.triggers().length, 0)
    } finally {
      await view.teardown()
    }
  }
})

test('trending 降级：筛选把结果筛空 → 说清是「筛选无匹配」，工具栏与重置都还在', async () => {
  const view = await renderSection()
  try {
    await chooseOption(view.host, 'trending.filter.region', 'TH')
    assert.equal(view.cards().length, 1)
    // TH 那条只有 1.0% 互动率，再加 2% 门槛必然筛空
    await chooseOption(view.host, 'trending.filter.engagement', 'trending.engagement.2')
    assert.equal(view.cards().length, 0)

    const empty = view.host.querySelector('[data-omnimux-trending-empty]')
    assert.equal(empty?.getAttribute('data-omnimux-trending-empty'), 'filtered')
    assert.match(view.host.textContent, /trending\.empty/)
    assert.doesNotMatch(view.host.textContent, /trending\.library\.empty/, '筛空不得被说成库为空')

    // 工具栏必须留着，否则用户只能靠刷新页面逃出来
    assert.ok(triggerByAria(view.host, 'trending.filter.region'), '筛空后工具栏必须保留')

    await click(view.host.querySelector('.omnimux-trending-reset'))
    await view.settle()
    assert.equal(view.cards().length, 3, '重置必须把结果拉回来')
  } finally {
    await view.teardown()
  }
})

// ─────────────────────────────────────────────────────────────
// 3. TrendingSelect：listbox 键盘契约
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
  assert.equal(opts().length, 3)

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
// 4. 复刻接管集成：把**原生**输入框搬到视口底部，不复制任何控件
// ─────────────────────────────────────────────────────────────

test('TrendingReplicateSection：复刻把指令写进原生输入框并停靠，再点同一张卡片即归还', async () => {
  const view = await renderSection()
  const { host, DOCK_OPEN_ATTR } = view
  const applied = []
  const root = view.root

  try {
    // 重新渲染以捕获 onApplyPrompt
    await act(async () => {
      root.render(React.createElement(
        (await loadComponent('./TrendingReplicateSection.jsx')).TrendingReplicateSection,
        { t: (key) => key, onApplyPrompt: (prompt, item) => applied.push({ prompt, id: item.id }) },
      ))
    })
    await flush()

    assert.ok(view.cards().length > 0, '应渲染出可复刻样本')
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '初始不应接管输入框')

    // 点击第二张卡片 → 接管：原生输入框被标记停靠，极简意图交回输入框所有权方
    const target = view.cards()[1]
    const targetId = target.getAttribute('data-trending-id')
    await click(target.querySelector('.omnimux-trending-recreate-btn'))
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true, '应给宿主打上停靠标记')
    assert.equal(applied.length, 1, '复刻应把指令交回输入框所有权方')
    assert.equal(applied[0].id, targetId)
    // 草稿只承载极简意图：复刻对象的数据随附件走，不堆进用户草稿
    assert.equal(applied[0].prompt, '复刻这条爆款视频', '复刻只写极简意图提示词')
    assert.equal(target.getAttribute('data-trending-active'), 'true', '被接管的卡片应标记 active')
    assert.equal(view.cards()[0].getAttribute('data-trending-active'), 'false')

    // 板块不再自造输入框：底部那一个就是原生输入框本身
    assert.equal(host.querySelector('[data-omnimux-trending-dock]'), null, '不应再挂载自绘吸底输入框')
    assert.equal(host.querySelectorAll('textarea').length, 0, '板块不得自造 textarea')

    // 换片：改选第三张，指令随之替换，写入的仍是同一个原生输入框
    const thirdId = view.cards()[2].getAttribute('data-trending-id')
    await click(view.cards()[2].querySelector('.omnimux-trending-recreate-btn'))
    assert.equal(view.cards()[2].getAttribute('data-trending-active'), 'true')
    assert.equal(view.cards()[1].getAttribute('data-trending-active'), 'false', '旧卡片应让出 active')
    assert.equal(applied.length, 2)
    assert.equal(applied[1].id, thirdId)
    // 换片后意图提示词不变（数据在附件里），但接管对象必须换成第三张
    assert.equal(applied[1].prompt, '复刻这条爆款视频')

    // 接管期间其余卡片保持可点，可直接换片
    assert.equal(view.cards()[0].querySelector('.omnimux-trending-recreate-btn').disabled, false)

    // 再点同一张卡片 → 归还输入框，且不再产生写入
    await click(view.cards()[2].querySelector('.omnimux-trending-recreate-btn'))
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '再点同一张卡片应归还输入框')
    assert.equal(view.cards()[2].getAttribute('data-trending-active'), 'false')
    assert.equal(applied.length, 2, '归还输入框不应再写入指令')

    // 「收起输入框」同样只归还位置，不改草稿
    await click(view.cards()[0].querySelector('.omnimux-trending-recreate-btn'))
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true)
    await click(host.querySelector('.omnimux-trending-undock'))
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '收起按钮应归还输入框')
    assert.equal(applied.length, 3, '收起不应额外写入')
  } finally {
    await view.teardown()
  }
})

test('TrendingReplicateSection：复刻吸底给出停靠几何，只有滑回页面最顶部才归还，滑开立刻吸回（含回收）', async () => {
  const view = await renderDockSection({ slotTop: 100 })

  try {
    // 用户正在灵感列表里往下浏览
    await scrollTo(view.scroller, 900)
    await view.recreate()
    assert.equal(view.docked(), true, '复刻必须吸底')
    // 780 = min(780, 1200-24)，604 = 394 + (1200-780)/2：输入框宽度与位置与 Hero 中完全一致
    assert.equal(view.host.style.getPropertyValue('--omnimux-dock-width'), '780px')
    assert.equal(view.host.style.getPropertyValue('--omnimux-dock-left'), '604px')
    assert.equal(view.host.style.getPropertyValue('--omnimux-dock-bottom'), '20px')
    assert.equal(view.host.style.getPropertyValue('--omnimux-dock-card-height'), '166px')

    // 仍然在浏览灵感（没有滑到最顶部）→ 必须一直吸底
    await scrollTo(view.scroller, 500)
    assert.equal(view.docked(), true, '没滑到最顶部就必须留在底部')
    await scrollTo(view.scroller, 120)
    assert.equal(view.docked(), true, '原位可见也不算数：只要不在最顶部就绝不弹回页首')

    // 迟滞区（10 < scrollTop <= 20）：维持吸底，边界上不来回横跳
    await scrollTo(view.scroller, 18)
    assert.equal(view.docked(), true, '迟滞区内不得来回横跳')

    // 真正向上滑回页面最顶部 → 归还
    await scrollTo(view.scroller, 0)
    assert.equal(view.docked(), false, '滑回页面最顶部才还原位')

    // 再滑开 → 立刻吸回底
    await scrollTo(view.scroller, 400)
    assert.equal(view.docked(), true, '滑离顶部应当重新吸底')

    await act(async () => view.root.unmount())
    assert.equal(view.docked(), false, '板块卸载必须回收停靠标记')
    assert.equal(view.host.style.getPropertyValue('--omnimux-dock-left'), '', '板块卸载必须清掉停靠几何变量')
    assert.equal(view.host.style.getPropertyValue('--omnimux-dock-width'), '')
    assert.equal(view.band.style.minHeight, '', '板块卸载必须还回原位占位高度')
  } finally {
    await view.teardown()
  }
})

test('TrendingReplicateSection：吸底绝不动用户的滚动条（原位塌陷不得被当成滚动补偿）', async () => {
  // 吸底后下方内容整体上移 180px：旧实现拿这个位移做 scrollTop 补偿，
  // 一把把滚动条往顶部抽——用户scrollTop 本来就不大，直接回到页面最顶部。
  const view = await renderDockSection({ slotTop: 1000, collapse: 180 })

  try {
    await scrollTo(view.scroller, 150)
    await view.recreate()

    assert.equal(view.docked(), true, '复刻必须吸底')
    assert.equal(view.scroller.scrollTop, 150, '吸底不得改写用户的滚动位置：抽回顶部是致命缺陷')
    assert.equal(view.scroller.scrollTop >= 0, true, '滚动位置不得被补偿成负值')
    assert.equal(view.band.style.minHeight, '166px', '原位槽位必须留出占位高度，布局零位移')
  } finally {
    await view.teardown()
  }
})

test('TrendingReplicateSection：复刻首帧必吸底，原位仍在视口内且没滑到最顶部时绝不弹回 inline', async () => {
  // 原位始终落在视口可见区：这正是用户反馈的场景，按「原位可不可见」判归还必然误判
  const view = await renderDockSection({ slotTop: 100 })

  try {
    await scrollTo(view.scroller, 600)
    await view.recreate()
    assert.equal(view.docked(), true, '点击复刻首帧必须吸底，无论原位是否还在视口内')
    assert.ok(view.host.querySelector('.omnimux-trending-undock'), '吸底时必须给出底部收起入口')

    // 聚焦、挂附件、追加批次都会甩出滚动事件：只要没滑到最顶部就必须纹丝不动
    await scrollTo(view.scroller, 600)
    assert.equal(view.docked(), true, '一次空滚动事件不得把输入框顶回原位')
    await scrollTo(view.scroller, 21)
    assert.equal(view.docked(), true, 'scrollTop > 20 必须保持吸底')

    // 滑回最顶部（<= 10）才切回 inline
    await scrollTo(view.scroller, 8)
    assert.equal(view.docked(), false, '只有滑回最顶部才切回 inline')
    assert.equal(view.host.querySelector('.omnimux-trending-undock'), null, '回流内后不再显示底部收起入口')
  } finally {
    await view.teardown()
  }
})

test('TrendingReplicateSection：停在页面最顶部点击复刻仍先吸底，必须真的滑开再滑回才还原位', async () => {
  // 页面本来就在最顶部：没有「滑下去」这个动作，就不该被一次空滚动事件判成「滑回顶部」
  const view = await renderDockSection({ slotTop: 100 })

  try {
    await view.recreate()
    assert.equal(view.docked(), true, '首帧必吸底')

    await scrollTo(view.scroller, 0)
    assert.equal(view.docked(), true, '没滑下去过就不算滑回顶部，不得提前起飞')

    await scrollTo(view.scroller, 300)
    assert.equal(view.docked(), true, '滑下去之后仍然吸底')

    await scrollTo(view.scroller, 0)
    assert.equal(view.docked(), false, '真的滑回页面最顶部才还原位')
  } finally {
    await view.teardown()
  }
})

test('TrendingReplicateSection：复刻意图只在输入框吸底就位之后才交出去（避免聚焦把页面抽回顶部）', async () => {
  // 采样点就是断言点：宿主收到意图的那一刻，会去聚焦原生输入框。
  // 若此刻还没吸底，输入框仍在 Hero 流内，原生聚焦会触发 scrollIntoView 把页面抽回顶部。
  const dockedWhenApplied = []
  const applied = []
  const view = await renderDockSection({
    slotTop: 100,
    onApplyPrompt: (prompt) => {
      applied.push(prompt)
      dockedWhenApplied.push(document.querySelector('#root').hasAttribute('data-omnimux-dock-open'))
    },
  })

  try {
    await scrollTo(view.scroller, 700)
    await view.recreate()

    assert.deepEqual(applied, ['复刻这条爆款视频'], '复刻意图必须交出去（且只交一次）')
    assert.deepEqual(dockedWhenApplied, [true], '意图落地时输入框必须已经吸底就位，否则聚焦会把页面抽回顶部')
    assert.equal(view.docked(), true)
  } finally {
    await view.teardown()
  }
})

test('TrendingReplicateSection：加载态呈现现代极简骨架屏与微光扫描，数据就绪后平滑过渡至真实网格', async () => {
  const { TrendingReplicateSection } = await loadComponent('./TrendingReplicateSection.jsx')
  const { clearTrendingCache } = await import('./trending-source.js')
  clearTrendingCache()

  const env = withDom(SECTION_FIXTURE)
  const host = document.querySelector('#root')
  let finishFetch
  const deferred = new Promise((resolve) => { finishFetch = resolve })

  const stub = {
    restore: () => { globalThis.fetch = undefined },
  }
  globalThis.fetch = async () => {
    await deferred
    return { ok: true, status: 200, json: async () => ({ data: { items: SOURCE_ROWS, total: SOURCE_ROWS.length } }) }
  }

  const root = createRoot(host.querySelector('#seat'))

  try {
    // 挂载初始状态（网络未返回）：必须渲染骨架屏，而非生硬文字或空白
    await act(async () => {
      root.render(React.createElement(TrendingReplicateSection, { t: (key) => key, onApplyPrompt: () => {} }))
      await flush()
    })

    const skeleton = host.querySelector('[data-omnimux-skeleton]')
    assert.ok(skeleton, '加载过程中必须渲染骨架屏容器')
    const skeletonCards = host.querySelectorAll('.omnimux-trending-skeleton-card')
    assert.equal(skeletonCards.length, 8, '骨架屏默认呈现 8 个 9:16 极简占位卡')
    assert.ok(host.querySelector('.omnimux-trending-skeleton-shimmer'), '骨架屏必须包含微光扫描动画层')

    // 网络数据返回并渲染
    finishFetch()
    await act(async () => {
      await flush()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    assert.equal(host.querySelector('[data-omnimux-skeleton]'), null, '数据到达后骨架屏必须平滑卸载')
    const realGrid = host.querySelector('.omnimux-trending-grid')
    assert.ok(realGrid, '真实卡片网格必须挂载')
    assert.ok(realGrid.classList.contains('omnimux-trending-grid-enter'), '真实网格必须携带淡入平滑过渡动画类')
    assert.equal(host.querySelectorAll('.omnimux-trending-card').length, 3, '真实卡片数正确渲染')
  } finally {
    root.unmount()
    stub.restore()
    env.restore()
    clearTrendingCache()
  }
})
