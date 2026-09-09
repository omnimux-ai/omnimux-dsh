import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createStageStore } from './stage-store.js'

// Offline component tests: real React/portal lifecycle, mocked media and Host I/O.
// These do not establish browser layout or native Electron hit-test acceptance.
const require = createRequire(import.meta.url)
const hubRequire = createRequire(new URL('../../../omnimux/package.json', import.meta.url))
const { JSDOM } = hubRequire('jsdom')
const dom = new JSDOM('<!doctype html><div id="root"></div><div data-omnimux-canvas-tab></div>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLStyleElement: dom.window.HTMLStyleElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })
const host = document.querySelector('[data-omnimux-canvas-tab]')
host.getBoundingClientRect = () => ({ width: 900, height: 600 })
const fixture = { project: null, hasOpenProject: false, mounts: 0, unmounts: 0, close: [] }
globalThis.__clipQa = fixture
const mocks = {
  'App.tsx': `import React, {useEffect,useState,useSyncExternalStore} from 'react';
export default function App(){
  const [edit,setEdit]=useState('original');
  useEffect(()=>{globalThis.__clipQa.mounts++;return()=>{globalThis.__clipQa.unmounts++}},[]);
  const langStore = globalThis.__clipQa.lang;
  const stage = globalThis.__clipQa.stage;
  const langSnap = useSyncExternalStore(
    cb => langStore ? langStore.subscribe(cb) : () => {},
    () => langStore ? langStore.getSnapshot() : { active: 'zh' }
  );
  const stageSnap = useSyncExternalStore(
    cb => stage ? stage.subscribe(cb) : () => {},
    () => stage ? stage.getSnapshot() : false
  );
  const session = stage?.getSessionSnapshot();
  const isCanvasMode = session?.source === 'canvas';
  const label = langSnap?.active === 'en' ? 'Exit editor' : '退出编辑';
  const handleClose = () => {
    if (session?.nodeId) globalThis.__clipQa.close.push({ nodeId: session.nodeId });
    stage?.set(false);
  };
  return React.createElement('div', null,
    isCanvasMode ? React.createElement('button', {
      className: 'omnimux-clip-stage-close-btn',
      'aria-label': label,
      onClick: handleClose,
    }, label) : null,
    React.createElement('input', {id:'editor-state',value:edit,onChange:e=>setEdit(e.target.value)})
  );
}`,
  'project-store.ts': `export const useProjectStore = select => select(globalThis.__clipQa);`,
  'engine-store.ts': `export const useEngineStore = {getState:()=>({})};`,
  'theme-store.ts': `export const applyOpenReelTheme = ()=>{};`,
  'use-router.ts': `export const resetOpenReelRouter = ()=>{};`,
  'projectApi.js': `export const putClipProject = (...args)=>globalThis.__clipQa.save ? globalThis.__clipQa.save(...args) : Promise.resolve({});`,
  'useCanvasIngestion.ts': `export const useCanvasIngestion = ()=>{};`,
  'CanvasBridge.js': `export const notifyCanvasSave = ()=>{}; export const notifyCanvasClose = p=>globalThis.__clipQa.close.push(p);`,
}
async function load(name) {
  const result = await build({ entryPoints: [new URL(name, import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', plugins: [{ name: 'qa-io', setup(b) {
    b.onResolve({ filter: /^react(?:\/.*)?$|^react-dom(?:\/.*)?$/ }, args => ({ path: require.resolve(args.path), external: true }))
    b.onResolve({ filter: /\.(css|tsx?|js)$/ }, args => {
      const base = args.path.split('/').pop()
      if (args.path.endsWith('.css')) return { path: args.path, namespace: 'empty' }
      if (mocks[base]) return { path: base, namespace: 'mock' }
    })
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }))
  } }] })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports)
  return mod.exports
}
const { OpenReelStudioTab } = await load('./OpenReelStudioTab.jsx')
const { ClipStage } = await load('./ClipStage.jsx')
const entry = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
const dictionaries = new Function(`${entry.slice(entry.indexOf('const zh ='), entry.indexOf('function renderClipIcon'))}; return {zh,en}`)()
function locale(active) {
  return { snapshot: {active,revision:0}, listeners: new Set(), getSnapshot(){return this.snapshot}, subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}, set(active){this.snapshot={active,revision:this.snapshot.revision+1};this.listeners.forEach(fn=>fn())} }
}
async function render(Component, initial, extra = {}) {
  const lang = locale(initial)
  globalThis.__clipQa.lang = lang
  globalThis.__clipQa.stage = extra.stage
  const t = key => dictionaries[lang.snapshot.active][key] || key
  const root = createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(Component,{locale:lang,t,...extra})))
  return {lang,root, async cleanup(){await act(async()=>root.unmount())} }
}

test('QA: non-slot Studio follows initial host, live switch, revision and remount', async () => {
  fixture.project=null; fixture.hasOpenProject=false
  let ui = await render(OpenReelStudioTab,'en')
  try {
    assert.equal(document.querySelector('#omnimux-clip-project-name').placeholder,'My video')
    await act(async()=>ui.lang.set('zh'))
    assert.equal(document.querySelector('#omnimux-clip-project-name').placeholder,'我的短视频')
    await act(async()=>ui.lang.set('zh'))
  } finally {await ui.cleanup()}
  assert.equal(ui.lang.listeners.size,0)
  ui = await render(OpenReelStudioTab,'en')
  try {assert.equal(document.querySelector('#omnimux-clip-project-name').placeholder,'My video')} finally {await ui.cleanup()}
})

test('QA: English Studio preset options contain no untranslated Chinese directions', async () => {
  fixture.project=null; fixture.hasOpenProject=false
  const ui = await render(OpenReelStudioTab,'en')
  try {assert.doesNotMatch(document.querySelector('#omnimux-clip-preset').textContent, /横屏|竖屏|方形/)} finally {await ui.cleanup()}
})

test('QA: saved hostbar status changes language without saving again', async () => {
  fixture.project={id:'qa',name:'QA'}; fixture.hasOpenProject=true
  const ui = await render(OpenReelStudioTab,'zh')
  try {
    await act(async()=>document.querySelector('.omnimux-clip-stage-save-btn').click())
    assert.equal(document.querySelector('.openreel-studio-hostbar-status').textContent,'已保存')
    await act(async()=>ui.lang.set('en'))
    assert.equal(document.querySelector('.openreel-studio-hostbar-status').textContent,'Saved')
  } finally {await ui.cleanup()}
})

test('QA: return clears active session but preserves portal editor and translated reopen', async () => {
  fixture.mounts=0; fixture.unmounts=0; fixture.close=[]
  const stage=createStageStore(()=>({}))
  stage.openFromCanvas({nodeId:'A'})
  const ui=await render(ClipStage,'zh',{stage})
  try {
    const editor=document.querySelector('#editor-state')
    assert.ok(editor)
    await act(async()=>document.querySelector('.omnimux-clip-stage-close-btn').click())
    assert.equal(stage.getSessionSnapshot(),null)
    assert.equal(stage.getSnapshot(),false)
    assert.equal(document.querySelector('#editor-state'),editor)
    assert.equal(document.querySelector('.omnimux-clip-stage').style.display,'none')
    assert.deepEqual(fixture.close,[{nodeId:'A'}])
    await act(async()=>ui.lang.set('en'))
    await act(async()=>stage.openFromCanvas({nodeId:'A'}))
    assert.equal(document.querySelector('#editor-state'),editor)
    assert.equal(document.querySelector('.omnimux-clip-stage-close-btn').textContent,'Exit editor')
    assert.equal(fixture.mounts,1)
    assert.equal(fixture.unmounts,0)
  } finally {await ui.cleanup();stage.dispose()}
})

// Final regression additions retain all first-round assertions above.
test('QA round 2: preset labels switch both ways without changing selected dimensions', async () => {
  fixture.project = null
  fixture.hasOpenProject = false
  const ui = await render(OpenReelStudioTab, 'en')
  try {
    const select = document.querySelector('#omnimux-clip-preset')
    const labels = () => [...select.options].map(option => option.textContent)
    assert.deepEqual(labels(), ['Landscape 1920×1080', 'Portrait 1080×1920', 'Square 1080×1080', 'Landscape 1280×720'])
    await act(async () => {
      select.value = '1080x1920'
      select.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    await act(async () => ui.lang.set('zh'))
    assert.deepEqual(labels(), ['横屏 1920×1080', '竖屏 1080×1920', '方形 1080×1080', '横屏 1280×720'])
    await act(async () => ui.lang.set('en'))
    assert.equal(select.value, '1080x1920')
  } finally { await ui.cleanup() }
})

for (const mode of ['manual', 'auto']) {
  for (const outcome of ['saved', 'saveFailed']) {
    test(`QA round 2: ${mode} ${outcome} translates pending and settled state without resaving`, async () => {
      fixture.project = { id: 'qa-counted', name: 'Counted' }
      fixture.hasOpenProject = true
      const originalSet = globalThis.setTimeout
      const originalClear = globalThis.clearTimeout
      const timers = new Map()
      let scheduled = 0
      let calls = 0
      let settle
      globalThis.setTimeout = (fn, delay, ...args) => {
        if (delay !== 1200) return originalSet(fn, delay, ...args)
        const token = { qaTimer: ++scheduled }
        timers.set(token, fn)
        return token
      }
      globalThis.clearTimeout = token => {
        if (token?.qaTimer) timers.delete(token)
        else originalClear(token)
      }
      fixture.save = () => {
        calls++
        return new Promise((resolve, reject) => { settle = outcome === 'saved' ? resolve : reject })
      }
      let ui
      try {
        ui = await render(OpenReelStudioTab, 'zh')
        const status = () => document.querySelector('.openreel-studio-hostbar-status').textContent
        assert.equal(status(), '')
        assert.equal(scheduled, 1)
        await act(async () => ui.lang.set('en'))
        assert.equal(calls, 0)
        assert.equal(scheduled, 1, 'locale must not restart the autosave deadline')
        await act(async () => {
          if (mode === 'manual') document.querySelector('.omnimux-clip-stage-save-btn').click()
          else {
            const [token, fn] = timers.entries().next().value
            timers.delete(token)
            fn()
          }
        })
        assert.equal(calls, 1)
        assert.equal(status(), 'Saving…')
        await act(async () => ui.lang.set('zh'))
        assert.equal(status(), '保存中…')
        assert.equal(calls, 1)
        await act(async () => settle(outcome === 'saved' ? {} : new Error('QA save failure')))
        assert.equal(status(), outcome === 'saved' ? '已保存' : '保存失败')
        await act(async () => ui.lang.set('en'))
        assert.equal(status(), outcome === 'saved' ? 'Saved' : 'Save failed')
        await act(async () => ui.lang.set('en'))
        assert.equal(calls, 1, 'locale and dictionary revision must not save again')
        assert.equal(scheduled, 1, 'no extra debounce timer may be scheduled')
      } finally {
        if (ui) await ui.cleanup()
        globalThis.setTimeout = originalSet
        globalThis.clearTimeout = originalClear
        delete fixture.save
      }
      assert.equal(timers.size, 0, 'unmount clears any pending autosave')
    })
  }
}

test('QA round 2: five canvas return/reopen cycles retain the same portal editor', async () => {
  fixture.mounts = 0
  fixture.unmounts = 0
  fixture.close = []
  const stage = createStageStore(() => ({}))
  stage.openFromCanvas({ nodeId: 'repeat' })
  const ui = await render(ClipStage, 'zh', { stage })
  try {
    const editor = document.querySelector('#editor-state')
    for (let cycle = 0; cycle < 5; cycle++) {
      await act(async () => document.querySelector('.omnimux-clip-stage-close-btn').click())
      assert.equal(stage.getSessionSnapshot(), null)
      assert.equal(stage.getSnapshot(), false)
      assert.equal(document.querySelector('.omnimux-clip-stage').style.display, 'none')
      await act(async () => ui.lang.set(cycle % 2 ? 'zh' : 'en'))
      await act(async () => stage.openFromCanvas({ nodeId: 'repeat' }))
      assert.equal(document.querySelector('#editor-state'), editor)
      assert.ok(host.contains(editor))
      const button = document.querySelector('.omnimux-clip-stage-close-btn')
      assert.equal(button.textContent, cycle % 2 ? '退出编辑' : 'Exit editor')
      assert.equal(button.getAttribute('aria-label'), button.textContent)
      assert.equal(fixture.mounts, 1)
      assert.equal(fixture.unmounts, 0)
    }
    assert.deepEqual(fixture.close, Array.from({ length: 5 }, () => ({ nodeId: 'repeat' })))
  } finally { await ui.cleanup(); stage.dispose() }
  assert.equal(fixture.unmounts, 1)
  assert.equal(ui.lang.listeners.size, 0)
})
