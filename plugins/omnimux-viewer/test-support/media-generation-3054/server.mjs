import { build } from 'esbuild';
import http from 'node:http';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, '../../../..');
const require = createRequire(resolve(root, 'plugins/omnimux/package.json'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function png() {
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, checksum]);
  }
  const width = 480, height = 320;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    const mountain = y > 310 - Math.abs(x - 240) * .75;
    pixels[offset] = mountain ? 52 : 138; pixels[offset + 1] = mountain ? 92 : 184; pixels[offset + 2] = mountain ? 129 : 223;
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const promptInput = { slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 };
const referenceInput = { slot: 'reference_images', type: 'image', role: 'reference', min: 1, max: 2, maxSizeMb: 5, allowedMimes: ['image/png', 'image/jpeg'] };
const catalog = {
  image: [{ id: 'qa-image-3054', label: '离线图片验证', family: 'qa', channelGroups: [{ id: 'qa-channel', label: '离线通道', default: true }], operations: [
    { id: 'text_to_image', output: { type: 'image' }, inputs: [promptInput] },
    { id: 'multi_reference', output: { type: 'image' }, inputs: [promptInput, referenceInput] },
  ] }],
  video: [{ id: 'qa-video-3054', label: '离线视频验证', family: 'qa', channelGroups: [{ id: 'qa-channel', label: '离线通道', default: true }], operations: [
    { id: 'text_to_video', output: { type: 'video' }, inputs: [promptInput] },
  ] }],
};

/** Synthetic Hub responses; production viewer, persistence, runner and public file route remain real. */
export async function startFixture(evidenceDir) {
  await mkdir(evidenceDir, { recursive: true });
  const imagePath = resolve(evidenceDir, 'fixture-image.png');
  await writeFile(imagePath, png());
  const videoPath = resolve(root, 'plugins/omnimux/test-support/generation-feedback/fixture-video.mp4');
  const alias = {};
  for (const name of ['react', 'react-dom']) alias[name] = dirname(await realpath(require.resolve(`${name}/package.json`)));
  alias['dsh-ui-kit'] = await realpath(require.resolve('dsh-ui-kit'));
  const options = { absWorkingDir: root, bundle: true, write: false, metafile: true, loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.module.css': 'local-css' } };
  const built = await build({ ...options, alias, entryPoints: [resolve(here, 'fixture.jsx')], outdir: resolve(here, 'memory-output'), format: 'esm', platform: 'browser' });
  const routes = await build({ ...options, stdin: { contents: `export { createLocalFileRoutes } from './plugins/omnimux-workflow/src/workflow/routes/localFileRoutes.ts'; export { serveFile } from './plugins/omnimux-workflow/src/workflow/routes/serveFile.ts';`, resolveDir: root }, format: 'esm', platform: 'node', packages: 'external' });
  const { createLocalFileRoutes, serveFile } = await import(`data:text/javascript;base64,${Buffer.from(routes.outputFiles[0].contents).toString('base64')}`);
  const localFiles = createLocalFileRoutes();
  const sourceHashes = {};
  for (const path of [...Object.keys(built.metafile.inputs), ...Object.keys(routes.metafile.inputs)].filter((path) => path !== '<stdin>')) sourceHashes[path] = hash(await readFile(resolve(root, path)));
  sourceHashes['plugins/omnimux/test-support/generation-feedback/fixture-video.mp4'] = hash(await readFile(videoPath));
  for (const name of ['server.mjs', 'browser.mjs', 'journey.mjs']) {
    const path = `plugins/omnimux-viewer/test-support/media-generation-3054/${name}`;
    sourceHashes[path] = hash(await readFile(resolve(root, path)));
  }
  const bundle = built.outputFiles.find((file) => file.path.endsWith('.js')).contents;
  const css = built.outputFiles.find((file) => file.path.endsWith('.css'))?.text || '';
  const html = `<!doctype html><html data-theme="light"><meta charset="utf-8"><title>3054 媒体生成隔离验证</title><style>${css}</style><style>
  :root{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f7f7f8;--dsw-alias-bg-layer-2:#f0f1f3;--dsw-alias-bg-elevated:#fff;--dsw-alias-label-primary:#111827;--dsw-alias-label-secondary:#4b5563;--dsw-alias-label-tertiary:#667085;--dsw-alias-border-l1:#ddd;--dsw-alias-border-l2:#ccc;--dsw-alias-state-error-primary:#dc2626}
  *{box-sizing:border-box}body{margin:0;font:14px system-ui}#root{height:100vh;width:100vw}</style><div id="root"></div>
  <script>window.qaBoot={errors:[],mounted:false};window.onerror=(message,source,line,column,error)=>window.qaBoot.errors.push({message:String(message),stack:error?.stack||''});window.onunhandledrejection=e=>window.qaBoot.errors.push({message:String(e.reason),stack:e.reason?.stack||''});</script><script type="module" src="/fixture.js"></script></html>`;
  let scenario = 'image-retry';
  let allowRefresh = false;
  const requests = [], byteRequests = [], tasks = new Map();
  const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const server = http.createServer({ maxHeaderSize: 65536 }, async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      res.setHeader('cache-control', 'no-store');
      if (url.pathname === '/') { res.setHeader('content-type', 'text/html;charset=utf-8'); res.end(html); return; }
      if (url.pathname === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); return; }
      if (url.pathname === '/omnimux/model-catalog') { json(res, 200, catalog); return; }
      if (url.pathname === '/qa/state') { json(res, 200, { scenario, requests, byteRequests, tasks: [...tasks.values()].map(({ held, ...task }) => task) }); return; }
      if (url.pathname === '/qa/control') {
        scenario = url.searchParams.get('scenario') || scenario;
        if (url.searchParams.get('release') === '1') {
          allowRefresh = true;
          for (const task of tasks.values()) for (const held of task.held || []) if (!held.destroyed) json(held, 200, { ok: true, mode: 'live', taskRef: task.taskRef, url: imagePath, dest: imagePath });
        }
        json(res, 200, { ok: true }); return;
      }
      if (url.pathname === '/omnimux/assets/state') { json(res, 200, { assets: [{ id: 'local-broken-3054', name: '读取失败参考图', type: 'image', cover: { id: 'cover' } }] }); return; }
      if (url.pathname === '/omnimux/assets/library/preview') { json(res, 503, { error: 'synthetic local asset read failure' }); return; }
      if (url.pathname === '/omnimux/api/media/generate' && req.method === 'POST') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const receipt = { index: requests.length + 1, scenario, body, at: new Date().toISOString() };
        requests.push(receipt);
        if (!body.wait) {
          const taskRef = `mtask_qa3054_${tasks.size + 1}`;
          tasks.set(taskRef, { taskRef, request: body, scenario, collectCount: 0, held: [] });
          receipt.response = { status: 200, mode: 'submitted', taskRef };
          json(res, 200, { ok: true, mode: 'submitted', taskRef }); return;
        }
        const task = tasks.get(body.taskRef);
        if (!task) { json(res, 404, { code: 'not-found', recoverable: false }); return; }
        task.collectCount++;
        if (task.scenario === 'image-retry' && task.collectCount === 1) {
          receipt.response = { status: 503, code: 'omnimux-collect-transient', recoverable: true, taskRef: task.taskRef };
          json(res, 503, { ok: false, code: 'omnimux-collect-transient', error: '收取暂时中断，请重试', recoverable: true, retryable: false, taskRef: task.taskRef }); return;
        }
        if (task.scenario === 'image-refresh' && !allowRefresh) { task.held.push(res); return; }
        if (task.scenario === 'image-refresh-backoff' && !allowRefresh) {
          receipt.response = { status: 200, mode: 'submitted', taskRef: task.taskRef };
          json(res, 200, { ok: true, mode: 'submitted', taskRef: task.taskRef }); return;
        }
        const cachePath = task.request.kind === 'video' ? videoPath : imagePath;
        receipt.response = { status: 200, mode: 'live', taskRef: task.taskRef, cachePath };
        json(res, 200, { ok: true, mode: 'live', taskRef: task.taskRef, url: cachePath, dest: cachePath }); return;
      }
      if (url.pathname === '/omnimux-workflow/api/local-file') {
        const target = url.searchParams.get('path');
        if (![imagePath, videoPath].includes(target)) { json(res, 403, { error: 'fixture path refused' }); return; }
        const result = await localFiles.tryHandle(req.method, url.pathname, { url: req.url, origin: req.headers.origin, referer: req.headers.referer, host: req.headers.host, secFetchSite: req.headers['sec-fetch-site'] });
        byteRequests.push({ path: target, range: req.headers.range || null, status: result?.status });
        if (result?.file) serveFile(res, result.file, 'application/octet-stream', req.headers.range);
        else json(res, result?.status || 404, result?.body || {});
        return;
      }
      json(res, 404, { error: 'fixture route not found', path: url.pathname });
    } catch (error) { json(res, 500, { error: String(error) }); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const manifest = { root, pid: process.pid, url: `http://127.0.0.1:${server.address().port}/`, aliases: alias, sourceHashes, bundleSha256: hash(bundle), startedAt: new Date().toISOString(), imagePath, videoPath };
  return { manifest, async close() {
    server.closeAllConnections();
    await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
    const changedSources = [];
    for (const [path, digest] of Object.entries(sourceHashes)) if (hash(await readFile(resolve(root, path))) !== digest) changedSources.push(path);
    return { closed: true, changedSources, requests, byteRequests };
  } };
}
