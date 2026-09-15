import { build } from 'esbuild';
import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, '../../../..');
const require = createRequire(resolve(root, 'plugins/omnimux/package.json'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function startFixture() {
  // Resolve one physical React instance for both the viewer and UI kit.
  const alias = {};
  for (const name of ['react', 'react-dom']) alias[name] = dirname(await realpath(require.resolve(`${name}/package.json`)));
  alias['dsh-ui-kit'] = await realpath(require.resolve('dsh-ui-kit'));
  const built = await build({ absWorkingDir: root, entryPoints: [resolve(here, 'generation-feedback-fixture.jsx')],
    bundle: true, alias, write: false, outdir: resolve(here, 'memory-output'), format: 'esm', platform: 'browser',
    metafile: true, loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.module.css': 'local-css' } });
  const sourceHashes = {};
  for (const path of Object.keys(built.metafile.inputs)) sourceHashes[path] = hash(await readFile(resolve(root, path)));
  const bundle = built.outputFiles.find((file) => file.path.endsWith('.js')).contents;
  const css = built.outputFiles.find((file) => file.path.endsWith('.css'))?.text || '';
  const html = `<!doctype html><html data-theme="light"><meta charset="utf-8"><title>1759 离线画布验证</title>
    <style>${css}</style><style>
    :root{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f7f7f8;--dsw-alias-bg-layer-2:#f0f1f3;--dsw-alias-bg-elevated:#fff;--dsw-alias-label-primary:#111827;--dsw-alias-label-secondary:#4b5563;--dsw-alias-label-tertiary:#667085;--dsw-alias-border-l1:#ddd;--dsw-alias-border-l2:#ccc;--dsw-alias-state-error-primary:#dc2626}
    *{box-sizing:border-box}body{margin:0;font:14px system-ui}#root{display:flex;height:100vh}
    aside{width:240px;padding:16px;border-right:1px solid var(--dsw-alias-border-l1);flex-shrink:0}
    aside button{display:block;margin:8px 0;height:32px}main{flex:1;min-width:0;height:100vh}</style>
    <div id="root"></div><script>window.qaBoot={errors:[],mounted:false};
    window.onerror = (message, source, lineno, colno, error) => { window.qaBoot.errors.push({message: String(message), stack: error?.stack||''}); };
    window.onunhandledrejection = (e) => { window.qaBoot.errors.push({message: String(e.reason), stack: e.reason?.stack||''}); };
    </script><script type="module" src="/fixture.js"></script></html>`;
  const videoPath = 'plugins/omnimux/test-support/generation-feedback/fixture-video.mp4';
  const video = await readFile(resolve(root, videoPath));
  sourceHashes[videoPath] = hash(video);
  const videoResponse = JSON.stringify({ ok: true, value: { offset: 0, eof: true, bytes: video.length, data: video.toString('base64') } });
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.setHeader('content-type', 'text/html;charset=utf-8'); res.end(html); }
    else if (path === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); }
    else if (path === '/fixture-video-result.json') { res.setHeader('content-type', 'application/json'); res.end(videoResponse); }
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const manifest = { root, pid: process.pid, url: `http://127.0.0.1:${server.address().port}/`,
    sourceHashes, bundleSha256: hash(bundle), startedAt: new Date().toISOString() };
  return { manifest, async close() {
    server.closeAllConnections();
    await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
    const changedSources = [];
    for (const [path, digest] of Object.entries(sourceHashes)) {
      if (hash(await readFile(resolve(root, path))) !== digest) changedSources.push(path);
    }
    return { closed: true, changedSources };
  } };
}
