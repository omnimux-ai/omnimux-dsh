import { JSDOM } from 'jsdom'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 创建仿真 DOM 环境
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
  url: 'https://x.com/ChrisGwinnLA/status/123456789',
})

global.window = dom.window
global.document = dom.window.document
global.HTMLElement = dom.window.HTMLElement
global.Node = dom.window.Node
global.MouseEvent = dom.window.MouseEvent
global.Event = dom.window.Event

// 动态载入已编译或源码中的 anchor
const {
  mountCopilotToTwitterButtons,
  cleanupStaleCopilotButtons,
  isStaleOrphanReplyButton,
  findHorizontalToolbarAnchor,
} = await import('../plugins/omnimux-browser/extension/src/content/twitter-copilot/anchor.ts')

const evidence = {
  task: 'fix/twitter-copilot-inactive-mount-1755',
  timestamp: new Date().toISOString(),
  scenarios: [],
}

// 场景 1：未激活单行回复条（图 1 场景）
console.log('--- 验证场景 1：未激活单行回复条 ---')
document.body.innerHTML = `
  <div class="compact-reply-bar" style="display: flex;">
    <div class="user-avatar">头像</div>
    <div class="placeholder-text">发布你的回复</div>
    <div class="button-wrapper" style="display: flex;">
      <button data-testid="tweetButtonInline" id="inactive-btn" disabled>回复</button>
      <button class="ai-assistant-button" id="sopilot-btn">SoPilot</button>
    </div>
  </div>
`

const inactiveBtn = document.getElementById('inactive-btn')
const sopilotBtn = document.getElementById('sopilot-btn')

inactiveBtn.getBoundingClientRect = () => ({
  width: 60, height: 32, top: 100, left: 400, right: 460, bottom: 132, x: 400, y: 100, toJSON: () => {},
})
sopilotBtn.getBoundingClientRect = () => ({
  width: 32, height: 32, top: 100, left: 468, right: 500, bottom: 132, x: 468, y: 100, toJSON: () => {},
})

// 检查是否误判为孤立陈旧节点
const isStale = isStaleOrphanReplyButton(inactiveBtn)
console.log('未激活回复按钮是否被误判为孤立节点:', isStale, '(期望: false)')

mountCopilotToTwitterButtons()

const inactiveMounted = document.querySelectorAll('.omnimux-copilot-anchor-btn')
console.log('未激活回复条挂载图标数量:', inactiveMounted.length, '(期望: 1)')
const parentDiv = inactiveBtn.parentElement
const firstCopilot = inactiveMounted[0]

evidence.scenarios.push({
  name: '未激活紧凑占位条挂载',
  isStaleOrphan: isStale,
  mountedCount: inactiveMounted.length,
  suppressCompetitor: sopilotBtn.style.display === 'none',
  passed: !isStale && inactiveMounted.length === 1 && sopilotBtn.style.display === 'none',
})

// 场景 2：流转到激活展开卡片（图 2 场景）
console.log('--- 验证场景 2：展开为回复卡片 ---')
// 模拟展开后的推特 DOM
document.body.innerHTML = `
  <div class="expanded-card">
    <div class="card-header" style="display: flex;">
      <span>回复 @ChrisGwinnLA</span>
      <button class="omnimux-copilot-anchor-btn" data-omnimux-copilot="true" id="ghost-corner">旧残留图标</button>
    </div>
    <div data-testid="tweetTextarea_0_label">
      <div data-testid="tweetTextarea_0" role="textbox" contenteditable="true">准备发表神评</div>
    </div>
    <div data-testid="toolBar" class="media-toolbar" style="display: flex;">
      <div class="tools" style="display: flex;">
        <button aria-label="媒体"></button>
        <button aria-label="GIF"></button>
        <button aria-label="Emoji"></button>
      </div>
      <div class="submit-row" style="display: flex;">
        <button data-testid="tweetButtonInline" id="active-reply-btn">回复</button>
        <button class="ai-assistant-button" id="active-sopilot-btn">SoPilot</button>
      </div>
    </div>
  </div>
`

const ghostCorner = document.getElementById('ghost-corner')
const activeReplyBtn = document.getElementById('active-reply-btn')
const activeSopilotBtn = document.getElementById('active-sopilot-btn')

ghostCorner.getBoundingClientRect = () => ({
  width: 32, height: 32, top: 110, left: 550, right: 582, bottom: 142, x: 550, y: 110, toJSON: () => {},
})
activeReplyBtn.getBoundingClientRect = () => ({
  width: 60, height: 36, top: 260, left: 500, right: 560, bottom: 296, x: 500, y: 260, toJSON: () => {},
})
activeSopilotBtn.getBoundingClientRect = () => ({
  width: 32, height: 32, top: 262, left: 568, right: 600, bottom: 294, x: 568, y: 262, toJSON: () => {},
})

mountCopilotToTwitterButtons()

const cornerCleaned = document.getElementById('ghost-corner') === null
const expandedMounted = document.querySelectorAll('.omnimux-copilot-anchor-btn')
console.log('展开态右上角残留是否被清除:', cornerCleaned, '(期望: true)')
console.log('展开态整张卡片挂载图标数量:', expandedMounted.length, '(期望: 1)')

const activeCopilot = expandedMounted[0]
const isAccompanyActiveSopilot = activeSopilotBtn.nextSibling === activeCopilot

evidence.scenarios.push({
  name: '展开状态挂载与单实例守卫',
  cornerCleaned,
  mountedCount: expandedMounted.length,
  isAtBottomToolbar: activeCopilot?.parentElement === activeReplyBtn.parentElement,
  passed: cornerCleaned && expandedMounted.length === 1 && activeSopilotBtn.style.display === 'none',
})

evidence.kind = 'jsdom-simulation-not-browser-acceptance'
evidence.passed = evidence.scenarios.every((scenario) => scenario.passed)
console.log('DOM 模拟检查结果（不构成真实浏览器验收）:', evidence)
mkdirSync(resolve('.workbuddy/evidence/twitter-copilot-inactive-mount-1755'), { recursive: true })
mkdirSync(resolve('tmp'), { recursive: true })
if (!evidence.passed) process.exitCode = 1

writeFileSync(
  resolve('.workbuddy/evidence/twitter-copilot-inactive-mount-1755/evidence.json'),
  JSON.stringify(evidence, null, 2),
  'utf8'
)

writeFileSync(
  resolve('.workbuddy/evidence/twitter-copilot-inactive-mount-1755/report.md'),
  `# 推特助手 DOM 模拟检查

- 历史任务：Issue #1755；报告口径由 #1766 更正。
- 时间：${evidence.timestamp}
- 模拟检查结果：${evidence.passed ? '通过' : '失败'}。
- 范围：JSDOM 合成页面与模拟几何；不包含真实浏览器、真实点击或已安装扩展验收。
- 紧凑条挂载数：${evidence.scenarios[0].mountedCount}；竞品隐藏：${evidence.scenarios[0].suppressCompetitor}。
- 展开条挂载数：${evidence.scenarios[1].mountedCount}；旧图标清理：${evidence.scenarios[1].cornerCleaned}。
`,
  'utf8'
)

// 同步写入 tmp 目录
writeFileSync(
  resolve('tmp/evidence-1755.json'),
  JSON.stringify(evidence, null, 2),
  'utf8'
)
