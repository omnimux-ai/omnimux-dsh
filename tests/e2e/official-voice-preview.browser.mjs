/**
 * tests/e2e/official-voice-preview.browser.mjs — Issue #3058 官方音色试听真实浏览器 QA 入口。
 *
 * 证明等级（qa-plan.md 选定路径）：REAL_COMPONENT + REAL_CATALOG +
 * REAL_ASSETS_HTTP + REAL_OFFICIAL_MEDIA。
 *   - 资产侧：生产 AssetsStage（真实 React 18 / locales / injectAssetsStyles），
 *     界面路径 公共 → 声音 → 配音，真实播放键驱动 useCloudAudition。
 *   - 画布侧：生产 CanvasEditor（真实 React 19），catalog 由本树
 *     buildModelCatalog({env:{}}) 输出经 readCanvasCatalog 投影；
 *     预置一个 audio 生成节点后由真实 wf-voice-trigger 打开 VoicePickerDialog。
 *   - transport：生产 createCloudCatalog（包内真实生成目录）+
 *     createAssetsDispatcher，listen 127.0.0.1:0；非页面与 /omnimux/assets
 *     前缀一律 409 拒绝并记账；save 等写路径真实送达 dispatcher（preview-only
 *     由生产路由拒绝，本身即边界断言材料）。
 *   - 媒体：正向仅放行 catalog index 中 verified 音色 preview URL 的 origin
 *     （CSP media-src 动态生成），匿名直读官方 MP3，不下载另存。
 *   - Audio 观察：bundle 前注入只观察包装（记录 src/play/pause/error/ended/
 *     timeupdate/currentTime/实例计数），返回原生 HTMLAudioElement，不改语义。
 *   - 主题：官方 @deepseek-ai/dsh-client-ui-theme 既有产物 lib/client.js 内嵌
 *     STYLES 工作表按官方 installThemeStyles 清单原样物化为 /official-theme.css
 *     （逐字节官方文本，零手写颜色）；选择器走官方 boot-theme 公开契约
 *     document.documentElement.dataset.dsThemeSource + body[data-ds-dark-theme]
 *     （bootThemeBodyScript 逐字移植，preference 仅读 QA_3058_THEME 环境
 *     覆盖、缺省 system），绝不写 data-theme 假属性、绝不自造 token 值；
 *     页面旅程以 assert.equal 实读 computed token 与官方属性契约为准。
 *
 * 执行门禁：需要 QA_3058_SOURCE_FROZEN=1（主理人冻结 diff 后授权运行）与既有
 * ego-browser task space（QA_3058_SPACE_ID 或 space.json）；否则 ENVIRONMENT
 * 拒绝，绝不静默降级为模拟。本文件不启动共享 Dev/Prod、不改 profile、不重启、
 * 不生成、不并行多个浏览器任务（全部旅程在同一 space 的 p1 顺序导航）。
 *
 * 运行：node --test tests/e2e/official-voice-preview.browser.mjs
 * 证据：.tmp/shared-official-voice-preview-qa/<runId>/（metafile、bundle SHA、
 * run.json、browser-report.json、截图、请求账本、Audio 事件账本）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..'); // 任务工作树根（<repo>/.worktrees/<task>）
const assetsPlugin = join(root, 'plugins/omnimux-assets');
const workflowPlugin = join(root, 'plugins/omnimux-workflow');
const hubPlugin = join(root, 'plugins/omnimux');
const scratch = join(root, '.tmp/shared-official-voice-preview-qa');
const spaceFile = join(scratch, 'space.json');
const require = createRequire(join(workflowPlugin, 'package.json'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * 官方主题产物定位：优先本树 node_modules 公开产物；缺失时仅接受
 * QA_3058_THEME_BUNDLE_FILE 显式指定的规范绝对文件路径。
 * 不提供开发机默认路径，不修改官方产物或宿主配置。
 */
function themeBundlePath() {
  const { statSync } = require('node:fs');
  const installed = join(root, 'node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js');
  try {
    if (statSync(installed).isFile()) return installed;
  } catch (error) {
    assert.equal(error.code === 'ENOENT' || error.code === 'ENOTDIR', true,
      `ENVIRONMENT: cannot inspect installed official theme artifact: ${error.message}`);
  }
  const explicit = process.env.QA_3058_THEME_BUNDLE_FILE;
  assert.equal(typeof explicit === 'string' && explicit.length > 0, true,
    'ENVIRONMENT: official theme artifact not installed; QA_3058_THEME_BUNDLE_FILE must explicitly name an absolute real file');
  assert.equal(resolve(explicit), explicit,
    'ENVIRONMENT: QA_3058_THEME_BUNDLE_FILE must be a normalized absolute path');
  assert.equal(statSync(explicit).isFile(), true,
    `ENVIRONMENT: QA_3058_THEME_BUNDLE_FILE is not a real file: ${explicit}`);
  return explicit;
}

/** 官方 installThemeStyles STYLES 清单内的工作表名（同源顺序）。 */
const THEME_SHEET_NAMES = ['base.css', 'corner-shape.css', 'design-platform.css', 'focus.css',
  'onboarding.css', 'scrollbar.css', 'gradient-shadow-text.css', 'shiki.css'];
assert.equal(THEME_SHEET_NAMES.length, 8, 'INTERFACE: official theme ships exactly 8 sheets');

/**
 * 从官方既有物化产物（ui-theme lib/client.js）逐字节提取 STYLES 工作表。
 * 结构与官方打包器输出绑定：var <name> = "<escaped css>"; const STYLES =
 * [["sheet.css", <name>], …]。解析失败即 ENVIRONMENT 失败，绝不降级为
 * 手写 token——本 runner 无权自造主题颜色。
 */
async function readOfficialThemeCss() {
  const bundleFile = themeBundlePath();
  const text = await readFile(bundleFile, 'utf8');
  const stylesAnchor = text.indexOf('const STYLES');
  assert.notEqual(stylesAnchor, -1, `ENVIRONMENT: ${bundleFile} has no official STYLES table`);
  const pairs = [...text.slice(stylesAnchor).matchAll(/\[\s*["']([a-z0-9-]+\.css)["']\s*,\s*([A-Za-z_$][\w$]*)\s*\]/g)]
    .map((m) => [m[1], m[2]]);
  const sheets = [];
  for (const [name, ident] of pairs) {
    if (!THEME_SHEET_NAMES.includes(name)) continue; // 只取官方清单内的工作表
    const decl = text.match(new RegExp(`var\\s+${ident}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)";`));
    assert.ok(decl, `ENVIRONMENT: theme sheet ${name} (${ident}) not found as a literal in ${bundleFile}`);
    // 只解析官方产物中的字符串字面量转义，不执行任意代码。
    const css = Function(`"use strict";return ("${decl[1]}");`)();
    assert.equal(typeof css === 'string' && css.length > 0, true,
      `ENVIRONMENT: theme sheet ${name} extracted empty`);
    sheets.push(`/* @deepseek-ai/dsh-client-ui-theme ${name} */\n${css}`);
  }
  assert.equal(sheets.length, THEME_SHEET_NAMES.length,
    `ENVIRONMENT: expected ${THEME_SHEET_NAMES.length} official theme sheets, extracted ${sheets.length}`);
  const css = sheets.join('\n');
  // 官方公开契约存在性断言（不校验颜色值本身，值全部来自官方产物）。
  for (const marker of ['body[data-ds-dark-theme]', '--dsw-alias-bg-base', '--dsw-alias-label-primary']) {
    assert.equal(css.includes(marker), true,
      `ENVIRONMENT: official theme css must contain ${marker}`);
  }
  return css;
}

/**
 * 官方 boot-theme.ts bootThemeBodyScript 逐字移植（公开契约）：
 * html[data-ds-theme-source] 记 preference，body[data-ds-dark-theme] 记
 * 有效暗色态，--dsh-content-font-size 记正文字号。preference 只允许
 * 官方枚举 light/dark/system；QA 覆盖仅经 QA_3058_THEME 环境变量。
 */
const THEME_PREFERENCE_ENUM = ['light', 'dark', 'system'];
function resolveThemePreference() {
  const pref = process.env.QA_3058_THEME ?? 'system';
  assert.equal(THEME_PREFERENCE_ENUM.includes(pref), true,
    `ENVIRONMENT: QA_3058_THEME must be one of ${THEME_PREFERENCE_ENUM.join('/')}, got ${pref}`);
  return pref;
}
const THEME_CONTENT_FONT_SIZE_PX = 13;
function themeBootScript(preference, fontSize = THEME_CONTENT_FONT_SIZE_PX) {
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  const systemDark = preference === 'system'
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || systemDark
  document.documentElement.dataset.dsThemeSource = preference
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  document.body.style.setProperty('--dsh-content-font-size', ${JSON.stringify(`${fontSize}px`)})
})()`;
}
/** 正向代表音色（对照 initial-candidate-audit exact identity，不猜补）。 */
const VOICES = [
  { voiceType: 'zh_female_linxiao_uranus_bigtts', name: '林潇 2.0', expect: 'verified' },
  { voiceType: 'zh_male_qingyiyuxuan_mars_bigtts', name: '阳光阿辰', expect: 'verified' },
  { voiceType: 'ICL_uranus_en_female_charlie_tob', name: 'Charlie 2.0', expect: 'verified' },
];
assert.equal(VOICES.length, 3, 'INTERFACE: exactly three verified representative voices required');

/** 未验证代表音色：名录在册、可选、但绝不渲染可播键。 */
const UNVERIFIED_VOICES = [
  { voiceType: 'ICL_uranus_zh_female_zhixingwenwan_tob', name: '知性温婉 2.0', expect: 'unverified' },
  { voiceType: 'en_male_jamie_uranus_bigtts', name: 'Jamie', expect: 'unverified' },
  { voiceType: 'mx_female_bv166emotion_uranus_bigtts', name: 'Rosa', expect: 'unverified' },
];
assert.equal(UNVERIFIED_VOICES.length, 3, 'INTERFACE: exactly three unverified representative voices required');

/**
 * 只观察 Audio 包装 + 原生实例 registry：注入于生产 bundle 之前。
 * PM 接缝 O2–O4：registry 保存每个真实元素的实引用（含脱离 DOM、清 ref
 * 后的实例），状态读取只经只读 getter 直取 native paused/currentTime/src，
 * 观察器绝不写任何 native 属性。事件账本仅作辅证诊断，不作通过条件。
 */
const AUDIO_OBSERVER_SNIPPET = `
(() => {
  const NativeAudio = window.Audio;
  const elements = new Map();
  const ledger = { instances: 0, events: [] };
  function rec(el, kind, detail) {
    ledger.events.push({ id: el.__qa3058id, kind, src: el.currentSrc || el.src || '', detail, t: Date.now() });
  }
  // 观察器监听只增不减；应用清空 onended/onerror 不影响 addEventListener。
  function registerElement(el) {
    if (!el || el.__qa3058id || elements.has(el)) return;
    const id = ++ledger.instances;
    elements.set(el, id);
    Object.defineProperty(el, '__qa3058id', { value: id, configurable: true });
    for (const type of ['play', 'playing', 'pause', 'error', 'ended', 'timeupdate']) {
      el.addEventListener(type, () => rec(el, type, { paused: el.paused, currentTime: el.currentTime }));
    }
    const nativePlay = el.play.bind(el);
    el.play = () => { rec(el, 'play()'); return nativePlay().then((v) => { rec(el, 'play:fulfilled'); return v; }, (e) => { rec(el, 'play:rejected', String(e && e.name)); throw e; }); };
    const nativePause = el.pause.bind(el);
    el.pause = () => { rec(el, 'pause()'); return nativePause(); };
  }
  // O4：详情页等经 document.createElement('audio') 或原型 play 的实例同样
  // 入册；观察器只是注册钩子，不改 HTMLMediaElement.prototype 语义。
  const nativeProtoPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this instanceof HTMLAudioElement) registerElement(this);
    return nativeProtoPlay.apply(this, arguments);
  };
  function registerDomAudios(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'AUDIO') registerElement(node);
    for (const el of node.querySelectorAll ? node.querySelectorAll('audio') : []) registerElement(el);
  }
  for (const el of document.querySelectorAll('audio')) registerElement(el);
  new MutationObserver((mutations) => {
    for (const m of mutations) for (const node of m.addedNodes) registerDomAudios(node);
  }).observe(document.documentElement || document, { childList: true, subtree: true });
  function ObservedAudio(src) {
    const el = new NativeAudio(src);
    registerElement(el);
    return el;
  }
  ledger.registry = () => {
    const out = [];
    for (const el of elements.keys()) {
      out.push({ id: el.__qa3058id, paused: el.paused, currentTime: el.currentTime,
        src: el.currentSrc || el.src || '', ended: el.ended, connected: el.isConnected });
    }
    return out;
  };
  // N1 测试范围故障注入的唯一元素入口；正向只读路径不调用它。
  ledger.element = (id) => {
    for (const el of elements.keys()) { if (el.__qa3058id === id) return el; }
    return null;
  };
  window.__qa3058Audio = ledger;
  window.Audio = ObservedAudio;
})();
`;
assert.equal(AUDIO_OBSERVER_SNIPPET.includes('ledger.registry'), true,
  'INTERFACE: audio observer must expose a real native element registry');
assert.equal(AUDIO_OBSERVER_SNIPPET.includes('ledger.element'), true,
  'INTERFACE: audio observer must expose the N1 fault-injection element entry');
assert.equal(AUDIO_OBSERVER_SNIPPET.includes('el.paused') && AUDIO_OBSERVER_SNIPPET.includes('el.currentTime'), true,
  'INTERFACE: observer must read native paused/currentTime directly');

/**
 * 资产页 entry：生产 AssetsStage + 真实 zh locales；'local' 是既有合法
 * runtime override，使 metadata 走本任务 dispatcher 的 /omnimux/assets 前缀。
 */
function assetsEntrySource() {
  return `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AssetsStage } from '${join(assetsPlugin, 'src/client/AssetsStage.jsx').replaceAll('\\', '/')}';
import { zh } from '${join(assetsPlugin, 'src/client/locales.js').replaceAll('\\', '/')}';
globalThis.__OMNIMUX_CLOUD_ASSETS_BASE_URL__ = 'local';
const t = (key) => zh[key] ?? key;
createRoot(document.getElementById('root')).render(React.createElement(AssetsStage, { t, visible: true }));
`;
}

/**
 * 画布页 entry：生产 CanvasEditor + 真实 buildModelCatalog 投影。
 * 预置一个 audio 生成节点（seed-audio-1.0/text_to_speech）作为宿主基线；
 * 音色弹窗经真实 wf-voice-trigger 打开，试听不改变 params。
 */
function canvasEntrySource(catalog) {
  return `
import React from 'react';
import { createRoot } from 'react-dom/client';
import CanvasEditor from '${join(workflowPlugin, 'src/canvas/editor/CanvasEditor').replaceAll('\\', '/')}';
import { injectCanvasStyles } from '${join(workflowPlugin, 'src/canvas/injectStyles').replaceAll('\\', '/')}';
import { useCanvasStore } from '${join(workflowPlugin, 'src/canvas/store/canvasStore').replaceAll('\\', '/')}';
import { setLocale } from '${join(workflowPlugin, 'src/canvas/i18n').replaceAll('\\', '/')}';
import { createMaterialNode } from '${join(workflowPlugin, 'src/shared/graph/nodeFactory').replaceAll('\\', '/')}';
import { readCanvasCatalog } from '${join(workflowPlugin, 'src/workflow/seam/canvasCatalog').replaceAll('\\', '/')}';
const raw = ${JSON.stringify(catalog)};
const catalog = readCanvasCatalog((name) => (name === 'modelCatalog' ? { list: () => raw } : undefined));
setLocale('zh');
injectCanvasStyles();
const node = createMaterialNode('audio', { x: 120, y: 80 }, {
  status: 'empty',
  params: { model: 'seed-audio-1.0', operation: 'text_to_speech', prompt: 'QA 试听样例' },
});
useCanvasStore.getState().setCatalogRuntime(catalog);
useCanvasStore.getState().hydrateGraph([node], []);
Object.defineProperty(window, '__qa3058', {
  value: Object.freeze({
    params: () => JSON.parse(JSON.stringify(useCanvasStore.getState().nodes.map((n) => ({ id: n.id, params: n.data.params })))),
  }),
  writable: false,
});
createRoot(document.getElementById('root')).render(
  React.createElement('div', { className: 'wf-canvas-root' },
    React.createElement('main', { className: 'wf-canvas-main' },
      React.createElement(CanvasEditor, { catalog }))));
`;
}

async function buildBundle({ absWorkingDir, contents, resolveDir, nodeModulesDir, outdir, outName }) {
  const esbuild = createRequire(join(absWorkingDir, 'package.json'))('esbuild');
  const { stat } = await import('node:fs/promises');
  const stdinResolveDir = dirname(resolveDir);
  assert.equal((await stat(stdinResolveDir)).isDirectory(), true,
    'ENVIRONMENT: esbuild stdin resolveDir must be the real containing directory');
  assert.equal(typeof outdir === 'string' && outdir.length > 0, true,
    'ENVIRONMENT: esbuild requires a real outdir so *.module.css artifacts get an output path');
  const pluginRequire = createRequire(join(absWorkingDir, 'package.json'));
  const built = await esbuild.build({
    absWorkingDir,
    stdin: { contents, resolveDir: stdinResolveDir, loader: resolveDir.endsWith('.jsx') ? 'jsx' : 'tsx' },
    bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser',
    target: 'es2020', jsx: 'automatic', outdir,
    nodePaths: [nodeModulesDir, join(root, 'node_modules/.pnpm/node_modules'), join(root, 'node_modules')],
    alias: {
      react: join(nodeModulesDir, 'react'),
      'react-dom': join(nodeModulesDir, 'react-dom'),
      'react/jsx-runtime': join(nodeModulesDir, 'react/jsx-runtime.js'),
      'react/jsx-dev-runtime': join(nodeModulesDir, 'react/jsx-dev-runtime.js'),
      // 同一份真实官方 primitives（含 *.module.css），防止 kit/组件各自
      // 解析出第二份依赖副本；react 系 alias 防双 React。
      '@deepseek-ai/dsh-client-ui-primitives':
        pluginRequire.resolve('@deepseek-ai/dsh-client-ui-primitives'),
    },
    // 普通 .css 保留 text loader：生产 injectStyles/injectAssetsStyles 按字符串
    // 契约运行时注入（非 stub/ignore/empty）。*.module.css 不受此 override，
    // 由 esbuild CSS-module 管线产出真实 .css 产物（需要上面的 outdir）。
    loader: { '.css': 'text', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    legalComments: 'none', logLevel: 'silent',
  });
  // 真实产物分离：JS 与 CSS 分别从 outputFiles 提取，禁止只用 [0] 猜顺序。
  const outputs = [...(built.outputFiles ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  const jsOutputs = outputs.filter((f) => f.path.endsWith('.js'));
  const cssOutputs = outputs.filter((f) => f.path.endsWith('.css'));
  assert.equal(jsOutputs.length, 1,
    `ENVIRONMENT: ${outName} must emit exactly one JS bundle, got ${jsOutputs.length}`);
  const code = jsOutputs[0]?.text;
  assert.ok(code, `ENVIRONMENT: empty bundle ${outName}`);
  const cssInputs = Object.keys(built.metafile?.inputs ?? {}).filter((p) => p.endsWith('.css'));
  const moduleCssInputs = cssInputs.filter((p) => p.endsWith('.module.css'));
  if (moduleCssInputs.length > 0) {
    assert.ok(cssOutputs.length > 0,
      `ENVIRONMENT: ${outName} imports ${moduleCssInputs.length} css modules but emitted no css artifact`);
  }
  assert.ok(cssOutputs.every((f) => typeof f.text === 'string' && f.text.trim().length > 0),
    `ENVIRONMENT: ${outName} emitted an empty css artifact`);
  const css = cssOutputs.length > 0 ? cssOutputs.map((f) => f.text).join('\n') : null;
  return { code, css, cssInputs, metafile: built.metafile, name: outName };
}

/** 生产 dispatcher 装配：真实 catalog 目录 + 本任务 .tmp 空库，无任何 mock。 */
async function createProductionDispatcher(libraryDir) {
  const { createCloudCatalog } = await import(join(assetsPlugin, 'src/cloud-catalog.js'));
  const { createAssetsDispatcher } = await import(join(assetsPlugin, 'src/http-routes.js'));
  const { createMappingStore } = await import(join(assetsPlugin, 'src/mappings.js'));
  const { createArtifactStore } = await import(join(assetsPlugin, 'src/artifacts.js'));
  const { createLibraryStore } = await import(join(assetsPlugin, 'src/library.js'));
  const mappings = createMappingStore({ paths: { mappingsFile: join(libraryDir, 'mappings.json'), scansDir: join(libraryDir, 'scans') } });
  const artifacts = createArtifactStore({ paths: { artifactsFile: join(libraryDir, 'artifacts.json'), artifactsDir: join(libraryDir, 'artifacts') } });
  const library = createLibraryStore({ paths: { libraryFile: join(libraryDir, 'library.json') } });
  const cloud = createCloudCatalog({ library });
  return { dispatcher: createAssetsDispatcher({ mappings, artifacts, library, cloud }), cloud, library };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return undefined; }
}

function header(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 受控 transport：/omnimux/assets 前缀交生产 dispatcher（与 registerAssetsRoutes
 * 同源行为：redirect → 302 Location、stream → 文件流、其余 JSON）；页面与
 * bundle 静态服务；其他一切 409 记账拒绝。CSP media-src 仅放行 catalog index
 * 里 verified voiceover preview URL 的 origin。inline Audio 观察脚本不开
 * 'unsafe-inline'，按精确 SHA-256 放行（CSP3 script-src hash），观察能力
 * 不依赖降级策略。
 */
function startTransport({ dispatcher, pages, bundles, mediaOrigins, requests, themeScript }) {
  const observerSha = createHash('sha256').update(AUDIO_OBSERVER_SNIPPET).digest('base64');
  assert.equal(observerSha.length, 44,
    'INTERFACE: audio observer sha256 must be 44-char base64 for CSP hash');
  // 官方主题引导脚本与观察器同等地位：内联即入 CSP sha256 白名单，
  // 内容与页面 <script> 逐字节一致（见 pageHtml themeScript 参数）。
  const themeSha = themeScript
    ? createHash('sha256').update(themeScript).digest('base64')
    : null;
  assert.equal(themeScript ? themeSha.length === 44 : themeSha === null, true,
    'INTERFACE: theme boot script sha256 must be 44-char base64 when a script is assembled');
  // Task-only bounded capacity; no cookie/profile mutation.
  const maxHeaderSize = 128 * 1024;
  assert.equal(maxHeaderSize, 131072, 'ENVIRONMENT: loopback header limit must be finite 128 KiB');
  return createServer({ maxHeaderSize }, async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const path = url.pathname;
    const method = (req.method || 'GET').toUpperCase();
    requests.push({ method, url: req.url });
    res.setHeader('cache-control', 'no-store');
    // style-src 'unsafe-inline' 保留：生产 injectAssetsStyles/injectCanvasStyles
    // 运行时插入 <style> 元素（真实注入契约）；*.module.css 产物经
    // <link rel=stylesheet> 走 'self' 静态路由，不依赖 inline。
    res.setHeader('content-security-policy',
      `default-src 'self'; script-src 'self' 'sha256-${observerSha}'${themeSha ? ` 'sha256-${themeSha}'` : ''}; ` +
      `style-src 'self' 'unsafe-inline'; ` +
      `connect-src 'self'; img-src 'self' data:; font-src 'self' data:; media-src ${mediaOrigins.join(' ')};`);
    try {
      if (method === 'GET' && pages[path]) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(pages[path]);
        return;
      }
      if (method === 'GET' && bundles[path]) {
        // bundles: path → { body, contentType }；CSS 产物走真实 text/css 静态
        // 路由（页面以 <link rel=stylesheet> 引用，非 inline/非 text loader）。
        const asset = bundles[path];
        assert.equal(typeof asset.contentType, 'string',
          `ENVIRONMENT: static route ${path} missing content type`);
        res.writeHead(200, { 'content-type': asset.contentType });
        res.end(asset.body);
        return;
      }
      if (path === '/omnimux/assets' || path.startsWith('/omnimux/assets/')) {
        const body = method === 'POST' ? await readJsonBody(req) : undefined;
        const result = await dispatcher.dispatch({
          method, url: req.url,
          origin: header(req, 'origin'), referer: header(req, 'referer'),
          secFetchSite: header(req, 'sec-fetch-site'), body,
        });
        if (result.redirect) {
          res.writeHead(result.status ?? 302, { Location: result.redirect });
          res.end();
          return;
        }
        if (result.stream) {
          const { createReadStream } = await import('node:fs');
          res.writeHead(result.status ?? 200, { 'content-type': result.stream.mime ?? 'application/octet-stream' });
          createReadStream(result.stream.absolutePath).pipe(res);
          return;
        }
        res.writeHead(result.status ?? 200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result.body));
        return;
      }
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end('{"error":"QA3058_TRANSPORT_NOT_AUTHORIZED"}');
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal', message: String(error?.message ?? error) }));
    }
  });
}

function pageHtml({ title, bundlePath, cssPath, themeCssPath, themeScript }) {
  // 官方主题工作表在最前：与官方 installThemeStyles 的头序一致，业务
  // module.css 产物在其后自然级联（后者仅含类名规则，不覆盖 :root token）。
  const themeLink = themeCssPath ? `<link rel="stylesheet" href="${themeCssPath}">` : '';
  const cssLink = cssPath ? `<link rel="stylesheet" href="${cssPath}">` : '';
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${themeLink}${cssLink}
<style>html,body,#root{height:100%;margin:0}</style></head>
<body><div id="root"></div>
<script>${AUDIO_OBSERVER_SNIPPET}</script>
${themeScript ? `<script>${themeScript}</script>` : ''}
<script src="${bundlePath}"></script></body></html>`;
  if (cssPath) {
    assert.equal(html.includes(`<link rel="stylesheet" href="${cssPath}">`), true,
      `INTERFACE: page ${title} must reference its real css artifact ${cssPath}`);
  }
  if (themeCssPath) {
    assert.equal(html.includes(`<link rel="stylesheet" href="${themeCssPath}">`), true,
      `INTERFACE: page ${title} must reference the official theme css artifact ${themeCssPath}`);
  }
  if (themeScript) {
    assert.equal(html.includes(`<script>${themeScript}</script>`), true,
      `INTERFACE: page ${title} must embed the official theme boot script verbatim`);
  }
  return html;
}

/**
 * 同构构建一次：正式旅程与 --build-only 前置共用。构建两个真实 bundle、
 * 提取真实 JS/CSS 产物、写出产物与 metafile 到 evidenceDir，并返回带
 * <link rel=stylesheet> 的页面与含 text/css 的静态路由表。
 */
async function assembleQaPages(evidenceDir, catalog) {
  const assets = await buildBundle({
    absWorkingDir: assetsPlugin, contents: assetsEntrySource(),
    resolveDir: join(assetsPlugin, 'src/client/x.jsx'), nodeModulesDir: join(assetsPlugin, 'node_modules'),
    outdir: join(evidenceDir, 'dist-assets'), outName: 'assets-page.js',
  });
  const canvas = await buildBundle({
    absWorkingDir: workflowPlugin, contents: canvasEntrySource(catalog),
    resolveDir: join(workflowPlugin, 'src/x.tsx'), nodeModulesDir: join(workflowPlugin, 'node_modules'),
    outdir: join(evidenceDir, 'dist-canvas'), outName: 'canvas-page.js',
  });
  await writeFile(join(evidenceDir, 'assets-page.js'), assets.code);
  await writeFile(join(evidenceDir, 'canvas-page.js'), canvas.code);
  await writeFile(join(evidenceDir, 'assets-metafile.json'), JSON.stringify(assets.metafile, null, 2));
  await writeFile(join(evidenceDir, 'canvas-metafile.json'), JSON.stringify(canvas.metafile, null, 2));
  const assetsCssPath = assets.css ? '/assets-page.css' : null;
  const canvasCssPath = canvas.css ? '/canvas-page.css' : null;
  if (assets.css) await writeFile(join(evidenceDir, 'assets-page.css'), assets.css);
  if (canvas.css) await writeFile(join(evidenceDir, 'canvas-page.css'), canvas.css);
  // 官方主题产物：@deepseek-ai/dsh-client-ui-theme 既有 lib/client.js 内嵌
  // STYLES 逐字节提取 → /official-theme.css 静态路由（text/css）。
  // 选择器由官方 boot-theme 公开契约脚本负责（data-ds-theme-source /
  // data-ds-dark-theme），页面不再出现 data-theme 空壳属性。
  const themeCss = await readOfficialThemeCss();
  const themePreference = resolveThemePreference();
  const themeScript = themeBootScript(themePreference);
  assert.equal(themeCss.includes('--dsw-alias-bg-base'), true,
    'INTERFACE: official theme artifact must define dsw-alias tokens');
  assert.equal(themeCss.includes('body[data-ds-dark-theme]'), true,
    'INTERFACE: official theme artifact must carry the official dark selector');
  assert.equal(['light', 'dark', 'system'].includes(themePreference), true,
    'INTERFACE: theme preference must be an official enum value');
  await writeFile(join(evidenceDir, 'official-theme.css'), themeCss);
  const themeCssPath = '/official-theme.css';
  const bundleSha = { assets: sha(assets.code), canvas: sha(canvas.code) };
  if (assets.css) bundleSha.assetsCss = sha(assets.css);
  if (canvas.css) bundleSha.canvasCss = sha(canvas.css);
  bundleSha.themeCss = sha(themeCss);
  bundleSha.themeScript = sha(themeScript);

  const pages = {
    '/assets': pageHtml({ title: 'Issue 3058 assets QA', bundlePath: '/assets-page.js',
      cssPath: assetsCssPath, themeCssPath, themeScript }),
    '/canvas': pageHtml({ title: 'Issue 3058 canvas QA', bundlePath: '/canvas-page.js',
      cssPath: canvasCssPath, themeCssPath, themeScript }),
  };
  const bundles = {
    '/assets-page.js': { body: assets.code, contentType: 'text/javascript; charset=utf-8' },
    '/canvas-page.js': { body: canvas.code, contentType: 'text/javascript; charset=utf-8' },
    [themeCssPath]: { body: themeCss, contentType: 'text/css; charset=utf-8' },
  };
  if (assets.css) bundles[assetsCssPath] = { body: assets.css, contentType: 'text/css; charset=utf-8' };
  if (canvas.css) bundles[canvasCssPath] = { body: canvas.css, contentType: 'text/css; charset=utf-8' };
  // CSS 产物接线强断言：metafile 报告 module.css 输入时产物必须非空，
  // 且页面 HTML 必须以 <link rel=stylesheet> 实际引用同名静态路径。
  for (const [pagePath, cssPath, built] of [
    ['/assets', assetsCssPath, assets], ['/canvas', canvasCssPath, canvas],
  ]) {
    const hasModuleCss = built.cssInputs.some((p) => p.endsWith('.module.css'));
    assert.equal(hasModuleCss ? cssPath !== null : true, true,
      `ENVIRONMENT: ${pagePath} imports css modules but no css artifact was emitted`);
    if (cssPath) {
      assert.equal(pages[pagePath].includes(`<link rel="stylesheet" href="${cssPath}">`), true,
        `ENVIRONMENT: ${pagePath} html must reference ${cssPath}`);
      assert.equal(cssPath in bundles, true,
        `ENVIRONMENT: ${pagePath} css artifact ${cssPath} missing from static routes`);
      assert.equal(bundles[cssPath].contentType.startsWith('text/css'), true,
        `ENVIRONMENT: ${pagePath} css route must serve text/css`);
    }
  }
  // 主题接线强断言：两个页面都必须实际引用 /official-theme.css 并内嵌
  // 与 CSP 白名单同哈希的官方 boot 脚本；路由表必须真的送 text/css。
  for (const pagePath of ['/assets', '/canvas']) {
    assert.equal(pages[pagePath].includes(`<link rel="stylesheet" href="${themeCssPath}">`), true,
      `INTERFACE: ${pagePath} must link the official theme sheet ${themeCssPath}`);
    assert.equal(pages[pagePath].includes(`<script>${themeScript}</script>`), true,
      `INTERFACE: ${pagePath} must embed the official theme boot script`);
  }
  return { pages, bundles, bundleSha, assets, canvas, themeCss, themeScript, themePreference, themeCssPath };
}

function runEgo(code, evidenceDir) {
  return new Promise((resolveRun, reject) => {
    const delimiter = `EGO_3058_${randomUUID().replaceAll('-', '')}`;
    const child = spawn('/bin/bash', ['-c', `ego-browser nodejs <<'${delimiter}'\n${code}\n${delimiter}\n`], {
      cwd: root,
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.once('error', reject);
    child.once('close', async (exitCode, signal) => {
      try {
        await writeFile(join(evidenceDir, 'ego.stdout.log'), stdout);
        await writeFile(join(evidenceDir, 'ego.stderr.log'), stderr);
        resolveRun({ exitCode, signal, stdout, stderr });
      } catch (error) { reject(error); }
    });
  });
}

/**
 * 浏览器旅程（ego-browser 内执行）：同一 space 的 p1 顺序导航两个页面。
 * 真实点击/键盘；Audio 账本 + DOM 断言 + 截图；正向官方 MP3 的 currentTime
 * 必须真实推进，CDN 不可达时该用例标 BLOCKED 而非伪造通过。
 */
async function browserJourney(config) {
  const assert = (await import('node:assert/strict')).default;
  const fs = await import('node:fs/promises');
  const save = (name, value) => fs.writeFile(`${config.evidenceDir}/${name}`, JSON.stringify(value, null, 2) + '\n');
  let spaceId = config.spaceId;
  if (typeof spaceId !== 'number') {
    try { spaceId = JSON.parse(await fs.readFile(config.spaceFile, 'utf8')).spaceId; } catch {}
  }
  if (typeof spaceId !== 'number') throw new Error('ENVIRONMENT: EXPECT_EXISTING_NUMERIC_SPACE');
  const task = await taskSpace(spaceId);
  if (task.ownership !== 'agent') throw new Error('ENVIRONMENT: USER_CONTROL_STOP');
  await fs.writeFile(config.spaceFile, JSON.stringify({ spaceId: task.spaceId, name: task.name, page: 'p1' }, null, 2) + '\n');
  const page = task.page('p1');
  const report = { runId: config.runId, spaceId: task.spaceId, page: page.label,
    evidenceLevel: 'REAL_COMPONENT_REAL_CATALOG_REAL_MEDIA', scenes: [], unknowns: [],
    playedSrc: {}, voices: config.voices, unverifiedVoices: config.unverifiedVoices };
  assert.equal(config.voices.length, 3, 'INTERFACE: journey requires three verified voices');
  assert.equal(config.unverifiedVoices.length, 3, 'INTERFACE: journey requires three unverified voices');
  const audio = () => page.evaluate(() => window.__qa3058Audio);
  const safeEvents = (events) => events.filter((e) => [
    'Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFailed',
    'Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded',
  ].includes(e.method)).map((e) => {
    const p = e.params ?? {};
    if (e.method === 'Network.requestWillBeSent') return { method: e.method,
      params: { type: p.type, request: { url: p.request?.url, method: p.request?.method } } };
    if (e.method === 'Network.responseReceived') return { method: e.method,
      params: { response: { url: p.response?.url, status: p.response?.status,
        statusText: p.response?.statusText, mimeType: p.response?.mimeType } } };
    return { method: e.method, params: p };
  });
  const failureEvidence = async (scene) => {
    const snapshot = await page.snapshot();
    assert.equal(typeof snapshot, 'string', 'ENVIRONMENT: failure snapshot must be real browser text');
    scene.snapshots.push(snapshot);
    scene.audioLedger = await audio().catch(() => null);
    scene.browserConsoleAndNetwork = safeEvents(await page.events());
    // 记录失败时真实停留 URL：资产页失败证据必须锚定 /assets 现场，
    // 不允许凭公共首页/样音卡上的残留状态冒充本场景证据。
    scene.failureUrl = await page.evaluate(() => location.href).catch(() => null);
    await save(`${scene.kind}-failure-state.json`, {
      error: scene.error, failureUrl: scene.failureUrl,
      snapshots: scene.snapshots, audioLedger: scene.audioLedger,
      browserConsoleAndNetwork: scene.browserConsoleAndNetwork,
    });
  };
  const shot = async (scene, stage) => {
    const path = `${config.evidenceDir}/${scene.kind}-${stage}.png`;
    await page.screenshot({ path, scale: 'css' });
    scene.screenshots.push({ stage, path });
  };
  const check = (scene, ok, name, details) => {
    scene.assertions.push({ name, ok: Boolean(ok), details });
    if (!ok) throw new Error(`FUNCTIONAL: ${name}`);
  };
  const timeupdates = (ledger, id) => ledger.events
    .filter((e) => e.id === id && e.kind === 'timeupdate')
    .map((e) => e.detail?.currentTime ?? 0);
  const latestId = (ledger) => Math.max(...ledger.events.map((e) => e.id));
  /**
   * O2/O4：registry 实读——本活动区域创建的所有原生 Audio 实例（含脱离 DOM、
   * 清 ref、error 后仍被持有的元素）的即时状态。读取失败返回 null（PENDING
   * 证据缺失），绝不把 error/ref null/空集合当作「无残留」的假绿。
   */
  const registry = async () => page.evaluate(
    () => window.__qa3058Audio?.registry?.() ?? null).catch(() => null);
  const nonPausedIds = (reg) => (reg ?? []).filter((i) => i.paused === false).map((i) => i.id);
  /**
   * O3：预注册有界观察窗——对 registry 全量实例以约 100ms 间隔连续实读，
   * 实际采样跨度覆盖至少 1500ms。中途页面销毁、观察器失联或目标消失一律
   * 记 unknown，不允许缺证凑绿、不允许看结果后缩窗。
   */
  const sampleWindow = async (id) => {
    const samples = [];
    // 窗口以首个样本绝对时间戳为起点：每轮先采样再判定，直到「首样本之后
    // ≥1500ms」才停止——收尾前必然刚采过一次，绝不凭循环耗时冒充实际采样
    // 跨度，也绝不截断最后一次 registry 实读。
    while (true) {
      const reg = await registry();
      if (!Array.isArray(reg)) return { ok: false, reason: 'registry-unreadable', samples, spanMs: null };
      samples.push({ t: Date.now(), states: reg.map((i) => ({
        id: i.id, paused: i.paused, currentTime: i.currentTime,
        ended: i.ended, connected: i.connected, src: i.src })) });
      if (Date.now() - samples[0].t >= 1500) break;
      await page.waitForTimeout(100);
    }
    const firstT = samples[0].t;
    const lastT = samples.at(-1).t;
    assert.equal(Number.isFinite(firstT) && Number.isFinite(lastT), true,
      'INTERFACE: sample window must carry absolute first/last sample timestamps');
    return { ok: samples.length >= 2 && lastT - firstT >= 1500,
      samples, spanMs: lastT - firstT, firstT, lastT, sampleCount: samples.length,
      targetMissingSamples: samples.filter((s) => !s.states.some((i) => i.id === id)).length };
  };
  /**
   * 共享停止 predicate（正负例共用，PM 接缝 O1–O4 的联合 AND，非任一迹象 OR）：
   * 目标旧实例 actual paused=true、currentTime=0、观察窗内不再推进、
   * action 之后无 play/playing 复活、且全页没有其他非暂停残留实例。
   * native pause 事件只进 diagnostics，绝不单独作通过凭证。
   */
  const evaluateStopped = (win, ledger, instId, actionT0) => {
    if (!ledger || !win || win.ok !== true || !Array.isArray(win.samples) || win.samples.length === 0) {
      return { stopped: 'unknown', reasons: ['missing-observer-window'] };
    }
    const reasons = [];
    const targetStates = win.samples.map((s) => s.states.find((i) => i.id === instId));
    const first = targetStates[0];
    const last = targetStates.at(-1);
    if (!first || !last) return { stopped: 'unknown', reasons: ['target-instance-missing-in-window'] };
    const times = targetStates.map((i) => i?.currentTime ?? 0);
    // 逐样本 AND（不允许只看首末）：窗口内每一样本目标实例都必须
    // paused===true 且 currentTime===0——中途复播、归零后非零、缺目标
    // 样本全部落 reason。该条件严格蕴含首末样本同态与时间零推进。
    const impure = win.samples
      .map((s, k) => ({ k, i: s.states.find((i) => i.id === instId), t: s.t }))
      .filter((x) => !x.i || x.i.paused !== true || x.i.currentTime !== 0);
    const revived = (ledger.events ?? []).some(
      (e) => e.id === instId && (e.kind === 'play' || e.kind === 'playing' || e.kind === 'play:fulfilled')
        && typeof e.t === 'number' && e.t >= actionT0);
    const residual = [...new Set(win.samples.flatMap(
      (s) => s.states.filter((i) => i.paused === false && i.id !== instId).map((i) => i.id)))];
    const diag = {
      pauseEvents: (ledger.events ?? []).filter(
        (e) => e.id === instId && e.kind === 'pause' && typeof e.t === 'number' && e.t >= actionT0).length,
      errorEvents: (ledger.events ?? []).filter(
        (e) => e.id === instId && e.kind === 'error' && typeof e.t === 'number' && e.t >= actionT0).length,
      revived,
    };
    if (win.spanMs < 1500) reasons.push(`sample-span-too-short:${win.spanMs}`);
    if (impure.length > 0) {
      reasons.push(`target-not-paused-zero-in-${impure.length}-samples:${impure
        .map((x) => x.i ? `t${x.k}={paused:${x.i.paused},ct:${x.i.currentTime}}` : `t${x.k}=missing`).slice(0, 8).join('|')}`);
    }
    if (revived) reasons.push('target-play-revived-after-action');
    if (residual.length > 0) reasons.push(`non-paused-residual:${residual.join(',')}`);
    return { stopped: reasons.length === 0, reasons, times, actionT0,
      spanMs: win.spanMs, firstT: win.firstT, lastT: win.lastT,
      samples: win.samples, diagnostics: diag };
  };
  /**
   * 切换单播的有界窗 predicate（与停止证明共享同一份 sampleWindow）：
   * 旧实例逐样本 stopped（paused===true ∧ currentTime===0）且 window 内无
   * 非目标复活，新实例窗内持续推进且为唯一非暂停实例。prevId 为 null 时
   * 只校验新实例推进与零残留。
   */
  const evaluateSwitched = (win, ledger, prevId, newId, switchT0) => {
    if (!ledger || !win || win.ok !== true || !Array.isArray(win.samples) || win.samples.length === 0) {
      return { switched: 'unknown', reasons: ['missing-observer-window'] };
    }
    const reasons = [];
    const newStates = win.samples.map((s) => s.states.find((i) => i.id === newId));
    const newTimes = newStates.map((i) => i?.currentTime ?? 0);
    const newLast = newStates.at(-1);
    const newIncrements = newTimes.filter((v, k) => k > 0 && v > newTimes[k - 1]).length;
    if (win.spanMs < 1500) reasons.push(`sample-span-too-short:${win.spanMs}`);
    if (prevId !== null && prevId !== undefined) {
      const impure = win.samples
        .map((s, k) => ({ k, i: s.states.find((i) => i.id === prevId), t: s.t }))
        .filter((x) => !x.i || x.i.paused !== true || x.i.currentTime !== 0);
      if (impure.length > 0) {
        reasons.push(`old-instance-not-stopped-in-${impure.length}-samples:${impure
          .map((x) => x.i ? `t${x.k}={paused:${x.i.paused},ct:${x.i.currentTime}}` : `t${x.k}=missing`).slice(0, 8).join('|')}`);
      }
      const prevRevived = (ledger.events ?? []).some(
        (e) => e.id === prevId && (e.kind === 'play' || e.kind === 'playing' || e.kind === 'play:fulfilled')
          && typeof e.t === 'number' && e.t >= switchT0);
      if (prevRevived) reasons.push('old-instance-play-revived-after-switch');
    }
    const residual = [...new Set(win.samples.flatMap(
      (s) => s.states.filter((i) => i.paused === false && i.id !== newId).map((i) => i.id)))];
    if (!newLast || (newLast.paused !== false && newLast.ended !== true)) {
      reasons.push(`new-instance-not-active-at-window-end:${newLast ? `paused:${newLast.paused},ended:${newLast.ended}` : 'missing'}`);
    }
    if (newIncrements < 1 && newLast?.ended !== true) reasons.push(`new-instance-not-advancing:${newIncrements}-increments`);
    if (residual.length > 0) reasons.push(`non-paused-residual:${residual.join(',')}`);
    return { switched: reasons.length === 0, reasons,
      newTimes, newIncrements, switchT0, spanMs: win.spanMs,
      firstT: win.firstT, lastT: win.lastT, samples: win.samples };
  };
  assert.equal(typeof evaluateStopped === 'function' && typeof evaluateSwitched === 'function', true,
    'INTERFACE: shared stopped predicate and switch predicate must both be defined before scene use');
  /**
   * 停止证明：动作落点 actionT0 之后开窗实读 1500ms×100ms 采样，交给共享
   * predicate。predicates stopped=false → FUNCTIONAL 红；unknown → 缺证红，
   * 均不落假绿。ledger 事件账本只留诊断（是否收到 pause/error/复活）。
   */
  const proofStopped = async (scene, label, instId, actionT0) => {
    const win = await sampleWindow(instId);
    const ledger = await audio();
    const verdict = evaluateStopped(win, ledger, instId, actionT0);
    assert.equal(Number.isFinite(verdict.actionT0), true,
      `INTERFACE: ${label} verdict must retain the action timestamp for revive filtering`);
    assert.equal(typeof verdict.spanMs === 'number' && verdict.spanMs >= 1500 || verdict.stopped === 'unknown', true,
      `INTERFACE: ${label} must retain the real sampled span >= 1500ms, got ${verdict.spanMs}`);
    // 全量样本（绝对时间戳 + 每样本 registry 全量状态）随 verdict 一并进
    // check 详情落盘——O3 签收口径以实际首末样本跨度为准，不看循环耗时。
    check(scene, verdict.stopped === true, `${label}: stopped proof`, verdict);
    return verdict;
  };
  /**
   * 执行一次真实停止动作（选择器点击或键盘等任意真实手势），随后用共享
   * predicate 完成 O2/O3/O4 停止证明。native pause 事件不再作为唯一凭证，
   * 只作 diagnostics；动作未落到真实控件由驱动自身抛错，不在此判绿。
   */
  const stopBy = async (scene, label, instId, act) => {
    const actionT0 = Date.now();
    assert.equal(Number.isFinite(actionT0), true,
      `INTERFACE: ${label} action timestamp must be a finite epoch for post-action revive filtering`);
    assert.equal(typeof evaluateStopped, 'function',
      'INTERFACE: shared stopped predicate must be shared by positive and negative proofs');
    await act();
    return proofStopped(scene, label, instId, actionT0);
  };
  /** 点击停止并验证：同一旧原生实例真实暂停归零、观察窗不推进不复活、无残留。 */
  const stopAndVerify = async (scene, stopSelector, label, instId) =>
    stopBy(scene, label, instId, () => page.click(stopSelector, { label, timeout: 6000 }));
  /**
   * 点击试听并验证真实媒体推进：新实例 currentTime 严格递增、播放态
   * paused=false、首个 play() 调用源为官方 primary_url（expectedSrc 给定时
   * 必须一致——双端同一份官方样音，不替代为任何本地/受控资源）。
   */
  const playAndObserve = async (scene, playSelector, label, expectedSrc) => {
    const before = await audio();
    await page.click(playSelector, { label, timeout: 6000 });
    await page.waitForTimeout(400);
    // 资产卡悬停即自动试听：真实 click 落在已 hover 的卡上时可能先命中
    // 「悬停自动播 → 点击暂停」。此时诚实再点一次恢复播放——两种情况都
    // 由账本判定，写不出假绿。
    {
      const probe = await audio();
      const inst = latestId(probe);
      const started = inst > before.instances
        && probe.events.some((e) => e.id === inst && e.kind === 'play()')
        && !probe.events.some((e) => e.id === inst && (e.kind === 'pause' || e.kind === 'ended' || e.kind === 'error'));
      assert.equal(typeof started, 'boolean', `${label}: probe ledger readable`);
      if (!started) await page.click(playSelector, { label: `${label}-resume`, timeout: 6000 });
    }
    await page.waitForFunction((mark) => {
      const l = window.__qa3058Audio;
      const inst = Math.max(...l.events.map((e) => e.id));
      const times = l.events.filter((e) => e.id === inst && e.kind === 'timeupdate').map((e) => e.detail.currentTime);
      return inst > mark && times.length >= 2 && times[times.length - 1] > times[0];
    }, before.instances, { timeout: 10000 });
    const ledger = await audio();
    const inst = latestId(ledger);
    const times = timeupdates(ledger, inst);
    check(scene, inst > before.instances, `${label}: new audio instance created`, { inst });
    check(scene, times.length >= 2 && times[times.length - 1] > times[0],
      `${label}: real currentTime advances`, { inst, times: times.slice(0, 6) });
    const lastUpdate = ledger.events.filter((e) => e.id === inst && e.kind === 'timeupdate').at(-1);
    assert.equal(lastUpdate?.detail?.paused, false,
      `${label}: playing media must report paused=false, got ${lastUpdate?.detail?.paused}`);
    check(scene, ledger.events.some((e) => e.id === inst && e.kind === 'play:fulfilled'),
      `${label}: play() promise fulfilled`, { inst });
    if (expectedSrc) {
      const playCall = ledger.events.find((e) => e.id === inst && e.kind === 'play()');
      assert.equal(playCall?.src, expectedSrc,
        `${label}: audition must consume official primary_url ${expectedSrc}, got ${playCall?.src}`);
      if (report.playedSrc[label] === undefined) report.playedSrc[label] = playCall?.src;
    }
    return inst;
  };
  assert.equal(typeof stopAndVerify, 'function' && typeof stopBy, 'function',
    'INTERFACE: exactly one registry-based stop proof entry must be defined');
  /** 资产页搜索：真实输入触发 280ms 防抖后的 /cloud/search。 */
  const searchAssets = async (query) => {
    await page.fill('.omnimux-assets-search-wrap input', query);
    await page.waitForTimeout(700);
  };
  const assetsThumb = (name, action) =>
    `[role="button"][aria-label="${name} · ${action}"]`;

  // ── 详情生命周期 helpers（detailModalState / detailNativePlay /
  //    detailLifecycleScene）：page / searchAssets / assetsThumb / shot /
  //    audio / registry / check / stopBy / playAndObserve / latestId /
  //    timeupdates / assert 均为 browserJourney 闭包，签名只携 scene 与 voice ──
  /**
   * 详情模态真实 DOM 状态：标准 DOM CSS 类选择器 + DOM API，绝不把
   * ego 伪类送进 evaluate；标题/按钮/布局全部读真实几何与属性。
   */
  const detailModalState = (expectedTitle) => page.evaluate((name) => {
    const dialogs = [...document.querySelectorAll('.omnimux-assets-modal-backdrop[role="dialog"]')];
    const dlg = dialogs[0];
    if (!dlg) return { dialogs: dialogs.length };
    const title = dlg.querySelector('.omnimux-assets-modal-title');
    const audioEl = dlg.querySelector('.omnimux-assets-modal-media-wrap audio.omnimux-assets-modal-audio');
    const closeBtn = dlg.querySelector('button.omnimux-assets-modal-close-external');
    const card = document.querySelector(`.omnimux-assets-card-title[title="${name}"]`)?.closest('.omnimux-assets-card');
    return {
      dialogs: dialogs.length,
      titleText: title?.textContent ?? null,
      titleAttr: title?.getAttribute('title') ?? null,
      hasAudio: Boolean(audioEl),
      audioControls: audioEl ? audioEl.controls === true && audioEl.hasAttribute('controls') : null,
      audioAutoplay: audioEl ? audioEl.autoplay === true : null,
      audioId: audioEl?.__qa3058id ?? null,
      closeLabel: closeBtn?.getAttribute('aria-label') ?? null,
      footerCount: dlg.querySelectorAll('.omnimux-assets-modal-footer').length,
      saveChatInModal: dlg.querySelectorAll('.omnimux-assets-cloud-save, .omnimux-assets-cloud-chat').length,
      saveChatOnCard: card ? card.querySelectorAll('.omnimux-assets-cloud-save, .omnimux-assets-cloud-chat').length : -1,
      titleAboveAudio: title && audioEl
        ? title.getBoundingClientRect().bottom <= audioEl.getBoundingClientRect().top + 1 : null,
      closeInDialog: closeBtn ? dlg.contains(closeBtn) : null,
    };
  }, expectedTitle);

  /**
   * 原生 controls 在挂载时已注册 DOM audio；浏览器内部起播不调用 JS play()
   * 包装。focus() 锁定 audio 本体后真实 Space 起播，原生 play/playing 事件与
   * 同一对象的 paused/currentTime 联合证明；不点控件中心（进度条），不执行
   * evaluate play/pause/currentTime 写入、不用新建实例或 JS promise 替代原生事实。
   */
  const detailNativePlay = async (scene, label, expectedSrc) => {
    const audioSel = '.omnimux-assets-modal-media-wrap audio.omnimux-assets-modal-audio';
    const target = await page.evaluate(() => {
      const el = document.querySelector('.omnimux-assets-modal-media-wrap audio.omnimux-assets-modal-audio');
      if (!el) return null;
      window.__qa3058DetailKeys = [];
      el.addEventListener('keydown', (event) => {
        window.__qa3058DetailKeys.push({ key: event.key, code: event.code,
          trusted: event.isTrusted, targetAudio: event.target === el, t: Date.now() });
      });
      return { id: el.__qa3058id, paused: el.paused, currentTime: el.currentTime,
        connected: el.isConnected, controls: el.controls };
    });
    assert.equal(typeof target?.id === 'number' && target.id > 0, true,
      `INTERFACE: ${label}: mounted native audio must already be registered`);
    assert.equal(target.paused === true && target.connected === true && target.controls === true, true,
      `${label}: target must be the connected idle native controls instance`);
    await page.focus(audioSel, { timeout: 6000 });
    const focused = await page.evaluate(() =>
      document.activeElement === document.querySelector('.omnimux-assets-modal-media-wrap audio.omnimux-assets-modal-audio'));
    assert.equal(focused, true, `INTERFACE: ${label}: focus must land on native audio, not seekbar`);
    const actionT0 = Date.now();
    await page.keyboard.press('Space');
    await page.waitForFunction(({ id, actionT0 }) => {
      const l = window.__qa3058Audio;
      const state = l?.registry?.().find((i) => i.id === id);
      const events = l?.events?.filter((e) => e.id === id && e.t >= actionT0) ?? [];
      const times = events.filter((e) => e.kind === 'timeupdate').map((e) => e.detail.currentTime);
      return state?.paused === false && events.some((e) => e.kind === 'play')
        && events.some((e) => e.kind === 'playing')
        && times.length >= 2 && times[times.length - 1] > times[0];
    }, { id: target.id, actionT0 }, { timeout: 10000 });
    const ledger = await audio();
    const inst = target.id;
    const events = ledger.events.filter((e) => e.id === inst && e.t >= actionT0);
    const times = events.filter((e) => e.kind === 'timeupdate').map((e) => e.detail.currentTime);
    const states = await registry();
    const state = states?.find((i) => i.id === inst);
    const keys = await page.evaluate(() => window.__qa3058DetailKeys);
    check(scene, state?.id === inst && state?.connected === true,
      `${label}: same mounted native detail audio instance`, { inst, target, state });
    check(scene, times.length >= 2 && times.at(-1) > times[0] && state?.currentTime > target.currentTime,
      `${label}: real currentTime advances`, { inst, times, currentTime: state?.currentTime });
    assert.equal(state?.paused, false,
      `${label}: playing media must report actual paused=false, got ${state?.paused}`);
    check(scene, events.some((e) => e.kind === 'play') && events.some((e) => e.kind === 'playing'),
      `${label}: native play and playing confirmed`, { inst, events });
    check(scene, keys.some((e) => e.t >= actionT0 && e.trusted === true && e.targetAudio === true && e.code === 'Space'),
      `${label}: trusted Space reached focused native audio`, { actionT0, keys });
    assert.equal(state?.src, expectedSrc,
      `${label}: detail audio must consume official primary_url ${expectedSrc}, got ${state?.src}`);
    assert.equal(events.find((e) => e.kind === 'play')?.src, expectedSrc,
      `${label}: native play event must carry the same official primary_url`);
    assert.deepEqual(nonPausedIds(states), [inst], `${label}: native detail must be the only playing instance`);
    scene.evidence = { ...(scene.evidence ?? {}), detailNativeInput: { inst, actionT0, target, state, keys, events } };
    await save('detail-native-input.json', scene.evidence.detailNativeInput);
    return inst;
  };

  /**
   * 资产详情生命周期外门场景（全部落进 sceneA.assertions，作正式外层 AND
   * 一部分，不是补充）：
   * 卡片真实起播 → 详情真实打开（同 predicate 证卡停）→ 标题/native controls/
   * 无footer无save无chat/真实布局 → focus+Space 实播 → 真实关闭控件 →
   * 共享 stopped predicate（paused∧currentTime===0 逐样本 AND，归零未修即红）→
   * 再点卡播放中切「本地」真实卸载 → 同一 predicate 证停止归零、零残留。
   */
  const detailLifecycleScene = async (scene, voice) => {
    await searchAssets(voice.name);
    const playSel = assetsThumb(voice.name, '试听');
    await page.waitForSelector(playSel, { state: 'visible', timeout: 10000 });
    const cardInst = await playAndObserve(scene, playSel, `detail-${voice.voiceType}-card-play`, voice.primaryUrl);
    // 打开详情（真实点击卡片 body，handleOpenPreview 先 audition.stop()）；
    // 卡片正在播放的实例停止证明走同一共享 predicate，不归档为补充证据。
    const openSel = `.omnimux-assets-card-body[role="button"][aria-label="${voice.name} · 查看详情"]`;
    await page.waitForSelector(openSel, { state: 'visible', timeout: 10000 });
    const openVerdict = await stopBy(scene, 'detail-open-stops-card', cardInst, async () => {
      await page.click(openSel, { label: `打开 ${voice.name} 详情`, timeout: 6000 });
      await page.waitForSelector('.omnimux-assets-modal-backdrop[role="dialog"]', { state: 'visible', timeout: 8000 });
    });
    assert.equal(openVerdict.stopped, true,
      `detail: opening detail must stop the playing card instance, reasons ${(openVerdict.reasons ?? []).join(',') || 'none'}`);
    // 真实 DOM 结构：单一 dialog、真实标题、native controls、无 footer、
    // modal 内外零 save/chat、标题在音频之上的真实几何布局。
    const ms = await detailModalState(voice.name);
    assert.equal(ms.dialogs, 1, `detail: exactly one real dialog must exist, got ${ms.dialogs}`);
    assert.equal(ms.titleText === voice.name && ms.titleAttr === voice.name, true,
      `detail: real title must be exactly ${voice.name}, got ${ms.titleText}`);
    check(scene, ms.hasAudio === true && ms.audioControls === true && ms.audioAutoplay === false,
      'detail: native audio controls present and autoplay off', {
        hasAudio: ms.hasAudio, audioControls: ms.audioControls, audioAutoplay: ms.audioAutoplay });
    check(scene, ms.footerCount === 0 && ms.saveChatInModal === 0 && ms.saveChatOnCard === 0,
      'detail: no footer and zero save/chat actions inside modal or on official card',
      { footerCount: ms.footerCount, saveChatInModal: ms.saveChatInModal, saveChatOnCard: ms.saveChatOnCard });
    check(scene, ms.titleAboveAudio === true && ms.closeInDialog === true && ms.closeLabel === '关闭预览',
      'detail: real layout title-over-audio and labelled close inside dialog',
      { titleAboveAudio: ms.titleAboveAudio, closeInDialog: ms.closeInDialog, closeLabel: ms.closeLabel });
    assert.equal(ms.audioId !== cardInst, true,
      `detail: modal audio must be a different native instance than card ${cardInst}`);
    // native controls 真实 focus+Space 起播（禁止 evaluate play）。
    const detailInst = await detailNativePlay(scene, `detail-${voice.voiceType}-native-play`, voice.primaryUrl);
    await shot(scene, 'detail-native-playing');
    // 真实点击关闭控件（不用 Escape 兜底、不点 backdrop），同一 predicate：
    // 逐样本 paused===true ∧ currentTime===0 ∧ 无复活 ∧ 无残留。
    const closeVerdict = await stopBy(scene, 'detail-close-stops-native', detailInst, async () => {
      await page.click('button.omnimux-assets-modal-close-external',
        { label: '真实关闭详情', timeout: 6000 });
      await page.waitForFunction(
        () => !document.querySelector('.omnimux-assets-modal-backdrop[role="dialog"]'),
        undefined, { timeout: 8000 });
    });
    assert.equal(closeVerdict.stopped, true,
      `detail: close while playing must pause AND zero (PM O2), reasons ${(closeVerdict.reasons ?? []).join(',') || 'none'}`);
    // 播放中的卡片 + 真实切「本地」来源：CloudAssetsView 真实条件卸载，
    // 正在播实例同一 predicate 停止归零、全部实例无非暂停残留。
    const cardInst2 = await playAndObserve(scene, playSel, `detail-${voice.voiceType}-card-replay`, voice.primaryUrl);
    const unloadVerdict = await stopBy(scene, 'local-source-unmount-stops-card', cardInst2, async () => {
      await page.click('loc=role:tab[name="本地"]', { label: '切本地来源卸载云端', timeout: 6000 });
      await page.waitForFunction(
        () => !document.querySelector('[role="group"][aria-label="云端素材分类"]'),
        undefined, { timeout: 8000 });
      await page.waitForSelector('[role="group"][aria-label="本地素材分类"], [role="group"][aria-label="素材分类"]',
        { state: 'visible', timeout: 8000 }).catch(() => null);
    });
    assert.equal(unloadVerdict.stopped, true,
      `detail: local-source unmount must stop the playing card, reasons ${(unloadVerdict.reasons ?? []).join(',') || 'none'}`);
    const regAfter = await registry();
    check(scene, Array.isArray(regAfter) && regAfter.every((i) => i.paused !== false),
      'detail: zero non-paused native audio after unload', { registrySize: regAfter?.length });
    // 回到公共来源保持后续旅程同位（真实点击，不是状态重置）。
    await page.click('loc=role:tab[name="公共"]', { label: '恢复公共来源', timeout: 6000 });
    await page.waitForSelector('[role="group"][aria-label="云端素材分类"]', { state: 'visible', timeout: 8000 });
    scene.actions.push('detail-lifecycle:open-detail,focus-space-play,close-stop,local-unmount');
  };

  // ── 场景 A：资产库 公共→声音→配音 真实搜索 + 三代表试听/切换 ──────────
  const sceneA = { kind: 'assets', status: 'RUNNING', assertions: [], actions: [], screenshots: [], snapshots: [] };
  report.scenes.push(sceneA);
  try {
    await page.goto(`${config.origin}/assets`);
    await page.waitForSelector('[role="region"][aria-label="资产中心"]', { state: 'visible', timeout: 15000 });
    assert.equal(await page.evaluate(() => document.querySelectorAll('[role="region"][aria-label="资产中心"]').length), 1,
      'ENVIRONMENT: real AssetsStage root must exist exactly once');
    // 官方主题契约实读：公开选择器（data-ds-theme-source / data-ds-dark-theme）
    // 与官方 --dsw-alias-* token 的 computed 值必须非空（官方产物提供，
    // 不是 runner 手写颜色）。assert.equal 断言的是存在性与契约值域。
    const themeA = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return {
        source: document.documentElement.dataset.dsThemeSource ?? null,
        dark: document.body.hasAttribute('data-ds-dark-theme'),
        bgBase: cs.getPropertyValue('--dsw-alias-bg-base').trim(),
        labelPrimary: cs.getPropertyValue('--dsw-alias-label-primary').trim(),
        borderL1: cs.getPropertyValue('--dsw-alias-border-l1').trim(),
      };
    });
    assert.equal(['light', 'dark', 'system'].includes(themeA.source), true,
      `ENVIRONMENT: assets page must carry official data-ds-theme-source, got ${themeA.source}`);
    assert.equal(typeof themeA.dark, 'boolean', 'ENVIRONMENT: assets page must expose data-ds-dark-theme boolean state');
    for (const [name, value] of Object.entries({ bgBase: themeA.bgBase, labelPrimary: themeA.labelPrimary, borderL1: themeA.borderL1 })) {
      assert.equal(typeof value === 'string' && value.length > 0, true,
        `ENVIRONMENT: assets page official token --dsw-alias-${name} must compute non-empty, got "${value}"`);
    }
    sceneA.theme = themeA;
    // selector-first：全部锁定生产真实容器的唯一按钮，禁止裸 text=
    // （「声音」同时命中二级分类 span 与某标题 h2 role=button，曾致 ElementResolutionError）。
    // round4 修正：ego 的 :text-is 只匹配「自身文本恰等」的叶子节点，而 Tabs 把
    // 文字放在子 <span>——[role="tab"]:text-is("公共") 永不可能命中，故改用
    // loc=role: 语义定位（snapshot 现场「公共」为唯一 tab 可访问名）；
    // :has-text 允许后代文本命中，chip 用它限定在原生 group 内，绝不 nth 盲选。
    // attrOf 只送标准 DOM CSS 进 querySelector，ego 专用伪类绝不进 evaluate。
    const sourceTab = (name) => `loc=role:tab[name="${name}"]`;
    const cloudNavChip = (name) => `[role="group"][aria-label="云端素材分类"] button.omnimux-assets-cloud-chip:has-text("${name}")`;
    const cloudSubChip = (name) => `[role="group"][aria-label="二级分类"] button.omnimux-assets-cloud-chip:has-text("${name}")`;
    // attrOf 只用标准 DOM：querySelectorAll 命中列表 → textContent.trim() 恰等
    // 过滤。:text-is/:has-text 是 ego 专用伪类，绝不进原生 querySelector。
    const attrOf = (css, attr, name) => page.evaluate(
      (a) => {
        const el = [...document.querySelectorAll(a.css)]
          .find((e) => (e.textContent ?? '').trim() === a.name);
        return el ? el.getAttribute(a.attr) : null;
      },
      { css, attr, name });
    assert.equal(await page.evaluate(
      () => [...document.querySelectorAll('[role="tab"]')]
        .filter((el) => (el.textContent ?? '').trim() === '公共').length), 1,
      'ENVIRONMENT: 公共 must be the unique accessible-name match among [role=tab]');
    await page.click(sourceTab('公共'), { label: '切到公共来源', timeout: 6000 });
    await page.waitForSelector('[role="group"][aria-label="云端素材分类"]', { state: 'visible', timeout: 6000 });
    assert.equal(await attrOf(
      '[role="toolbar"].omnimux-assets-stage-toolbar [role="tab"][aria-selected="true"]',
      'aria-selected', '公共'), 'true',
      'ENVIRONMENT: 公共 source tab must report aria-selected=true after real click');
    await page.click(cloudNavChip('声音'), { label: '打开声音分类', timeout: 6000 });
    await page.waitForSelector('[role="group"][aria-label="二级分类"]', { state: 'visible', timeout: 6000 });
    assert.equal(await attrOf(
      '[role="group"][aria-label="云端素材分类"] button.omnimux-assets-cloud-chip[aria-pressed="true"]',
      'aria-pressed', '声音'), 'true',
      'ENVIRONMENT: 声音 category chip must report aria-pressed=true after real click');
    await page.click(cloudSubChip('配音'), { label: '打开配音子类', timeout: 6000 });
    assert.equal(await attrOf(
      '[role="group"][aria-label="二级分类"] button.omnimux-assets-cloud-chip[aria-pressed="true"]',
      'aria-pressed', '配音'), 'true',
      'ENVIRONMENT: 配音 sub-category chip must report aria-pressed=true after real click');
    sceneA.actions.push('公共→声音→配音');
    // 三个已验证代表：真实搜索（林潇不在首个 grid），逐个点 div[role=button]
    // 播放键，A→B 切换验证上一实例真实 pause、全页单播。
    let previousInst = null;
    for (const voice of config.voices) {
      await searchAssets(voice.name);
      const playBtn = assetsThumb(voice.name, '试听');
      await page.waitForSelector(playBtn, { state: 'visible', timeout: 10000 });
      const inst = await playAndObserve(sceneA, playBtn, `assets-${voice.voiceType}-play`, voice.primaryUrl);
      await shot(sceneA, `playing-${voice.voiceType}`);
      // O4 切换单播：与停止证明同一有界窗——旧实例逐样本 paused=true ∧
      // currentTime=0、无复活；新实例窗内持续推进且为唯一非暂停实例。
      // 一次性 registry 快照不足以证明「持续」单播，绝不用它凑绿。
      const switchT0A = Date.now();
      const switchWinA = await sampleWindow(inst);
      const switchLedgerA = await audio();
      const switchVerdictA = evaluateSwitched(switchWinA, switchLedgerA, previousInst, inst, switchT0A);
      assert.equal(switchVerdictA.switched, true,
        `assets: switch to ${voice.voiceType} must hold for the full bounded window, got reasons ${(switchVerdictA.reasons ?? []).join(',') || 'none'}`);
      check(sceneA, switchVerdictA.switched === true,
        `assets: old voice stopped and only ${voice.voiceType} advances during switch window`,
        { prev: previousInst, inst, reasons: switchVerdictA.reasons, spanMs: switchVerdictA.spanMs });
      sceneA.evidence = sceneA.evidence ?? {};
      sceneA.evidence[`switch-${voice.voiceType}`] = {
        spanMs: switchVerdictA.spanMs, firstT: switchVerdictA.firstT,
        lastT: switchVerdictA.lastT, samples: switchVerdictA.samples,
        newIncrements: switchVerdictA.newIncrements };
      previousInst = inst;
    }
    await stopAndVerify(sceneA, assetsThumb(config.voices.at(-1).name, '停止'), 'assets-last-voice-stop', previousInst);
    // 未验证音色：真实搜索后卡片在册但无试听键、无保存/会话动作簇
    for (const u of config.unverifiedVoices) {
      await searchAssets(u.name);
      const cardTitle = `.omnimux-assets-card-title[title="${u.name}"]`;
      await page.waitForSelector(cardTitle, { state: 'visible', timeout: 10000 });
      const state = await page.evaluate((name) => {
        const card = document.querySelector(`.omnimux-assets-card-title[title="${name}"]`)?.closest('.omnimux-assets-card');
        return {
          hasPlayKey: !!document.querySelector(`[role="button"][aria-label="${name} · 试听"]`),
          hasSaveChat: card ? card.querySelectorAll('.omnimux-assets-cloud-save, .omnimux-assets-cloud-chat').length : -1,
        };
      }, u.name);
      assert.equal(state.hasSaveChat >= 0, true, `assets: ${u.voiceType} card located in DOM`);
      assert.equal(state.hasPlayKey, false,
        `assets: unverified ${u.voiceType} must not render a play key`);
      assert.equal(state.hasSaveChat, 0,
        `assets: official voice ${u.voiceType} card must not render save/chat actions`);
      check(sceneA, state.hasSaveChat === 0 && !state.hasPlayKey,
        `assets: unverified ${u.voiceType} listed without play/save`, null);
    }
    await searchAssets('');
    // 详情生命周期外门：全部断言落进 sceneA.assertions，由外层计数门 AND。
    assert.equal(typeof detailLifecycleScene, 'function',
      'INTERFACE: detail lifecycle scene must be defined before scene A invokes it');
    await detailLifecycleScene(sceneA, config.voices[0]);
    // 白名单核对：页面上不得出现「热门」「官方」「已验证」徽章文案
    const banned = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return ['热门', '已验证', '待核对', '抖音同款', '剪映同款', '豆包同款'].filter((w) => text.includes(w));
    });
    check(sceneA, banned.length === 0, 'assets: zero banned badges', banned);
    await shot(sceneA, 'voiceover-grid');
    sceneA.status = 'PASS_COMPONENT_JOURNEY';
  } catch (error) {
    sceneA.status = /ENVIRONMENT|CONTROL/i.test(String(error)) ? 'BLOCKED' : 'FAILED';
    sceneA.error = String(error.stack ?? error);
    await shot(sceneA, 'failure');
    await failureEvidence(sceneA);
    assert.equal(sceneA.snapshots.length > 0, true, 'ENVIRONMENT: assets failure must retain snapshot');
    if (/user.control|executionStopped|mayHaveLateEffects|policy|permission|unassigned|inactive/i.test(sceneA.error)) throw error;
  }

  // ── 场景 B：画布 VoicePickerDialog 真实搜索试听 + 单播 + 关闭清理 ──────
  const sceneB = { kind: 'canvas', status: 'RUNNING', assertions: [], actions: [], screenshots: [], snapshots: [] };
  report.scenes.push(sceneB);
  const optionRow = (voiceType) => `[role="option"][data-voice-type="${voiceType}"]`;
  const fillVoiceSearch = async (query) => {
    await page.fill('.wf-voice-picker__search input', query);
    await page.waitForTimeout(300);
  };
  // Escape 关闭会让真实音频节点失选、配置入口随之消失：每次开弹窗前必须
  // 真实重选节点，绝不按记忆坐标或 nth() 猜点配置面板里可能出现的元素。
  const openVoiceDialog = async () => {
    const selected = await page.evaluate(
      () => document.querySelectorAll('.wf-material-node--audio.wf-material-node--selected').length);
    if (selected === 0) {
      await page.click('.wf-material-node--audio', { label: '重新选中音频节点', timeout: 6000 });
    }
    assert.equal(await page.evaluate(
      () => document.querySelectorAll('.wf-material-node--audio.wf-material-node--selected').length), 1,
      'ENVIRONMENT: audio node must be re-selected through a real pointer action');
    await page.waitForSelector('button[data-testid="wf-voice-trigger"]', { state: 'visible', timeout: 6000 });
    await page.click('button[data-testid="wf-voice-trigger"]', { label: '打开音色弹窗', timeout: 6000 });
    await page.waitForSelector('[role="listbox"][aria-label="音色列表"]', { state: 'visible', timeout: 8000 });
  };
  const waitDialogClosed = async () => {
    await page.waitForFunction(() => !document.querySelector('[role="listbox"][aria-label="音色列表"]'),
      undefined, { timeout: 8000 });
  };
  try {
    await page.goto(`${config.origin}/canvas`);
    await page.waitForSelector('.wf-canvas-root', { state: 'visible', timeout: 15000 });
    // 画布页同一官方主题契约：公开选择器 + computed token 非空。
    const themeB = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return {
        source: document.documentElement.dataset.dsThemeSource ?? null,
        dark: document.body.hasAttribute('data-ds-dark-theme'),
        bgBase: cs.getPropertyValue('--dsw-alias-bg-base').trim(),
        labelPrimary: cs.getPropertyValue('--dsw-alias-label-primary').trim(),
        borderL1: cs.getPropertyValue('--dsw-alias-border-l1').trim(),
      };
    });
    assert.equal(['light', 'dark', 'system'].includes(themeB.source), true,
      `ENVIRONMENT: canvas page must carry official data-ds-theme-source, got ${themeB.source}`);
    for (const [name, value] of Object.entries({ bgBase: themeB.bgBase, labelPrimary: themeB.labelPrimary, borderL1: themeB.borderL1 })) {
      assert.equal(typeof value === 'string' && value.length > 0, true,
        `ENVIRONMENT: canvas page official token --dsw-alias-${name} must compute non-empty, got "${value}"`);
    }
    sceneB.theme = themeB;
    await page.waitForSelector('.wf-material-node--audio', { state: 'visible', timeout: 10000 });
    await page.click('.wf-material-node--audio', { label: '选中真实音频节点', timeout: 6000 });
    assert.equal(await page.evaluate(() => document.querySelectorAll('.wf-material-node--audio.wf-material-node--selected').length), 1,
      'ENVIRONMENT: audio node must be selected through a real pointer action');
    const paramsBefore = await page.evaluate(() => window.__qa3058.params());
    await page.waitForSelector('button[data-testid="wf-voice-trigger"]', { state: 'visible', timeout: 10000 });
    await openVoiceDialog();
    await shot(sceneB, 'dialog-open');
    // §2.3/§3.3：禁「热门」em 徽章（DOM 级，非仅源码）
    const hotBadge = await page.evaluate(() => ({
      em: [...document.querySelectorAll('[role="option"] em')].map((e) => e.textContent),
      text: (document.querySelector('[role="listbox"]')?.innerText || '').includes('热门'),
    }));
    check(sceneB, hotBadge.em.length === 0 && !hotBadge.text, 'canvas: no 热门 em badge', hotBadge);
    // 三个已验证代表：弹窗内真实搜索 → data-voice-type 精确行 → 行内 ▶ 试听。
    let previousInst = null;
    for (const voice of config.voices) {
      await fillVoiceSearch(voice.name);
      const row = optionRow(voice.voiceType);
      await page.waitForSelector(row, { state: 'visible', timeout: 8000 });
      const playBtn = `${row} button.wf-voice-picker__preview`;
      await page.waitForSelector(playBtn, { state: 'visible', timeout: 8000 });
      const inst = await playAndObserve(sceneB, playBtn, `canvas-${voice.voiceType}-play`, voice.primaryUrl);
      const paramsDuring = await page.evaluate(() => window.__qa3058.params());
      check(sceneB, JSON.stringify(paramsBefore) === JSON.stringify(paramsDuring),
        `canvas: params unchanged during ${voice.voiceType} preview`, paramsDuring);
      // O4 切换单播：与停止证明同一有界窗——旧实例逐样本 paused=true ∧
      // currentTime=0、无复活；新实例窗内持续推进且为唯一非暂停实例。
      const switchT0B = Date.now();
      const switchWinB = await sampleWindow(inst);
      const switchLedgerB = await audio();
      const switchVerdictB = evaluateSwitched(switchWinB, switchLedgerB, previousInst, inst, switchT0B);
      assert.equal(switchVerdictB.switched, true,
        `canvas: switch to ${voice.voiceType} must hold for the full bounded window, got reasons ${(switchVerdictB.reasons ?? []).join(',') || 'none'}`);
      check(sceneB, switchVerdictB.switched === true,
        `canvas: old voice stopped and only ${voice.voiceType} advances during switch window`,
        { prev: previousInst, inst, reasons: switchVerdictB.reasons, spanMs: switchVerdictB.spanMs });
      sceneB.evidence = sceneB.evidence ?? {};
      sceneB.evidence[`switch-${voice.voiceType}`] = {
        spanMs: switchVerdictB.spanMs, firstT: switchVerdictB.firstT,
        lastT: switchVerdictB.lastT, samples: switchVerdictB.samples,
        newIncrements: switchVerdictB.newIncrements };
      previousInst = inst;
    }
    await shot(sceneB, 'dialog-playing');
    // 播放中直接关闭弹窗：真实 Escape → CustomModal onClose → stopPlayback。
    // 同一 predicate：旧实例 actual paused=true、归零、观察窗不推进不复活、无残留。
    const closeVerdict = await stopBy(sceneB, 'canvas-close-while-playing', previousInst, async () => {
      await page.keyboard.press('Escape');
      await waitDialogClosed();
    });
    assert.equal(closeVerdict.stopped, true,
      `canvas: close-while-playing stopped proof must be fully green, got reasons ${(closeVerdict.reasons ?? []).join(',') || 'none'}`);
    await shot(sceneB, 'dialog-closed-playing-stopped');
    // 未验证行：真实搜索 → 行在册、无播放键 → 点击行真实写回 voice_type 并关闭
    for (const u of config.unverifiedVoices) {
      await openVoiceDialog();
      await fillVoiceSearch(u.name);
      const row = optionRow(u.voiceType);
      await page.waitForSelector(row, { state: 'visible', timeout: 8000 });
      const hasPlayKey = await page.evaluate(
        (vt) => !!document.querySelector(`[role="option"][data-voice-type="${vt}"] button`),
        u.voiceType);
      assert.equal(hasPlayKey, false,
        `canvas: unverified ${u.voiceType} must not render a play key`);
      await page.click(row, { label: `选中未验证音色 ${u.name}`, timeout: 6000 });
      await waitDialogClosed();
      const paramsAfter = await page.evaluate(() => window.__qa3058.params());
      const voice = paramsAfter?.[0]?.params?.voice;
      assert.equal(voice, u.voiceType,
        `canvas: selecting ${u.voiceType} must write the exact voice_type, got ${voice}`);
      check(sceneB, typeof voice === 'string' && voice.length > 0 && !voice.startsWith('http'),
        `canvas: ${u.voiceType} select writes voice_type`, { voice });
      sceneB.actions.push(`unverified-select:${u.voiceType}`);
    }
    // 已验证行同样按 voice_type 写回（非 URL/resource_id）
    const pick = config.voices[0];
    await openVoiceDialog();
    await fillVoiceSearch(pick.name);
    await page.waitForSelector(optionRow(pick.voiceType), { state: 'visible', timeout: 8000 });
    await page.click(optionRow(pick.voiceType), { label: `选中已验证音色 ${pick.name}`, timeout: 6000 });
    await waitDialogClosed();
    const paramsPicked = await page.evaluate(() => window.__qa3058.params());
    assert.equal(paramsPicked?.[0]?.params?.voice, pick.voiceType,
      `canvas: verified select writes exact voice_type ${pick.voiceType}, got ${paramsPicked?.[0]?.params?.voice}`);
    assert.equal(paramsPicked?.[0]?.params?.model, 'seed-audio-1.0',
      `canvas: model param must stay seed-audio-1.0, got ${paramsPicked?.[0]?.params?.model}`);
    check(sceneB, !String(paramsPicked?.[0]?.params?.voice ?? '').startsWith('http'),
      'canvas: voice param is never a URL', paramsPicked?.[0]?.params);
    const regFinal = await registry();
    assert.ok(Array.isArray(regFinal), 'canvas: audio registry must be readable after final select close');
    const nonPausedFinal = nonPausedIds(regFinal);
    assert.equal(nonPausedFinal.length, 0,
      `canvas: zero non-paused audio after final dialog close, got ${nonPausedFinal.join(',') || 'none'}`);
    check(sceneB, nonPausedFinal.length === 0, 'canvas: no non-paused audio after dialog close', { nonPausedFinal });
    await shot(sceneB, 'dialog-closed');
    sceneB.status = 'PASS_COMPONENT_JOURNEY';
  } catch (error) {
    sceneB.status = /ENVIRONMENT|CONTROL/i.test(String(error)) ? 'BLOCKED' : 'FAILED';
    sceneB.error = String(error.stack ?? error);
    await shot(sceneB, 'failure');
    await failureEvidence(sceneB);
    assert.equal(sceneB.snapshots.length > 0, true, 'ENVIRONMENT: canvas failure must retain snapshot');
    if (/user.control|executionStopped|mayHaveLateEffects|policy|permission|unassigned|inactive/i.test(sceneB.error)) throw error;
  }

  // ── 场景 N1：REAL_NEGATIVE_CONTINUED_PLAY（PM 接缝 N1，独立标注负例）──────
  // 测试范围故障注入：仅对「本实例」暂停调用与 src 清理做暂阻（pause()→noop、
  // src 写→noop），不改产品源码、不改整个 Audio/profile、不 mock Audio 正向、
  // 不伪造 timeupdate。UI 真实 Escape 关闭声称已停后，旧实例仍 paused=false、
  // 时间推进 ⇒ 共享 predicate 必须给出 stopped === false（行为门红）。
  // 负例结束后原地恢复本实例的 native pause/src 并真正停止，避免残留。
  const sceneN1 = { kind: 'n1-continued-play-negative', status: 'RUNNING', assertions: [], actions: [], screenshots: [], snapshots: [] };
  report.scenes.push(sceneN1);
  try {
    assert.equal(sceneB.status, 'PASS_COMPONENT_JOURNEY',
      'N1_DEPENDENCY: canvas positive journey must be green before running the N1 continued-play negative');
    await openVoiceDialog();
    const n1Voice = config.voices[0];
    await fillVoiceSearch(n1Voice.name);
    const n1Row = optionRow(n1Voice.voiceType);
    await page.waitForSelector(n1Row, { state: 'visible', timeout: 8000 });
    const n1PlayBtn = `${n1Row} button.wf-voice-picker__preview`;
    await page.waitForSelector(n1PlayBtn, { state: 'visible', timeout: 8000 });
    const n1Inst = await playAndObserve(sceneN1, n1PlayBtn, `n1-${n1Voice.voiceType}-play`, n1Voice.primaryUrl);
    check(sceneN1, typeof n1Inst === 'number' && n1Inst > 0,
      'n1: target real audio instance is playing before fault injection', { n1Inst });
    // 故障注入（仅本实例）：暂阻 pause() 调用与 src 清理。返回值标记注入边界。
    const injected = await page.evaluate((id) => {
      const el = window.__qa3058Audio?.element?.(id);
      if (!el) return { injected: false, reason: 'instance-not-in-registry' };
      el.__qa3058N1Faulted = true;
      el.pause = () => { window.__qa3058Audio.events.push({ id, kind: 'n1:pause-blocked', src: el.currentSrc || el.src || '', detail: null, t: Date.now() }); };
      Object.defineProperty(el, 'src', {
        configurable: true,
        get() { return el.__qa3058N1SrcBlocked ?? ''; },
        set(v) { el.__qa3058N1SrcBlocked = String(v ?? ''); },
      });
      return { injected: true, fault: 'pause-blocked+src-clear-blocked', scope: 'single-instance', id };
    }, n1Inst);
    assert.equal(injected.injected, true,
      `N1_FAULT: test-scoped pause/src-clear fault must install on instance ${n1Inst}, got ${injected.reason ?? injected.fault}`);
    assert.equal(injected.scope, 'single-instance',
      'N1_FAULT: fault injection must be scoped to the single target instance, not product or profile');
    // 真实 UI 关闭动作（UI 声称停止/已关闭）。
    const n1ActionT0 = Date.now();
    await page.keyboard.press('Escape');
    await waitDialogClosed();
    const n1Win = await sampleWindow(n1Inst);
    const n1Ledger = await audio();
    const n1Verdict = evaluateStopped(n1Win, n1Ledger, n1Inst, n1ActionT0);
    // 负例必须红：严格断言 stopped === false（不能 catch false→true，
    // 不能把 unknown 当成通过；unknown 在此断言下同样落红）。
    assert.equal(n1Verdict.stopped, false,
      `N1_EXPECTED_RED: continued-play must be rejected by the stopped predicate, got ${String(n1Verdict.stopped)} reasons ${(n1Verdict.reasons ?? []).join(',') || 'none'}`);
    // 负例有效性：旧实例确实持续播放——actual paused=false 且时间至少两次递增。
    const n1Times = (n1Verdict.times ?? []).filter((v) => Number.isFinite(v));
    const n1Increments = n1Times.filter((v, k) => k > 0 && v > n1Times[k - 1]).length;
    const n1Last = n1Win.samples?.at(-1)?.states?.find((i) => i.id === n1Inst);
    assert.equal(n1Last?.paused, false,
      `N1_VALIDITY: faulted instance must stay paused=false after UI claims stopped, got ${n1Last?.paused}`);
    assert.equal(n1Increments >= 2, true,
      `N1_VALIDITY: faulted instance currentTime must advance at least twice, got ${n1Increments} increments in ${JSON.stringify(n1Times)}`);
    // N1 完整负窗证据：n1Verdict 已含 times/samples/spanMs/firstT/lastT/
    // actionT0/diagnostics/reasons——整体落盘与进 check 详情，绝不截短。
    sceneN1.evidence = { ...(sceneN1.evidence ?? {}), n1NegativeWindow: n1Verdict };
    await save('n1-negative-window.json', n1Verdict);
    check(sceneN1, n1Verdict.stopped === false && n1Increments >= 2 && n1Last?.paused === false,
      'n1: gate correctly red on real continued play', n1Verdict);
    await shot(sceneN1, 'expected-red-continued-play');
    // 负例收尾：恢复本实例 native pause/src 并真正停止，避免残留进入下一页。
    const restored = await page.evaluate((id) => {
      const el = window.__qa3058Audio?.element?.(id);
      if (!el || el.__qa3058N1Faulted !== true) return { restored: false, reason: 'fault-marker-missing' };
      delete el.pause; // 移除注入 noop，落回 HTMLMediaElement.prototype.pause
      delete el.src;   // 移除注入 accessor，落回原生 src 属性
      el.pause();
      el.src = '';
      return { restored: true, id, paused: el.paused, currentTime: el.currentTime };
    }, n1Inst);
    assert.equal(restored.restored, true,
      `N1_CLEANUP: must restore native pause/src on instance ${n1Inst}, got ${restored.reason ?? 'ok'}`);
    // 恢复后的真实停止再走同一 predicate，证明本实例已真实暂停且无残留。
    const n1CleanupVerdict = await proofStopped(sceneN1, 'n1-cleanup-stop', n1Inst, Date.now());
    assert.equal(n1CleanupVerdict.stopped, true,
      `N1_CLEANUP: restored instance must satisfy the same stopped predicate, reasons ${(n1CleanupVerdict.reasons ?? []).join(',') || 'none'}`);
    sceneN1.actions.push('fault-inject:pause+src-clear:single-instance', 'escape-close:expected-red', 'restore+cleanup:green');
    sceneN1.status = 'PASS_NEGATIVE_GATE_RED';
  } catch (error) {
    sceneN1.status = /ENVIRONMENT|CONTROL|N1_DEPENDENCY/i.test(String(error)) ? 'BLOCKED' : 'FAILED';
    sceneN1.error = String(error.stack ?? error);
    await shot(sceneN1, 'failure');
    await failureEvidence(sceneN1);
    assert.equal(sceneN1.snapshots.length > 0, true, 'ENVIRONMENT: n1 failure must retain snapshot');
    // 尽力恢复：注入失败或中途红时若故障已装，尝试还原本实例，避免残留。
    try {
      await page.evaluate(() => {
        const reg = window.__qa3058Audio;
        if (!reg?.element) return;
        for (const entry of reg.registry()) {
          const el = reg.element(entry.id);
          if (el && el.__qa3058N1Faulted === true) {
            try { delete el.pause; delete el.src; el.pause(); el.src = ''; } catch {}
          }
        }
      });
    } catch {}
    if (/user.control|executionStopped|mayHaveLateEffects|policy|permission|unassigned|inactive/i.test(sceneN1.error)) throw error;
  }

  // 全程不得出现生成/TTS/R2/会话提交请求
  report.mediaRequests = safeEvents(await page.events());
  assert.equal(report.mediaRequests.some((e) => e.method.endsWith('ExtraInfo')), false,
    'ENVIRONMENT: retained browser events must omit cookie/header extra info');
  report.audioLedger = await audio().catch(() => null);
  await save('browser-report.json', report);
  return report;
}

/**
 * --build-only 前置构建：同一份 assembleQaPages + 同一 startTransport，
 * 纯离线（无浏览器、无 space、无 FROZEN 门禁）。exit 0 即「两个 bundle
 * 完整构建成功且 transport 页面实际引用并送出 CSS 产物」。
 */
async function runBuildOnly() {
  const evidenceDir = join(scratch, 'build-only');
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(join(evidenceDir, 'library'), { recursive: true });
  const receipt = { evidenceDir, probes: [], errors: [] };
  const { buildModelCatalog } = await import(join(hubPlugin, 'src/catalog/list.js'));
  const catalog = buildModelCatalog({ env: {} });
  const { pages, bundles, bundleSha, themeCss, themeScript, themePreference, themeCssPath } =
    await assembleQaPages(evidenceDir, catalog);
  receipt.bundleSha = bundleSha;
  receipt.theme = { source: themeBundlePath(), preference: themePreference,
    cssRoute: themeCssPath, cssSha: sha(themeCss), bootSha: sha(themeScript) };
  assert.equal(Object.keys(pages).length, 2, 'ENVIRONMENT: exactly two QA pages expected');
  assert.equal(themeCssPath in bundles, true,
    'ENVIRONMENT: official theme css must be a real static route');
  assert.equal(bundles[themeCssPath].body.includes('--dsw-alias-bg-base'), true,
    'ENVIRONMENT: official theme route must carry real dsw-alias tokens');
  const { dispatcher } = await createProductionDispatcher(join(evidenceDir, 'library'));
  const server = startTransport({ dispatcher, pages, bundles, mediaOrigins: [], requests: receipt.probes, themeScript });
  try {
    await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const cssRoutes = Object.keys(bundles).filter((p) => p.endsWith('.css'));
    assert.equal(cssRoutes.length >= 1, true,
      'ENVIRONMENT: at least one real css artifact must be served');
    for (const pagePath of Object.keys(pages)) {
      const pageRes = await fetch(`${origin}${pagePath}`);
      const pageText = await pageRes.text();
      assert.equal(pageRes.status, 200, `ENVIRONMENT: ${pagePath} must serve 200`);
      assert.equal(pageText, pages[pagePath],
        `ENVIRONMENT: ${pagePath} served bytes must equal the assembled html`);
      const hrefs = [...pageText.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
      for (const href of hrefs) {
        assert.equal(href in bundles, true,
          `ENVIRONMENT: ${pagePath} references ${href} which is not a static route`);
      }
    }
    for (const cssPath of cssRoutes) {
      const cssRes = await fetch(`${origin}${cssPath}`);
      const cssText = await cssRes.text();
      assert.equal(cssRes.status, 200, `ENVIRONMENT: ${cssPath} must serve 200`);
      assert.equal((cssRes.headers.get('content-type') ?? '').startsWith('text/css'), true,
        `ENVIRONMENT: ${cssPath} must serve text/css, got ${cssRes.headers.get('content-type')}`);
      assert.equal(cssText, bundles[cssPath].body,
        `ENVIRONMENT: ${cssPath} served bytes must equal the emitted artifact`);
      assert.equal(cssText.trim().length > 0, true,
        `ENVIRONMENT: ${cssPath} artifact must be non-empty`);
    }
    const requests = receipt.probes.map((r) => `${r.method} ${r.url}`);
    const expected = [...Object.keys(pages), ...cssRoutes].map((p) => `GET ${p}`);
    assert.deepEqual(requests.sort(), expected.sort(),
      'ENVIRONMENT: transport probes must only touch page and css routes');
    receipt.status = 'BUILD_ONLY_OK';
  } finally {
    server.closeAllConnections();
    await new Promise((res, rej) => server.close((e) => (e ? rej(e) : res())));
    await writeFile(join(evidenceDir, 'build-only-receipt.json'), JSON.stringify(receipt, null, 2));
  }
  console.log(`QA3058_BUILD_ONLY_OK evidence=${evidenceDir}`);
}

// --build-only：前置构建入口，不注册 node:test、不需要授权/space/浏览器。
// 仅修测试环境（本 runner），正式浏览器验收仍由 QA 按既有门禁执行。
const BUILD_ONLY = process.argv.includes('--build-only');
if (BUILD_ONLY) {
  await runBuildOnly();
} else {
test('Issue #3058 真实浏览器试听旅程（QA 授权后运行）', async (t) => {
  assert.equal(process.env.QA_3058_SOURCE_FROZEN, '1',
    'ENVIRONMENT: principal must freeze sources before this authorized run');
  await mkdir(scratch, { recursive: true });
  const runId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  const evidenceDir = join(scratch, runId);
  await mkdir(evidenceDir, { recursive: true });
  const libraryDir = join(evidenceDir, 'library');
  await mkdir(libraryDir, { recursive: true });
  const run = { runId, root, requests: [], serverClosed: false, evidenceLevel: 'REAL_COMPONENT_REAL_CATALOG_REAL_MEDIA' };
  let server;
  try {
    run.head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    run.dirtyPaths = execFileSync('git', ['-C', root, 'status', '--short'], { encoding: 'utf8' });

    // 生产 Catalog：hub buildModelCatalog 真实输出（画布侧）与包内 catalog 目录（资产侧）
    const { buildModelCatalog } = await import(join(hubPlugin, 'src/catalog/list.js'));
    const catalog = buildModelCatalog({ env: {} });
    await writeFile(join(evidenceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    run.catalogFingerprint = catalog.fingerprint;

    const { dispatcher, cloud, library } = await createProductionDispatcher(libraryDir);
    const { catalogShelves } = await import(join(assetsPlugin, 'src/cloud-catalog.js'));
    assert.equal(typeof catalogShelves, 'function', 'INTERFACE: production catalogShelves export missing');
    const index = JSON.parse(await readFile(join(assetsPlugin, 'cloud-catalog/index.json'), 'utf8'));
    const voiceover = index.filter((row) => row.category === 'audio' && catalogShelves(row).includes('voiceover'));
    // 真实契约：身份在 row.meta.voice_type，preview DTO 在 row.meta.preview；
    // 每行 voiceover 必须携带稳定 voice_type 与 purpose=official-voice-preview。
    const verified = voiceover.filter((row) => row.meta?.preview?.state === 'verified-file');
    run.voiceCount = { total: voiceover.length, verified: verified.length, unverified: voiceover.length - verified.length };
    assert.ok(voiceover.length > 0, 'ENVIRONMENT: real catalog has no voiceover rows');
    assert.equal(voiceover.length, 509, 'INTERFACE: first-slice catalog must expose 509 voiceover rows');
    assert.equal(verified.length, 124, 'INTERFACE: first approved slice is exactly 124 verified-file voices');
    assert.equal(voiceover.length - verified.length, 385,
      'INTERFACE: remaining voiceover rows must stay unverified (never silently upgraded)');
    for (const row of voiceover) {
      assert.equal(typeof row.meta?.voice_type, 'string',
        `INTERFACE: voiceover row ${row.id} missing meta.voice_type`);
      assert.ok(row.meta.voice_type.length > 0,
        `INTERFACE: voiceover row ${row.id} empty meta.voice_type`);
      assert.equal(row.meta?.preview?.purpose, 'official-voice-preview',
        `INTERFACE: voiceover row ${row.id} preview purpose contract`);
      assert.ok(['verified-file', 'unverified'].includes(row.meta?.preview?.state),
        `INTERFACE: voiceover row ${row.id} unexpected preview state ${row.meta?.preview?.state}`);
    }
    for (const row of verified) {
      assert.ok(typeof row.meta?.preview?.primary_url === 'string' && row.meta.preview.primary_url.startsWith('https://'),
        `INTERFACE: verified row ${row.id} must carry official https primary_url`);
    }
    // 正向媒体白名单：只放行 catalog 中 verified preview URL 的 origin
    const mediaOrigins = [...new Set(verified
      .flatMap((row) => [row.meta?.preview?.primary_url, ...(row.meta?.preview?.candidates ?? [])])
      .filter(Boolean)
      .map((u) => { try { return new URL(u).origin; } catch { return null; } })
      .filter(Boolean))];
    assert.ok(mediaOrigins.length > 0, 'ENVIRONMENT: no verified official media origin');
    run.mediaOrigins = mediaOrigins;

    // 代表音色身份核对（不猜补）：meta.voice_type 是资产与画布共用身份
    for (const v of VOICES) {
      const row = voiceover.find((r) => r.meta?.voice_type === v.voiceType);
      assert.ok(row, `INTERFACE: catalog missing ${v.voiceType}`);
      assert.equal(row.meta?.preview?.state, 'verified-file', `INTERFACE: ${v.voiceType} not verified-file`);
      assert.equal(row.name, v.name, `INTERFACE: ${v.voiceType} display name drift: ${row.name}`);
    }
    // 未验证代表：名录在册、preview.state 明确 unverified、绝不升格为可播
    for (const u of UNVERIFIED_VOICES) {
      const row = voiceover.find((r) => r.meta?.voice_type === u.voiceType);
      assert.ok(row, `INTERFACE: catalog missing unverified ${u.voiceType}`);
      assert.equal(row.meta?.preview?.state, 'unverified',
        `INTERFACE: ${u.voiceType} must stay unverified, got ${row.meta?.preview?.state}`);
    }

    const { pages, bundles, bundleSha, assets, canvas, themeCss, themeScript, themePreference } =
      await assembleQaPages(evidenceDir, catalog);
    run.bundleSha = bundleSha;
    run.theme = { source: themeBundlePath(), preference: themePreference, cssSha: sha(themeCss) };
    assert.equal(typeof pages['/assets'], 'string', 'ENVIRONMENT: /assets page missing');
    assert.equal(typeof themeScript === 'string' && themeScript.length > 0, true,
      'ENVIRONMENT: official theme boot script must be assembled for the authorized run');
    // 冻结面真实哈希：对两份 bundle metafile 登记的全部输入文件逐一 sha256，
    // 浏览器旅程前后各采一次并逐条强断言一致（不再只留产物级 bundleSha）。
    const hashInputs = async (phase) => {
      const hashes = {};
      let unreadable = 0;
      const generatedInputs = { assets: assetsEntrySource(), canvas: canvasEntrySource(catalog) };
      for (const [bundle, built, baseDir] of [
        ['assets', assets, assetsPlugin], ['canvas', canvas, workflowPlugin],
      ]) {
        for (const input of Object.keys(built.metafile?.inputs ?? {})) {
          // esbuild stdin is generated by these same entry builders, not a disk file.
          if (input === '<stdin>') {
            assert.equal(Buffer.byteLength(generatedInputs[bundle]), built.metafile.inputs[input].bytes,
              `ENVIRONMENT: ${phase} ${bundle} generated entry bytes must match the actual esbuild input`);
            hashes[`${bundle}:${input}`] = sha(generatedInputs[bundle]);
            continue;
          }
          const abs = input.startsWith('/') ? input : resolve(baseDir, input);
          try { hashes[`${bundle}:${input}`] = sha(await readFile(abs)); }
          catch { unreadable += 1; }
        }
      }
      assert.equal(unreadable, 0,
        `ENVIRONMENT: ${phase} source inputs must all be readable, got ${unreadable} unreadable`);
      return hashes;
    };
    const sourceBefore = await hashInputs('before');
    await writeFile(join(evidenceDir, 'source-before.json'), JSON.stringify(sourceBefore, null, 2));
    run.sourceInputs = Object.keys(sourceBefore).length;
    server = startTransport({ dispatcher, pages, bundles, mediaOrigins, requests: run.requests, themeScript });
    assert.equal(typeof run.theme?.cssSha === 'string' && run.theme.cssSha.length === 64, true,
      'ENVIRONMENT: theme css sha256 must be recorded for the authorized run');
    await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
    run.origin = `http://127.0.0.1:${server.address().port}`;

    const config = {
      runId, evidenceDir, spaceFile, origin: run.origin,
      spaceId: process.env.QA_3058_SPACE_ID ? Number(process.env.QA_3058_SPACE_ID) : undefined,
      // 三个代表音色与未验证代表携真实 catalog primary_url 进入浏览器旅程：
      // play() 源必须等于官方 primary_url，双端同一份样音。
      voices: VOICES.map((v) => ({
        ...v,
        primaryUrl: voiceover.find((r) => r.meta?.voice_type === v.voiceType)?.meta?.preview?.primary_url,
      })),
      unverifiedVoices: UNVERIFIED_VOICES.map((u) => ({ ...u })),
    };
    for (const v of config.voices) {
      assert.equal(typeof v.primaryUrl, 'string',
        `INTERFACE: ${v.voiceType} primary_url must be a string URL`);
      assert.equal(v.primaryUrl.startsWith('https://'), true,
        `INTERFACE: ${v.voiceType} primary_url must reach the journey as https`);
    }
    assert.equal(config.voices.length, 3, 'INTERFACE: journey carries exactly three verified voices');
    assert.equal(config.unverifiedVoices.length, 3, 'INTERFACE: journey carries exactly three unverified voices');
    const ego = await runEgo(`const drive = ${browserJourney.toString()};\nawait drive(${JSON.stringify(config)});`, evidenceDir);
    run.egoExit = ego.exitCode;
    const report = JSON.parse(await readFile(join(evidenceDir, 'browser-report.json'), 'utf8'));
    run.spaceId = report.spaceId;
    run.scenes = report.scenes.map((s) => ({ kind: s.kind, status: s.status }));

    // 后置冻结面比对：浏览器旅程不得改动任何参与构建的源文件。
    const sourceAfter = await hashInputs('after');
    await writeFile(join(evidenceDir, 'source-after.json'), JSON.stringify(sourceAfter, null, 2));
    const drifted = Object.keys(sourceBefore).filter((k) => sourceBefore[k] !== sourceAfter[k]);
    assert.equal(drifted.length, 0,
      `ENVIRONMENT: source inputs drifted during browser run: ${drifted.slice(0, 5).join(', ')}`);
    run.sourceFreeze = { inputs: Object.keys(sourceBefore).length, drifted: 0 };

    // 提交类请求边界：除 GET 页面/目录/媒体外不得有生成/上传/会话写
    const submitted = run.requests.filter((r) => r.method !== 'GET');
    run.nonGetRequests = submitted;
    for (const r of submitted) {
      assert.ok(r.url.startsWith('/omnimux/assets'),
        `boundary: non-GET outside assets prefix rejected: ${r.method} ${r.url}`);
    }
    const sceneA = report.scenes.find((s) => s.kind === 'assets');
    const sceneB = report.scenes.find((s) => s.kind === 'canvas');
    const sceneN1 = report.scenes.find((s) => s.kind === 'n1-continued-play-negative');
    assert.ok(sceneA && sceneA.status === 'PASS_COMPONENT_JOURNEY',
      sceneA?.error ?? 'assets journey not executed');
    assert.ok(sceneB && sceneB.status === 'PASS_COMPONENT_JOURNEY',
      sceneB?.error ?? 'canvas journey not executed');
    // N1 是 PM 接缝负例，必须显式检查其负门判定：不得出现「A/B 绿而 N1
    // 失败」时测试假绿——PASS_NEGATIVE_GATE_RED 才是它的唯一合法终态。
    assert.equal(sceneN1?.status, 'PASS_NEGATIVE_GATE_RED',
      sceneN1?.error ?? 'N1 negative gate scene not executed or not red-by-design');
    // 详情生命周期并入正式外层 AND：sceneA.assertions 中 detail 条目
    // ≥8 条且全部 ok，且必须包含两个具体停止证明码与卸载动作码。
    const detailAssertions = (sceneA.assertions ?? []).filter((a) =>
      typeof a.name === 'string' && (a.name.startsWith('detail:') || a.name.startsWith('detail-')
        || a.name === 'local-source-unmount-stops-card: stopped proof'));
    assert.equal(detailAssertions.length >= 8 && detailAssertions.every((a) => a.ok === true), true,
      `OUTER: detail lifecycle guards must all be green, got ${detailAssertions.filter((a) => !a.ok).map((a) => a.name).join(',') || 'none'} failing`);
    for (const required of [
      'detail-open-stops-card: stopped proof',
      'detail-close-stops-native: stopped proof',
      'local-source-unmount-stops-card: stopped proof',
    ]) {
      assert.equal(detailAssertions.some((a) => a.name === required && a.ok === true), true,
        `OUTER: required stop proof "${required}" must exist and be green in sceneA assertions`);
    }
    assert.equal((sceneA.actions ?? []).includes('detail-lifecycle:open-detail,focus-space-play,close-stop,local-unmount'), true,
      'OUTER: detail lifecycle action code must be recorded in sceneA actions');
    assert.equal(ego.exitCode, 0, 'browser command preserves original nonzero on RED');
  } catch (error) {
    run.error = String(error.stack ?? error);
    // 选择器解析类错误单独归类，不再混入 FUNCTIONAL_RED
    //（round3 的 text=声音 歧义属定位器失败，不是业务功能失败）。
    assert.equal(typeof run.error, 'string', 'ENVIRONMENT: failure must retain error stack text');
    run.classification = /ENVIRONMENT:/.test(run.error) ? 'ENVIRONMENT_RED'
      : /INTERFACE:/.test(run.error) ? 'INTERFACE_RED'
      : /ElementResolutionError|strict mode violation/i.test(run.error) ? 'SELECTOR_RED'
      : 'FUNCTIONAL_RED';
    throw error;
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((res, rej) => server.close((e) => (e ? rej(e) : res())));
      run.serverClosed = !server.listening;
    }
    run.finishedAt = new Date().toISOString();
    await writeFile(join(evidenceDir, 'run.json'), JSON.stringify(run, null, 2));
    await writeFile(join(scratch, 'latest-run.json'),
      JSON.stringify({ runId, evidenceDir, spaceId: run.spaceId, classification: run.classification, egoExit: run.egoExit }, null, 2));
    console.log(`QA3058_BROWSER_EVIDENCE=${evidenceDir}`);
  }
});
}
assert.equal(typeof BUILD_ONLY, 'boolean', 'ENVIRONMENT: build-only flag must parse as boolean');
