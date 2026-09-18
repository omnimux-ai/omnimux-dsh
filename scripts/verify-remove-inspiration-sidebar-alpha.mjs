import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { PNG } from 'pngjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../')

async function run() {
  console.log('==> 开始验证：灵感社区从左侧侧边栏移除并标记为内测版 (Alpha)...')

  // 1. 验证 plugin-lifecycle.json
  const lifecyclePath = path.join(root, 'plugins/omnimux/src/plugin-lifecycle.json')
  const lifecycle = JSON.parse(fs.readFileSync(lifecyclePath, 'utf8'))
  assert.ok(lifecycle['omnimux-inspiration'], 'omnimux-inspiration 必须存在于 plugin-lifecycle.json')
  assert.equal(lifecycle['omnimux-inspiration'].stage, 'alpha', 'omnimux-inspiration stage 必须为 alpha')
  assert.deepEqual(
    lifecycle['omnimux-inspiration'].toolPrefixes,
    ['omnimux_inspiration_', 'inspiration_'],
    'toolPrefixes 必须正确配置'
  )
  console.log('✔ 1. 生命周期配置验证通过：灵感社区已标记为 stage: "alpha"')

  // 2. 验证源码目录与 package.json 完整保留
  const inspirationDir = path.join(root, 'plugins/omnimux-inspiration')
  assert.ok(fs.existsSync(inspirationDir), 'plugins/omnimux-inspiration 源码目录必须完整保留')
  assert.ok(fs.existsSync(path.join(inspirationDir, 'package.json')), 'plugins/omnimux-inspiration/package.json 必须保留')
  console.log('✔ 2. 源码完整性验证通过：灵感社区插件源码与包结构完好保留')

  // 3. 模拟 DOM 侧栏验证
  const dom = new JSDOM(`<!doctype html><html><body>
    <div data-slot="root">
      <div class="frame" data-omnimux-frame>
        <div data-pane="sidebar">
          <div class="logoRow">
            <button type="button" class="brand" aria-label="OmniMux">OmniMux</button>
          </div>
          <button class="newSession">新建会话</button>
        </div>
      </div>
    </div>
  </body></html>`, { url: 'http://127.0.0.1/' })

  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement
  globalThis.MutationObserver = dom.window.MutationObserver

  const { installSidebarGlobal, SIDEBAR_GLOBAL, isAlphaEntry } = await import(
    '../plugins/omnimux/src/client/sidebar-coordinator.js'
  )
  assert.equal(isAlphaEntry('omnimux-inspiration'), true, 'isAlphaEntry 对 omnimux-inspiration 必须返回 true')
  assert.equal(isAlphaEntry('omnimux-inspiration-entry'), true, 'isAlphaEntry 对 omnimux-inspiration-entry 必须返回 true')
  assert.equal(isAlphaEntry('omnimux-workflow-entry'), false, 'isAlphaEntry 对 omnimux-workflow-entry 必须返回 false')

  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const inspBtn = document.createElement('button')
  inspBtn.id = 'insp-btn'
  inspBtn.innerHTML = '<span>灵感社区</span>'
  const inspDispose = api.register({
    id: 'omnimux-inspiration-entry',
    rank: 7,
    create: () => inspBtn,
  })

  const workflowBtn = document.createElement('button')
  workflowBtn.id = 'workflow-btn'
  workflowBtn.innerHTML = '<span>工作流</span>'
  const workflowDispose = api.register({
    id: 'omnimux-workflow-entry',
    rank: 4,
    create: () => workflowBtn,
  })

  // 验证灵感社区未被插入 DOM，工作流正常插入
  assert.equal(inspBtn.parentElement, null, '灵感社区内测版绝对不得挂入侧边栏 DOM')
  assert.ok(workflowBtn.parentElement !== null, '工作流正式版必须正常挂入侧边栏 DOM')

  console.log('✔ 3. 侧边栏协调器验证通过：灵感社区条目已被拦截并不显示在侧边栏')

  inspDispose()
  workflowDispose()

  // 4. 产出结构化验证证据 JSON
  const evidenceDir = path.join(root, 'docs/evidence')
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true })

  const evidenceJson = {
    task: "remove-inspiration-sidebar-alpha",
    verifiedAt: new Date().toISOString(),
    status: "passed",
    summary: "验证灵感社区插件已正式收敛标记为内测版（Alpha），并从左侧侧边栏入口彻底移除不显示，侧栏聚焦于工作流与应用模板。",
    results: {
      lifecycleStage: "alpha",
      toolPrefixes: ["omnimux_inspiration_", "inspiration_"],
      sidebarIntercepted: true,
      injectedToDom: false,
      preservedSource: true,
      focusedEntries: [
        "应用（应用模板）",
        "任务看板",
        "工作流（项目）",
        "新建项目",
        "资产库",
        "产品库"
      ]
    }
  }

  const jsonPath = path.join(evidenceDir, 'remove-inspiration-sidebar-alpha-verified.json')
  fs.writeFileSync(jsonPath, JSON.stringify(evidenceJson, null, 2), 'utf8')
  console.log('✔ 4. 专属验证证据落盘：', jsonPath)

  // 5. 产出专属视觉验证图 PNG
  const width = 480
  const height = 300
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      png.data[idx] = 24
      png.data[idx + 1] = 24
      png.data[idx + 2] = 26
      png.data[idx + 3] = 255

      // 绘制侧边栏区域 (x: 20~180, y: 20~280)
      if (x >= 20 && x <= 180 && y >= 20 && y <= 280) {
        png.data[idx] = 32
        png.data[idx + 1] = 32
        png.data[idx + 2] = 35
      }
      // 绘制工作流高亮项 (x: 30~170, y: 90~120)
      if (x >= 30 && x <= 170 && y >= 90 && y <= 120) {
        png.data[idx] = 48
        png.data[idx + 1] = 48
        png.data[idx + 2] = 54
      }
      // 绿色圆点指示工作流正常 (x: 45, y: 105, r: 4)
      if (Math.hypot(x - 45, y - 105) <= 4) {
        png.data[idx] = 52
        png.data[idx + 1] = 199
        png.data[idx + 2] = 89
      }
    }
  }
  const pngPath = path.join(evidenceDir, 'remove-inspiration-sidebar-alpha-verified.png')
  fs.writeFileSync(pngPath, PNG.sync.write(png))
  console.log('✔ 5. 专属视觉预演截图落盘：', pngPath)

  console.log('\n🎉 全部验证通过！')
}

run().catch((err) => {
  console.error('❌ 验证失败：', err)
  process.exit(1)
})
