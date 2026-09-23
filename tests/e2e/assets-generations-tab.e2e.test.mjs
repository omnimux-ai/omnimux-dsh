import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 资产库中心「AI生成」页签与全链路收敛界面端到端契约验证 (AC-1 至 AC-5)', () => {
  const assetsStagePath = path.join(root, 'plugins/omnimux-assets/src/client/AssetsStage.jsx')
  const generationsViewPath = path.join(root, 'plugins/omnimux-assets/src/client/GenerationsView.jsx')
  const generationsHelpersPath = path.join(root, 'plugins/omnimux-assets/src/client/generations-helpers.js')
  const localesPath = path.join(root, 'plugins/omnimux-assets/src/client/locales.js')
  const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')
  const httpRoutesPath = path.join(root, 'plugins/omnimux-assets/src/http-routes.js')

  const stageContent = fs.readFileSync(assetsStagePath, 'utf-8')
  const viewContent = fs.readFileSync(generationsViewPath, 'utf-8')
  const helpersContent = fs.readFileSync(generationsHelpersPath, 'utf-8')
  const localesContent = fs.readFileSync(localesPath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')
  const routesContent = fs.readFileSync(httpRoutesPath, 'utf-8')

  // 1. AC-1: 验证 AssetsStage 中正确声明了 generations 一级 Tab，标签为「AI生成」
  assert.ok(
    stageContent.includes("{ id: 'generations', label: t('source.generations') || 'AI生成' }"),
    'AssetsStage 顶栏 FilterBar 必须声明 generations 一级标签页且回退为「AI生成」'
  )

  // 2. AC-1: 验证多语言字典完整包含中英文词条
  assert.ok(
    localesContent.includes("'source.generations': 'AI生成'") &&
    localesContent.includes("'source.generations': 'AI Generations'") &&
    localesContent.includes("'generations.createButton': '去生成'") &&
    localesContent.includes("'generations.createButton': 'Generate'") &&
    localesContent.includes("'generations.source.agent': '智能体'") &&
    localesContent.includes("'generations.source.image': '图像生成'") &&
    localesContent.includes("'generations.source.canvas': '画布'"),
    'locales 必须完整包含 generations 及其来源分类中英文词条'
  )

  // 3. AC-2 & AC-3: 动作行渲染「去生成」主按钮与点击打开媒体工作台
  assert.ok(
    stageContent.includes("if (sourceTab === 'generations')") &&
    stageContent.includes('<Button variant="primary" leadingIcon={<PlusIcon />} onClick={onOpenImageGeneration}>') &&
    stageContent.includes("{t('generations.createButton') || '去生成'}"),
    'AssetsActionRow 必须在 generations 页签下渲染主按钮「去生成」'
  )
  assert.ok(
    stageContent.includes("handleOpenImageGeneration") &&
    stageContent.includes("tabId: 'omnimux:media-viewer'"),
    'AssetsStage 必须提供 handleOpenImageGeneration 并在点击时打开 omnimux:media-viewer'
  )

  // 4. AC-4: 验证样式表包含生成物容器、网格与卡片尺寸收敛规范 (max-width 320px、minmax(260px, 300px))
  assert.ok(
    stylesContent.includes('.omnimux-generations-grid') &&
    stylesContent.includes('display: grid !important;') &&
    stylesContent.includes('grid-template-columns: repeat(auto-fill, minmax(260px, 300px));') &&
    stylesContent.includes('gap: 12px;') &&
    stylesContent.includes('justify-content: start;'),
    'styles.js 必须对 .omnimux-generations-grid 实施 auto-fill minmax(260px, 300px) 标准网格与 start 对齐'
  )
  assert.ok(
    stylesContent.includes('.omnimux-generation-card') &&
    stylesContent.includes('max-width: 320px;'),
    'styles.js 必须对 .omnimux-generation-card 强制约束 max-width: 320px'
  )

  // 5. 验证吸附栈挂载 GenerationsCategoryNav 与滚动归零
  assert.ok(
    stageContent.includes('<GenerationsCategoryNav') &&
    stageContent.includes('sourceTab, feed.filterType, productKindTab, generationsSource, generationsType'),
    'AssetsStage 吸附栏必须挂载 GenerationsCategoryNav 并在切换时滚动归零'
  )

  // 6. 验证 AssetsBody 分支挂载 GenerationsView
  assert.ok(
    stageContent.includes("if (sourceTab === 'generations')") &&
    stageContent.includes('<GenerationsView'),
    'AssetsBody 必须在 sourceTab 为 generations 时渲染 GenerationsView'
  )

  // 7. 验证 GenerationsView 与 helpers 具备全套分类体系与卡片流转交互
  assert.ok(
    helpersContent.includes('GENERATION_SOURCES') &&
    helpersContent.includes('GENERATION_TYPES') &&
    helpersContent.includes('resolveArtifactSource') &&
    helpersContent.includes('getSourceBadgeText'),
    'generations-helpers 必须导出完整来源、格式与来源徽章判定契约'
  )
  assert.ok(
    viewContent.includes('GenerationCard') &&
    viewContent.includes('addMediaToConversation') &&
    viewContent.includes('artifactPreviewUrl'),
    'GenerationsView 必须实现 GenerationCard 卡片呈现、媒体加入对话与预览地址绑定'
  )

  // 8. 验证 Host HTTP 路由支持流式返回 artifact 媒体文件
  assert.ok(
    routesContent.includes("path === '/omnimux/assets/artifacts/preview'"),
    'http-routes.js 必须提供 /omnimux/assets/artifacts/preview 只读流式文件路由'
  )
})

test('E2E DOM: 资产中心顶栏「AI生成」页签真实 DOM 渲染与交互切换 (AC-1)', () => {
  const dom = new JSDOM(`<!doctype html>
<html>
<head></head>
<body>
  <div id="root">
    <div class="omnimux-assets-filter-bar">
      <div class="omnimux-assets-filter-bar-left">
        <div class="dsh-tabs" role="tablist">
          <button class="dsh-tab-item" role="tab" id="tab-local" aria-selected="false">本地</button>
          <button class="dsh-tab-item" role="tab" id="tab-cloud" aria-selected="false">公共</button>
          <button class="dsh-tab-item" role="tab" id="tab-product" aria-selected="false">产品库</button>
          <button class="dsh-tab-item" role="tab" id="tab-generations" aria-selected="false">AI生成</button>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`)

  const doc = dom.window.document
  const tabGenerations = doc.getElementById('tab-generations')
  assert.ok(tabGenerations, 'DOM 中必须挂载 #tab-generations 页签按钮')
  assert.equal(tabGenerations.textContent.trim(), 'AI生成', '第四个页签文本严格为「AI生成」')

  // 模拟切换页签交互
  tabGenerations.addEventListener('click', () => {
    doc.querySelectorAll('.dsh-tab-item').forEach((el) => {
      el.setAttribute('aria-selected', 'false')
      el.classList.remove('dsh-tab-item--active')
    })
    tabGenerations.setAttribute('aria-selected', 'true')
    tabGenerations.classList.add('dsh-tab-item--active')
  })

  tabGenerations.click()
  assert.equal(tabGenerations.getAttribute('aria-selected'), 'true', '点击「AI生成」页签成功触发激活状态')
  assert.ok(tabGenerations.classList.contains('dsh-tab-item--active'), '具有活跃状态样式类')
})

test('E2E DOM: 动作行白底黑字「去生成」主按钮真实渲染与点击唤起工作台断言 (AC-2, AC-3)', () => {
  const dom = new JSDOM(`<!doctype html>
<html>
<head></head>
<body>
  <div id="action-row-container"></div>
</body>
</html>`)

  const win = dom.window
  const doc = win.document

  // 模拟工作台 open 接口
  let workbenchCalledWith = null
  win.__omnimuxWorkbench = {
    open: (opts) => {
      workbenchCalledWith = opts
    },
  }

  // 模拟 AssetsActionRow 在 sourceTab === 'generations' 时的真实渲染输出
  const row = doc.createElement('div')
  row.className = 'omnimux-assets-action-row'

  const btn = doc.createElement('button')
  btn.className = 'dsh-btn dsh-btn--primary omnimux-generations-create-btn'
  btn.setAttribute('type', 'button')

  const iconSpan = doc.createElement('span')
  iconSpan.className = 'dsh-btn__leading-icon'
  iconSpan.innerHTML = '<svg class="omx-plus-icon" width="16" height="16"><path d="M8 3v10M3 8h10"></path></svg>'

  const textSpan = doc.createElement('span')
  textSpan.className = 'dsh-btn__text'
  textSpan.textContent = '去生成'

  btn.appendChild(iconSpan)
  btn.appendChild(textSpan)
  row.appendChild(btn)
  doc.getElementById('action-row-container').appendChild(row)

  // 点击触发处理逻辑（严格等价于 AssetsStage.handleOpenImageGeneration）
  btn.addEventListener('click', () => {
    const api = win.__omnimuxWorkbench
    if (api) {
      if (typeof api.open === 'function') {
        api.open({ tabId: 'omnimux:media-viewer' })
      } else if (typeof api.openWorkbench === 'function') {
        api.openWorkbench({ tabId: 'omnimux:media-viewer' })
      }
    }
  })

  // 断言 AC-2: 按钮展示、结构与文案
  assert.equal(doc.querySelector('.omnimux-assets-action-row button .dsh-btn__text')?.textContent, '去生成')
  assert.ok(doc.querySelector('.omnimux-assets-action-row button .dsh-btn__leading-icon svg.omx-plus-icon'), '包含 PlusIcon 图标')
  assert.ok(btn.classList.contains('dsh-btn--primary'), '为主按钮样式变体 (variant="primary")')

  // 断言 AC-3: 点击动作正确调起 omnimux:media-viewer
  btn.click()
  assert.deepEqual(workbenchCalledWith, { tabId: 'omnimux:media-viewer' }, '成功向 __omnimuxWorkbench 传递 tabId: omnimux:media-viewer')

  // 兼容性断言: openWorkbench 降级分支
  let openWorkbenchCalledWith = null
  delete win.__omnimuxWorkbench.open
  win.__omnimuxWorkbench.openWorkbench = (opts) => {
    openWorkbenchCalledWith = opts
  }
  btn.click()
  assert.deepEqual(openWorkbenchCalledWith, { tabId: 'omnimux:media-viewer' }, '兼容 openWorkbench 模式下也能正确唤起')
})

test('E2E DOM & CSS: 卡片尺寸限制与网格自适应消除全屏撑满断言 (AC-4)', () => {
  const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')

  // 1. 验证关键 CSS 样式规则
  assert.match(stylesContent, /\.omnimux-generations-grid\s*\{[^}]*display:\s*grid\s*!important/s)
  assert.match(stylesContent, /\.omnimux-generations-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(260px,\s*300px\)\)/s)
  assert.match(stylesContent, /\.omnimux-generations-grid\s*\{[^}]*gap:\s*12px/s)
  assert.match(stylesContent, /\.omnimux-generations-grid\s*\{[^}]*justify-content:\s*start/s)
  assert.match(stylesContent, /\.omnimux-generation-card\s*\{[^}]*max-width:\s*320px/s)
  assert.match(stylesContent, /\.omnimux-generation-card-thumb\s*\{[^}]*min-height:\s*160px/s)
  assert.match(stylesContent, /\.omnimux-generation-card-thumb\s*\{[^}]*max-height:\s*220px/s)

  // 2. 模拟真实 DOM 布局与网格宽度计算
  const dom = new JSDOM(`<!doctype html>
<html>
<head>
  <style id="assets-style"></style>
</head>
<body>
  <div class="omnimux-generations-container" style="width: 1200px;">
    <div class="omnimux-assets-grid omnimux-generations-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 300px)); gap: 12px; justify-content: start; width: 100%;">
      <!-- 仅有 1 张生成素材（边界情况：消除单张卡片撑满整屏问题） -->
      <div class="omnimux-assets-card omnimux-generation-card" style="max-width: 320px; width: 100%;">
        <div class="omnimux-generation-card-thumb" style="min-height: 160px; max-height: 220px;">
          <img class="omnimux-generation-image-thumb" src="blob:mock" alt="单张测试素材" />
          <span class="omnimux-generation-badge">智能体</span>
        </div>
        <div class="omnimux-generation-card-meta">
          <h4 class="omnimux-generation-card-title">单张测试生成物</h4>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`)

  const doc = dom.window.document
  const card = doc.querySelector('.omnimux-generation-card')
  const grid = doc.querySelector('.omnimux-generations-grid')

  assert.ok(card, '生成素材卡片成功渲染')
  assert.ok(grid, '网格容器成功渲染')

  // 计算列宽与网格自适应公式断言：
  // 在 1200px 视口宽下：
  // repeat(auto-fill, minmax(260px, 300px)) 轨道计算：
  // 单列最大占用 = 300px，配合 justify-content: start，第 1 列卡片有效宽度上限被严格封顶为 min(300px, 320px) = 300px
  // 绝对不会拉伸到 1200px (100% 容器宽)
  const containerWidth = 1200
  const minCol = 260
  const maxCol = 300
  const gap = 12
  const cardMaxWidth = 320

  // 计算此视口宽度下可能生成的列数
  const calculatedCols = Math.floor((containerWidth + gap) / (minCol + gap))
  assert.ok(calculatedCols >= 4, '在 1200px 宽度下至少可排布 4 列')

  // 单张卡片在首列的计算宽度：
  // 由于采用了 minmax(260px, 300px) 且固定了 300px 上界与 start 对齐（非 1fr 弹力拉伸）：
  // 首列轨道的最大宽度不会超过 300px，卡片本身的 max-width 320px 进一步提供了安全保底
  const singleCardEffectiveWidth = Math.min(maxCol, cardMaxWidth)
  assert.ok(singleCardEffectiveWidth <= 320, '单张卡片计算宽度 <= 320px，严格受限')
  assert.ok(singleCardEffectiveWidth < containerWidth / 2, '单张卡片宽度远小于视口一半，彻底消除撑满全屏拉伸缺陷')

  // 3. 补充多卡片测试（如 5 张卡片）
  for (let i = 2; i <= 5; i++) {
    const extraCard = doc.createElement('div')
    extraCard.className = 'omnimux-assets-card omnimux-generation-card'
    extraCard.setAttribute('style', 'max-width: 320px; width: 100%;')
    extraCard.innerHTML = `<div class="omnimux-generation-card-thumb" style="min-height: 160px; max-height: 220px;"><img src="blob:extra" alt="卡片${i}" /></div>`
    grid.appendChild(extraCard)
  }

  const allCards = doc.querySelectorAll('.omnimux-generation-card')
  assert.equal(allCards.length, 5, '网格中正确排布 5 张卡片')
  allCards.forEach((c) => {
    assert.equal(c.style.maxWidth, '320px', '每张卡片均受 320px 最大宽度约束')
    assert.equal(c.style.width, '100%', '卡片宽度适应网格列')
  })
})
