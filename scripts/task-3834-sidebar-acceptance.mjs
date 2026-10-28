#!/usr/bin/env node
/**
 * #3834 退役 omnimux-automation 的界面验收。
 *
 * 本次改动是「删除界面代码」，没有新增可点击路径，所以验收对象是退役的**可观测结果**：
 * 侧栏入口清单里不再出现 automation 条目，而其余入口保持原样。
 *
 * 用真实 Chrome 内核渲染一份最小 harness：把工作树里 sidebar-coordinator.js 的
 * EXPLORE_MENU_ITEMS 真实导出喂进 DOM，截图留证。不连 Dev、不写共享 profile。
 */
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean)

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try { readFileSync(candidate); return candidate } catch { /* 继续找 */ }
  }
  throw new Error('未找到 Chrome/Chromium，可用 CHROME_PATH 指定')
}

async function main() {
  const chrome = findChrome()

  // 真实读取工作树的侧栏入口真源，不复制一份清单到脚本里。
  const coordinatorPath = join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')
  const mod = await import(pathToFileURL(coordinatorPath).href)
  const entries = mod.EXPLORE_MENU_ITEMS
  if (!Array.isArray(entries)) throw new Error('EXPLORE_MENU_ITEMS 不是数组')

  const ids = entries.map(item => item.id)
  const pluginIds = entries.map(item => item.pluginId).filter(Boolean)
  const automationPresent = ids.includes('automation')
    || pluginIds.includes('omnimux-automation')
    || entries.some(item => String(item.tabId || '').startsWith('omnimux-automation'))

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;margin:0;padding:24px;background:#fafafa;color:#111}
    h1{font-size:15px;margin:0 0 4px}
    .sub{color:#666;margin:0 0 18px;font-size:12px}
    ul{list-style:none;padding:0;margin:0;max-width:460px}
    li{display:flex;align-items:center;gap:10px;padding:9px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:9px;margin-bottom:7px}
    .dot{width:7px;height:7px;border-radius:50%;background:#6366f1;flex:none}
    .pid{color:#6b7280;font-size:11px;margin-left:auto;font-family:ui-monospace,monospace}
    .verdict{margin-top:18px;padding:11px 13px;border-radius:9px;font-weight:600}
    .ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}
    .bad{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
  </style></head><body>
    <h1>侧栏一级入口（退役 omnimux-automation 后）</h1>
    <p class="sub">真源：plugins/omnimux/src/client/sidebar-coordinator.js · EXPLORE_MENU_ITEMS · 共 ${entries.length} 项</p>
    <ul>${entries.map(item => `<li><span class="dot"></span><span>${item.label || item.id}</span><span class="pid">${item.pluginId || item.id}</span></li>`).join('')}</ul>
    <div class="verdict ${automationPresent ? 'bad' : 'ok'}">${automationPresent ? '❌ 仍存在 automation 入口' : '✅ 已无 automation 入口'}</div>
  </body></html>`

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const evidenceDir = join(root, 'docs/evidence/task-3834')
  mkdirSync(evidenceDir, { recursive: true })
  const shot = join(evidenceDir, 'sidebar-entries-after-automation-retirement.png')

  try {
    await run(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--window-size=560,720',
      `--screenshot=${shot}`,
      `http://127.0.0.1:${port}/`,
    ], { timeout: 60000 })
  } finally {
    server.close()
  }

  const report = {
    task: '3834',
    scenario: 'sidebar-entries-after-automation-retirement',
    generatedAt: new Date().toISOString(),
    source: 'plugins/omnimux/src/client/sidebar-coordinator.js#EXPLORE_MENU_ITEMS',
    entryCount: entries.length,
    entryIds: ids,
    automationPresent,
    assertions: [
      { name: '侧栏入口清单不含 automation', pass: !automationPresent },
      { name: '入口清单非空（未被整体误删）', pass: entries.length > 0 },
      { name: '其余入口仍带 pluginId', pass: pluginIds.length > 0 },
    ],
    screenshot: shot,
  }
  writeFileSync(join(evidenceDir, 'sidebar-entries-report.json'), JSON.stringify(report, null, 2))

  const failed = report.assertions.filter(a => !a.pass)
  if (failed.length) {
    console.error('❌ 验收失败:', failed.map(a => a.name).join('; '))
    process.exit(1)
  }
  console.log(`✅ 验收通过：${entries.length} 个入口，automation 已消失`)
  console.log(`   截图: ${shot}`)
  console.log(`   报告: ${join(evidenceDir, 'sidebar-entries-report.json')}`)
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
