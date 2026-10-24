import * as fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { parseDocument } from 'yaml';
import { readDevDeepSeekCredential, readDevCredentialsBundle } from './test-env-credentials.mjs';
import { captureCandidate } from './evidence-contract.mjs';
import { runPnpm } from './managed-tarball.mjs';
import { privatePnpmEnvironment } from './materialize-cache.mjs';
import { prepareFiles, payloadManifest, hashFile, readJson, stable } from './materialize-graph.mjs';
import { createTaskPnpmTool, installTaskRuntime } from './task-runtime-install.mjs';

const EXECUTABLE = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
const WRAPPER = '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/lib/desktop-cli.js';
const OFFICIAL_ENDPOINT = 'https://api.deepseek.com';
const SYNTHETIC_KEY = 'QA-SYNTHETIC-NOT-A-REAL-KEY';
/**
 * 隔离环境里的媒体生成凭据。中枢的 omnimux 线路只接受 `sk-` 前缀的密钥，
 * 这里给的是本机 mock 的假密钥：它只在本进程树内存在，不会落到磁盘，也不会发往真实上游。
 */
const SYNTHETIC_MEDIA_KEY = 'sk-qa-local-media-key';
/**
 * mock 的合成图像产物：两张 1×1 的有效 PNG，字节不同。
 * 文生图（无参考图）返回第一张，图生图（请求体带 image）返回第二张，
 * 验收因此能按字节证明「哪张产物落在哪个位置」，而不是只数元素个数。
 */
const MOCK_IMAGE_TEXT_TO_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC',
  'base64',
);
const MOCK_IMAGE_IMAGE_TO_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQiLoDAAIMAV9Wszw4AAAAAElFTkSuQmCC',
  'base64',
);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = sourceRoot.split(`${sep}.worktrees${sep}`)[0];
const failure = (code, hint) => Object.assign(new Error('TEST_ENV_' + code), { code: 'TEST_ENV_' + code, ...(hint ? { hint } : {}) });
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
  let imageTasks = 0;
  /** task_id → 该任务的产物口味（文生图 / 图生图），决定 /v1/qa-media 回哪一张 PNG。 */
  const imageFlavourByTask = new Map();
  const server = createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    const requestPath = (req.url || '').split('?')[0];
    // 非 chat 车道的请求逐条打到 stderr：隔离环境的 mock 在父进程里，
    // 这条日志是「请求到底有没有到本机 mock」的唯一直接证据。
    if (requestPath !== '/chat/completions') {
      process.stderr.write(`[qa-mock] ${req.method} ${requestPath} auth=${req.headers.authorization ? 'yes' : 'no'} group=${String(req.headers['x-omnimux-group'] ?? '')}\n`);
    }
    // 合成图像生成车道：OpenAI 兼容的最小媒体任务形状（提交回 task_id、轮询回产物 URL、
    // 产物由本机提供真实 PNG 字节）。它不解析生成参数，也不替任何插件做判定——
    // 只是让中枢那条「提交 → 轮询 → 下载落盘」的真实代码路径在本机有可用的上游。
    if (/\/images\/generations$/.test(requestPath) && req.method === 'POST') {
      let body = '';
      try {
        for await (const chunk of req) body += chunk.toString();
      } catch { return reply(400, { error: { message: 'QA模拟：请求无效' } }); }
      imageTasks += 1;
      // 带参考图的请求（图生图）与纯文生图返回不同字节，验收据此分辨产物归属。
      const flavour = body.includes('"image"') ? 'image-to-image' : 'text-to-image';
      const taskId = `qa-image-task-${imageTasks}`;
      imageFlavourByTask.set(taskId, flavour);
      // 同步出图：中枢明确支持「提交即带产物地址」的同步形态（image 提交可能同步返回，
      // 与 live 模式真机验收同一条路径），因此这里同时给出 task_id 与产物地址。
      // 产物地址指向本机 mock，中枢会真的下载字节并落到 dest。
      return reply(200, {
        task_id: taskId,
        data: { url: `http://${req.headers.host}/qa-media/${taskId}.png` },
      });
    }
    const taskMatch = /\/images\/generations\/([A-Za-z0-9_-]+)$/.exec(requestPath);
    if (taskMatch && req.method === 'GET') {
      return reply(200, {
        status: 'completed',
        data: { url: `http://${req.headers.host}/qa-media/${taskMatch[1]}.png` },
      });
    }
    const mediaMatch = /\/qa-media\/([A-Za-z0-9_-]+)\.png$/.exec(requestPath);
    if (mediaMatch && req.method === 'GET') {
      const bytes = imageFlavourByTask.get(mediaMatch[1]) === 'image-to-image'
        ? MOCK_IMAGE_IMAGE_TO_IMAGE
        : MOCK_IMAGE_TEXT_TO_IMAGE;
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': bytes.length, 'cache-control': 'no-store' });
      res.end(bytes);
      return;
    }
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

// Hub client sources import a sibling plugin's module across the plugin boundary, so the stage
// must carry that source too; only explicitly selected plugins become installed bundles.
const PREPARATION_PACKAGES = ['plugins/omnimux', 'plugins/omnimux-inspiration', 'packages/dsh-ui-kit', 'packages/generation-capabilities'];
const PREPARATION_CONFIG = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml'];
const ARCHIVE_SCRIPT = fileURLToPath(new URL('./managed-tarball-archive.py', import.meta.url));
const SHA_RE = /^[0-9a-f]{40}$/;
const PACKER_INCLUDED = { LICENSE: 'LICENSE' };
// The packer silently omits whitelist entries that do not exist, so a build that produced nothing
// would leave the plan and the archive in agreement; these outputs are asserted to exist instead.
const PREPARATION_OUTPUTS = {
  'plugins/omnimux': ['lib/client.js', 'lib/generation-core.js', 'lib/video-inspect.js', 'lib/mediabunny-LICENSE.txt'],
  'packages/dsh-ui-kit': ['lib/index.js', 'lib/index.d.ts', 'lib/index.js.map', 'lib/index.d.ts.map'],
  'plugins/omnimux-inspiration': ['lib/client.js'],
  'plugins/omnimux-assets': ['lib/client.js'],
  'plugins/omnimux-browser': ['lib/index.js', 'lib/protocol.js', 'lib/invariant.js', 'lib/client.js'],
  'plugins/omnimux-workflow': ['dist/index.js', 'lib/client.js', 'lib/canvas.js', 'lib/director.js'],
  'plugins/omnimux-automation': ['lib/client.js'],
};
// The build body comes from the candidate manifest, so a candidate that rewrote it would otherwise
// have its own script executed here; only these reviewed values may run.
const PREPARATION_BUILD_SCRIPTS = {
  'plugins/omnimux': 'node scripts/build-media-inspect.mjs && node scripts/build-client.mjs',
  'packages/dsh-ui-kit': 'tsdown',
  'plugins/omnimux-inspiration': 'node scripts/build-client.mjs',
  'plugins/omnimux-assets': 'node scripts/build-client.mjs',
  'plugins/omnimux-browser': 'tsc -b --pretty false && tsdown && node -e "require(\'node:fs\').copyFileSync(\'src/client.js\', \'lib/client.js\')"',
  'plugins/omnimux-workflow': 'node scripts/build-host.mjs && node scripts/build-client.mjs && node scripts/build-canvas.mjs && node scripts/build-director.mjs',
  'plugins/omnimux-automation': 'node scripts/build-client.mjs',
};

/**
 * Task-source assembly targets. Optional runtime plugins plus the first-party
 * canvas/workflow packages, so canvas-level task work can be installed and
 * loaded from the task's own candidate build instead of a Dev-backed profile.
 */
export const TASK_RUNTIME_PLUGINS = Object.freeze(['omnimux-inspiration', 'omnimux-browser', 'omnimux-assets', 'omnimux-workflow', 'omnimux-automation']);
export function normalizeTaskPlugins(value) {
  if (!Array.isArray(value) || value.some(name => !TASK_RUNTIME_PLUGINS.includes(name)) || new Set(value).size !== value.length) throw failure('OPTIONS');
  return ['omnimux', ...value.slice().sort()];
}

/** Archive child-process failures must carry the real reason: an empty error code made a broken
 * archive look identical to a broken build and cost several diagnosis rounds. */
function archiveCommandFailure(code, action, result) {
  const detail = String(result.stderr || '').trim() || String(result.stdout || '').trim() || String(result.error || '');
  const reason = `python3 归档${action}失败（status=${result.status ?? 'null'}, signal=${result.signal ?? 'null'}）：${detail.slice(-1200) || '无输出'}`;
  return failure(code, reason.slice(0, 1600));
}

function inspectArchive(tarball, name, version, sha256) {
  const result = spawnSync('python3', ['-B', ARCHIVE_SCRIPT, 'inspect'], {
    input: JSON.stringify({ tarball, name, version, sha256 }), encoding: 'utf8', maxBuffer: 16 << 20,
  });
  if (result.status !== 0) throw archiveCommandFailure('PREPARE_ARCHIVE_INSPECTION_FAILED', '检查', result);
  try { return JSON.parse(result.stdout); }
  catch { throw failure('PREPARE_ARCHIVE_INSPECTION_FAILED', `归档检查输出不是 JSON：${String(result.stdout || '').slice(-600)}`); }
}

/** Materialize a verified archive so the packed manifest can be compared by content, not by bytes. */
function extractArchive(tarball, name, version, sha256, destination) {
  const result = spawnSync('python3', ['-B', ARCHIVE_SCRIPT, 'extract'], {
    input: JSON.stringify({ tarball, name, version, sha256, destination }), encoding: 'utf8', maxBuffer: 16 << 20,
  });
  if (result.status !== 0) throw archiveCommandFailure('PREPARE_ARCHIVE_EXTRACTION_FAILED', '解包', result);
  try { return JSON.parse(result.stdout); }
  catch { throw failure('PREPARE_ARCHIVE_EXTRACTION_FAILED', `归档解包输出不是 JSON：${String(result.stdout || '').slice(-600)}`); }
}

/** Directory prefixes that contain at least one captured candidate entry. */
export function candidateDirectoryIndex(allowed) {
  const directories = new Set();
  for (const path of allowed) {
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index += 1) directories.add(parts.slice(0, index).join('/'));
  }
  return directories;
}

/** Classify one working-tree entry against the captured candidate index.
 * The stage must mirror the captured candidate: build outputs written by dependency `prepare`
 * scripts (`lib/`, `dist/`) and every other policy-excluded file are rebuilt inside the stage and
 * therefore skipped. Only a candidate-owned symlink or an exotic entry cannot be staged faithfully.
 * @returns {'copy' | 'recurse' | 'skip' | 'unsupported-symlink' | 'unsupported-special'}
 */
export function classifyCandidateEntry({ rel, isSymbolicLink, isDirectory, isFile, allowed, candidateDirectories, allowAll = false }) {
  if (allowAll) {
    if (isSymbolicLink) return 'unsupported-symlink';
    if (isDirectory) return 'recurse';
    return isFile ? 'copy' : 'unsupported-special';
  }
  if (isSymbolicLink) return allowed.has(rel) ? 'unsupported-symlink' : 'skip';
  if (isDirectory) return candidateDirectories.has(rel) ? 'recurse' : 'skip';
  if (isFile) return allowed.has(rel) ? 'copy' : 'skip';
  return 'unsupported-special';
}

/** Packages whose manifest declares dependencies but whose worktree install is missing. */
export function missingPackageDependencies({ packedPaths, hasInstalledDependencies, declaresDependencies }) {
  return packedPaths.filter(rel => !hasInstalledDependencies(rel) && declaresDependencies(rel));
}

/** preparation-only: real candidate source → owned stage → fixed build → pack → archive inspect.
 * Reuses captureCandidate, prepareFiles, privatePnpmEnvironment, runPnpm, payloadManifest and archive.py inspect.
 * Never installs, never reads Dev profile or credentials, never upgrades output to installed/loaded/fresh proof.
 */
async function runTaskPreparation({ options, io, deps }) {
  const { root, mode, candidate, evidenceContext } = options;
  if (mode !== 'ui') throw failure('OPTIONS');
  if (!candidate || typeof candidate !== 'object' || !SHA_RE.test(candidate.base) || !SHA_RE.test(candidate.head)) throw failure('PREPARE_CANDIDATE_REQUIRED');
  validateRoot(root, io, deps.repositoryRoot ?? repositoryRoot);
  if (!evidenceContext || Object.keys(evidenceContext).sort().join(',') !== 'runId,taskId'
    || !Object.values(evidenceContext).every(value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value))) throw failure('OPTIONS');
  const taskPlugins = options.taskPlugins === undefined ? ['omnimux'] : normalizeTaskPlugins(options.taskPlugins);
  const packagePaths = [...new Set([...PREPARATION_PACKAGES, ...taskPlugins.map(name => `plugins/${name}`),
    // Assets reuses this candidate-owned menu source at build time; it is not installed as a bundle.
    ...(taskPlugins.includes('omnimux-assets') ? ['plugins/omnimux-products'] : []),
  ])];
  const packedPaths = ['packages/dsh-ui-kit', ...taskPlugins.map(name => `plugins/${name}`)];
  const observations = { contract: 'preparation-only', runtimeStarted: false, userFresh: 'unknown', taskBinding: 'unknown', steps: [] };
  const capture = deps.captureCandidate ?? captureCandidate;
  const readJsonFile = deps.readJson ?? readJson;
  const privateDir = io.mkdtempSync(join(root, '.test-env-'));
  const created = io.statSync(privateDir, { bigint: true });
  const ownerIdentity = [String(created.dev), String(created.ino)];
  const cleanup = async () => {
    if (!io.lstatSync(privateDir, { throwIfNoEntry: false })) return { cleaned: true, ownerIdentity, alreadyCleaned: true };
    const privateRoot = io.realpathSync(privateDir);
    if (dirname(privateRoot) !== root || !basename(privateRoot).startsWith('.test-env-') || io.realpathSync(privateRoot) !== privateRoot) throw failure('ROOT_UNSAFE');
    canonical(io, privateRoot, true);
    const current = io.statSync(privateRoot, { bigint: true });
    if (String(current.dev) !== ownerIdentity[0] || String(current.ino) !== ownerIdentity[1]) throw failure('ROOT_UNSAFE');
    io.rmSync(privateRoot, { recursive: true, force: true });
    return { cleaned: true, ownerIdentity };
  };
  try {
    io.chmodSync(privateDir, 0o700);
    const captureOptions = { root, base: candidate.base, head: candidate.head, taskId: evidenceContext.taskId, runId: evidenceContext.runId, outputs: candidate.outputs ?? [], extraInputs: candidate.extraInputs ?? [] };
    const before = capture(captureOptions);
    observations.steps.push('candidate-before');
    const allowed = new Set((before.candidate?.entries || []).map(item => item.path));
    const candidateDirectories = candidateDirectoryIndex(allowed);
    const skippedInputs = [];
    const noteSkipped = rel => { if (skippedInputs.length < 20) skippedInputs.push(rel); };
    const copyTree = (source, destination, allowAll = false, batch = null) => {
      const operations = batch ?? [];
      for (const name of io.readdirSync(source)) {
        if (['node_modules', '.git', '.scratch'].includes(name)) continue;
        const from = join(source, name), to = join(destination, name);
        const rel = relative(root, from);
        const stat = io.lstatSync(from);
        const decision = classifyCandidateEntry({
          rel, allowed, candidateDirectories, allowAll,
          isSymbolicLink: stat.isSymbolicLink(), isDirectory: stat.isDirectory(), isFile: stat.isFile(),
        });
        if (decision === 'skip') { noteSkipped(rel); continue; }
        if (decision === 'unsupported-symlink') throw failure('PREPARE_INPUT_UNSUPPORTED', `候选输入是符号链接，装配不支持复制：${rel}`);
        if (decision === 'unsupported-special') throw failure('PREPARE_INPUT_UNSUPPORTED', `候选输入不是普通文件：${rel}`);
        if (decision === 'recurse') { copyTree(from, to, allowAll, operations); continue; }
        io.mkdirSync(dirname(to), { recursive: true });
        operations.push({ operation: 'copy', source: from, destination: to });
      }
      if (batch === null) prepareFiles({ operation: 'batch', root: privateDir, operations });
    };
    const stageRoot = join(privateDir, 'stage');
    for (const rel of PREPARATION_CONFIG.concat(packagePaths)) {
      const source = join(root, rel), destination = join(stageRoot, rel);
      const stat = io.lstatSync(source);
      if (stat.isSymbolicLink()) throw failure('PREPARE_INPUT_UNSUPPORTED', `任务源路径是符号链接：${rel}`);
      if (stat.isDirectory()) copyTree(source, destination);
      else if (stat.isFile()) { io.mkdirSync(dirname(destination), { recursive: true }); prepareFiles({ operation: 'copy', source, destination }); }
      else throw failure('PREPARE_INPUT_UNSUPPORTED', `任务源路径不是普通文件：${rel}`);
    }
    if (skippedInputs.length) observations.skippedInputs = skippedInputs;
    observations.steps.push('stage-copied');
    // The stage reuses the task worktree's installed dependencies. A worktree that never ran the
    // standard install otherwise fails deep inside a package build with no actionable reason, so
    // reject early and name both the missing packages and the command that fixes it.
    const missingDependencies = missingPackageDependencies({
      packedPaths,
      hasInstalledDependencies: rel => io.existsSync(join(root, rel, 'node_modules')),
      declaresDependencies: rel => {
        const manifest = readJsonFile(join(root, rel, 'package.json'));
        return Object.keys(manifest.dependencies ?? {}).length + Object.keys(manifest.devDependencies ?? {}).length > 0;
      },
    });
    if (missingDependencies.length) {
      throw failure('PREPARE_DEPENDENCY_REQUIRED', `任务工作树缺少依赖：${missingDependencies.join('、')}。请先在该工作树执行 pnpm install --frozen-lockfile。`);
    }
    let linkedTools = 0;
    for (const rel of ['node_modules', ...packagePaths.map(item => join(item, 'node_modules'))]) {
      const source = join(root, rel);
      if (!io.existsSync(source)) continue;
      io.mkdirSync(dirname(join(stageRoot, rel)), { recursive: true });
      try {
        const destination = join(stageRoot, rel);
        if (rel === 'node_modules') io.symlinkSync(source, destination, 'dir');
        else {
          io.mkdirSync(destination, { recursive: true });
          for (const name of io.readdirSync(source)) {
            io.symlinkSync(name === 'dsh-ui-kit' ? join(stageRoot, 'packages/dsh-ui-kit') : join(source, name), join(destination, name), 'dir');
          }
        }
        linkedTools++;
      }
      catch { throw failure('PREPARE_DEPENDENCY_REQUIRED'); }
    }
    if (!linkedTools) throw failure('PREPARE_DEPENDENCY_REQUIRED');
    // Snapshot the staged source before building: the build must not mutate the copied inputs, and
    // this same snapshot is the honest source map the caller receives.
    const stageExclusions = ['node_modules', ...packagePaths.map(item => `${item}/node_modules`)];
    const stagedSource = [...allowed].filter(path => io.existsSync(join(stageRoot, path)));
    const stageBefore = payloadManifest(stageRoot, { exclude: stageExclusions, links: false });
    const sourceMap = stageBefore.entries.filter(entry => stagedSource.includes(entry.path));
    io.mkdirSync(join(privateDir, 'pnpm'), { recursive: true, mode: 0o700 });
    // Build and pack use an already installed, version-checked tool; all mutable caches stay private.
    const env = Object.assign(privatePnpmEnvironment(join(privateDir, 'pnpm')), {
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    });
    const run = deps.runPnpm ?? runPnpm;
    const toolchain = createTaskPnpmTool(privateDir);
    const runOptions = { executable: toolchain.executable };
    const runStep = async (argv, cwd) => {
      const result = await run(argv, { cwd, env, ...runOptions });
      const step = { argv, cwd: relative(stageRoot, cwd) || cwd, code: result.code, signal: result.signal ?? null,
        stdout: (result.stdout || '').slice(-2048), stderr: (result.stderr || '').slice(-2048) };
      observations.steps.push({ argv, code: result.code, signal: result.signal ?? null, stdout: step.stdout, stderr: step.stderr });
      if (result.code !== 0 || result.signal) throw failure('PREPARE_BUILD_FAILED');
      return step;
    };
    for (const rel of packedPaths) {
      const expected = PREPARATION_BUILD_SCRIPTS[rel];
      const staged = readJsonFile(join(stageRoot, rel, 'package.json'));
      if (staged?.scripts?.[rel === 'plugins/omnimux-browser' ? 'build:server' : 'build'] !== expected) throw failure('PREPARE_BUILD_SCRIPT_UNSUPPORTED', { path: `${rel}/package.json` });
    }
    // Lifecycle pre/post hooks are not part of the reviewed build body, so they are switched off.
    const buildArgs = ['--config.verify-deps-before-run=false', '--config.enable-pre-post-scripts=false'];
    await runStep([...buildArgs, '--filter', 'dsh-ui-kit', 'build'], stageRoot);
    await runStep([...buildArgs, '--filter', 'omnimux', 'build'], stageRoot);
    for (const name of taskPlugins.filter(name => name !== 'omnimux')) await runStep([...buildArgs, '--filter', name, name === 'omnimux-browser' ? 'build:server' : 'build'], stageRoot);
    // The build may add generated outputs but must leave every copied candidate input untouched.
    const stageAfter = payloadManifest(stageRoot, { exclude: stageExclusions, links: false });
    const stagedAfter = new Map(stageAfter.entries.map(item => [item.path, item]));
    for (const entry of sourceMap) {
      const now = stagedAfter.get(entry.path);
      if (!now || now.size !== entry.size || now.sha256 !== entry.sha256 || now.mode !== entry.mode) throw failure('PREPARE_SOURCE_MUTATED', { path: entry.path });
    }
    const after = capture(captureOptions);
    if (JSON.stringify(before.candidate) !== JSON.stringify(after.candidate)) throw failure('PREPARE_CANDIDATE_CHANGED');
    observations.steps.push('candidate-after');
    const packRoot = join(privateDir, 'pack');
    const packages = [];
    for (const rel of packedPaths) {
      const destination = join(packRoot, rel);
      copyTree(join(stageRoot, rel), destination, true);
      const manifestPath = join(destination, 'package.json');
      const manifest = readJsonFile(manifestPath);
      if (rel === 'plugins/omnimux') {
        if (manifest.dependencies?.['dsh-ui-kit'] !== 'file:../../packages/dsh-ui-kit') throw failure('PREPARE_PACKAGE_MANIFEST_UNSUPPORTED');
        const channelPath = join(destination, 'src/release-channel.json');
        const channel = readJsonFile(channelPath);
        if (channel.channel !== 'development') throw failure('PREPARE_RELEASE_CHANNEL_UNSUPPORTED');
        io.writeFileSync(channelPath, `${JSON.stringify(channel, null, 2)}\n`);
      }
      // pnpm drops the lifecycle `prepare` script and the trailing newline while packing; declaring
      // both here keeps the archived manifest byte-identical instead of re-serialized by the packer.
      if (manifest.scripts && Object.hasOwn(manifest.scripts, 'prepare')) delete manifest.scripts.prepare;
      io.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      const dryRun = await run(['--config.ignore-scripts=true', '--config.verify-deps-before-run=false', 'pack', '--dry-run', '--json'], { cwd: destination, env, ...runOptions });
      observations.steps.push({ argv: ['pack', '--dry-run', '--json'], code: dryRun.code, signal: dryRun.signal ?? null, stdout: (dryRun.stdout || '').slice(-2048), stderr: (dryRun.stderr || '').slice(-2048) });
      if (dryRun.code !== 0 || dryRun.signal) throw failure('PREPARE_PACK_PLAN_FAILED');
      let declaredFiles;
      try { declaredFiles = JSON.parse(dryRun.stdout).files.map(item => item.path); } catch { throw failure('PREPARE_PACK_PLAN_FAILED'); }
      if (!Array.isArray(declaredFiles) || !declaredFiles.length) throw failure('PREPARE_PACK_PLAN_FAILED');
      for (const artifact of PREPARATION_OUTPUTS[rel] ?? []) {
        const built = io.lstatSync(join(destination, artifact), { throwIfNoEntry: false });
        if (!built?.isFile() || built.size === 0) throw failure('PREPARE_OUTPUT_MISSING', { path: artifact });
        if (!declaredFiles.includes(artifact)) throw failure('PREPARE_OUTPUT_UNPLANNED', { path: artifact });
      }
      const packResult = await run(['--config.ignore-scripts=true', '--config.verify-deps-before-run=false', 'pack', '--pack-destination', privateDir], { cwd: destination, env, ...runOptions });
      observations.steps.push({ argv: ['pack'], code: packResult.code, signal: packResult.signal ?? null, stdout: (packResult.stdout || '').slice(-2048), stderr: (packResult.stderr || '').slice(-2048) });
      if (packResult.code !== 0 || packResult.signal) throw failure('PREPARE_PACK_FAILED');
      const tarball = join(privateDir, `${manifest.name}-${manifest.version}.tgz`);
      const sha256 = hashFile(tarball);
      const inspection = deps.inspectArchive ? deps.inspectArchive(tarball, manifest.name, manifest.version, sha256)
        : inspectArchive(tarball, manifest.name, manifest.version, sha256);
      // The archive file set must equal the set the packer itself declared, so a build that produced
      // nothing or dropped an output cannot still be reported as prepared. Every declared file is
      // then matched byte for byte against its real origin; the packer re-serializes only the manifest.
      const archivedFiles = inspection.entries.filter(entry => entry.type === 'file').map(entry => entry.path).sort();
      const plannedFiles = [...declaredFiles].sort();
      if (archivedFiles.length !== plannedFiles.length || archivedFiles.some((path, index) => path !== plannedFiles[index])) {
        throw failure('PREPARE_ARCHIVE_SET_MISMATCH', { planned: plannedFiles.length, archived: archivedFiles.length,
          missing: plannedFiles.filter(path => !archivedFiles.includes(path)).slice(0, 8),
          unexpected: archivedFiles.filter(path => !plannedFiles.includes(path)).slice(0, 8) });
      }
      const declaredPayload = payloadManifest(destination, { links: false });
      const declared = new Map(declaredPayload.entries.map(item => [item.path, item]));
      const archived = new Map(inspection.entries.map(entry => [entry.path, entry]));
      for (const path of plannedFiles) {
        const entry = archived.get(path);
        const origin = declared.get(path) ? join(destination, path) : join(root, PACKER_INCLUDED[path] ?? '');
        if (!declared.has(path) && !PACKER_INCLUDED[path]) throw failure('PREPARE_ARCHIVE_UNDECLARED_ENTRY', { path });
        const originStat = io.lstatSync(origin);
        if (path === 'package.json') continue;
        if (entry.size !== originStat.size || entry.sha256 !== hashFile(origin) || entry.mode !== (originStat.mode & 0o777)) {
          throw failure('PREPARE_ARCHIVE_BYTES_MISMATCH', { path, originSize: originStat.size, archivedSize: entry.size,
            originMode: originStat.mode & 0o777, archivedMode: entry.mode });
        }
      }
      const extractedRoot = join(privateDir, `extracted-${manifest.name}`);
      const extraction = deps.extractArchive ? deps.extractArchive(tarball, manifest.name, manifest.version, sha256, extractedRoot)
        : extractArchive(tarball, manifest.name, manifest.version, sha256, extractedRoot);
      const archivedManifest = readJsonFile(join(extractedRoot, 'package.json'));
      if (stable(archivedManifest) !== stable(manifest)) throw failure('PREPARE_ARCHIVE_MANIFEST_MISMATCH', { path: 'package.json' });
      packages.push({ name: manifest.name, version: manifest.version, sourcePath: rel, extractedRoot, tarball, sha256, inspection, extraction,
        plannedFiles: plannedFiles.length, payloadDigest: declaredPayload.digest, archiveDigest: inspection.digest });
    }
    const manifests = { stage: stageAfter };
    observations.steps.push('completed');
    const result = { scope: 'preparation-only', status: 'task-source-prepared', preparationPath: privateDir, stageRoot,
      candidateBefore: before, candidateAfter: after, sourceMap, packages, build: observations.steps, observations, manifests, ownerIdentity, ...(toolchain ? { toolchain } : {}) };
    Object.defineProperty(result, 'cleanup', { value: cleanup, enumerable: false });
    return result;
  } catch (error) {
    const classified = safeError(error, 'PREPARE');
    classified.observations = observations;
    classified.rootReason = error?.code || error?.message || 'unknown';
    if (error?.sourcePath) classified.failedInput = { source: error.sourcePath, destination: error.path };
    try { await cleanup(); classified.cleanup = { cleaned: true, resources: [{ name: 'preparation-directory', owner: 'app-environment', status: 'completed', reason: null }] }; }
    catch { classified.cleanup = { cleaned: false, resources: [{ name: 'preparation-directory', owner: 'app-environment', status: 'failed', reason: 'remove-failed' }] }; }
    throw classified;
  }
}

function validateFreshRequest(options) {
  if (options.mode !== 'ui') throw failure('FRESH_MODE_UNSUPPORTED');
  const candidate = options.candidate;
  if (!candidate || Object.getPrototypeOf(candidate) !== Object.prototype || Object.keys(candidate).some(key => !['base', 'head', 'outputs', 'extraInputs'].includes(key))
    || !SHA_RE.test(candidate.base) || !SHA_RE.test(candidate.head) || ['outputs', 'extraInputs'].some(key => candidate[key] !== undefined && !Array.isArray(candidate[key]))) throw failure('PREPARE_CANDIDATE_REQUIRED');
  normalizeTaskPlugins(options.taskPlugins);
}

async function startFreshTaskRuntime({ options, io, deps }) {
  validateFreshRequest(options);
  if (io !== fs) throw failure('FRESH_FILESYSTEM_REQUIRED');
  try { io.accessSync(EXECUTABLE, fs.constants.X_OK); } catch { throw failure('RUNTIME_MISSING'); }
  let preparation, runtimeRoot, runtimeOwnerIdentity, mock, child, exited = false, closed = false, cleaning = false, cleanupPromise;
  const observations = { contract: 'task-private-installation', userFresh: 'unknown', taskBinding: 'unknown', runtimeStarted: false, unexpectedExit: false, events: [], rawOutputRetained: false };
  const signals = deps.signals ?? process;
  const timeout = deps.shutdownTimeoutMs ?? 5000;
  const runtimePrefix = `omnimux-task-${options.evidenceContext.taskId}-${options.evidenceContext.runId}-`;
  const waitExit = milliseconds => new Promise(yes => {
    if (!child || (exited && closed)) return yes(true);
    let timer;
    const finish = value => { clearTimeout(timer); child.off('exit', check); child.off('close', check); yes(value); };
    const check = () => { if (exited && closed) finish(true); };
    child.on('exit', check); child.on('close', check); timer = setTimeout(() => finish(false), milliseconds); check();
  });
  const onSignal = () => { observations.interrupted = true; void cleanup(); };
  const cleanup = () => cleanupPromise ??= (async () => {
    cleaning = true;
    signals.off('SIGINT', onSignal); signals.off('SIGTERM', onSignal);
    const resources = [];
    const record = (name, status, reason = null) => resources.push({ name, owner: 'app-environment', status, reason });
    if (!child) record('app-child', 'not-applicable', 'not-created');
    else {
      let stopped = exited && closed;
      try {
        if (!exited) child.kill('SIGTERM');
        stopped = await waitExit(timeout);
        if (!stopped && !exited) { child.kill('SIGKILL'); stopped = await waitExit(timeout); }
      } catch { stopped = false; }
      record('app-child', stopped ? 'completed' : 'failed', stopped ? null : 'exit-or-close-unconfirmed');
    }
    if (!mock) record('mock-server', 'not-applicable', 'not-created');
    else { try { await mock.close(); record('mock-server', 'completed'); } catch { record('mock-server', 'failed', 'close-failed'); } }
    if (!runtimeRoot && !preparation) record('app-private-directory', 'not-applicable', 'not-created');
    else if (resources.some(item => item.status === 'failed')) record('app-private-directory', 'failed', 'resource-still-open');
    else {
      try {
        if (runtimeRoot) {
          canonical(io, runtimeRoot, true);
          const current = io.statSync(runtimeRoot, { bigint: true });
          if (dirname(runtimeRoot) !== io.realpathSync(tmpdir()) || !basename(runtimeRoot).startsWith(runtimePrefix)
            || String(current.dev) !== runtimeOwnerIdentity[0] || String(current.ino) !== runtimeOwnerIdentity[1]) throw failure('ROOT_UNSAFE');
          io.rmSync(runtimeRoot, { recursive: true, force: true });
        }
        if (preparation) await preparation.cleanup();
        record('app-private-directory', 'completed');
      } catch { record('app-private-directory', 'failed', 'remove-failed'); }
    }
    return { cleaned: resources.every(item => item.status !== 'failed'), resources };
  })();
  try {
    preparation = await runTaskPreparation({ options, io, deps });
    observations.preparation = { candidateDigest: preparation.candidateBefore.candidate.contentDigest, inputsDigest: preparation.candidateBefore.inputs.contentDigest, packages: preparation.packages.map(item => ({ name: item.name, sha256: item.sha256 })) };
    runtimeRoot = io.realpathSync(io.mkdtempSync(join(io.realpathSync(tmpdir()), runtimePrefix)));
    io.chmodSync(runtimeRoot, 0o700);
    const owner = io.statSync(runtimeRoot, { bigint: true });
    runtimeOwnerIdentity = [String(owner.dev), String(owner.ino)];
    const privateRoot = runtimeRoot;
    const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--max-http-header-size=65536', COREPACK_ENABLE_NETWORK: '0' };
    for (const [name, leaf] of Object.entries({ HOME: 'home', DSH_HOME: 'dsh', DSH_AGENTS_HOME: 'agents', XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state', XDG_DATA_HOME: 'data', TMPDIR: 'tmp', TMP: 'tmp', TEMP: 'tmp' })) {
      env[name] = join(privateRoot, leaf); io.mkdirSync(env[name], { recursive: true, mode: 0o700 });
    }
    mock = await startMock();
    Object.assign(env, { DEEPSEEK_API_KEY: SYNTHETIC_KEY, DEEPSEEK_BASE_URL: mock.origin, OMNIMUX_BASE_URL: `${mock.origin}/v1`, OMNIMUX_SITE_URL: mock.origin, OMNIMUX_API_KEY: SYNTHETIC_MEDIA_KEY });
    io.writeFileSync(join(env.DSH_HOME, 'settings.yaml'), JSON.stringify({
      'llm-deepseek': { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: mock.origin },
      'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash' },
    }) + '\n', { flag: 'wx', mode: 0o600 });
    const installed = await installTaskRuntime({ root: options.root, repository: deps.repositoryRoot ?? repositoryRoot, privateRoot, ownerIdentity: runtimeOwnerIdentity, preparation, evidenceContext: options.evidenceContext, candidate: options.candidate, executable: EXECUTABLE, wrapper: WRAPPER, env });
    const { createTaskPeerProbeSource } = await import('./task-runtime-proof.mjs');
    if (installed.installation.hostPeerExpectations.length) {
      const probePath = join(installed.installation.profile, 'task-peer-probe.mjs');
      io.writeFileSync(probePath, createTaskPeerProbeSource({ expectations: installed.installation.hostPeerExpectations, appAnchor: installed.installation.appAnchor }), { mode: 0o600, flag: 'wx' });
      installed.installation.peerProbe = { path: probePath, sha256: hashFile(probePath) };
    }
    const profilePatch = [
      { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: { omnimux: { displayName: 'QA模拟', apiKeyEnv: 'OMNIMUX_API_KEY', api: 'openai-completions', baseURL: mock.origin, models: [{ id: 'qa-synthetic', name: 'QA模拟', contextWindow: 8192, maxTokens: 2048 }] } } } },
      { id: 'omnimux', config: { siteBaseUrl: mock.origin, official: { accountAvatars: { enabled: false } }, media: { defaultProvider: 'omnimux', providers: { omnimux: { protocol: 'openai-media', baseUrl: `${mock.origin}/v1`, apiKeyEnv: 'OMNIMUX_API_KEY' } } } } },
    ];
    const patchPath = join(installed.installation.profile, 'cordis.patch.yml');
    if (io.existsSync(patchPath)) {
      canonical(io, patchPath, false);
      const initial = parseDocument(io.readFileSync(patchPath, 'utf8')).toJS();
      if (initial !== null && (!Array.isArray(initial) || initial.length)) throw failure('FRESH_PROFILE_CONFIG_UNEXPECTED');
    }
    io.writeFileSync(patchPath, JSON.stringify(profilePatch) + '\n', { mode: 0o600 });
    // The only seeded business state is the repository's declared synthetic media workspace.
    const seededWorkspace = 'ws_qa_media';
    const fixtureSource = join(options.root, 'tests/fixtures/qa-workspace-media');
    const fixtureTarget = join(env.DSH_HOME, 'workspaces', seededWorkspace);
    const capturedFiles = new Map(preparation.candidateBefore.candidate.entries.map(item => [item.path, item.sha256]));
    const seed = (from, to) => {
      io.mkdirSync(to, { recursive: true, mode: 0o700 });
      for (const name of io.readdirSync(from)) {
        const source = join(from, name), target = join(to, name), stat = io.lstatSync(source);
        if (stat.isSymbolicLink()) throw failure('FRESH_FIXTURE_UNSAFE');
        if (stat.isDirectory()) seed(source, target);
        else if (stat.isFile()) {
          const expected = capturedFiles.get(relative(options.root, source));
          if (!expected || hashFile(source) !== expected) throw failure('FRESH_FIXTURE_CHANGED');
          io.copyFileSync(source, target);
          if (hashFile(target) !== expected) throw failure('FRESH_FIXTURE_CHANGED');
        } else throw failure('FRESH_FIXTURE_UNSAFE');
      }
    };
    seed(fixtureSource, fixtureTarget);
    io.mkdirSync(join(env.DSH_HOME, 'storages'), { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString();
    io.writeFileSync(join(env.DSH_HOME, 'storages/workspace.json'), JSON.stringify({ unit: { name: 'workspace', version: 2 }, global: { initialized: true, workspaceIds: [seededWorkspace], archivedSessionIds: [] }, tables: { workspaces: { [seededWorkspace]: { path: fixtureTarget, title: 'QA Media', sessionIds: [], createdAt: timestamp, updatedAt: timestamp } } } }) + '\n', { flag: 'wx', mode: 0o600 });
    signals.on('SIGINT', onSignal); signals.on('SIGTERM', onSignal);
    let inspectorUrl;
    const login = await new Promise((yes, no) => {
      let stdout = '', stderr = '', loginUrl, settled = false;
      const finish = () => { if (loginUrl && inspectorUrl && !settled) { settled = true; clearTimeout(timer); yes(loginUrl); } };
      const timer = setTimeout(() => no(failure('START_TIMEOUT')), deps.startupTimeoutMs ?? 60000);
      child = (deps.spawn ?? spawn)(EXECUTABLE, ['--inspect=127.0.0.1:0', '--expose-internals', WRAPPER, '--profile', 'web', '--port', '0', '--host', '127.0.0.1', '--no-open'], { cwd: env.HOME, env, stdio: ['ignore', 'pipe', 'pipe'] });
      observations.runtimeStarted = true;
      observations.events.push({ event: 'spawn', pid: child.pid ?? null, parentPid: process.pid });
      child.once('exit', (code, signal) => { exited = true; observations.events.push({ event: 'exit', code: code ?? null, signal: signal ?? null }); if (!cleaning) observations.unexpectedExit = true; clearTimeout(timer); no(failure('RUNTIME_EXIT')); });
      child.once('close', () => { closed = true; });
      child.once('error', () => { clearTimeout(timer); no(failure('RUNTIME_START')); });
      const consume = (kind, chunk) => {
        if (settled) return;
        if (kind === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
        if (stdout.length + stderr.length > 65536) { clearTimeout(timer); return no(failure('OUTPUT_LIMIT')); }
        let buffer = kind === 'stdout' ? stdout : stderr, end;
        while ((end = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
          try {
            if (kind === 'stdout') loginUrl = parseLogin(line) ?? loginUrl;
            else {
              const match = /^Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9-]+)$/.exec(line);
              if (match) inspectorUrl = match[1];
            }
            if (/error|cannot find|failed|^\s+at\s/i.test(line) && !/token|Bearer|password|api[-_]?key/i.test(line)) {
              observations.diagnostics ??= [];
              if (observations.diagnostics.length < 16) observations.diagnostics.push(line.slice(0, 512));
            }
          } catch (error) { clearTimeout(timer); return no(error); }
        }
        if (kind === 'stdout') stdout = buffer; else stderr = buffer;
        finish();
      };
      child.stdout.on('data', chunk => consume('stdout', chunk));
      child.stderr.on('data', chunk => consume('stderr', chunk));
    });
    installed.installation.origin = login.origin;
    installed.installation.pid = child.pid;
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    freeze(installed.installation);
    const assertAlive = () => { if (exited || closed || observations.unexpectedExit || observations.interrupted) throw failure('RUNTIME_EXIT'); };
    assertAlive(); installed.assertInstalledIntegrity();
    const { verifyTaskServerLoading } = await import('./task-runtime-proof.mjs');
    const verifyServerLoading = async () => { assertAlive(); installed.assertInstalledIntegrity(); return verifyTaskServerLoading({ inspectorUrl, pid: child.pid, installation: installed.installation }); };
    const serverLoading = await verifyServerLoading();
    const summary = Object.freeze({ mode: 'ui', origin: login.origin, evidenceLevel: 'task-source-installed', taskPluginsInstalled: true, taskPluginsCount: normalizeTaskPlugins(options.taskPlugins).length, seededDataDomains: ['synthetic-workspace'], realModelRequest: false, modelConfiguration: 'QA模拟', seededWorkspace });
    const result = { origin: login.origin, summary, observations, installation: installed.installation, serverLoading, cleanup };
    Object.defineProperties(result, { loginUrl: { value: login.href }, assertAlive: { value: assertAlive }, assertInstalledIntegrity: { value: installed.assertInstalledIntegrity }, verifyServerLoading: { value: verifyServerLoading } });
    return result;
  } catch (error) {
    const cleaned = await cleanup();
    const classified = safeError(error, 'FRESH_RUNTIME');
    classified.rootReason = error.rootReason ?? error.code ?? error.name;
    if (!classified.hint && typeof error.message === 'string' && !/[?&]token=|Bearer\s|password|api[-_]?key/i.test(error.message)) classified.hint = error.message.slice(0, 512);
    if (typeof error.path === 'string' && error.path.startsWith(options.root + '/.test-env-')) classified.failedPath = error.path;
    classified.cleanup = error.cleanup?.cleaned === false ? error.cleanup : error.cleanup?.resources?.some(item => item.name === 'preparation-directory')
      ? { cleaned: cleaned.cleaned, resources: cleaned.resources.map(item => item.name === 'app-private-directory' ? { ...item, status: 'completed', reason: null } : item) } : cleaned;
    classified.observations = { ...observations, ...(error.observations ? { failedPreparation: error.observations } : {}) };
    if (error.installDiagnostic) classified.installDiagnostic = error.installDiagnostic;
    if (error.peerObserverFailure) classified.peerObserverFailure = error.peerObserverFailure;
    if (error.peerResolutionFailure) classified.peerResolutionFailure = error.peerResolutionFailure;
    throw classified;
  }
}

/**
 * Public preparation-only entry, sharing the exact path the starter uses for `preparationOnly:true`.
 * It never installs, loads, or starts anything, and grants no authority beyond producing artifacts.
 */
export async function prepareTaskRuntime(options = {}) {
  return runTaskPreparation({ options, io: fs, deps: {} });
}

/** Test-only dependency seam. Overrides never come from CLI flags or process environment.
 * @param {{fs?: typeof fs, repositoryRoot?: string, spawn?: typeof spawn, readCredential?: () => string, signals?: NodeJS.Process, startupTimeoutMs?: number, shutdownTimeoutMs?: number}} [deps]
 */
export function createTestEnvironmentStarter(deps = {}) {
  const io = deps.fs ?? fs;
  const signals = deps.signals ?? process;
  return async function start(options = {}) {
    if (!options || typeof options !== 'object' || Object.keys(options).some(k => !['root', 'mode', 'evidenceContext', 'preparationOnly', 'candidate', 'taskPlugins'].includes(k))) throw failure('OPTIONS');
    const { root, mode = 'ui', evidenceContext = null, preparationOnly = false, candidate = null } = options;
    if (!['ui', 'onboarding', 'live'].includes(mode)) throw failure('OPTIONS');
    validateRoot(root, io, deps.repositoryRoot ?? repositoryRoot);
    if (preparationOnly) {
      if (mode !== 'ui') throw failure('OPTIONS');
      if (!candidate || typeof candidate !== 'object' || !SHA_RE.test(candidate.base) || !SHA_RE.test(candidate.head)) throw failure('PREPARE_CANDIDATE_REQUIRED');
      return runTaskPreparation({ options: { root, mode, candidate, evidenceContext, ...(options.taskPlugins === undefined ? {} : { taskPlugins: options.taskPlugins }) }, io, deps });
    }
    if (Object.hasOwn(options, 'candidate') && options.taskPlugins === undefined) throw failure('OPTIONS');
    if (evidenceContext !== null) {
      if (!evidenceContext || Object.keys(evidenceContext).sort().join(',') !== 'runId,taskId'
        || !Object.values(evidenceContext).every(value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value))) throw failure('OPTIONS');
      if (options.taskPlugins !== undefined) return startFreshTaskRuntime({ options: { ...options, mode }, io, deps });
      // The legacy full profile is Dev-backed, not a fresh synthetic installation.
      const error = failure('NOT_USER_FRESH_TASK_UNKNOWN');
      error.cleanup = { cleaned: true, resources: ['app-child', 'mock-server', 'app-private-directory'].map(name => ({ name, owner: 'app-environment', status: 'not-applicable', reason: 'not-created' })) };
      error.observations = { userFresh: false, taskBinding: 'unknown', runtimeStarted: false };
      throw error;
    }
    if (options.taskPlugins !== undefined) throw failure('OPTIONS');
    try { io.accessSync(EXECUTABLE, fs.constants.X_OK); } catch { throw failure('RUNTIME_MISSING'); }
    let privateDir, mock, child, exited = false, closed = false, cleaning = false, cleanupPromise, startupReject;
    const observations = { contract: 'none', userFresh: 'unknown', taskBinding: 'unknown', runtimeStarted: false, unexpectedExit: false, events: [], rawOutputRetained: false };
    let releaseOutput = () => {};
    const shutdownMs = deps.shutdownTimeoutMs ?? 5000;
    const waitExit = async milliseconds => {
      if (!child || (exited && closed)) return true;
      return new Promise(yes => {
        const finish = value => { clearTimeout(timer); child.off('exit', check); child.off('close', check); yes(value); };
        const check = () => { if (exited && closed) finish(true); };
        const timer = setTimeout(() => finish(false), milliseconds);
        child.on('exit', check); child.on('close', check);
        check();
      });
    };
    const onSignal = () => { observations.interrupted = true; startupReject?.(failure('INTERRUPTED')); void cleanup().catch(() => {}); };
    const cleanup = () => cleanupPromise ??= Promise.resolve().then(async () => {
      cleaning = true;
      signals.off('SIGINT', onSignal); signals.off('SIGTERM', onSignal);
      const resources = [];
      const record = (name, status, reason = null) => resources.push({ name, owner: 'app-environment', status, reason });
      try { releaseOutput(); } catch { observations.outputReleaseFailed = true; }
      if (!child) record('app-child', 'not-applicable', 'not-created');
      else {
        let stopped = exited && closed;
        try {
          if (!exited) child.kill('SIGTERM');
          stopped = await waitExit(shutdownMs);
          if (!stopped && !exited) { child.kill('SIGKILL'); stopped = await waitExit(shutdownMs); }
        } catch { stopped = false; }
        record('app-child', stopped ? 'completed' : 'failed', stopped ? null : 'exit-or-close-unconfirmed');
      }
      if (!mock) record('mock-server', 'not-applicable', 'not-created');
      else {
        try { await mock.close(); record('mock-server', 'completed'); }
        catch { record('mock-server', 'failed', 'mock-close-failed'); }
      }
      if (!privateDir) record('app-private-directory', 'not-applicable', 'not-created');
      else if (resources.some(item => item.name === 'app-child' && item.status === 'failed')) record('app-private-directory', 'failed', 'owned-child-still-unconfirmed');
      else {
        try {
          if (dirname(privateDir) !== root || !privateDir.startsWith(join(root, '.test-env-'))) throw failure('ROOT_UNSAFE');
          canonical(io, privateDir, true);
          io.rmSync(privateDir, { recursive: true, force: true });
          record('app-private-directory', 'completed');
        } catch { record('app-private-directory', 'failed', 'private-directory-remove-failed'); }
      }
      return { cleaned: resources.every(item => item.status !== 'failed'), resources };
    });
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
        // ui 模式的媒体生成同样落在本机 mock 上：否则隔离环境里没有任何渠道能产出图像，
        // 「生成完成 → 自动归档」这条业务路径在真机上永远走不到（Issue #3176 J3/J4）。
        // 只写隔离进程的环境变量，绝不落盘，也绝不指向真实上游。
        if (mode === 'ui') {
          env.OMNIMUX_BASE_URL = `${mock.origin}/v1`;
          env.OMNIMUX_API_KEY = SYNTHETIC_MEDIA_KEY;
        }
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
            // ui 模式的 cordis.patch.yml 同样必须是实体副本（下面会追加本机 mock 的媒体线路覆盖），
            // 软链会顺着写到 Dev profile 上——那是硬性禁止的。
            if (item === 'node_modules' || item === '.materialize-snapshots' || item === 'package.json') continue;
            if (mode === 'ui' && item === 'cordis.patch.yml') continue;
            try {
              io.symlinkSync(join(devProfile, item), join(omnimuxProfileDir, item));
            } catch {}
          }

          // ui 模式：中枢的媒体线路必须落在本机 mock 上，否则隔离环境里没有任何渠道能产出图像，
          // 「生成完成 → 自动归档」这条业务路径在真机上永远走不到（Issue #3176 J3/J4）。
          // 为什么不能只用 OMNIMUX_BASE_URL：官方媒体请求在 execution-plan 里会把 env 收窄成
          // 只含密钥的对象，base URL 覆盖到不了路由层；这里改为在隔离 profile 的插件配置里
          // 覆盖 provider 的 baseUrl。这是测试配置（只写一次性隔离 profile），不改产品代码。
          if (mode === 'ui') {
            const devCordisPatch = join(devProfile, 'cordis.patch.yml');
            if (io.existsSync(devCordisPatch)) {
              const base = io.readFileSync(devCordisPatch, 'utf8');
              const override = [
                '',
                '# QA 隔离环境（仅此一次性 profile，绝不写 Dev）：把中枢媒体线路指向本机 mock。',
                '- id: omnimux',
                '  config:',
                '    media:',
                '      providers:',
                '        omnimux:',
                `          baseUrl: ${mock.origin}/v1`,
                '',
              ].join('\n');
              io.writeFileSync(
                join(omnimuxProfileDir, 'cordis.patch.yml'),
                base.replace(/\n*$/, '\n') + override,
                { mode: 0o600 },
              );
            }
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
          observations.runtimeStarted = true;
          observations.events.push({ event: 'spawn', pid: child.pid ?? null, parentPid: process.pid });
          child.once('exit', (code, signal) => {
            exited = true;
            observations.events.push({ event: 'exit', code: code ?? null, signal: signal ?? null });
            if (!cleaning) observations.unexpectedExit = true;
            no(failure('RUNTIME_EXIT'));
            void cleanup().catch(() => {});
          });
          child.once('close', (code, signal) => { closed = true; observations.events.push({ event: 'close', code: code ?? null, signal: signal ?? null }); });
          child.on('error', () => { observations.events.push({ event: 'error' }); no(failure('RUNTIME_START')); });
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
      const result = { origin: url.origin, summary, observations, cleanup };
      Object.defineProperty(result, 'loginUrl', { value: url.href, enumerable: false });
      Object.defineProperty(result, 'assertAlive', { value: () => {
        if (exited || closed || observations.unexpectedExit || observations.interrupted) throw failure('RUNTIME_EXIT');
      }, enumerable: false });
      return result;
    } catch (error) {
      const cleaned = await cleanup();
      const classified = safeError(error, 'PREPARE');
      classified.cleanup = cleaned;
      classified.observations = observations;
      throw classified;
    }
  };
}

/** Start a private complete core Web runtime. Callers must use try/finally cleanup.
 * `live` requires prior task-specific authorization and does not submit a model request.
 * loginUrl is a secret in-memory capability: never log it or put it in evidence.
 * Explicit taskPlugins + candidate select the ui-only, task-private installation path.
 * A legacy evidenceContext without taskPlugins still refuses to claim a fresh installation.
 * @param {{root: string, mode?: 'ui'|'onboarding'|'live', evidenceContext?: {taskId:string, runId:string}}} options
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
