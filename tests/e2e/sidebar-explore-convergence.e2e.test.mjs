import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 验证左侧侧边栏非核心及内测插件收敛至探索菜单且探索位于最下方', async () => {
  const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.ok(fs.existsSync(coordinatorPath), 'sidebar-coordinator.js 必须存在')
  const coordinatorContent = fs.readFileSync(coordinatorPath, 'utf8')

  // 1. 验证探索行常驻定义与 Rank 7.2（排在最下方，位于灵感社区之后）
  assert.ok(
    coordinatorContent.includes("rank: 7.2"),
    '探索行必须设置 rank: 7.2，排在最下方'
  )
  assert.ok(
    coordinatorContent.includes("omnimux-explore-entry"),
    '必须包含常驻探索行 ID omnimux-explore-entry'
  )

  // 2. 验证核心常驻排除名单：项目、技能专家、资产库、灵感社区
  assert.ok(
    coordinatorContent.includes("omnimux-workflow") &&
    coordinatorContent.includes("omnimux-market") &&
    coordinatorContent.includes("omnimux-assets") &&
    coordinatorContent.includes("omnimux-inspiration"),
    '必须严格排除项目、技能专家、资产库、灵感社区并保持常驻'
  )

  // 3. 验证 11 项白名单与 SVG 矢量图标定义（UI04 门禁）
  const expectedLabels = [
    '应用',
    '视频剪辑',
    'Google Vids',
    '产品库',
    '发布',
    '账号',
    '手机管理',
    '数据分析',
    '自动化',
    '任务表单',
    '社交采收',
  ]
  for (const label of expectedLabels) {
    assert.ok(
      coordinatorContent.includes(`label: '${label}'`),
      `探索菜单必须包含白名单锁定项: ${label}`
    )
  }

  // 4. 验证严格零 Emoji 规则（UI04）
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
  assert.equal(
    emojiRegex.test(coordinatorContent),
    false,
    'UI04 门禁硬拦截：探索菜单代码中严禁包含任何 Emoji'
  )

  // 5. 验证浮动菜单几何定位算法与事件清理
  assert.ok(
    coordinatorContent.includes('computeExploreMenuPosition'),
    '必须提供带视口防溢出的探索菜单几何计算函数'
  )
  assert.ok(
    coordinatorContent.includes('closeExploreMenu'),
    '必须提供完整的浮动菜单销毁与事件注销函数'
  )

  // 6. 验证契约文档已同步
  const contractPath = path.join(root, 'docs/contracts/sidebar-extra-entries.md')
  const contractContent = fs.readFileSync(contractPath, 'utf8')
  assert.ok(
    contractContent.includes('data-omnimux-explore-entry'),
    'sidebar-extra-entries.md 必须登记探索行契约'
  )

  // 7. 防透底硬门禁：探索浮动菜单必须使用不透明实体背景，严禁裸用未定义 Token 与伪毛玻璃滤镜
  const menuStyleMatch = coordinatorContent.match(/\.omnimux-explore-menu\s*\{([^}]+)\}/)
  assert.ok(menuStyleMatch, '必须定义 .omnimux-explore-menu 样式块')
  const menuStyle = menuStyleMatch[1]

  // 7.1 严禁使用 backdrop-filter 伪毛玻璃特效
  assert.equal(
    /backdrop-filter/i.test(menuStyle),
    false,
    '硬门禁拦截：.omnimux-explore-menu 严禁包含 backdrop-filter，避免透出中栏与底层内容'
  )

  // 7.2 严禁裸写 var(--dsw-alias-bg-elevated)
  assert.equal(
    /var\(\s*--dsw-alias-bg-elevated\s*\)/.test(menuStyle),
    false,
    '硬门禁拦截：.omnimux-explore-menu 严禁裸写未定义的 var(--dsw-alias-bg-elevated)，防止退化为 transparent'
  )

  // 7.3 严禁使用导致深色模式下变成中浅灰 (#61666b) 的 --dsw-alias-bg-overlay
  assert.equal(
    /--dsw-alias-bg-overlay\b/.test(menuStyle),
    false,
    '.omnimux-explore-menu 严禁使用 --dsw-alias-bg-overlay，避免深色主题严重偏色'
  )

  // 7.4 必须声明官方标准深色层级背景
  assert.match(
    menuStyle,
    /background:\s*var\(--dsw-alias-bg-layer-2,\s*var\(--dsw-alias-bg-base\)\)/,
    '.omnimux-explore-menu 必须使用官方深色规范层级底色'
  )

  // 7.5 运行时注册项让菜单高度不再固定：必须有滚动兜底，禁止溢出视口
  assert.match(menuStyle, /max-height:\s*calc\(100vh - 16px\)/, '菜单必须有视口高度上限，长菜单不得溢出')
  assert.match(menuStyle, /overflow-y:\s*auto/, '菜单必须可滚动，保证注册项（末尾项）可达')
})

/**
 * Issue #3108：探索菜单运行时注册接缝的端到端旅程。
 * 真实模块 + 真实官方侧栏 DOM 骨架：boot → 打开菜单 → 注册 → 点击 → 注销。
 */
test('E2E: 探索菜单运行时注册接缝——注册项追加在末尾、点击走 tabId 兜底、注销后消失', async () => {
  const { JSDOM } = await import('jsdom')
  const { installSidebarGlobal, SIDEBAR_GLOBAL, EXPLORE_MENU_ITEMS, resolveExploreMenuItems } = await import(
    '../../plugins/omnimux/src/client/sidebar-coordinator.js'
  )

  // install() 会 setInterval(2s) 轮询；替换为 no-op，避免挂住测试进程。
  const realSetInterval = globalThis.setInterval
  const realClearInterval = globalThis.clearInterval
  globalThis.setInterval = () => 1
  globalThis.clearInterval = () => {}

  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div class="frame" data-omnimux-frame>
        <div data-pane="sidebar">
          <div class="logoRow"><button type="button" class="brand" aria-label="OmniMux">OmniMux</button></div>
          <button class="newSession">新建会话</button>
        </div>
      </div>
    </body></html>`,
    { url: 'http://127.0.0.1/' }
  )
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.MutationObserver = dom.window.MutationObserver
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement

  try {
    installSidebarGlobal()
    const api = SIDEBAR_GLOBAL()
    assert.ok(api, 'window.__omnimuxSidebar 必须已安装')
    assert.equal(typeof api.registerExploreItem, 'function', '协调器必须暴露 registerExploreItem 接缝')

    // 1. 未注册：渲染集合与内置白名单逐项同序
    assert.equal(EXPLORE_MENU_ITEMS.length, 11, '内置白名单锁定 11 项')
    assert.deepEqual(
      resolveExploreMenuItems().map((item) => item.id),
      EXPLORE_MENU_ITEMS.map((item) => item.id),
      '未注册时渲染集合与内置白名单完全一致'
    )

    api.place()
    const exploreBtn = document.querySelector('[data-pane="sidebar"]').querySelector('[data-omnimux-explore-entry]')
    assert.ok(exploreBtn, '探索行必须已挂载')

    exploreBtn.click()
    let menu = document.getElementById('omnimux-explore-menu')
    assert.equal(menu.querySelectorAll('[data-explore-id]').length, 11, '打开菜单渲染 11 项')

    // 2. 注册：追加在末尾，展开中的菜单先收起
    const unregister = api.registerExploreItem({
      id: 'fast-news-workbench',
      label: '快讯中枢',
      iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
      tabId: 'fast-news-workbench',
    })
    assert.equal(typeof unregister, 'function', '注册返回注销函数')
    assert.equal(document.getElementById('omnimux-explore-menu'), null, '注册时收起已展开的菜单')

    exploreBtn.click()
    menu = document.getElementById('omnimux-explore-menu')
    const ids = [...menu.querySelectorAll('[data-explore-id]')].map((el) => el.dataset.exploreId)
    assert.equal(ids.length, 12, '注册后共 12 项')
    assert.equal(ids[ids.length - 1], 'fast-news-workbench', '注册项追加在末尾')

    // 3. 点击：复用 tabId 兜底打开 Workbench Tab，并关闭菜单
    const opened = []
    globalThis.window.__omnimuxWorkbench = { open: (opts) => { opened.push(opts); return true } }
    menu.querySelector('[data-explore-id="fast-news-workbench"]').click()
    assert.deepEqual(opened, [{ tabId: 'fast-news-workbench', title: '快讯中枢' }], 'tabId 兜底打开一次')
    assert.equal(document.getElementById('omnimux-explore-menu'), null, '选后关闭菜单')

    // 4. 注销：重新打开后回到 11 项且不含该项
    unregister()
    exploreBtn.click()
    menu = document.getElementById('omnimux-explore-menu')
    assert.equal(menu.querySelectorAll('[data-explore-id]').length, 11, '注销后回到 11 项')
    assert.equal(menu.querySelector('[data-explore-id="fast-news-workbench"]'), null, '注销项不再渲染')

    // 5. 非法形状与内置 id 冲突不得产生脏项
    for (const bad of [null, {}, { id: 'x' }, { id: 'x', label: '快讯中枢' }, { id: '  ', label: '快讯中枢', iconSvg: '<svg></svg>' }]) {
      const dispose = api.registerExploreItem(bad)
      assert.equal(typeof dispose, 'function', '非法输入仍返回可调用注销函数')
      dispose()
    }
    const conflict = api.registerExploreItem({ id: 'apps', label: '伪装应用', iconSvg: '<svg></svg>' })
    conflict()
    assert.equal(resolveExploreMenuItems().length, 11, '非法与冲突输入不改变渲染集合')
    delete globalThis.window.__omnimuxWorkbench

    // 6. label 按纯文本渲染：注入标签不得被解析成 HTML 元素
    const escaped = api.registerExploreItem({
      id: 'label-escape-probe',
      label: '<b>快讯中枢</b>',
      iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14"></svg>',
    })
    exploreBtn.click()
    menu = document.getElementById('omnimux-explore-menu')
    const probe = menu.querySelector('[data-explore-id="label-escape-probe"]')
    assert.equal(
      probe.querySelector('.omnimux-explore-menu-item-label').textContent,
      '<b>快讯中枢</b>',
      'label 必须原样按纯文本渲染'
    )
    assert.equal(probe.querySelector('.omnimux-explore-menu-item-label b'), null, 'label 不得被解析成 HTML 元素')
    escaped()

    // 7. 字段白名单：注册项不得借 entryId / pluginId 委托到已挂载行的 click
    let impersonatedClicks = 0
    const victim = document.createElement('button')
    victim.addEventListener('click', () => { impersonatedClicks += 1 })
    const disposeVictim = api.register({ id: 'omnimux-victim-entry', rank: 1, create: () => victim })
    const impersonator = api.registerExploreItem({
      id: 'impersonator',
      label: '冒充项',
      iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14"></svg>',
      entryId: 'omnimux-victim-entry',
      pluginId: 'omnimux-victim',
    })
    api.place()
    exploreBtn.click()
    menu = document.getElementById('omnimux-explore-menu')
    menu.querySelector('[data-explore-id="impersonator"]').click()
    assert.equal(impersonatedClicks, 0, '注册项不得借 entryId / pluginId 委托到已挂载行')
    impersonator()
    disposeVictim()
    delete globalThis.window.__omnimuxWorkbench
  } finally {
    const { resetSidebarCoordinatorForTests } = await import('../../plugins/omnimux/src/client/sidebar-coordinator.js')
    resetSidebarCoordinatorForTests()
    dom.window.close()
    globalThis.setInterval = realSetInterval
    globalThis.clearInterval = realClearInterval
    delete globalThis.window
    delete globalThis.document
    delete globalThis.MutationObserver
    delete globalThis.HTMLElement
    delete globalThis.HTMLButtonElement
  }
})
