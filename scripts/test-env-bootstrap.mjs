import * as fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { readDevDeepSeekCredential, readDevCredentialsBundle } from './test-env-credentials.mjs';

const EXECUTABLE = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
const WRAPPER = '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/lib/desktop-cli.js';
const OFFICIAL_ENDPOINT = 'https://api.deepseek.com';
const SYNTHETIC_KEY = 'QA-SYNTHETIC-NOT-A-REAL-KEY';
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = sourceRoot.split(`${sep}.worktrees${sep}`)[0];
const failure = code => Object.assign(new Error('TEST_ENV_' + code), { code: 'TEST_ENV_' + code });
function safeError(error, fallback) {
  const code = error?.code;
  if (typeof code === 'string' && /^TEST_ENV_(?:CREDENTIAL_)?[A-Z_]+$/.test(code)) {
    // 保留可读说明与精确原因：脱敏只针对底层原文，不能把面向调用者的提示一并丢掉。
    return Object.assign(new Error(code), { code, hint: error.hint, rootReason: error.rootReason });
  }
  return failure(fallback);
}
function canonical(io, path, directory) {
  const stat = io.lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || io.realpathSync(path) !== path) throw failure('ROOT_UNSAFE');
}

/** 位置不合规时的可读说明：只说下一步该做什么，不含凭据或敏感信息。 */
const ROOT_HINTS = {
  'not-absolute-or-unnormalized': '请传入已规范化的绝对路径：不要带尾部斜杠、不要包含 . 或 .. 段。',
  'outside-worktrees': '任务工作树必须是 <仓库根>/.worktrees/<任务名> 的直接子级。仓库外的兄弟目录（如 product/omnimux-dsh-wt-*）不受支持：请用 `bash scripts/worktree.sh new <任务名> origin/main` 在本仓 .worktrees/ 下建树；已有树可用 `git worktree move <当前路径> <仓库根>/.worktrees/<任务名>` 迁入。',
  'path-missing': '该路径不存在或不可访问。请确认工作树已创建，并核对路径拼写。',
  'path-through-symlink': '该路径本身或其上级目录是符号链接。请传入真实路径（realpath 结果），不要经快捷方式。',
  'not-a-git-worktree': '该目录不是 Git 工作树（缺少 .git 文件）。残留空壳目录不满足条件：请用 `bash scripts/worktree.sh new <任务名> origin/main` 重新创建。',
  'gitlink-shape-unsupported': '该目录的 .git 是目录而不是文件，形态不受支持。请改用 `bash scripts/worktree.sh new <任务名> origin/main` 创建的标准工作树。',
  'registry-mismatch': '该目录的 .git 内容未指向 <仓库根>/.git/worktrees/<任务名>。请用标准入口重建，或检查 .git 文件是否被改写。',
  'registry-missing': 'Git 注册目录不存在或不完整（缺 commondir / gitdir）。请用 `bash scripts/worktree.sh new <任务名> origin/main` 重建该工作树。',
};
function unsafe(reason) {
  return {
    ok: false,
    reason,
    code: 'TEST_ENV_ROOT_UNSAFE',
    hint: ROOT_HINTS[reason] ?? '位置不合规，请使用 <仓库根>/.worktrees/<任务名> 下的标准工作树。',
  };
}
/** 读取路径身份：缺失返回 null，符号链接或 realpath 不一致返回 'symlink'。 */
function pathShape(io, path) {
  let stat;
  try { stat = io.lstatSync(path); } catch { return null; }
  if (stat.isSymbolicLink()) return 'symlink';
  let real;
  try { real = io.realpathSync(path); } catch { return null; }
  if (real !== path) return 'symlink';
  if (stat.isDirectory()) return 'directory';
  if (stat.isFile()) return 'file';
  return 'other';
}

/**
 * 诊断位置为何不合规，返回具体原因而非笼统错误码。
 * 判定分层：先判路径形状（前缀仓库、root 自身），再判 git 身份，最后判注册内容。
 * 该顺序保证「残留空壳目录」报 not-a-git-worktree 而非被前缀检查掩盖成 path-missing。
 * 语义与既有 validateRoot 等价，不放宽任何约束。
 * @param {unknown} root @param {*} io @param {string} repo
 * @returns {{ok:true, reason:'ok'} | {ok:false, reason:string, code:string, hint:string}}
 */
export function diagnoseWorktreeRoot(root, io, repo) {
  if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) !== root) return unsafe('not-absolute-or-unnormalized');
  if (dirname(root) !== join(repo, '.worktrees')) return unsafe('outside-worktrees');
  // 建树基础设施：仓库根、.worktrees、.git 必须存在且形态正常。
  for (const path of [repo, join(repo, '.worktrees'), join(repo, '.git')]) {
    const shape = pathShape(io, path);
    if (shape === 'symlink') return unsafe('path-through-symlink');
    if (shape !== 'directory') return unsafe('path-missing');
  }
  const rootShape = pathShape(io, root);
  if (rootShape === 'symlink') return unsafe('path-through-symlink');
  if (rootShape === null) return unsafe('path-missing');
  if (rootShape !== 'directory') return unsafe('path-missing');
  const dotgit = join(root, '.git');
  const dotgitShape = pathShape(io, dotgit);
  if (dotgitShape === 'symlink') return unsafe('path-through-symlink');
  if (dotgitShape === null) return unsafe('not-a-git-worktree');
  if (dotgitShape !== 'file') return unsafe('gitlink-shape-unsupported');
  let match;
  try { match = /^gitdir: (.+)\n?$/.exec(io.readFileSync(dotgit, 'utf8')); } catch { return unsafe('registry-mismatch'); }
  if (!match) return unsafe('registry-mismatch');
  const gitdir = resolve(root, match[1].trim());
  if (dirname(gitdir) !== join(repo, '.git/worktrees')) return unsafe('registry-mismatch');
  // 注册目录属于 Git 注册表而非建树基础设施，缺失时原因归到注册表，约束强度不变。
  if (pathShape(io, join(repo, '.git/worktrees')) !== 'directory') return unsafe('registry-missing');
  if (pathShape(io, gitdir) !== 'directory') return unsafe('registry-missing');
  for (const name of ['commondir', 'gitdir']) {
    if (pathShape(io, join(gitdir, name)) !== 'file') return unsafe('registry-missing');
  }
  let commonRaw, gitdirRaw;
  try {
    commonRaw = io.readFileSync(join(gitdir, 'commondir'), 'utf8');
    gitdirRaw = io.readFileSync(join(gitdir, 'gitdir'), 'utf8');
  } catch { return unsafe('registry-missing'); }
  if (resolve(gitdir, commonRaw.trim()) !== join(repo, '.git') || resolve(gitdir, gitdirRaw.trim()) !== dotgit) return unsafe('registry-mismatch');
  return { ok: true, reason: 'ok' };
}

/** Validate the linked-worktree metadata without consulting cwd or inherited Git variables. */
function validateRoot(root, io, repo) {
  const diagnosis = diagnoseWorktreeRoot(root, io, repo);
  // 错误码保持稳定（既有断言与调用方依赖它），另附可读说明与精确原因。
  if (!diagnosis.ok) throw Object.assign(failure('ROOT_UNSAFE'), { hint: diagnosis.hint, rootReason: diagnosis.reason });
  return root;
}

/** Local-only protocol double; never forwards requests or echoes submitted content. */
async function startMock() {
  const server = createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.url !== '/chat/completions') return reply(404, { error: { message: 'QA模拟：路径不支持' } });
    if (req.method !== 'POST') return reply(405, { error: { message: 'QA模拟：方法不支持' } });
    let size = 0; const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) return reply(413, { error: { message: 'QA模拟：请求过大' } });
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!input || typeof input !== 'object') return reply(400, { error: { message: 'QA模拟：请求无效' } });
      const content = 'QA模拟：这是本机测试响应，不是真实模型结果。';
      const base = { id: 'qa-local-completion', created: 0, model: 'qa-simulated-deepseek' };
      const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      if (input.stream === true) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
        for (const chunk of [
          { ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] },
          { ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
        ]) res.write('data: ' + JSON.stringify(chunk) + '\n\n');
        res.end('data: [DONE]\n\n');
      } else reply(200, { ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage });
    } catch { if (!res.headersSent) reply(400, { error: { message: 'QA模拟：请求无效' } }); else res.end(); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise((yes, no) => { server.close(error => error ? no(error) : yes()); server.closeAllConnections(); }) };
}
function parseLogin(line) {
  const match = /^dsh web: (\S+)/.exec(line);
  if (!match) return;
  try {
    const url = new URL(match[1]);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || Number(url.port) === 0 || url.username || url.password || url.pathname !== '/' || url.hash || [...url.searchParams.keys()].join(',') !== 'token' || !/^[A-Za-z0-9_-]+$/.test(url.searchParams.get('token') ?? '')) throw failure('UNSAFE_LOGIN_URL');
    return url;
  } catch { throw failure('UNSAFE_LOGIN_URL'); }
}

/** Test-only dependency seam. Overrides never come from CLI flags or process environment.
 * @param {{fs?: typeof fs, repositoryRoot?: string, spawn?: typeof spawn, readCredential?: () => string, signals?: NodeJS.Process, startupTimeoutMs?: number, shutdownTimeoutMs?: number}} [deps]
 */
export function createTestEnvironmentStarter(deps = {}) {
  const io = deps.fs ?? fs;
  const signals = deps.signals ?? process;
  return async function start(options = {}) {
    if (!options || typeof options !== 'object' || Object.keys(options).some(k => !['root', 'mode'].includes(k))) throw failure('OPTIONS');
    const { root, mode = 'ui' } = options;
    if (!['ui', 'onboarding', 'live'].includes(mode)) throw failure('OPTIONS');
    validateRoot(root, io, deps.repositoryRoot ?? repositoryRoot);
    try { io.accessSync(EXECUTABLE, fs.constants.X_OK); } catch { throw failure('RUNTIME_MISSING'); }
    let privateDir, mock, child, exited = false, cleanupPromise, startupReject;
    let releaseOutput = () => {};
    const shutdownMs = deps.shutdownTimeoutMs ?? 5000;
    const waitExit = async milliseconds => {
      if (!child || exited || child.exitCode !== null || child.signalCode !== null) return true;
      return new Promise(yes => {
        const onExit = () => { clearTimeout(timer); yes(true); };
        const timer = setTimeout(() => { child.off('exit', onExit); yes(false); }, milliseconds);
        child.once('exit', onExit);
      });
    };
    const onSignal = () => { startupReject?.(failure('INTERRUPTED')); void cleanup().catch(() => {}); };
    const cleanup = () => cleanupPromise ??= (async () => {
      signals.off('SIGINT', onSignal); signals.off('SIGTERM', onSignal);
      releaseOutput();
      let stopped = true;
      try {
        if (child && !exited && child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM'); stopped = await waitExit(shutdownMs);
          if (!stopped) { child.kill('SIGKILL'); stopped = await waitExit(shutdownMs); }
        }
      } catch { stopped = false; }
      await mock?.close();
      if (!stopped) throw failure('CLEANUP_TIMEOUT');
      if (privateDir) io.rmSync(privateDir, { recursive: true, force: true });
      return { cleaned: true };
    })();
    try {
      // Authorization for live credential access must already cover this task; selecting a mode does not grant it.
      let credential;
      let credentialBundle = null;
      if (mode === 'live') {
        if (deps.readCredential) {
          credential = deps.readCredential();
        } else if (deps.readCredentialsBundle) {
          credentialBundle = deps.readCredentialsBundle();
          credential = credentialBundle?.DEEPSEEK_API_KEY || credentialBundle?.OMNIMUX_API_KEY;
        } else {
          credentialBundle = readDevCredentialsBundle();
          credential = credentialBundle?.DEEPSEEK_API_KEY || credentialBundle?.OMNIMUX_API_KEY;
        }
      }
      if (mode === 'live' && (typeof credential !== 'string' || !credential.trim())) throw failure('CREDENTIAL_INVALID');
      privateDir = io.mkdtempSync(join(root, '.test-env-')); io.chmodSync(privateDir, 0o700);
      const paths = { HOME: 'home', DSH_HOME: 'dsh', DSH_AGENTS_HOME: 'agents', XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state', XDG_DATA_HOME: 'data', TMPDIR: 'tmp', TMP: 'tmp', TEMP: 'tmp' };
      const basePath = io === fs
        ? `${dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
        : '/usr/bin:/bin:/usr/sbin:/sbin';
      const env = { PATH: basePath, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--max-http-header-size=65536' };
      for (const [name, leaf] of Object.entries(paths)) { env[name] = join(privateDir, leaf); io.mkdirSync(env[name], { recursive: true, mode: 0o700 }); }
      if (mode === 'ui') mock = await startMock();
      const endpoint = mode === 'ui' ? mock.origin : OFFICIAL_ENDPOINT;
      if (mode !== 'onboarding') {
        env.DEEPSEEK_API_KEY = mode === 'ui' ? SYNTHETIC_KEY : credential;
        env.DEEPSEEK_BASE_URL = endpoint;
        if (mode === 'live' && credentialBundle) {
          if (credentialBundle.OMNIMUX_API_KEY) {
            env.OMNIMUX_API_KEY = credentialBundle.OMNIMUX_API_KEY;
            env.OMNIMUX_TOKEN = credentialBundle.OMNIMUX_API_KEY;
          }
          if (credentialBundle.CPA_API_KEY) {
            env.CPA_API_KEY = credentialBundle.CPA_API_KEY;
          }
        }
      }
      // JSON is YAML-compatible. The fresh fixed settings layer wins over bundle adapter defaults.
      const initialSettings = {
        'llm-deepseek': { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: endpoint },
      };
      if (mode !== 'onboarding') {
        initialSettings['ui-onboarding'] = { welcomeNoticeVersion: '2026-08-13.1' };
        initialSettings.omnimux = {
          defaultTextModel: 'gemini-3.8-flash',
          defaultVideoModel: 'minimax-h3',
          runtimeAgentId: 'codex',
          runtimeAgentVerified: true,
          runtimeMode: 'agent',
          runtimeAgentModel: '',
        };
      }
      const realUserHome = process.env.HOME || '';
      const devHome = join(realUserHome, '.omnimux-dev');
      if (mode !== 'onboarding') {
        try {
          const devSettingsPath = join(devHome, 'settings.yaml');
          if (io.existsSync(devSettingsPath)) {
            const parsedDoc = parseDocument(io.readFileSync(devSettingsPath, 'utf8'));
            const devSettings = parsedDoc?.toJS?.() || {};
            for (const key of ['locale', 'permission', 'agent-presets', 'dsh-better-sidebar', 'dsh-desktop', 'ui-theme']) {
              if (devSettings[key] !== undefined) initialSettings[key] = devSettings[key];
            }
            if (mode === 'live') {
              for (const key of ['llm-pi-ai', 'agent-default-model']) {
                if (devSettings[key] !== undefined) initialSettings[key] = devSettings[key];
              }
            }
          }
        } catch {}
      }
      io.writeFileSync(join(env.DSH_HOME, 'settings.yaml'), JSON.stringify(initialSettings) + '\n', { mode: 0o600, flag: 'wx' });

      // 预置标准测试工程夹具（自带视频素材节点，解除测试环境空画布造数据死锁）
      // 必须同时写入 storages/workspace.json 账本，否则 UI 无合法 workspace，
      // openWorkbench / 新对话都会因无 sessionId 失败，SessionGuide 永不渲染。
      const fixtureSrc = join(root, 'tests', 'fixtures', 'qa-workspace-media');
      const seededWorkspaceId = 'ws_qa_media';
      let hasSeededFixture = false;
      try {
        if (io.existsSync(fixtureSrc)) {
          const targetWsDir = join(env.DSH_HOME, 'workspaces', seededWorkspaceId);
          io.mkdirSync(targetWsDir, { recursive: true, mode: 0o700 });
          if (typeof io.cpSync === 'function') {
            io.cpSync(fixtureSrc, targetWsDir, { recursive: true });
            const storageDir = join(env.DSH_HOME, 'storages');
            io.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
            const timestamp = new Date().toISOString();
            io.writeFileSync(join(storageDir, 'workspace.json'), JSON.stringify({
              unit: { name: 'workspace', version: 2 },
              global: { initialized: true, workspaceIds: [seededWorkspaceId], archivedSessionIds: [] },
              tables: {
                workspaces: {
                  [seededWorkspaceId]: {
                    path: targetWsDir,
                    title: 'QA Media',
                    sessionIds: [],
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  },
                },
              },
            }) + '\n', { mode: 0o600, flag: 'wx' });
            hasSeededFixture = true;
          }
        }
      } catch {}

      // 检测并挂载本地 OmniMux 完整插件 Profile 与业务测试数据集（若存在）
      const devProfile = join(devHome, 'profiles', 'omnimux');
      let profileName = 'web';
      let pluginsInstalled = false;
      let evidenceLevel = 'core-only';
      let taskPluginsCount = 0;
      let seededDataDomains = [];

      try {
        if (io.existsSync(devProfile) && io.existsSync(join(devProfile, 'package.json')) && io.existsSync(join(devProfile, 'node_modules'))) {
          profileName = 'omnimux';
          pluginsInstalled = true;
          evidenceLevel = 'full';

          // 0. 挂载完整 Dev 业务测试数据集与预设（Copy-on-Write 元数据 + 软链媒体大目录，零污染主环境）
          try {
            if (typeof io.symlinkSync === 'function') {
              try { io.symlinkSync(env.DSH_HOME, join(env.HOME, '.dsh')); } catch {}
              try { io.symlinkSync(env.DSH_HOME, join(env.HOME, '.omnimux')); } catch {}
              try { io.symlinkSync(env.DSH_HOME, join(env.HOME, '.omnimux-dev')); } catch {}
              if (mode === 'live' && io.existsSync(join(devHome, '.credentials.yaml'))) {
                try { io.symlinkSync(join(devHome, '.credentials.yaml'), join(env.DSH_HOME, '.credentials.yaml')); } catch {}
              }
              for (const sharedEntry of ['agent-presets-shipped', '.agent-presets', 'skills', 'omnimux-market', 'omnimux-social-harvest', '.dsh-viewer-asset-key', '.omnimux-video-preview-key']) {
                const srcShared = join(devHome, sharedEntry);
                if (io.existsSync(srcShared)) {
                  try { io.symlinkSync(srcShared, join(env.DSH_HOME, sharedEntry)); } catch {}
                }
              }
            }
            const devOmnimuxData = join(devHome, 'omnimux');
            if (io.existsSync(devOmnimuxData) && typeof io.cpSync === 'function') {
              const targetOmnimuxData = join(env.DSH_HOME, 'omnimux');
              io.mkdirSync(targetOmnimuxData, { recursive: true, mode: 0o700 });
              const HEAVY_MEDIA_DIRS = new Set(['media', 'data', 'artifacts', 'projects', 'rival-accounts', 'exports', 'snapshots']);
              for (const domain of io.readdirSync(devOmnimuxData)) {
                const srcDomain = join(devOmnimuxData, domain);
                const dstDomain = join(targetOmnimuxData, domain);
                try {
                  if (io.lstatSync(srcDomain).isDirectory()) {
                    io.mkdirSync(dstDomain, { recursive: true, mode: 0o700 });
                    for (const sub of io.readdirSync(srcDomain)) {
                      const srcSub = join(srcDomain, sub);
                      const dstSub = join(dstDomain, sub);
                      if (HEAVY_MEDIA_DIRS.has(sub) && typeof io.symlinkSync === 'function') {
                        try { io.symlinkSync(srcSub, dstSub); } catch {}
                      } else {
                        try { io.cpSync(srcSub, dstSub, { recursive: true }); } catch {}
                      }
                    }
                    seededDataDomains.push(domain);
                  }
                } catch {}
              }
            }
          } catch {}

          const omnimuxProfileDir = join(env.DSH_HOME, 'profiles', 'omnimux');
          io.mkdirSync(omnimuxProfileDir, { recursive: true, mode: 0o700 });
          for (const item of io.readdirSync(devProfile)) {
            // package.json 是插件注册表，必须写实体副本而不是软链——否则下面为新插件补注册时
            // 会顺着软链改到 Dev profile 上。
            if (item === 'node_modules' || item === '.materialize-snapshots' || item === 'package.json') continue;
            try {
              io.symlinkSync(join(devProfile, item), join(omnimuxProfileDir, item));
            } catch {}
          }

          // 动态扫描工作树 plugins/* 下的全部 21 个插件（若测试桩返回空则回退核心集合）
          const wtPluginsRoot = join(root, 'plugins');
          const discoveredPlugins = [];
          try {
            if (io.existsSync(wtPluginsRoot)) {
              for (const entry of io.readdirSync(wtPluginsRoot)) {
                const name = typeof entry === 'string' ? entry : entry?.name;
                if (name && !name.startsWith('.') && io.existsSync(join(wtPluginsRoot, name, 'package.json'))) {
                  discoveredPlugins.push(name);
                }
              }
            }
          } catch {}
          const taskPlugins = new Set(discoveredPlugins.length > 0 ? discoveredPlugins : ['omnimux', 'omnimux-video', 'omnimux-clip']);
          taskPluginsCount = taskPlugins.size;

          // 插件注册表：profile 的 package.json 决定宿主加载哪些插件。新插件尚未物化进 Dev，
          // 因此不在 Dev 的注册表里；若不在隔离 profile 里补注册，宿主就不会加载它——
          // 验收装置会「看不见」这个插件，新增插件类任务只能对着源码断言。
          // 这里写的是实体副本（上面已跳过 package.json 的软链），绝不改到 Dev profile。
          try {
            const devProfilePkg = join(devProfile, 'package.json');
            if (io.existsSync(devProfilePkg)) {
              const registry = JSON.parse(io.readFileSync(devProfilePkg, 'utf8'));
              registry.dependencies = registry.dependencies ?? {};
              // cordis.yml 只声明「空树」，真正决定加载哪些插件的是 dsh.profile.bundles；
              // 只补 dependencies 不补 bundles，插件依然不会被宿主加载。
              const bundles = registry.dsh?.profile?.bundles;
              const bundleList = Array.isArray(bundles) ? bundles : null;
              let registered = 0;
              for (const pkg of taskPlugins) {
                if (!io.existsSync(join(root, 'plugins', pkg, 'package.json'))) continue;
                let touched = false;
                if (!registry.dependencies[pkg]) {
                  registry.dependencies[pkg] = `file:${join(root, 'plugins', pkg)}`;
                  touched = true;
                }
                if (bundleList && !bundleList.includes(pkg)) {
                  bundleList.push(pkg);
                  touched = true;
                }
                if (touched) registered += 1;
              }
              if (registered > 0) {
                io.writeFileSync(
                  join(omnimuxProfileDir, 'package.json'),
                  JSON.stringify(registry, null, 2) + '\n',
                  { mode: 0o600 },
                );
              } else {
                io.cpSync(devProfilePkg, join(omnimuxProfileDir, 'package.json'), { force: true });
              }
            }
          } catch (error) {
            // 不阻断启动，但绝不静默：这一段失败会让新插件不被加载，验收会悄悄退回源码断言。
            process.stderr.write(`[test-env] 插件注册表写入失败（新插件可能不会被加载）：${error?.message ?? error}\n`)
          }

          // 检测当前工作树有改动的插件集合（用于按需触发自动构建）
          const modifiedPlugins = new Set();
          if (io === fs) {
            try {
              const statusOut = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8', timeout: 4000 }).stdout || '';
              const diffOut = spawnSync('git', ['-C', root, 'diff', '--name-only', 'origin/main...HEAD'], { encoding: 'utf8', timeout: 4000 }).stdout || '';
              for (const line of `${statusOut}\n${diffOut}`.split('\n')) {
                const m = /(?:^|\s)plugins\/([^/\s]+)\//.exec(line);
                if (m && m[1]) modifiedPlugins.add(m[1]);
              }
            } catch {}
          }

          // 1. 处理 .materialize-snapshots/plugins 映射：全部任务插件优先软链至任务工作树源码
          const devSnapshotsPlugins = join(devProfile, '.materialize-snapshots', 'plugins');
          if (io.existsSync(devSnapshotsPlugins)) {
            const targetSnapshotsPlugins = join(omnimuxProfileDir, '.materialize-snapshots', 'plugins');
            io.mkdirSync(targetSnapshotsPlugins, { recursive: true, mode: 0o700 });
            for (const pkg of io.readdirSync(devSnapshotsPlugins)) {
              if (taskPlugins.has(pkg)) {
                try {
                  io.symlinkSync(join(root, 'plugins', pkg), join(targetSnapshotsPlugins, pkg));
                } catch {
                  io.symlinkSync(join(devSnapshotsPlugins, pkg), join(targetSnapshotsPlugins, pkg));
                }
              } else {
                try {
                  io.symlinkSync(join(devSnapshotsPlugins, pkg), join(targetSnapshotsPlugins, pkg));
                } catch {}
              }
            }
          }

          // 2. 处理 node_modules 映射：
          //    非任务依赖直接软链至 devNodeModules；
          //    工作树插件在真实文件系统中物化为实体目录（保持 realpath 位于 targetNodeModules 内，
          //    从而 100% 继承 194 个同级依赖如 ws、dsh-ui-kit、react），并叠加工作树最新源码与构建产物。
          try {
            const targetNodeModules = join(omnimuxProfileDir, 'node_modules');
            io.mkdirSync(targetNodeModules, { recursive: true, mode: 0o700 });
            const devNodeModules = join(devProfile, 'node_modules');
            const SYMLINK_DATA_DIRS = new Set(['catalog', 'cloud-catalog', 'assets', 'apps', 'node_modules']);
            if (io.existsSync(devNodeModules)) {
              const repoEsbuild = join(deps.repositoryRoot ?? repositoryRoot, 'node_modules', 'esbuild');
              if (io === fs && io.existsSync(repoEsbuild) && !io.existsSync(join(targetNodeModules, 'esbuild'))) {
                try { io.symlinkSync(repoEsbuild, join(targetNodeModules, 'esbuild')); } catch {}
              }
              for (const pkg of io.readdirSync(devNodeModules)) {
                if (taskPlugins.has(pkg)) {
                  const wtPkgDir = join(root, 'plugins', pkg);
                  const devPkgDir = join(devNodeModules, pkg);
                  const dstPkgDir = join(targetNodeModules, pkg);
                  if (io === fs && typeof io.cpSync === 'function' && io.existsSync(wtPkgDir)) {
                    try {
                      io.mkdirSync(dstPkgDir, { recursive: true, mode: 0o700 });
                      for (const entry of io.readdirSync(devPkgDir)) {
                        if (entry === 'node_modules' || entry === '.git') continue;
                        const s = join(devPkgDir, entry);
                        const d = join(dstPkgDir, entry);
                        if (SYMLINK_DATA_DIRS.has(entry)) {
                          try { io.symlinkSync(s, d); } catch {}
                        } else {
                          io.cpSync(s, d, { recursive: true, force: true });
                        }
                      }
                      for (const entry of io.readdirSync(wtPkgDir)) {
                        if (entry === 'node_modules' || entry === '.git' || entry === '.scratch') continue;
                        const s = join(wtPkgDir, entry);
                        const d = join(dstPkgDir, entry);
                        if (SYMLINK_DATA_DIRS.has(entry)) {
                          try { io.rmSync(d, { recursive: true, force: true }); io.symlinkSync(s, d); } catch {}
                        } else {
                          io.cpSync(s, d, { recursive: true, force: true });
                        }
                      }
                      // 若该插件在工作树中有源码修改，或缺失关键构建产物，在 targetNodeModules/<pkg> 内就地自动编译
                      const needsClient = !io.existsSync(join(dstPkgDir, 'lib', 'client.js'));
                      if (modifiedPlugins.has(pkg) || needsClient) {
                        for (const buildScript of ['scripts/build-host.mjs', 'scripts/build-client.mjs', 'scripts/build-canvas.mjs', 'scripts/build.mjs']) {
                          if (io.existsSync(join(dstPkgDir, buildScript))) {
                            spawnSync(process.execPath, [buildScript], { cwd: dstPkgDir, stdio: 'ignore', timeout: 30000 });
                          }
                        }
                      }
                    } catch {
                      try { io.rmSync(dstPkgDir, { recursive: true, force: true }); io.symlinkSync(wtPkgDir, dstPkgDir); } catch {}
                    }
                  } else {
                    try {
                      io.symlinkSync(wtPkgDir, dstPkgDir);
                    } catch {
                      io.symlinkSync(devPkgDir, dstPkgDir);
                    }
                  }
                } else {
                  try {
                    io.symlinkSync(join(devNodeModules, pkg), join(targetNodeModules, pkg));
                  } catch {}
                }
              }
            }
            // 3. 任务自带的**新插件**尚未物化进 Dev profile，因此不在 devNodeModules 里。
            //    若不在隔离 profile 内补齐，它就不会被宿主加载——验收装置会「看不见」这个插件，
            //    新增插件类任务只能对着源码断言，那不是真机证据。这里只写入一次性隔离 profile，
            //    绝不触碰 ~/.omnimux-dev。
            for (const pkg of taskPlugins) {
              const dstPkgDir = join(targetNodeModules, pkg)
              if (io.existsSync(dstPkgDir)) continue
              const wtPkgDir = join(root, 'plugins', pkg)
              if (!io.existsSync(join(wtPkgDir, 'package.json'))) continue
              try {
                io.mkdirSync(dstPkgDir, { recursive: true, mode: 0o700 })
                for (const entry of io.readdirSync(wtPkgDir)) {
                  if (entry === 'node_modules' || entry === '.git' || entry === '.scratch') continue
                  const s = join(wtPkgDir, entry)
                  const d = join(dstPkgDir, entry)
                  if (SYMLINK_DATA_DIRS.has(entry)) {
                    try { io.symlinkSync(s, d) } catch {}
                  } else {
                    io.cpSync(s, d, { recursive: true, force: true })
                  }
                }
                if (!io.existsSync(join(dstPkgDir, 'lib', 'client.js'))) {
                  for (const buildScript of ['scripts/build-host.mjs', 'scripts/build-client.mjs', 'scripts/build-canvas.mjs', 'scripts/build.mjs']) {
                    if (io.existsSync(join(dstPkgDir, buildScript))) {
                      spawnSync(process.execPath, [buildScript], { cwd: dstPkgDir, stdio: 'ignore', timeout: 60000 })
                    }
                  }
                }
              } catch (error) {
                // 同上：物化或构建失败会让这个插件在真机里不可见，必须留下可见的痕迹。
                process.stderr.write(`[test-env] 插件物化失败 ${pkg}：${error?.message ?? error}\n`)
              }
            }
          } catch {}
        }
      } catch {}

      signals.on('SIGINT', onSignal); signals.on('SIGTERM', onSignal);
      const url = await new Promise((yes, no) => {
        startupReject = no;
        let buffer = '';
        const timer = setTimeout(() => no(failure('START_TIMEOUT')), deps.startupTimeoutMs ?? 60000);
        try {
          child = (deps.spawn ?? spawn)(EXECUTABLE, ['--expose-internals', WRAPPER, '--profile', profileName, '--port', '0', '--host', '127.0.0.1', '--no-open'], { cwd: env.HOME, env, stdio: ['ignore', 'pipe', 'pipe'] });
          child.once('exit', () => {
            exited = true; no(failure('RUNTIME_EXIT'));
            void cleanup().catch(() => {});
          });
          child.on('error', () => no(failure('RUNTIME_START')));
          const output = chunk => {
            buffer += chunk.toString();
            if (buffer.length > 65536) { buffer = ''; no(failure('OUTPUT_LIMIT')); return; }
            let end;
            while ((end = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
              try { const login = parseLogin(line); if (login) yes(login); } catch (error) { no(error); }
            }
          };
          child.stdout.on('data', output);
          child.stderr.resume();
          releaseOutput = () => { clearTimeout(timer); buffer = ''; child.stdout.off('data', output); child.stdout.resume(); };
        } catch { clearTimeout(timer); no(failure('RUNTIME_START')); }
      });
      startupReject = undefined; releaseOutput();
      if (exited || child?.exitCode !== null || child?.signalCode !== null) throw failure('RUNTIME_EXIT');
      const summary = Object.freeze({
        mode,
        origin: url.origin,
        evidenceLevel,
        taskPluginsInstalled: pluginsInstalled,
        taskPluginsCount,
        seededDataDomains,
        realModelRequest: false,
        modelConfiguration: mode === 'ui' ? 'QA模拟' : mode === 'live' ? 'authorized-dev-reference' : 'unconfigured',
        seededWorkspace: hasSeededFixture ? seededWorkspaceId : null,
      });
      const result = { origin: url.origin, summary, cleanup };
      Object.defineProperty(result, 'loginUrl', { value: url.href, enumerable: false });
      return result;
    } catch (error) {
      try { await cleanup(); } catch { throw failure('CLEANUP_FAILED'); }
      throw safeError(error, 'PREPARE');
    }
  };
}

/** Start a private complete core Web runtime. Callers must use try/finally cleanup.
 * `live` requires prior task-specific authorization and does not submit a model request.
 * loginUrl is a secret in-memory capability: never log it or put it in evidence.
 * @param {{root: string, mode?: 'ui'|'onboarding'|'live'}} options
 */
export const startTestEnvironment = createTestEnvironmentStarter();

// Deliberately no command execution or live credential entrypoint on the CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== 'preflight') throw failure('OPTIONS');
    validateRoot(process.argv[3], fs, repositoryRoot);
    try { fs.accessSync(EXECUTABLE, fs.constants.X_OK); } catch { throw failure('RUNTIME_MISSING'); }
    process.stdout.write(JSON.stringify({ ready: true, scope: 'core-only', credentialRead: false }) + '\n');
  } catch (error) { process.stderr.write(safeError(error, 'PREFLIGHT').message + '\n'); process.exitCode = 1; }
}
