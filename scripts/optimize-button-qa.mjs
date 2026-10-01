import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const hubRequire = createRequire(join(REPO_ROOT, 'plugins/omnimux/package.json'))

async function bundleComponent() {
  const { build } = hubRequire('esbuild')
  const entrySource = `
import React, { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { OptimizeButton } from '../plugins/omnimux/src/client/prompt-optimizer/OptimizeButton.jsx'
const t = (k) => ({ 'promptOptimize.tooltip': '优化提示词', 'promptOptimize.noKey': '配置 API Key 后可用', 'promptOptimize.failed': '优化失败，请重试' }[k] || k)
let cached = { draft: '', draftRev: 0, phase: 'plain', occurrences: [], attachmentIds: [] }
const draftStore = {
  listeners: new Set(),
  set(v){ cached = { ...cached, draft: v }; this.listeners.forEach(l=>l()) },
  subscribe(l){ this.listeners.add(l); return ()=>this.listeners.delete(l) },
}
window.__setDraft = (v) => draftStore.set(v)
const useInput = (sel) => useSyncExternalStore(
  (l)=>draftStore.subscribe(l),
  ()=>sel(cached),
  ()=>sel(cached),
)
window.__mountOptimizeButton = (el, props) => createRoot(el).render(React.createElement(OptimizeButton, { t, useInput, ...props }))
`
  const res = await build({
    absWorkingDir: REPO_ROOT,
    stdin: { contents: entrySource, resolveDir: join(REPO_ROOT, 'scripts'), loader: 'js' },
    bundle: true, format: 'iife', write: false, logLevel: 'silent',
    loader: { '.woff':'empty','.woff2':'empty','.ttf':'empty','.css':'empty','.svg':'text','.png':'empty' },
    jsx: 'automatic', outdir: 'dist',
  })
  return res.outputFiles[0].text
}

const HARNESS = (bundled) => `<!doctype html><html><body>
<div data-composer-card>
  <div data-composer-input="true" contenteditable="true" role="textbox" style="min-height:60px;border:1px solid #555;padding:8px;color:#eee;background:#1c1c1f"></div>
  <div id="toolbar" style="display:flex;gap:6px;margin-top:8px;align-items:center">
    <div id="model" style="color:#aaa;font-size:12px">Claude Opus 4.5 ▾</div>
    <button aria-label="发送消息" id="send" style="margin-left:auto">send</button>
  </div>
</div>
<style>body{background:#111113;color:#eee;font:13px system-ui;padding:40px}</style>
<script>${bundled}<\/script>
<script>
  window.__omnimuxComposerActions = {
    getDraft(){ return document.querySelector('[data-composer-input]').innerText },
    setDraft(t){ document.querySelector('[data-composer-input]').innerText = t; window.__setDraft(t); return true },
  }
  window.__optimizeState = { delay: 250, fail: false }
  window.__omnimuxPromptOptimizer = {
    configured: true,
    async optimize(text){
      await new Promise(r=>setTimeout(r, window.__optimizeState.delay))
      if (window.__optimizeState.fail) return { ok:false, error:'upstream' }
      return { ok:true, prompt:'优化后：' + text, templateId:'bugfix-production', matched:true }
    }
  }
  const mount = document.createElement('span')
  document.getElementById('toolbar').insertBefore(mount, document.getElementById('model'))
  window.__mountOptimizeButton(mount, {})
  // 输入联动快照 store
  document.querySelector('[data-composer-input]').addEventListener('input', (e)=>window.__setDraft(e.target.innerText))
<\/script>
</body></html>`

async function main() {
  const bundled = await bundleComponent()
  assert.ok(bundled.includes('omx-optimize-btn'))
  const { chromium } = await import('/Users/x/.camofox-browser/node_modules/playwright-core/index.mjs')
  const browser = await chromium.launch({ headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args:['--no-sandbox'] })
  const page = await browser.newPage({ viewport:{width:900,height:400} })
  const errors=[]; page.on('pageerror',e=>errors.push(e.message))
  await page.setContent(HARNESS(bundled))
  await page.waitForSelector('.omx-optimize-btn',{timeout:8000})
  const outDir=join(REPO_ROOT,'docs/evidence/prompt-optimizer-qa'); mkdirSync(outDir,{recursive:true})
  const results=[]

  // 1 空草稿 → disabled
  await page.screenshot({path:`${outDir}/01-disabled-empty.png`})
  results.push({case:'empty-disabled', ...await page.$eval('.omx-optimize-btn',b=>({disabled:b.disabled,title:b.title||null}))})

  // 2 输入 → enabled → click → running → replaced
  await page.evaluate(()=>{const el=document.querySelector('[data-composer-input]');el.innerText='登录接口偶尔报 500，帮我查一下生产环境怎么回事';el.dispatchEvent(new Event('input',{bubbles:true}))})
  await page.waitForTimeout(150)
  results.push({case:'enabled', ...await page.$eval('.omx-optimize-btn',b=>({disabled:b.disabled,title:b.title}))})
  await page.click('.omx-optimize-btn')
  await page.waitForTimeout(90)
  results.push({case:'running', ...await page.$eval('.omx-optimize-btn',b=>({state:b.dataset.state,spinner:!!b.querySelector('.omx-optimize-spinner'),disabled:b.disabled}))})
  await page.screenshot({path:`${outDir}/02-running.png`})
  await page.waitForTimeout(400)
  results.push({case:'replaced', draft:await page.$eval('[data-composer-input]',el=>el.innerText.slice(0,60)), state:await page.$eval('.omx-optimize-btn',b=>b.dataset.state)})
  await page.screenshot({path:`${outDir}/03-replaced.png`})

  // 3 失败 → 草稿保留 + 提示
  await page.evaluate(()=>{const el=document.querySelector('[data-composer-input]');el.innerText='再试一次';window.__setDraft('再试一次');window.__optimizeState.fail=true})
  await page.click('.omx-optimize-btn')
  await page.waitForTimeout(500)
  results.push({case:'fail', draft:await page.$eval('[data-composer-input]',el=>el.innerText), notice:await page.evaluate(()=>document.body.innerText.includes('优化失败'))})
  await page.screenshot({path:`${outDir}/04-fail.png`})

  writeFileSync(join(outDir,'report.json'),JSON.stringify({results,errors},null,2))
  console.log(JSON.stringify({results,errors},null,2))
  await browser.close()
  if(errors.length)process.exit(1)
}
main().catch(e=>{console.error(e);process.exit(1)})
