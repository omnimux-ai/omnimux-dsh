import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { readDevDeepSeekCredential } from './test-env-credentials.mjs';
import { classifyPrivateRuntimeOutput, preparePrivateProductProfile } from './test-env-private-profile.mjs';
import { payloadManifest } from './materialize-graph.mjs';

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
const failure = code => Object.assign(new Error('TEST_ENV_' + code), { code: 'TEST_ENV_' + code });
function safeError(error, fallback) {
  const code = error?.code;
  if (typeof code === 'string' && /^TEST_ENV_(?:CREDENTIAL_)?[A-Z_]+$/.test(code)) {
    // 保留可读说明与精确原因：脱敏只针对底层原文，不能把面向调用者的提示一并丢掉。
    const reason = ['missing-config', 'auth-required', 'module-missing', 'address-in-use', 'permission-denied', 'network-failure', 'runtime-exception', 'timeout', 'output-limit', 'process-exit', 'process-start'].includes(error.reason) ? error.reason : undefined;
    const phase = ['seed', 'pack', 'install', 'runtime-start'].includes(error.phase) ? error.phase : undefined;
    return Object.assign(new Error(code), { code, hint: error.hint, rootReason: error.rootReason, reason, phase });
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

/**
 * @typedef {{id: string, name: string, arguments: string}} MockToolCall
 * @typedef {{content?: string, toolCalls?: MockToolCall[]}} MockChatResponse
 * @typedef {(input: Record<string, unknown>) => MockChatResponse | Promise<MockChatResponse>} MockChatResponder
 */
function validateMockChatResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !['content', 'toolCalls'].includes(key))
      || value.content !== undefined && (typeof value.content !== 'string' || Buffer.byteLength(value.content, 'utf8') > 65536)
      || value.toolCalls !== undefined && (!Array.isArray(value.toolCalls) || value.toolCalls.length > 8)) throw failure('MOCK_RESPONSE_INVALID');
  const ids = new Set();
  const toolCalls = (value.toolCalls ?? []).map(call => {
    if (!call || typeof call !== 'object' || Array.isArray(call)
        || Object.keys(call).some(key => !['id', 'name', 'arguments'].includes(key))
        || typeof call.id !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(call.id)
        || typeof call.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(call.name)
        || ids.has(call.id) || typeof call.arguments !== 'string'
        || Buffer.byteLength(call.arguments, 'utf8') > 65536) throw failure('MOCK_RESPONSE_INVALID');
    JSON.parse(call.arguments);
    ids.add(call.id);
    return { id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } };
  });
  return { content: value.content ?? (toolCalls.length ? null : ''), toolCalls };
}

/** Local-only protocol double; never forwards requests or echoes submitted content.
 * @param {MockChatResponder | undefined} mockChatResponse
 */
async function startMock(mockChatResponse) {
  let imageTasks = 0;
  /** task_id → 该任务的产物口味（文生图 / 图生图），决定 /v1/qa-media 回哪一张 PNG。 */
  const imageFlavourByTask = new Map();
  const server = createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    const requestPath = (req.url || '').split('?')[0];
    // 非 chat 车道的请求逐条打到 stderr：隔离环境的 mock 在父进程里，
    // 这条日志是「请求到底有没有到本机 mock」的唯一直接证据。
    if (!['/chat/completions', '/v1/chat/completions'].includes(requestPath)) {
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
    if (!['/chat/completions', '/v1/chat/completions'].includes(requestPath)) return reply(404, { error: { message: 'QA模拟：路径不支持' } });
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
      let response = { content: 'QA模拟：这是本机测试响应，不是真实模型结果。', toolCalls: [] };
      if (mockChatResponse) {
        try { response = validateMockChatResponse(await mockChatResponse(input)); }
        catch { return reply(500, { error: { code: 'TEST_ENV_MOCK_RESPONSE_ERROR', message: 'QA模拟：测试响应失败' } }); }
      }
      const { content, toolCalls } = response;
      const finishReason = toolCalls.length ? 'tool_calls' : 'stop';
      const base = { id: 'qa-local-completion', created: 0, model: 'qa-simulated-deepseek' };
      const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      if (input.stream === true) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
        const delta = { role: 'assistant', ...(content !== null ? { content } : {}) };
        if (toolCalls.length) delta.tool_calls = toolCalls.map((call, index) => ({ index, ...call }));
        for (const chunk of [
          { ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] },
          { ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage },
        ]) res.write('data: ' + JSON.stringify(chunk) + '\n\n');
        res.end('data: [DONE]\n\n');
      } else reply(200, { ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: finishReason }], usage });
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
 * @param {{fs?: typeof fs, repositoryRoot?: string, spawn?: typeof spawn, readCredential?: () => string, signals?: NodeJS.Process, startupTimeoutMs?: number, shutdownTimeoutMs?: number, mockChatResponse?: MockChatResponder}} [deps]
 */
export function createTestEnvironmentStarter(deps = {}) {
  const io = deps.fs ?? fs;
  const signals = deps.signals ?? process;
  return async function start(options = {}) {
    if (!options || typeof options !== 'object' || Object.keys(options).some(k => !['root', 'mode', 'assembly', 'taskPackages'].includes(k))) throw failure('OPTIONS');
    const { root, mode = 'ui', assembly = 'core', taskPackages = ['omnimux-workflow'] } = options;
    if (!['ui', 'onboarding', 'live'].includes(mode) || !['core', 'full'].includes(assembly)
        || !Array.isArray(taskPackages) || taskPackages.length === 0 || taskPackages.some(name => typeof name !== 'string' || !/^omnimux(?:-[a-z0-9]+)*$/.test(name))
        || new Set(taskPackages).size !== taskPackages.length) throw failure('OPTIONS');
    if (deps.mockChatResponse !== undefined && (typeof deps.mockChatResponse !== 'function' || mode !== 'ui')) throw failure('MOCK_RESPONSE_DEPENDENCY');
    validateRoot(root, io, deps.repositoryRoot ?? repositoryRoot);
    try { io.accessSync(EXECUTABLE, fs.constants.X_OK); } catch { throw failure('RUNTIME_MISSING'); }
    let privateDir, privateIdentity, mock, current, cleanupPromise, startupReject;
    let closing = false, restarting = false, restartPromise, restartCount = 0, login;
    const generations = [];
    const shutdownMs = deps.shutdownTimeoutMs ?? 5000;
    const hasExited = record => record.exited || record.child.exitCode !== null || record.child.signalCode !== null;
    const waitExit = async (record, milliseconds) => {
      if (hasExited(record)) return true;
      return new Promise(yes => {
        const onExit = () => { clearTimeout(timer); yes(true); };
        const timer = setTimeout(() => { record.child.off('exit', onExit); yes(false); }, milliseconds);
        record.child.once('exit', onExit);
      });
    };
    const stop = record => {
      if (record.stopPromise) return record.stopPromise;
      record.plannedStop = true; record.release();
      record.stopPromise = (async () => {
        try {
          if (hasExited(record)) return true;
          record.child.kill('SIGTERM');
          if (await waitExit(record, shutdownMs)) return true;
          record.child.kill('SIGKILL');
          return await waitExit(record, shutdownMs);
        } catch { return false; }
      })().finally(() => { record.stopPromise = undefined; });
      return record.stopPromise;
    };
    const onSignal = () => { startupReject?.(failure('INTERRUPTED')); void cleanup().catch(() => {}); };
    const cleanup = () => {
      closing = true; login = undefined;
      startupReject?.(failure('INTERRUPTED'));
      return cleanupPromise ??= (async () => {
        signals.off('SIGINT', onSignal); signals.off('SIGTERM', onSignal);
        let stopped = true;
        for (const record of generations) if (!await stop(record)) stopped = false;
        await mock?.close();
        if (!stopped) throw failure('CLEANUP_TIMEOUT');
        if (privateDir) {
          if (dirname(privateDir) !== root || !privateDir.startsWith(join(root, '.test-env-'))) throw failure('CLEANUP_UNSAFE');
          canonical(io, privateDir, true);
          const identity = io.lstatSync(privateDir);
          if (privateIdentity && (identity.dev !== privateIdentity.dev || identity.ino !== privateIdentity.ino)) throw failure('CLEANUP_UNSAFE');
          io.rmSync(privateDir, { recursive: true, force: true });
        }
        return { cleaned: true };
      })();
    };
    try {
      // Authorization for live credential access must already cover this task; selecting a mode does not grant it.
      let credential;
      let credentialBundle = null;
      if (mode === 'live') {
        if (deps.readCredential) {
          credential = deps.readCredential();
        } else if (deps.readCredentialsBundle) {
          credentialBundle = deps.readCredentialsBundle();
          credential = credentialBundle?.DEEPSEEK_API_KEY;
        } else {
          credential = readDevDeepSeekCredential();
        }
      }
      if (mode === 'live' && (typeof credential !== 'string' || !credential.trim())) throw failure('CREDENTIAL_INVALID');
      privateDir = io.mkdtempSync(join(root, '.test-env-')); io.chmodSync(privateDir, 0o700);
      const created = io.lstatSync(privateDir);
      if (created.dev !== undefined && created.ino !== undefined) privateIdentity = { dev: created.dev, ino: created.ino };
      const paths = { HOME: 'home', DSH_HOME: 'dsh', DSH_AGENTS_HOME: 'agents', XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state', XDG_DATA_HOME: 'data', TMPDIR: 'tmp', TMP: 'tmp', TEMP: 'tmp' };
      const basePath = io === fs
        ? `${dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
        : '/usr/bin:/bin:/usr/sbin:/sbin';
      const env = { PATH: basePath, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--max-http-header-size=65536' };
      for (const [name, leaf] of Object.entries(paths)) { env[name] = join(privateDir, leaf); io.mkdirSync(env[name], { recursive: true, mode: 0o700 }); }
      if (mode === 'ui') mock = await startMock(deps.mockChatResponse);
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
          runtimeAgentId: assembly === 'full' ? '' : 'codex',
          runtimeAgentVerified: assembly !== 'full',
          runtimeMode: assembly === 'full' ? 'key' : 'agent',
          runtimeAgentModel: '',
        };
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
            if (assembly === 'full') payloadManifest(fixtureSrc); // Refuse shared links in fixture inputs before copying.
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
      } catch (error) {
        if (assembly === 'full') throw failure('FIXTURE_PREPARE');
      }

      const profile = assembly === 'full'
        ? await preparePrivateProductProfile({ root, privateDir, env, mode, mockOrigin: mock?.origin, taskPackages, io, deps })
        : { profileName: 'web', pluginsInstalled: false, evidenceLevel: 'core-only', taskPluginsCount: 0, identities: [] };
      const { profileName, pluginsInstalled, evidenceLevel, taskPluginsCount } = profile;
      const seededDataDomains = [];

      const profilePath = assembly === 'full' ? join(env.DSH_HOME, 'profiles', profileName) : env.DSH_HOME;
      const profileStat = io.lstatSync(profilePath);
      const installedDigest = createHash('sha256').update(JSON.stringify(profile.identities)).digest('hex');
      const verifyPrivate = () => {
        canonical(io, privateDir, true); canonical(io, profilePath, true);
        const identity = io.lstatSync(privateDir), actualProfile = io.lstatSync(profilePath);
        if (privateIdentity && (identity.dev !== privateIdentity.dev || identity.ino !== privateIdentity.ino)
            || actualProfile.dev !== profileStat.dev || actualProfile.ino !== profileStat.ino) throw failure('PROFILE_IDENTITY');
        profile.verify?.();
        if (createHash('sha256').update(JSON.stringify(profile.identities)).digest('hex') !== installedDigest) throw failure('PROFILE_IDENTITY');
      };
      const command = ['--expose-internals', WRAPPER, '--profile', profileName, '--port', '0', '--host', '127.0.0.1', '--no-open'];
      const launch = async () => {
        if (closing) throw failure('INTERRUPTED');
        if (generations.length >= 32) throw failure('RESTART_LIMIT');
        let record;
        try {
          const url = await new Promise((yes, no) => {
            startupReject = no;
            let buffer = '', diagnosticTail = '', diagnosticReason, outputSize = 0;
            const runtimeFailure = (code, reason) => Object.assign(failure(code), { phase: 'runtime-start', reason: diagnosticReason ?? reason });
            const diagnosticOutput = chunk => {
              diagnosticTail = (diagnosticTail + chunk.toString()).slice(-16384);
              diagnosticReason = classifyPrivateRuntimeOutput(diagnosticTail) ?? diagnosticReason;
            };
            const timer = setTimeout(() => no(runtimeFailure('START_TIMEOUT', 'timeout')), deps.startupTimeoutMs ?? 60000);
            try {
              const child = (deps.spawn ?? spawn)(EXECUTABLE, command, { cwd: env.HOME, env, stdio: ['ignore', 'pipe', 'pipe'] });
              record = { child, exited: false, plannedStop: false, release: () => {} };
              generations.push(record); current = record;
              child.once('exit', () => {
                record.exited = true; no(runtimeFailure('RUNTIME_EXIT', 'process-exit'));
                if (!record.plannedStop && !restarting) void cleanup().catch(() => {});
              });
              child.on('error', () => no(runtimeFailure('RUNTIME_START', 'process-start')));
              const output = chunk => {
                diagnosticOutput(chunk); outputSize += chunk.length;
                buffer += chunk.toString();
                if (outputSize > 65536) { buffer = ''; no(runtimeFailure('OUTPUT_LIMIT', 'output-limit')); return; }
                let end;
                while ((end = buffer.indexOf('\n')) !== -1) {
                  const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
                  try { const candidate = parseLogin(line); if (candidate) yes(candidate); } catch (error) { no(error); }
                }
              };
              child.stdout.on('data', output);
              child.stderr.on('data', diagnosticOutput);
              record.release = () => { clearTimeout(timer); buffer = ''; diagnosticTail = ''; child.stdout.off('data', output); child.stderr.off('data', diagnosticOutput); child.stdout.resume(); child.stderr.resume(); };
            } catch { clearTimeout(timer); no(runtimeFailure('RUNTIME_START', 'process-start')); }
          });
          if (!record || hasExited(record)) throw failure('RUNTIME_EXIT');
          if (closing) throw failure('INTERRUPTED');
          verifyPrivate();
          return url;
        } finally { startupReject = undefined; record?.release(); }
      };
      signals.on('SIGINT', onSignal); signals.on('SIGTERM', onSignal);
      const url = await launch(); login = url;
      const summary = Object.freeze({
        mode,
        assembly,
        installedIdentities: profile.identities,
        installation: profile.installation ?? null,
        origin: url.origin,
        evidenceLevel,
        taskPluginsInstalled: pluginsInstalled,
        taskPluginsCount,
        seededDataDomains,
        realModelRequest: false,
        modelConfiguration: mode === 'ui' ? 'QA模拟' : mode === 'live' ? 'authorized-dev-reference' : 'unconfigured',
        seededWorkspace: hasSeededFixture ? seededWorkspaceId : null,
      });
      const provenance = () => ({
        profile: relative(privateDir, profilePath),
        privateIdentity: privateIdentity ? { ...privateIdentity } : null,
        profileIdentity: { dev: profileStat.dev ?? null, ino: profileStat.ino ?? null },
        installedDigest,
        projectRoot: relative(privateDir, join(env.DSH_HOME, 'workspaces')),
      });
      const receipt = (ok, reason, errorCode = null) => ({ ok, restarted: ok, restartCount, reason, errorCode, provenance: provenance() });
      const restart = () => {
        if (closing) return Promise.resolve(receipt(false, 'closed', 'TEST_ENV_INTERRUPTED'));
        if (restartPromise) return restartPromise;
        restarting = true; login = undefined;
        restartPromise = Promise.resolve().then(async () => {
          try {
            if (closing) throw failure('INTERRUPTED');
            verifyPrivate();
            if (generations.length >= 32) throw failure('RESTART_LIMIT');
            if (current && !await stop(current)) throw failure('RESTART_STOP_TIMEOUT');
            if (closing) throw failure('INTERRUPTED');
            verifyPrivate();
            const nextLogin = await launch();
            if (closing) throw failure('INTERRUPTED');
            login = nextLogin; restartCount++;
            return receipt(true, 'restarted');
          } catch (error) {
            login = undefined;
            const classified = safeError(error, 'RESTART_FAILED');
            const stopped = current ? await stop(current) : true;
            const errorCode = stopped ? classified.code : 'TEST_ENV_RESTART_STOP_TIMEOUT';
            const reason = !stopped ? 'shutdown-timeout' : classified.reason ?? ({
              TEST_ENV_INTERRUPTED: 'closed', TEST_ENV_RESTART_LIMIT: 'restart-limit',
              TEST_ENV_RESTART_STOP_TIMEOUT: 'shutdown-timeout', TEST_ENV_PROFILE_IDENTITY: 'identity-mismatch',
              TEST_ENV_ROOT_UNSAFE: 'identity-mismatch', TEST_ENV_UNSAFE_LOGIN_URL: 'unsafe-login-url',
            }[classified.code] ?? 'restart-failed');
            return receipt(false, reason, errorCode);
          } finally { restarting = false; restartPromise = undefined; }
        });
        return restartPromise;
      };
      const result = { summary, cleanup, restart };
      Object.defineProperty(result, 'origin', { get: () => login?.origin ?? null, enumerable: true });
      Object.defineProperty(result, 'loginUrl', { get: () => login?.href ?? null, enumerable: false });
      return result;
    } catch (error) {
      try { await cleanup(); } catch { throw failure('CLEANUP_FAILED'); }
      throw safeError(error, 'PREPARE');
    }
  };
}

/** Start the strict private product runtime; assembly='core' explicitly limits evidence to core.
 * Callers must use try/finally cleanup.
 * `live` requires prior task-specific authorization and does not submit a model request.
 * loginUrl is a secret in-memory capability: never log it or put it in evidence.
 * @param {{root: string, mode?: 'ui'|'onboarding'|'live'}} options
 */
const startProductEnvironment = createTestEnvironmentStarter();
export const startTestEnvironment = options => startProductEnvironment({ ...options, assembly: options?.assembly ?? 'full' });

// Deliberately no command execution or live credential entrypoint on the CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== 'preflight') throw failure('OPTIONS');
    validateRoot(process.argv[3], fs, repositoryRoot);
    try { fs.accessSync(EXECUTABLE, fs.constants.X_OK); } catch { throw failure('RUNTIME_MISSING'); }
    process.stdout.write(JSON.stringify({ ready: true, scope: 'core-only', credentialRead: false }) + '\n');
  } catch (error) { process.stderr.write(safeError(error, 'PREFLIGHT').message + '\n'); process.exitCode = 1; }
}
