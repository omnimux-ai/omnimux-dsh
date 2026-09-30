import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { PNG } from 'pngjs';
import { buildModelCatalog } from '../../plugins/omnimux/src/catalog/list.js';

/** Offline transport fixture; annotation, submission and rendering use production components. */
export async function startCommentEditFixture(root) {
  assert.equal(path.basename(path.dirname(root)), '.worktrees', 'Require isolated task worktree');
  const dir = await fs.mkdtemp(path.join(root, '.tmp/comment-edit-browser-'));
  const sourceFiles = ['plugins/omnimux/src/catalog/project.js', ...['MediaViewerTab.jsx', 'MediaViewerComposer.jsx', 'MediaViewerComposerData.js', 'MediaConfigControls.jsx', 'media-slot.js', 'media-viewer-store.js', 'styles.js'].map((name) => `plugins/omnimux/src/client/media-viewer/${name}`)];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex')])));
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{MediaViewerTab}from'../../plugins/omnimux/src/client/media-viewer/MediaViewerTab.jsx';import{getGlobalMediaViewerStore}from'../../plugins/omnimux/src/client/media-viewer/media-viewer-store.js';import{bindWorkbenchDeps}from'../../plugins/omnimux/src/client/workbench/host-adapter.js';const sessions={list:{subscribe:()=>()=>{},getSnapshot:()=>({current:'comment-edit-2847'})}};bindWorkbenchDeps({sessions});getGlobalMediaViewerStore().addMedia({id:'original-2847',url:'/original.png',title:'测试原图（模拟素材）',type:'image',status:'completed',sessionId:'comment-edit-2847',aspectRatio:'1:1'});window.addEventListener('omnimux:toast',e=>{document.getElementById('notice').textContent=e.detail.message});createRoot(document.getElementById('app')).render(React.createElement(MediaViewerTab,{sessions}));`;
  await fs.writeFile(path.join(dir, 'entry.jsx'), entry);
  await build({ entryPoints: [path.join(dir, 'entry.jsx')], outfile: path.join(dir, 'bundle.js'), bundle: true, format: 'iife', platform: 'browser', nodePaths: [path.join(root, 'node_modules')], loader: { '.js': 'jsx', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' } });
  const bundle = await fs.readFile(path.join(dir, 'bundle.js'));
  const identity = { root, head: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['-C', root, 'status', '--short'], { encoding: 'utf8' }), sourceHashes, bundleHash: createHash('sha256').update(bundle).digest('hex'), mode: 'offline-simulated', pid: process.pid };
  const catalog = buildModelCatalog();
  const catalogResponse = { ...catalog, image: catalog.image.filter((model) => model.id === 'gpt-image-2.5') };
  assert.equal(catalogResponse.image.length, 1);
  function image(edited) {
    const png = new PNG({ width: 640, height: 640 });
    for (let y = 0; y < 640; y++) for (let x = 0; x < 640; x++) {
      const color = x > 200 && x < 440 && y > 110 && y < 550 ? [155, 163, 175] : edited ? [38, 92 + Math.round(y / 20), 115] : [197, 181, 152];
      png.data.set([...color, 255], (y * 640 + x) * 4);
    }
    return PNG.sync.write(png);
  }
  const original = image(false), result = image(true), requests = [];
  assert.equal(PNG.sync.read(original).width, 640);
  assert.notDeepEqual(original, result);
  let failNext = false;
  const html = `<!doctype html><html data-theme="dark"><meta charset="UTF-8"><title>评论改图隔离验证（模拟响应）</title><style>:root{--dsw-alias-bg-base:#111113;--dsw-alias-bg-primary:#141416;--dsw-alias-bg-layer-1:#222225;--dsw-alias-bg-layer-2:#29292d;--dsw-alias-bg-elevated:#27272a;--dsw-alias-label-primary:#f4f4f5;--dsw-alias-label-secondary:#c4c4ca;--dsw-alias-label-tertiary:#94949c;--dsw-alias-border-l2:#45454b;--dsw-alias-border-l1:#303036;--dsw-alias-interactive-bg-hover:#35353b;--dsw-alias-state-error-primary:#f87171}*{box-sizing:border-box}body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:Arial,sans-serif}header{height:44px;padding:12px 20px;font-size:14px;border-bottom:1px solid var(--dsw-alias-border-l2)}#app{height:calc(100vh - 44px);width:100%}#notice{position:fixed;top:8px;right:20px;z-index:100000;color:var(--dsw-alias-state-error-primary)}</style><header>评论改图隔离验证 · 原图和生成结果均为模拟素材</header><div id="notice"></div><div id="app"></div><script src="/bundle.js"></script></html>`;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.host !== new URL(identity.url).host || (req.headers.origin && req.headers.origin !== identity.url)) return json({ error: 'origin-denied' }, 403);
    if (req.method === 'POST' && url.pathname === '/omnimux/api/media/generate') {
      let text = '';
      for await (const chunk of req) { text += chunk; if (text.length > 100_000) return json({ error: 'too-large' }, 413); }
      try { requests.push(JSON.parse(text)); } catch { return json({ error: 'invalid-json' }, 400); }
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (failNext) { failNext = false; return json({ ok: false, error: '测试失败原因：参考图片不可读取' }, 500); }
      return json({ ok: true, mode: 'mock', taskId: `simulated-${requests.length}`, url: '/result.png', kind: 'image' });
    }
    if (url.pathname === '/evidence') return json({ identity, requests });
    if (url.pathname === '/fail-next') { failNext = true; return json({ armed: true }); }
    if (url.pathname === '/omnimux/model-catalog') return json(catalogResponse);
    if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'" }); return res.end(html); }
    if (url.pathname === '/bundle.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end(bundle); }
    if (url.pathname === '/original.png' || url.pathname === '/result.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(url.pathname === '/original.png' ? original : result); }
    json({ error: 'not-found' }, 404);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  identity.url = `http://127.0.0.1:${server.address().port}`;
  return { identity, async cleanup() { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await fs.rm(dir, { recursive: true, force: true }); } };
}
