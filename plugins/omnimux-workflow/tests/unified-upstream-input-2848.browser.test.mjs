import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

// Approved seam: real CanvasEditor, UI-created targets, startup-only controlled
// handwritten sources. This is not the full app or a supplier execution test.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const plugin = join(root, 'plugins/omnimux-workflow');
const scratch = join(root, '.tmp/unified-upstream-input-2848');
const spaceFile = join(scratch, 'space.json');
const require = createRequire(join(plugin, 'package.json'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const cases = [
  { kind: 'text', menu: '文本', modelId: 'gemini-3.8-flash', operationId: 'chat', brand: 'google' },
  { kind: 'image', menu: '图片', modelId: 'gpt-image-2.5', operationId: 'text_to_image', brand: 'openai' },
  { kind: 'video', menu: '视频', modelId: 'seedance-2-5', operationId: 'text_to_video', brand: 'bytedance' },
  { kind: 'audio', menu: '音频', modelId: 'seed-audio-1.0', operationId: 'text_to_speech', brand: 'bytedance' },
];
const longBodyB = '禁止消费的备用正文。' + '\n第二文本B长正文，用于验证真实预览滚动及完整正文不被截断。'.repeat(48);
const literals = {
  zh: { addAssets: '添加素材', assets: '素材', canvas: '画布', local: '本地', add: '添加', preview: '素材预览', disable: '停用', notInUse: '未使用', use: '使用', replace: '替换', cancel: '取消', close: '关闭', search: '搜索素材…', unavailable: '素材尚未就绪' },
  en: { addAssets: 'Add assets', assets: 'Assets', canvas: 'Canvas', local: 'Local', add: 'Add', preview: 'Asset preview', disable: 'Disable', notInUse: 'Not in use', use: 'Use', replace: 'Replace', cancel: 'Cancel', close: 'Close', search: 'Search assets…', unavailable: 'Assets are not ready yet' },
};

function runEgo(code, evidenceDir) {
  // Skill-prescribed heredoc, public nodejs API. No browser/Playwright spawn.
  return new Promise((resolveRun, reject) => {
    const delimiter = `EGO_2848_${randomUUID().replaceAll('-', '')}`;
    const child = spawn('/bin/bash', ['-c', `ego-browser nodejs <<'${delimiter}'\n${code}\n${delimiter}\n`], {
      cwd: root,
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', async (exitCode, signal) => {
      try {
        await writeFile(join(evidenceDir, 'ego.stdout.log'), stdout);
        await writeFile(join(evidenceDir, 'ego.stderr.log'), stderr);
        await writeFile(join(evidenceDir, 'ego-exit.json'), JSON.stringify({ exitCode, signal }, null, 2));
        resolveRun({ exitCode, signal, stdout, stderr });
      } catch (error) { reject(error); }
    });
  });
}

function entrySource(catalog, locale, runId) {
  // Only source init mutates the store. No target, binding, selected model or
  // consumption mutation is exported; the observer returns detached JSON.
  return `
import React from 'react';
import {createRoot} from 'react-dom/client';
import CanvasEditor from './src/canvas/editor/CanvasEditor';
import {injectCanvasStyles} from './src/canvas/injectStyles';
import {useCanvasStore} from './src/canvas/store/canvasStore';
import {setLocale} from './src/canvas/i18n';
import {createDefaultMaterialNodeData} from './src/canvas/types/materialNode';
import {readNodeInputSource} from './src/shared/graph/nodeInputSource';
import {readCanvasCatalog} from './src/workflow/seam/canvasCatalog';
import {validateCanvasInputSelection} from './src/shared/graph/canvasInputMutationGateway';
const rawCatalog=${JSON.stringify(catalog)};
const catalog=readCanvasCatalog(name=>name==='modelCatalog'?{list:()=>rawCatalog}:undefined);
setLocale(${JSON.stringify(locale)});
injectCanvasStyles();
const nodes=[['controlled-source-A','来源A_不应朗读','第一段。'],['controlled-source-B','来源B_不应朗读',${JSON.stringify(longBodyB)}]].map(([id,label,content],i)=>({
 id,type:'material',position:{x:60+i*340,y:40},data:createDefaultMaterialNodeData('text',{
  label,content,nodeKind:'import',selectedTool:'import',status:'ready',nodeWidth:288,params:{}
 })
}));
useCanvasStore.getState().setCatalogRuntime(catalog);
useCanvasStore.getState().hydrateGraph(nodes,[]);
Object.defineProperty(window,'__qa2848',{value:Object.freeze({
 runId:${JSON.stringify(runId)},evidenceLevel:'REAL_COMPONENT_WITH_CONTROLLED_DATA',
 init:'controlled init data: A original short body, B long ready handwritten text; no targets, edges or generated results',
 snapshot:()=>{const state=useCanvasStore.getState(); const graph={nodes:state.nodes,edges:state.edges};
  return JSON.parse(JSON.stringify({...graph,sources:state.nodes.map(n=>readNodeInputSource(n)),catalogFingerprint:catalog.fingerprint,
   verdicts:state.nodes.filter(n=>n.data.inputBindingVersion===1).map(n=>({targetId:n.id,
    ...validateCanvasInputSelection(graph,{targetNodeId:n.id,chosenOperationId:String(n.data.params?.operation??'')},{catalog})}))}));}
}),writable:false});
createRoot(document.getElementById('root')).render(<div className="wf-canvas-root"><main className="wf-canvas-main"><CanvasEditor catalog={catalog}/></main></div>);
`;
}

async function browserJourney(config) {
  const fs = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const digest = (s) => createHash('sha256').update(s).digest('hex');
  const save = (name, value) => fs.writeFile(`${config.evidenceDir}/${name}`, JSON.stringify(value, null, 2) + '\n');
  let spaceId;
  try { spaceId = JSON.parse(await fs.readFile(config.spaceFile, 'utf8')).spaceId; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (spaceId !== 1) throw new Error('ENVIRONMENT: EXPECT_EXISTING_NUMERIC_SPACE_1_NO_CREATE');
  const task = await taskSpace(spaceId);
  // Save before navigation; subsequent runs must resume this numeric ID.
  await fs.writeFile(config.spaceFile, JSON.stringify({ spaceId: task.spaceId, name: task.name, page: 'p1' }, null, 2) + '\n');
  if (task.ownership !== 'agent') throw new Error('ENVIRONMENT: USER_CONTROL_STOP');
  const page = task.page('p1');
  const report = { runId: config.runId, spaceId: task.spaceId, page: page.label,
    evidenceLevel: 'REAL_COMPONENT_WITH_CONTROLLED_DATA', supplier: 'NOT_RUN_NOT_AUTHORIZED', scenes: [] };
  const graph = () => page.evaluate(() => window.__qa2848.snapshot());
  const observe = async (scene, stage) => {
    const snapshot = await page.snapshot();
    scene.snapshots.push({ stage, snapshot });
    console.log(snapshot);
    return snapshot;
  };
  const act = async (scene, method, selector, label) => {
    const receipt = await page[method](selector, { label, timeout: 4000 });
    scene.actions.push({ method, selector, label, receipt });
  };
  const check = (scene, ok, name, details) => {
    scene.assertions.push({ name, ok: Boolean(ok), details });
    if (!ok) throw new Error(`FUNCTIONAL: ${name}`);
  };
  const shot = async (scene, stage) => {
    const path = `${config.evidenceDir}/${scene.kind}-${stage}.png`;
    await page.screenshot({ path, scale: 'css' });
    scene.screenshots.push({ stage, path });
  };
  const visibleSelector = async (selector) => page.evaluate((s) => [...document.querySelectorAll(s)].filter(e => {
    const r=e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  }).length, selector);
  const ui = config.literals;
  report.theme = config.theme;
  report.viewportInput = config.viewport;
  report.themeInput = 'Controlled startup host attributes; production injectCanvasStyles and its fallbacks only. No supplied host tokens or UI style overrides; not full-App theme evidence.';
  report.requestCapture = 'NOT_CLAIMED_UI_GRAPH_ONLY';
  report.unknowns = [
    'R2 new taskId/generated-output transition has no authorized visible task identity editor; body editing is covered, new-task identity remains UNKNOWN.',
    'R5 known-incompatible media and R6 unnamed ready media require a separate approved source fixture/public-policy test; two handwritten text sources cannot prove them.',
    'Full picker filter portals, OS file chooser cancellation, reduced-motion and entry-disappearance fallback remain NOT_COVERED.'
  ];
  const regression = async (scene, name, journey) => {
    const seam = { name, status: 'RUNNING' };
    (scene.regressions ??= []).push(seam);
    const unknownCount=report.unknowns.length;
    try { await journey(); seam.status = report.unknowns.length>unknownCount ? 'UNKNOWN_NOT_COVERED' : 'OBSERVED_COMPONENT_ONLY'; }
    catch (error) {
      seam.status = 'FAILED'; seam.error = String(error.stack ?? error);
      await observe(scene, `${name}-failure`);
      await shot(scene, `${name}-failure`);
      if (/user.control|space.{0,30}(inactive|unassigned)|permission|executionStopped|mayHaveLateEffects/i.test(seam.error)) throw error;
    }
  };
  // Presentation selection/focus may change on cancel; compare all business data,
  // topology and position, but not ReactFlow's selected/measured rendering flags.
  const graphKey = state => JSON.stringify({nodes: state.nodes.map(n=>({id:n.id,type:n.type,position:n.position,data:n.data})),edges:state.edges});
  const bindings = (state, id) => Object.values(state.nodes.find(n=>n.id===id).data.slotBindings ?? {}).flat();
  const verdict = (state, id) => state.verdicts.find(v=>v.targetId===id);
  const coherent = (scene, state, id, name) => {
    const saved=bindings(state,id), records=verdict(state,id)?.records ?? [];
    check(scene, saved.length===new Set(saved.map(o=>JSON.stringify([o.edgeId,o.role]))).size, `${name}: no duplicate edge/role occupant`, saved);
    check(scene, saved.every(o=>state.edges.some(e=>e.id===o.edgeId && e.source===o.sourceNodeId && e.target===id)), `${name}: all bindings have matching real edge`, {saved,edges:state.edges});
    check(scene, records.length===saved.length && records.every(r=>saved.some(o=>o.edgeId===r.occupant.edgeId && o.sourceNodeId===r.occupant.sourceNodeId && o.role===r.occupant.role)), `${name}: records and saved intent coherent`, records);
  };
  const waitUse = (id, source, use) => page.waitForFunction(({id,source,use})=>Object.values(window.__qa2848.snapshot().nodes.find(n=>n.id===id).data.slotBindings??{}).flat().some(o=>o.sourceNodeId===source && o.use===use),{id,source,use},{timeout:5000});
  const closePreview = async () => {
    if (await visibleSelector('.wf-slot-hover-preview')) {
      await page.keyboard.press('Escape');
      await page.waitForSelector('.wf-slot-hover-preview',{state:'hidden',timeout:4000});
    }
  };
  const openPicker = async (scene, entry) => {
    await closePreview();
    await page.focus(entry,{timeout:4000});
    await act(scene,'click',entry,'打开素材选择器');
    await page.waitForSelector('.wf-picker-modal',{state:'visible',timeout:5000});
    await observe(scene,'regression-picker');
  };
  const selectSource = async (scene, name) => {
    // Name/class are from the actual suite and CanvasResourcePane, snapshot is
    // refreshed before selecting. Never guess a stale ref or fabricate a control.
    await observe(scene,`candidate-${name}`);
    await act(scene,'click',`.wf-picker-modal button:has-text("${name}")`,'选择真实文本素材');
  };
  const confirmPicker = async (scene, label) => {
    await act(scene,'click',`.wf-picker-modal .wf-picker-footer button:text-is("${label}")`,'确认素材事务');
    await page.waitForSelector('.wf-picker-modal',{state:'hidden',timeout:5000});
  };
  const returnFocus = async (scene, anchor, label) => {
    await page.waitForFunction(s=>document.activeElement===document.querySelector(s),anchor,{timeout:4000});
    // Observe two rendering turns to catch Esc/focus reopening without a sleep.
    const focus = await page.evaluate(async s=>{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {same:document.activeElement===document.querySelector(s),preview:!!document.querySelector('.wf-slot-hover-preview'),
        active:document.activeElement?.outerHTML};
    },anchor);
    check(scene,focus.same && !focus.preview,`${label}: original well focus without preview reopen`,focus);
  };
  const openReplacement = async (scene, well) => {
    await closePreview();
    await page.focus(well,{timeout:4000});
    await page.press(well,'Enter',{timeout:4000});
    await page.waitForSelector('.wf-slot-hover-preview',{state:'visible',timeout:4000});
    await page.keyboard.press('Tab');
    const action=await page.evaluate(()=>({inPreview:!!document.activeElement?.closest('.wf-slot-hover-preview'),text:document.activeElement?.textContent?.trim()}));
    check(scene,action.inPreview && action.text===ui.replace,'well Tab reaches preview Replace action',action);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.wf-picker-modal',{state:'visible',timeout:5000});
    await observe(scene,'preview-replace-picker');
  };
  const history = async (scene, scope, chord, expected, name) => {
    await closePreview();
    await page.focus(`${scope} .wf-slot-well[role="button"] >> nth=0`,{timeout:4000});
    await closePreview();
    await page.keyboard.press(chord);
    scene.actions.push({method:'keyboard.press',key:chord,label:name});
    await page.waitForFunction(({id,expected})=>{
      const snap=window.__qa2848.snapshot(), n=snap.nodes.find(n=>n.id===id);
      return JSON.stringify({bindings:n.data.slotBindings,edges:snap.edges.filter(e=>e.target===id)})===expected;
    },{id:scene.targetId,expected:JSON.stringify({bindings:expected.nodes.find(n=>n.id===scene.targetId).data.slotBindings,edges:expected.edges.filter(e=>e.target===scene.targetId)})},{timeout:5000});
    const actual=await graph();
    check(scene,graphKey(actual)===graphKey(expected),`${name}: coherent graph restored`,actual);
    coherent(scene,actual,scene.targetId,name);
  };
  const measurePlus = async (scene, entry, stage) => {
    await page.evaluate(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    await page.waitForFunction(s=>{const e=document.querySelector(s);return e && e.getAnimations().every(a=>a.playState!=='running');},entry,{timeout:4000});
    const actual=await page.evaluate(s=>{
      const well=document.querySelector(s), svg=well?.querySelector('svg'), path=svg?.querySelector('path,line,polyline');
      if (!well || !svg || !path) return {missing:true};
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      const ws=getComputedStyle(well),ss=getComputedStyle(svg),ps=getComputedStyle(path);
      const backgrounds=[]; for(let e=well;e;e=e.parentElement) {const style=getComputedStyle(e); backgrounds.push({tag:e.tagName,background:style.backgroundColor,backgroundImage:style.backgroundImage});}
      return {well:rect(well),icon:rect(svg),offsetWidth:well.offsetWidth,offsetHeight:well.offsetHeight,
        color:ss.color,stroke:ps.stroke,strokeWidth:ps.strokeWidth,opacity:ss.opacity,pathOpacity:ps.opacity,strokeOpacity:ps.strokeOpacity,
        visibility:ss.visibility,display:ss.display,border:ws.borderColor,backgrounds,
        tokens:Object.fromEntries(['--dsw-alias-label-secondary','--dsw-alias-label-primary','--wb-text-secondary','--wb-text-primary'].map(k=>[k,ws.getPropertyValue(k).trim()])),
        paths:[...svg.querySelectorAll('path,line,polyline')].map(p=>p.getAttribute('d')??p.outerHTML),
        theme:document.documentElement.dataset.theme,bodyDark:document.body.hasAttribute('data-ds-dark-theme'),viewport:{width:innerWidth,height:innerHeight},zoom:document.querySelector('.wf-header-capsule__zoom-text')?.textContent};
    },entry);
    (scene.visualMeasurements ??= []).push({stage,actual});
    await shot(scene,stage);
    scene.screenshots.at(-1).plusMeasurement=actual;
    check(scene,!actual.missing,`${stage}: actual SVG paths exist`,actual);
    check(scene,actual.offsetWidth===44 && actual.offsetHeight===44,`${stage}: unscaled well is 44x44`,actual);
    check(scene,actual.icon.width>0 && actual.icon.height>0 && parseFloat(actual.strokeWidth)>0 && parseFloat(actual.opacity)>0 && actual.visibility==='visible' && actual.stroke!=='none',`${stage}: rendered stroke geometry`,actual);
    // Contrast is calculated later from actual computed colors and real PNG.
  };
  const measurePicker = async scene => {
    const actual=await page.evaluate(()=>{
      const card=document.querySelector('.wf-picker-modal'),footer=card?.querySelector('.wf-picker-footer');
      const buttons=[...(footer?.querySelectorAll('button')??[])];
      const metric=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,radius:s.borderRadius,paddingRight:s.paddingRight,gap:s.gap,justify:s.justifyContent,borderTop:s.borderTopWidth,text:e.textContent?.trim()};};
      return {card:metric(card),footer:metric(footer),buttons:buttons.map(metric),close:metric(card.querySelector('.wf-modal-close')),
        title:card.querySelector('.wf-modal-title')?.textContent?.trim(),initialSearchFocus:document.activeElement===card.querySelector('.wf-picker-search__input'),
        viewport:{width:innerWidth,height:innerHeight}};
    });
    (scene.pickerMeasurements ??= []).push(actual);
    await shot(scene,'picker-computed');
    const [cancel,confirm]=actual.buttons;
    check(scene,actual.card.radius==='16px' && Math.abs(actual.card.width-Math.min(480,actual.viewport.width-48))<1,'Picker actual 480/calc48 width and 16px radius',actual);
    check(scene,actual.buttons.length===2 && cancel.text===ui.cancel && [ui.add,ui.replace].includes(confirm.text) && actual.title===ui.assets,'PM literal footer and common title',actual);
    check(scene,Math.abs(confirm.x-cancel.right-8)<1 && actual.footer.justify==='flex-end' && Math.abs(actual.footer.right-parseFloat(actual.footer.paddingRight)-confirm.right)<1,'Footer adjacent 8px right-aligned group',actual);
    check(scene,actual.footer.borderTop==='0px','Picker no unapproved inner divider',actual);
    check(scene,actual.buttons.every(b=>Math.abs(b.height-32)<1 && b.radius==='8px') && Math.abs(actual.close.height-32)<1 && actual.close.radius==='8px','Picker controls 32px/8px',actual);
    check(scene,actual.initialSearchFocus,'Picker initially focuses real search',actual);
    check(scene,actual.card.x>=0 && actual.card.y>=0 && actual.card.right<=actual.viewport.width && actual.card.bottom<=actual.viewport.height && confirm.bottom<=actual.viewport.height,'Picker and confirmation within actual viewport',actual);
  };
  let fatal;
  try {
    await page.cdp('Emulation.setDeviceMetricsOverride',{width:config.viewport.width,height:config.viewport.height,deviceScaleFactor:1,mobile:false});
    await page.goto(config.origin, { timeout: 20000 });
    await page.waitForSelector('.wf-canvas-root .react-flow', { timeout: 12000, state: 'visible' });
    report.startSnapshot = await page.snapshot();
    console.log(report.startSnapshot);
    const initial = await graph();
    if (initial.nodes.length !== 2 || initial.edges.length !== 0 || initial.sources.some(s => s.availability !== 'ready')) {
      throw new Error('ENVIRONMENT: CONTROLLED_SOURCE_INIT_NOT_READY');
    }
    report.controlledInit = initial;
    // Debugger sees actual executed source, not HTTP/manifest/URL identity.
    await page.events();
    try {
      await page.cdp('Debugger.enable');
      await page.cdp('Runtime.evaluate', { expression: 'void 0', returnByValue: true });
      const events = await page.events();
      const ids = [...new Set(events.filter(e => e.method === 'Debugger.scriptParsed' && e.params?.url === `${config.origin}/canvas-harness.js`).map(e => e.params.scriptId))];
      if (ids.length !== 1) throw new Error('ENVIRONMENT: LOADED_SCRIPT_MISSING_OR_AMBIGUOUS');
      const actual = await page.cdp('Debugger.getScriptSource', { scriptId: ids[0] });
      const local = await fs.readFile(config.bundlePath, 'utf8');
      if (actual.scriptSource !== local) throw new Error('ENVIRONMENT: LOADED_BUNDLE_SOURCE_MISMATCH');
      report.identity = { bundleSha256: digest(local), loadedScriptSha256: digest(actual.scriptSource), scriptId: ids[0],
        origin: config.origin, bundlePath: config.bundlePath, runId: await page.evaluate(() => window.__qa2848.runId),
        pageInfo: await page.info(), catalogFingerprint: initial.catalogFingerprint };
      if (report.identity.runId !== config.runId) throw new Error('ENVIRONMENT: RUN_ID_MISMATCH');
    } finally { await page.cdp('Debugger.disable'); }
    await save('runtime-identity.json', report.identity);
    for (const item of config.cases) {
      const scene = { ...item, snapshots: [], actions: [], assertions: [], screenshots: [], status: 'RUNNING' };
      report.scenes.push(scene);
      try {
        // Reload only reruns startup source initialization. Every target below
        // must still be created by the real toolbar in this same task space.
        await page.goto(`${config.origin}/?scene=${item.kind}`, { timeout: 20000 });
        await page.waitForSelector('.wf-canvas-root .react-flow', { state: 'visible', timeout: 12000 });
        await observe(scene, 'startup');
        const before = await graph();
        await act(scene, 'click', '.wf-canvas-toolbar__item--primary-add', '打开新增节点菜单');
        await observe(scene, 'toolbar-menu');
        const menuLabel = config.locale === 'en' ? {text:'Text',image:'Image',video:'Video',audio:'Audio'}[item.kind] : item.menu;
        const menu = `.wf-node-menu--dock .wf-node-menu__label:text-is("${menuLabel}")`;
        await act(scene, 'click', menu, `新建${item.menu}生成节点`);
        await page.waitForFunction((ids) => window.__qa2848.snapshot().nodes.some(n => !ids.includes(n.id)), before.nodes.map(n => n.id), { timeout: 6000 });
        const created = await graph();
        const targets = created.nodes.filter(n => !before.nodes.some(old => old.id === n.id));
        check(scene, targets.length === 1, 'exactly one UI-created target', targets.map(n => n.id));
        const targetId = targets[0].id;
        scene.targetId = targetId;
        const scope = `.react-flow__node[data-id="${targetId}"]`;
        // Click the node title, not the empty text editor (which begins editing).
        await act(scene, 'click', `${scope} .wf-material-node .wf-node-header`, '打开新节点配置');
        await observe(scene, 'selected-target');
        // Bounded native viewport actions based on the actual panel rectangle.
        for (let zoomStep=0; zoomStep<5; zoomStep++) {
          const inside=await page.evaluate((s)=>{
            const r=document.querySelector(s+' [data-testid="wf-model-cascade-trigger"]')?.getBoundingClientRect();
            return r && r.top>=0 && r.bottom<innerHeight-20;
          },scope);
          if (inside) break;
          const percent=await page.evaluate(()=>parseInt(document.querySelector('.wf-header-capsule__zoom-text')?.textContent ?? '100'));
          await act(scene, 'click', `.wf-header-controls button[title="${config.locale === 'en' ? 'Zoom Out' : '缩小'}"]`, '缩小以完整查看配置');
          await page.waitForFunction((p)=>parseInt(document.querySelector('.wf-header-capsule__zoom-text')?.textContent ?? '100') <= Math.round(p / 1.2)+1, percent, {timeout:4000});
        }
        await page.waitForFunction((s) => {
          const e=document.querySelector(s+' [data-testid="wf-model-cascade-trigger"]');
          const r=e?.getBoundingClientRect(); return r && r.top>=0 && r.bottom<innerHeight;
        }, scope, {timeout:6000});
        await page.waitForSelector(`${scope} .wf-config-panel`, { state: 'visible', timeout: 6000 });
        await observe(scene, 'new-target-panel');
        await act(scene, 'click', `${scope} [data-testid="wf-model-cascade-trigger"]`, '打开真实模型选择');
        await observe(scene, 'model-menu');
        await act(scene, 'hover', `[data-testid="wf-cascade-brand-${item.brand}"]`, '查看目标模型品牌');
        await observe(scene, 'model-brand');
        await act(scene, 'click', `[data-testid="wf-cascade-model-${item.modelId}"]`, '选择目录真实模型');
        // ModelCascadeMenu remains open after selection; Esc is the public close path.
        await page.keyboard.press('Escape');
        // Escape also deselects the node in the existing canvas; reselect its title.
        await act(scene, 'click', `${scope} .wf-material-node .wf-node-header`, '重新打开已配置节点');
        await page.waitForSelector(`${scope} .wf-config-panel`, {state:'visible',timeout:5000});
        await observe(scene, 'selected-model');
        if (item.kind === 'image' || item.kind === 'video') {
          const wrap = item.kind === 'image' ? '.wf-cfg-summary-bar__wrap' : '.wf-video-trigger-bar__wrap';
          // The floating dock can cover this trigger; use the real keyboard
          // activation path, never force-click or DOM dispatch.
          await page.focus(`${scope} ${wrap} button`, {timeout:4000});
          await page.press(`${scope} ${wrap} button`, 'Enter', {timeout:4000});
          scene.actions.push({method:'press',selector:`${scope} ${wrap} button`,key:'Enter',label:'键盘打开生成方式参数'});
          await observe(scene, 'operation-menu');
        }
        const opSelector = `[data-operation-id="${item.operationId}"]`;
        if (await visibleSelector(opSelector)) {
          await act(scene, 'click', opSelector, '选择批准生成方式');
          await page.keyboard.press('Escape');
        } else {
          // Existing automatic/single-op controls are intentionally hidden.
          // Do not write params or inject an operation control for the test.
          scene.operationControl = 'automatic/singleton; observed selected operation, no store mutation';
          await page.keyboard.press('Escape');
        }
        await act(scene, 'click', `${scope} .wf-material-node .wf-node-header`, '查看方式配置后的空态');
        await page.waitForSelector(`${scope} .wf-config-panel`, {state:'visible',timeout:5000});
        await observe(scene, 'configured-empty');
        const empty = await graph();
        const target = empty.nodes.find(n => n.id === targetId);
        scene.empty = empty;
        check(scene, target.data.materialType === item.kind && target.data.params.model === item.modelId, 'UI selected target type/model', target.data);
        check(scene, target.data.params.operation === item.operationId, 'selected operation is qualified expected operation', target.data.params);
        check(scene, !empty.edges.some(e => e.target === targetId) && !target.data.prompt && !target.data.content && !target.data.generatedContent,
          'new target has no edges/local text/result', target.data);
        check(scene, target.data.inputBindingVersion === 1 && Object.values(target.data.slotBindings ?? {}).flat().length === 0, 'new target explicit empty consumption', target.data.slotBindings);
        await shot(scene, '01-empty');
        const entry = `${scope} [aria-label="${ui.addAssets}"]`;
        check(scene, await visibleSelector(entry) === 1, 'PM literal common empty Add assets entry', ui.addAssets);
        await regression(scene,'Plus-rest-hover-focus-computed',async()=>{
          await measurePlus(scene,entry,'empty-plus-rest');
          await act(scene,'hover',entry,'检查空槽悬停图标');
          await measurePlus(scene,entry,'empty-plus-hover');
          await page.focus(entry,{timeout:4000});
          await measurePlus(scene,entry,'empty-plus-focus');
        });
        // Required input is missing even though discovery is available.
        const canGenerate = await page.evaluate((s) => {
          const buttons=[...document.querySelectorAll(s+' .wf-config-panel__action-group button')];
          if (!buttons.length) throw new Error('FUNCTIONAL: generate control absent');
          return buttons.some(e => !e.disabled && e.getAttribute('aria-disabled') !== 'true');
        }, scope);
        check(scene, !canGenerate, 'missing required text cannot generate');
        await act(scene, 'click', entry, '打开同一素材选择器');
        await page.waitForSelector('.wf-picker-modal', { state: 'visible', timeout: 5000 });
        await observe(scene, 'picker');
        await shot(scene, '02-picker');
        await regression(scene,'Picker-computed-layout-copy',async()=>{ await measurePicker(scene); });
        const picker = await page.evaluate(() => ({ text: document.querySelector('.wf-picker-modal')?.textContent,
          titles:[...document.querySelectorAll('.wf-picker-modal [role="tab"]')].map(e=>e.textContent.trim()),
          nativeSelects:document.querySelectorAll('.wf-picker-modal select').length,
          typeTags:document.querySelectorAll('.wf-picker-modal .wf-picker-type-tag').length }));
        check(scene, picker.titles.includes(ui.canvas) && picker.titles.includes(ui.local), 'PM literal source tabs without count', picker);
        check(scene, picker.nativeSelects === 0 && picker.typeTags === 0, 'no native select or redundant type badge', picker);
        await act(scene, 'click', '.wf-picker-modal button:has-text("来源A_不应朗读")', '选择就绪正文来源A');
        await observe(scene, 'A-selected');
        await act(scene, 'click', `.wf-picker-modal button:text-is("${ui.add}")`, '添加并确认统一绑定');
        await page.waitForSelector('.wf-picker-modal', { state: 'hidden', timeout: 5000 });
        const bound = await graph();
        scene.bound = bound;
        const boundNode = bound.nodes.find(n => n.id === targetId);
        const active = Object.values(boundNode.data.slotBindings ?? {}).flat().filter(o => o.use !== 'inactive');
        check(scene, active.length === 1 && active[0].use === 'active' && active[0].sourceNodeId === 'controlled-source-A' && active[0].outputId && active[0].edgeId && active[0].role && Number.isFinite(active[0].ordinal), 'A has source/output/edge/role/order/use identity', active);
        check(scene, !Object.values(boundNode.data.slotBindings ?? {}).flat().some(o => o.sourceNodeId === 'controlled-source-B'), 'unselected B is not consumed');
        check(scene, !boundNode.data.prompt, 'source body is not copied into local editor');
        await observe(scene, 'bound');
        await shot(scene, '03-bound');
        const well = `${scope} [data-slot-edge="${active[0].edgeId}"]`;
        await act(scene, 'hover', well, '预览已绑定真实正文');
        await page.waitForSelector(`[role="dialog"][aria-label="${ui.preview}"]`, { state: 'visible', timeout: 5000 });
        await observe(scene, 'preview');
        const preview = await page.evaluate(() => document.querySelector('.wf-slot-hover-preview')?.textContent);
        check(scene, preview?.includes('第一段。'), 'preview shows real A body', preview);
        await shot(scene, '04-preview');
        await act(scene, 'click', `.wf-slot-hover-preview button:text-is("${ui.disable}")`, '停用当前上游正文');
        await observe(scene, 'inactive');
        const inactive = await graph();
        scene.inactive = inactive;
        const inactiveNode = inactive.nodes.find(n => n.id === targetId);
        const kept = Object.values(inactiveNode.data.slotBindings ?? {}).flat();
        check(scene, kept.length === 1 && kept[0].use === 'inactive' && kept[0].edgeId === active[0].edgeId, 'Disable preserves same inactive binding', kept);
        check(scene, inactive.edges.some(e => e.id === active[0].edgeId) && inactive.nodes.some(n => n.id === 'controlled-source-A'), 'Disable preserves source and edge');
        const panelText = await page.evaluate((s) => document.querySelector(s)?.textContent, scope);
        check(scene, panelText.includes(ui.notInUse), 'PM literal Not in use is visible', panelText);
        await shot(scene, '05-inactive');
        await act(scene, 'hover', well, '预览已停用素材卡');
        await observe(scene, 'inactive-preview');
        await act(scene, 'click', `.wf-slot-hover-preview button:text-is("${ui.use}")`, '恢复使用同一上游正文');
        await observe(scene, 'reactivated');
        const reactivated = await graph();
        scene.reactivated = reactivated;
        const resumed = Object.values(reactivated.nodes.find(n => n.id === targetId).data.slotBindings ?? {}).flat();
        check(scene, resumed.length === 1 && resumed[0].use !== 'inactive' && resumed[0].edgeId === active[0].edgeId, 'Use restores identity once', resumed);
        await shot(scene, '06-reactivated');
        scene.status = 'PASS_COMPONENT_JOURNEY_ONLY';
        await regression(scene,'original-graph-record-coherence',async()=>{
          coherent(scene,bound,targetId,'original Add');
          coherent(scene,inactive,targetId,'original Disable');
          coherent(scene,reactivated,targetId,'original Use');
          check(scene,verdict(bound,targetId)?.ready && !verdict(inactive,targetId)?.ready && verdict(reactivated,targetId)?.ready,'original ready/inactive/ready states',reactivated.verdicts);
        });
        if (item.kind === 'text') {
          await regression(scene,'R3-keyboard-preview-Escape',async()=>{
            await closePreview();
            await page.focus(well,{timeout:4000}); await page.press(well,'Enter',{timeout:4000});
            await page.waitForSelector('.wf-slot-hover-preview',{state:'visible',timeout:4000});
            await page.keyboard.press('Tab');
            check(scene,await page.evaluate(()=>!!document.activeElement?.closest('.wf-slot-hover-preview')),'Tab reaches actual preview action');
            await page.keyboard.press('Escape');
            await page.waitForSelector('.wf-slot-hover-preview',{state:'hidden',timeout:4000});
            await returnFocus(scene,well,'preview Esc');
            check(scene,graphKey(await graph())===graphKey(reactivated),'preview keyboard close does not change graph');
            await shot(scene,'07-keyboard-closed');
          });
          await regression(scene,'cancel-replace-history-and-order',async()=>{
            const baseline=await graph();
            await openPicker(scene,entry); await selectSource(scene,'来源B_不应朗读');
            await act(scene,'click',`.wf-picker-footer button:text-is("${ui.cancel}")`,'取消待添加素材');
            await page.waitForSelector('.wf-picker-modal',{state:'hidden',timeout:5000});
            await returnFocus(scene,entry,'direct Add Cancel');
            check(scene,graphKey(await graph())===graphKey(baseline),'direct Add Cancel leaves business graph unchanged');
            for (const exit of ['cancel','X','mask','Escape']) {
              await openReplacement(scene,well); await selectSource(scene,'来源B_不应朗读');
              if (exit==='cancel') await act(scene,'click',`.wf-picker-footer button:text-is("${ui.cancel}")`,'取消原位替换');
              else if (exit==='X') await act(scene,'click',`.wf-picker-modal button[aria-label="${ui.close}"]`,'关闭原位替换弹窗');
              else if (exit==='Escape') await page.keyboard.press('Escape');
              else {
                const point=await page.evaluate(()=>{
                  const mask=document.querySelector('.wf-modal-overlay'),r=mask.getBoundingClientRect();
                  for(const [x,y] of [[r.x+2,r.y+2],[r.right-2,r.bottom-2]]) if(document.elementFromPoint(x,y)===mask) return {x,y};
                  return null;
                });
                check(scene,point,'actual backdrop hit-test identifies close target',point);
                await page.mouse.click(point.x,point.y,{label:'点击真实弹窗遮罩关闭'});
              }
              await page.waitForSelector('.wf-picker-modal',{state:'hidden',timeout:5000});
              await returnFocus(scene,well,`preview Replace ${exit}`);
              check(scene,graphKey(await graph())===graphKey(baseline),`Replace ${exit} leaves graph unchanged`);
              await observe(scene,`replace-${exit}-closed`);
            }
            await openReplacement(scene,well); await selectSource(scene,'来源B_不应朗读'); await confirmPicker(scene,ui.replace);
            const replaced=await graph(),replacement=bindings(replaced,targetId);
            check(scene,replacement.length===1 && replacement[0].sourceNodeId==='controlled-source-B' && replacement[0].use==='active' && replacement[0].ordinal===active[0].ordinal && replacement[0].role===active[0].role,'Replace A→B commits exactly one in original position',replacement);
            check(scene,replaced.edges.filter(e=>e.target===targetId).length===1 && replaced.nodes.filter(n=>n.id.startsWith('controlled-source-')).length===2,'Replace keeps both sources and only one target edge',replaced);
            coherent(scene,replaced,targetId,'Replace B');
            check(scene,verdict(replaced,targetId)?.ready && verdict(replaced,targetId)?.records[0]?.asset?.textContent===config.longBodyB,'Replace B active record ready with complete body',verdict(replaced,targetId));
            const wellB=`${scope} [data-slot-edge="${replacement[0].edgeId}"]`;
            await returnFocus(scene,wellB,'successful Replace original-position well');
            await page.focus(wellB,{timeout:4000}); await page.press(wellB,'Enter',{timeout:4000});
            await page.waitForSelector('.wf-slot-hover-preview',{state:'visible',timeout:4000});
            const longPreview=await page.evaluate(()=>{
              const e=document.querySelector('.wf-slot-hover-preview'),r=e.getBoundingClientRect();
              return {body:e.querySelector('span')?.textContent,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflow:getComputedStyle(e).overflowY,bottom:r.bottom,viewport:innerHeight};
            });
            check(scene,longPreview.body===config.longBodyB && longPreview.scrollHeight>longPreview.clientHeight && ['auto','scroll'].includes(longPreview.overflow) && longPreview.bottom<=longPreview.viewport,'long B preview retains whole body in bounded scrollable surface',longPreview);
            await shot(scene,'08-long-B-preview');
            await history(scene,scope,'ControlOrMeta+z',baseline,'Undo Replace');
            await history(scene,scope,'ControlOrMeta+Shift+z',replaced,'Redo Replace');
            await history(scene,scope,'ControlOrMeta+z',baseline,'restore A before second Add');
            await openPicker(scene,entry); await selectSource(scene,'来源B_不应朗读'); await confirmPicker(scene,ui.add);
            const second=await graph(),ordered=bindings(second,targetId).sort((a,b)=>a.ordinal-b.ordinal);
            scene.secondAdd=second;
            check(scene,ordered.length===2 && ordered[0].sourceNodeId==='controlled-source-A' && ordered[1].sourceNodeId==='controlled-source-B' && ordered.every(o=>o.use==='active') && ordered[0].ordinal<ordered[1].ordinal,'second real UI Add preserves A then B order',ordered);
            check(scene,ordered[0].edgeId===active[0].edgeId && second.edges.filter(e=>e.target===targetId).length===2 && verdict(second,targetId)?.ready,'second Add preserves A edge and ready graph',second);
            coherent(scene,second,targetId,'second Add');
            const visualOrder=await page.evaluate(s=>[...document.querySelectorAll(s+' .wf-slot-well[role="button"]')].map(e=>e.getAttribute('aria-label')),scope);
            check(scene,JSON.stringify(visualOrder)===JSON.stringify(['来源A_不应朗读','来源B_不应朗读']),'actual well order A then B',visualOrder);
            await shot(scene,'09-second-Add');
            await history(scene,scope,'ControlOrMeta+z',baseline,'Undo second Add');
            await history(scene,scope,'ControlOrMeta+Shift+z',second,'Redo second Add');
            await page.focus(well,{timeout:4000}); await page.press(well,'Enter',{timeout:4000});
            await page.waitForSelector('.wf-slot-hover-preview',{state:'visible',timeout:4000});
            await act(scene,'click',`.wf-slot-hover-preview button:text-is("${ui.disable}")`,'停用多来源中的A');
            await waitUse(targetId,'controlled-source-A','inactive');
            const disabled=await graph();
            check(scene,verdict(disabled,targetId)?.ready && verdict(disabled,targetId)?.records.map(r=>r.state).join(',')==='inactive,ready','Disable A leaves B ready and original ordinal',verdict(disabled,targetId));
            coherent(scene,disabled,targetId,'multi-source Disable');
            await history(scene,scope,'ControlOrMeta+z',second,'Undo Disable');
            await history(scene,scope,'ControlOrMeta+Shift+z',disabled,'Redo Disable');
            await page.focus(well,{timeout:4000}); await page.press(well,'Enter',{timeout:4000});
            await page.waitForSelector('.wf-slot-hover-preview',{state:'visible',timeout:4000});
            await act(scene,'click',`.wf-slot-hover-preview button:text-is("${ui.use}")`,'恢复多来源中的A');
            await waitUse(targetId,'controlled-source-A','active');
            const used=await graph();
            check(scene,graphKey(used)===graphKey(second),'Use restores original multi-source graph',used);
            await history(scene,scope,'ControlOrMeta+z',disabled,'Undo Use');
            await history(scene,scope,'ControlOrMeta+Shift+z',used,'Redo Use');
          });
          await regression(scene,'R2-visible-body-edit-and-same-source-Add',async()=>{
            await closePreview();
            const beforeEdit=await graph(),previous=bindings(beforeEdit,targetId).find(o=>o.sourceNodeId==='controlled-source-A');
            check(scene,previous,'A binding exists before source edit',previous);
            const editor='.react-flow__node[data-id="controlled-source-A"] textarea.wf-material-node__text-editor';
            await observe(scene,'A-existing-source-editor');
            if (await visibleSelector(editor)!==1) { report.unknowns.push('R2 source editor absent: no injected generated body/task identity; UI body update UNKNOWN.'); return; }
            await page.focus(editor,{timeout:4000});
            if (!await page.evaluate(s=>!document.querySelector(s).readOnly,editor)) { report.unknowns.push('R2 source editor stayed readOnly; no store mutation fallback; body update UNKNOWN.'); return; }
            const newBody='用户通过既有文本编辑器更新的A正文。';
            await page.fill(editor,newBody,{timeout:4000});
            await page.waitForFunction(body=>window.__qa2848.snapshot().sources.find(s=>s.nodeId==='controlled-source-A')?.output.text===body,newBody,{timeout:5000});
            await act(scene,'click',`${scope} .wf-material-node .wf-node-header`,'返回原目标配置');
            await page.waitForSelector(`${scope} .wf-config-panel`,{state:'visible',timeout:5000});
            const edited=await graph();
            check(scene,bindings(edited,targetId).find(o=>o.sourceNodeId==='controlled-source-A').edgeId===previous.edgeId,'source body edit preserves bound edge');
            coherent(scene,edited,targetId,'source edited');
            check(scene,verdict(edited,targetId)?.records.find(r=>r.occupant.sourceNodeId==='controlled-source-A')?.asset?.textContent===newBody,'record follows actual UI-edited A body',verdict(edited,targetId));
            await page.focus(well,{timeout:4000}); await page.press(well,'Enter',{timeout:4000});
            await page.waitForSelector('.wf-slot-hover-preview',{state:'visible',timeout:4000});
            await act(scene,'click',`.wf-slot-hover-preview button:text-is("${ui.disable}")`,'停用更新后的同源A');
            await waitUse(targetId,'controlled-source-A','inactive');
            const inactiveEdited=await graph();
            await openPicker(scene,entry); await selectSource(scene,'来源A_不应朗读'); await confirmPicker(scene,ui.add);
            await waitUse(targetId,'controlled-source-A','active');
            const added=await graph(),same=bindings(added,targetId).filter(o=>o.sourceNodeId==='controlled-source-A');
            check(scene,same.length===1 && same[0].edgeId===previous.edgeId && same[0].ordinal===previous.ordinal && same[0].role===previous.role,'inactive same-source Add reuses exactly one original identity',same);
            check(scene,added.edges.filter(e=>e.source==='controlled-source-A' && e.target===targetId).length===1 && verdict(added,targetId)?.ready && verdict(added,targetId)?.records.find(r=>r.occupant.sourceNodeId==='controlled-source-A')?.state==='ready','same-source Add actual active record and one stable edge ready',verdict(added,targetId));
            coherent(scene,added,targetId,'same-source Add');
            await history(scene,scope,'ControlOrMeta+z',inactiveEdited,'Undo same-source Add');
            await history(scene,scope,'ControlOrMeta+Shift+z',added,'Redo same-source Add');
            await shot(scene,'10-source-edited-reused');
          });
          await regression(scene,'R1-two-invalid-visible-edit-reduction',async()=>{
            const initialState=await graph();
            if (bindings(initialState,targetId).length!==2 || verdict(initialState,targetId)?.records.some(r=>r.state!=='ready')) {
              report.unknowns.push('R1 cannot establish two ready UI bindings after prior seam failure; no initialized target/binding or live-store bypass.'); return;
            }
            await closePreview();
            let uiCanClear=true;
            for (const source of ['controlled-source-A','controlled-source-B']) {
              const editor=`.react-flow__node[data-id="${source}"] textarea.wf-material-node__text-editor`;
              await observe(scene,`${source}-clear-editor`);
              if (await visibleSelector(editor)!==1) { uiCanClear=false; break; }
              await page.focus(editor,{timeout:4000});
              if (!await page.evaluate(s=>!document.querySelector(s).readOnly,editor)) { uiCanClear=false; break; }
              await page.evaluate(s => {
                const el = document.querySelector(s);
                if (!el) return;
                const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                if (setter) setter.call(el, ''); else el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }, editor);
              await page.waitForFunction(id=>window.__qa2848.snapshot().sources.find(s=>s.nodeId===id)?.availability!=='ready',source,{timeout:5000});
            }
            await act(scene,'click',`${scope} .wf-material-node .wf-node-header`,'查看真实失效绑定');
            await page.waitForSelector(`${scope} .wf-config-panel`,{state:'visible',timeout:5000});
            const broken=await graph(),brokenVerdict=verdict(broken,targetId);
            scene.R1Observed=broken;
            if (!uiCanClear || brokenVerdict?.records.filter(r=>r.state==='invalid').length!==2) {
              report.unknowns.push(`R1 UI empty body yielded ${JSON.stringify(brokenVerdict?.records.map(r=>r.state))}, not two invalid; no fake missing-source/mutation fixture. Multi-invalid remains developer public-policy/core coverage.`);
              await shot(scene,'11-empty-source-state'); return;
            }
            check(scene,!brokenVerdict.ready,'two actual invalid records block readiness',brokenVerdict);
            const edgeIds=bindings(broken,targetId).map(o=>o.edgeId);
            const setByUI=async (anchor,action)=>{
              await closePreview(); await page.focus(anchor,{timeout:4000}); await page.press(anchor,'Enter',{timeout:4000});
              await page.waitForSelector('.wf-slot-hover-preview',{state:'visible',timeout:4000});
              await act(scene,'click',`.wf-slot-hover-preview button:text-is("${action}")`,'逐项处理真实失效输入');
            };
            await setByUI(`${scope} [data-slot-edge="${edgeIds[0]}"]`,ui.disable); await waitUse(targetId,'controlled-source-A','inactive');
            const first=await graph();
            check(scene,verdict(first,targetId)?.records.map(r=>r.state).join(',')==='inactive,invalid' && !verdict(first,targetId).ready,'first reduction allowed while remaining invalid blocks',verdict(first,targetId));
            coherent(scene,first,targetId,'first invalid reduction');
            await setByUI(`${scope} [data-slot-edge="${edgeIds[0]}"]`,ui.use);
            check(scene,graphKey(await graph())===graphKey(first),'Use cannot bypass remaining invalid');
            const wellB=`${scope} [data-slot-edge="${edgeIds[1]}"]`;
            await setByUI(wellB,ui.disable); await waitUse(targetId,'controlled-source-B','inactive');
            const final=await graph();
            check(scene,bindings(final,targetId).every(o=>o.use==='inactive') && edgeIds.every(id=>final.edges.some(e=>e.id===id)),'both reductions keep original bindings and edges',final);
            coherent(scene,final,targetId,'both invalid reductions');
            check(scene,!verdict(final,targetId)?.ready,'all inactive without required local body cannot generate',verdict(final,targetId));
            await history(scene,scope,'ControlOrMeta+z',first,'Undo second invalid reduction');
            await history(scene,scope,'ControlOrMeta+Shift+z',final,'Redo second invalid reduction');
            await shot(scene,'12-invalid-reductions');
          });
        }
      } catch (error) {
        scene.status = 'RED'; scene.error = String(error.stack ?? error);
        await observe(scene, 'failure');
        await shot(scene, 'failure');
        if (/user.control|inactive|unassigned|permission|executionStopped|mayHaveLateEffects/i.test(scene.error)) throw error;
      } finally { await save(`${item.kind}-scene.json`, scene); }
    }
  } catch (error) { fatal = error; report.fatal = String(error.stack ?? error); }
  finally {
    report.regressionCoverage = report.unknowns.length ? 'PARTIAL_UNKNOWN_NOT_QA_ACCEPTANCE' : 'COMPONENT_ONLY_NOT_QA_ACCEPTANCE';
    await page.cdp('Emulation.clearDeviceMetricsOverride').catch(error=>{report.viewportCleanupError=String(error);});
    report.endSnapshot = await page.snapshot().catch(error => String(error));
    await save('browser-report.json', report);
    // Goal continues through frontend green and principal sign-off. Never finish
    // or claim another space here; the Node server is owned by the outer finally.
  }
  console.log(JSON.stringify({ runId: config.runId, spaceId: task.spaceId, scenes: report.scenes.map(s => ({ kind:s.kind,status:s.status,error:s.error })) }));
  if (fatal) throw fatal;
  if (report.scenes.length !== 4 || report.scenes.some(s => s.status !== 'PASS_COMPONENT_JOURNEY_ONLY' || s.regressions?.some(r=>r.status==='FAILED'))) throw new Error('FUNCTIONAL: V1_BROWSER_RED');
}

async function inputDigests(metafile) {
  return Object.fromEntries(await Promise.all(Object.keys(metafile.inputs).filter(p => p !== '<stdin>').map(async p => {
    const absolute = resolve(plugin, p);
    return [absolute, sha(await readFile(absolute))];
  })));
}

// Composite measured sRGB solid backgrounds through the first real opaque
// ancestor. Other color spaces/images and unresolved page bases stay UNKNOWN.
function plusPixelEvidence(decoded, actual) {
  const rgb = value => {
    const match=/^(rgb|rgba|color)\(([^)]+)\)$/.exec(value?.trim() ?? '');
    if (!match) return null;
    const srgb=match[1]==='color';
    if (srgb && !/^srgb\s/.test(match[2])) return null;
    const parts=(srgb?match[2].replace(/^srgb\s+/,''):match[2]).split(/[,\s/]+/).filter(Boolean);
    if (parts.length<3 || parts.length>4 || parts.some(v=>!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%?$/i.test(v))) return null;
    const values=parts.map((v,i)=>parseFloat(v)*(v.endsWith('%')?(i<3?255:1)/100:(i<3 && srgb?255:1)));
    if (values.some((v,i)=>!Number.isFinite(v) || v<0 || v>(i<3?255:1))) return null;
    return [...values.slice(0,3),values[3] ?? 1];
  };
  const composite=(front,back)=>front.slice(0,3).map((v,i)=>v*front[3]+back[i]*(1-front[3]));
  const luminance=color=>color.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
  if (actual?.missing || !actual?.icon) return {status:'UNKNOWN',reason:'missing measured SVG'};
  const backgrounds=actual.backgrounds ?? [];
  const layers=backgrounds.map(b=>rgb(b.background));
  const opaque=layers.findIndex(c=>c && c[3]===1);
  const stroke=rgb(actual.stroke);
  if (opaque<0 || !stroke || layers.slice(0,opaque+1).some(c=>!c)) return {status:'UNKNOWN',reason:'unresolved actual stroke/background',actual};
  if (backgrounds.slice(0,opaque+1).some(b=>b.backgroundImage && b.backgroundImage!=='none')) return {status:'UNKNOWN',reason:'non-solid actual background image/gradient',actual};
  let bg=layers[opaque].slice(0,3);
  for(let i=opaque-1;i>=0;i--) bg=composite(layers[i],bg);
  const alpha=Number(actual.opacity)*Number(actual.pathOpacity)*Number(actual.strokeOpacity);
  if (!Number.isFinite(alpha)) return {status:'UNKNOWN',reason:'unresolved stroke opacity',actual};
  stroke[3]*=alpha;
  const fg=composite(stroke,bg),ratio=contrast(fg,bg);
  const rect=actual.icon, sx=decoded.width/actual.viewport.width,sy=decoded.height/actual.viewport.height;
  const bounds={left:Math.max(0,Math.floor(rect.x*sx)),top:Math.max(0,Math.floor(rect.y*sy)),right:Math.min(decoded.width,Math.ceil((rect.x+rect.width)*sx)),bottom:Math.min(decoded.height,Math.ceil((rect.y+rect.height)*sy))};
  let painted=0,nonWhite=0,horizontal=0,vertical=0,total=0,maxPixelContrast=1;
  for(let y=bounds.top;y<bounds.bottom;y++) for(let x=bounds.left;x<bounds.right;x++) {
    const offset=(y*decoded.width+x)*4,pixel=[...decoded.data.subarray(offset,offset+3)];
    const delta=Math.max(...pixel.map((v,i)=>Math.abs(v-bg[i])));
    const px=(x/sx-rect.x)/rect.width,py=(y/sy-rect.y)/rect.height;
    total++; if(pixel.some(v=>v<240)) nonWhite++;
    if(delta>=20 && contrast(pixel,bg)>=2) {
      painted++; maxPixelContrast=Math.max(maxPixelContrast,contrast(pixel,bg));
      if(py>=0.35 && py<=0.65 && px>=0.15 && px<=0.85) horizontal++;
      if(px>=0.35 && px<=0.65 && py>=0.15 && py<=0.85) vertical++;
    }
  }
  return {status:ratio>=3 && painted>=4 && horizontal>=2 && vertical>=2?'OBSERVED_VISIBLE':'FAILED',
    contrast:ratio,requiredNonTextContrast:3,computedStroke:actual.stroke,backgroundRGB:bg,foregroundRGB:fg,
    bounds,total,painted,nonWhite,horizontal,vertical,maxPixelContrast,
    note:'Non-white is diagnostic only (dark white glyph is valid); actual contrast and two painted Plus arms gate visibility.'};
}

test('V1 real browser: four new empty nodes select, preview, disable and reuse canvas text', async (t) => {
  assert.equal(process.env.QA_2848_SOURCE_FROZEN, '1', 'ENVIRONMENT: principal must freeze sources before this single authorized run');
  await mkdir(scratch, { recursive: true });
  const runId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  const evidenceDir = join(scratch, runId);
  await mkdir(evidenceDir);
  const locale = process.env.QA_2848_LOCALE ?? 'en';
  const theme = process.env.QA_2848_THEME ?? 'light';
  assert.ok(['light','dark'].includes(theme), 'QA_2848_THEME must be light or dark');
  const viewportText = process.env.QA_2848_VIEWPORT ?? '1728x873';
  assert.match(viewportText, /^\d{3,4}x\d{3,4}$/, 'QA_2848_VIEWPORT requires widthxheight');
  const [width,height] = viewportText.split('x').map(Number);
  assert.ok(width>=960 && width<=2400 && height>=640 && height<=1600, 'bounded desktop/compact viewport');
  const viewport = {width,height};
  assert.ok(literals[locale], 'QA_2848_LOCALE must be zh or en');
  const run = { runId, root, locale, theme, viewport, themeInput: 'startup host attributes and production fallbacks only; no supplied host tokens', evidenceLevel: 'REAL_COMPONENT_WITH_CONTROLLED_DATA', buildExit: null,
    supplier: 'NOT_RUN_NOT_AUTHORIZED', requests: [], serverClosed: false };
  let server;
  try {
    run.head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    run.dirtyPaths = execFileSync('git', ['-C', root, 'status', '--short'], { encoding: 'utf8' });
    // Exactly the builder provided as modelCatalog.list by Hub apply. No live
    // fetch, credentials, realm/config qualification mutation or draft promotion.
    const { buildModelCatalog } = await import(join(root, 'plugins/omnimux/src/catalog/list.js'));
    const catalog = buildModelCatalog({ env: {} });
    await writeFile(join(evidenceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    run.catalogFingerprint = catalog.fingerprint;
    run.catalogCandidates = cases.map(item => {
      const model = catalog.models.find(m => m.id === item.modelId);
      const op = model?.operations.find(o => o.id === item.operationId);
      return { ...item, listed: op?.listed, implementation: op?.implementation,
        upstreamText: op?.inputs.filter(s => s.type === 'text' && s.valueSources?.includes('upstream_output')) ?? [] };
    });
    const esbuild = require('esbuild');
    let built;
    try {
      built = await esbuild.build({ absWorkingDir: plugin, stdin: { contents: entrySource(catalog, locale, runId), resolveDir: plugin, loader: 'tsx' },
        bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', target: 'es2020', jsx: 'automatic',
        nodePaths: [join(plugin, 'node_modules'), join(root, 'node_modules/.pnpm/node_modules'), join(root, 'node_modules')],
        loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"development"' }, legalComments: 'none', logLevel: 'silent' });
      run.buildExit = 0;
    } catch (error) {
      run.buildExit = 1;
      run.buildErrors = error.errors ?? String(error);
      throw new Error(`ENVIRONMENT: REAL_CANVAS_BUILD_FAILED ${JSON.stringify(run.buildErrors)}`);
    }
    const code = built.outputFiles[0]?.text;
    assert.ok(code, 'ENVIRONMENT: empty real canvas bundle');
    const bundlePath = join(evidenceDir, 'canvas-harness.js');
    await writeFile(bundlePath, code);
    run.bundleSha256 = sha(code);
    run.sourceDigests = await inputDigests(built.metafile);
    await writeFile(join(evidenceDir, 'build-metafile.json'), JSON.stringify(built.metafile, null, 2));
    const html = `<!doctype html><html lang="${locale}" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue 2848 controlled CanvasEditor</title><style>html,body,#root{height:100%;margin:0}</style></head><body${theme==='dark' ? ' data-ds-dark-theme="true"' : ''}><div id="root"></div><script src="/canvas-harness.js"></script></body></html>`;
    server = createServer((req, res) => {
      run.requests.push({ method: req.method, url: req.url });
      const path = new URL(req.url, 'http://127.0.0.1').pathname;
      res.setHeader('cache-control', 'no-store');
      res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self' data:; font-src 'self' data:");
      if (req.method === 'GET' && path === '/canvas-harness.js') {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); res.end(code);
      } else if (req.method === 'GET' && path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
      } else if (req.method === 'GET' && path === '/omnimux-workflow/api/templates') {
        // Fake transport for read-only startup only; no execution or persistence.
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"templates":[]}');
      } else {
        res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"error":"QA_TRANSPORT_NOT_AUTHORIZED"}');
      }
    });
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
    run.origin = `http://127.0.0.1:${server.address().port}`;
    const config = { runId, evidenceDir, spaceFile, origin: run.origin, bundlePath, cases, locale, theme, viewport, longBodyB, literals: literals[locale] };
    const ego = await runEgo(`const drive = ${browserJourney.toString()};\nawait drive(${JSON.stringify(config)});`, evidenceDir);
    run.egoExit = ego.exitCode;
    let report;
    try { report = JSON.parse(await readFile(join(evidenceDir, 'browser-report.json'), 'utf8')); }
    catch (error) { throw new Error(`ENVIRONMENT: EGO_BROWSER_REPORT_UNAVAILABLE exit=${ego.exitCode} ${ego.stderr} ${error.message}`); }
    run.spaceId = report.spaceId;
    run.sourceDigestsAtEnd = await inputDigests(built.metafile);
    run.sourcesUnchanged = JSON.stringify(run.sourceDigests) === JSON.stringify(run.sourceDigestsAtEnd);
    const { PNG } = require('pngjs');
    run.pngs = [];
    run.plusPixels = [];
    run.regressionCoverage = report.regressionCoverage;
    run.qaAcceptance = 'NOT_SIGNED';
    run.requestCapture = 'NOT_CLAIMED_UI_GRAPH_ONLY';
    run.unknowns = [...report.unknowns];
    for (const scene of report.scenes) for (const screenshot of scene.screenshots) {
      const bytes = await readFile(screenshot.path);
      const decoded = PNG.sync.read(bytes);
      assert.ok(decoded.width > 0 && decoded.height > 0, 'ENVIRONMENT: invalid screenshot dimensions');
      run.pngs.push({ ...screenshot, width: decoded.width, height: decoded.height, sha256: sha(bytes) });
      if (screenshot.plusMeasurement) {
        const pixels=plusPixelEvidence(decoded,screenshot.plusMeasurement);
        run.plusPixels.push({kind:scene.kind,stage:screenshot.stage,path:screenshot.path,...pixels});
        if(pixels.status==='UNKNOWN') run.unknowns.push(`${scene.kind}/${screenshot.stage}: actual nontext contrast UNKNOWN (${pixels.reason})`);
      }
    }
    await writeFile(join(evidenceDir,'plus-pixels.json'),JSON.stringify(run.plusPixels,null,2));
    assert.ok(report.identity && report.identity.bundleSha256 === run.bundleSha256 && report.identity.loadedScriptSha256 === run.bundleSha256, report.fatal ?? 'ENVIRONMENT: loaded CDP source identity missing');
    for (const item of cases) await t.test(`${item.kind}: ${item.modelId} ${item.operationId} common-entry journey`, () => {
      const candidate = run.catalogCandidates.find(c => c.kind === item.kind);
      assert.ok(candidate.listed && candidate.upstreamText.length && candidate.implementation?.status === 'ready', 'INTERFACE: production catalog lacks qualified upstream text');
      const scene = report.scenes.find(s => s.kind === item.kind);
      assert.ok(scene && scene.status === 'PASS_COMPONENT_JOURNEY_ONLY', scene?.error ?? report.fatal ?? 'ENVIRONMENT: scene not executed');
      assert.ok(scene.screenshots.length >= 6, 'all functional stages need real PNG evidence');
    });
    await t.test('approved regression seams and actual PNG Plus visibility',()=>{
      assert.ok(report.scenes.every(s=>s.regressions?.length>=2),'all four targets execute visual seams');
      assert.ok(report.scenes.every(s=>s.regressions.every(r=>r.status!=='FAILED')),JSON.stringify(report.scenes.flatMap(s=>s.regressions.filter(r=>r.status==='FAILED'))));
      assert.equal(run.plusPixels.length,12,'four empty targets each record rest/hover/focus PNG');
      assert.ok(run.plusPixels.every(p=>p.status==='OBSERVED_VISIBLE'),JSON.stringify(run.plusPixels));
    });
    // UNKNOWN remains explicit even when observed checks pass; runner exit is
    // not full V1 acceptance, request capture or PM sign-off.
    assert.equal(ego.exitCode, 0, 'browser command preserves original nonzero on RED');
    assert.equal(run.sourcesUnchanged, true, 'ENVIRONMENT: transitive source changed during evidence run');
  } catch (error) {
    run.error = String(error.stack ?? error);
    run.classification = /ENVIRONMENT:/.test(run.error) ? 'ENVIRONMENT_RED' : /INTERFACE:/.test(run.error) ? 'INTERFACE_RED' : 'FUNCTIONAL_RED';
    throw error;
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
      run.serverClosed = !server.listening;
    }
    run.finishedAt = new Date().toISOString();
    await writeFile(join(evidenceDir, 'run.json'), JSON.stringify(run, null, 2));
    await writeFile(join(scratch, 'latest-run.json'), JSON.stringify({ runId, evidenceDir, spaceId: run.spaceId, classification: run.classification, egoExit: run.egoExit }, null, 2));
    console.log(`V1_BROWSER_EVIDENCE=${evidenceDir}`);
  }
});
