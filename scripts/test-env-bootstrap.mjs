import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDevDeepSeekCredential } from './test-env-credentials.mjs';

const EXECUTABLE = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
const WRAPPER = '/Applications/OmniMux Dev.app/Contents/Resources/app.asar/lib/desktop-cli.js';
const OFFICIAL_ENDPOINT = 'https://api.deepseek.com';
const SYNTHETIC_KEY = 'QA-SYNTHETIC-NOT-A-REAL-KEY';
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = sourceRoot.split(`${sep}.worktrees${sep}`)[0];
const failure = code => Object.assign(new Error('TEST_ENV_' + code), { code: 'TEST_ENV_' + code });
function safeError(error, fallback) {
  const code = error?.code;
  return typeof code === 'string' && /^TEST_ENV_(?:CREDENTIAL_)?[A-Z_]+$/.test(code)
    ? Object.assign(new Error(code), { code }) : failure(fallback);
}
function canonical(io, path, directory) {
  const stat = io.lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || io.realpathSync(path) !== path) throw failure('ROOT_UNSAFE');
}
/** Validate the linked-worktree metadata without consulting cwd or inherited Git variables. */
function validateRoot(root, io, repo) {
  try {
    if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) !== root || dirname(root) !== join(repo, '.worktrees')) throw failure('ROOT_UNSAFE');
    for (const p of [repo, join(repo, '.worktrees'), root, join(repo, '.git'), join(repo, '.git/worktrees')]) canonical(io, p, true);
    const dotgit = join(root, '.git'); canonical(io, dotgit, false);
    const match = /^gitdir: (.+)\n?$/.exec(io.readFileSync(dotgit, 'utf8'));
    if (!match) throw failure('ROOT_UNSAFE');
    const gitdir = resolve(root, match[1].trim());
    if (dirname(gitdir) !== join(repo, '.git/worktrees')) throw failure('ROOT_UNSAFE');
    canonical(io, gitdir, true);
    for (const name of ['commondir', 'gitdir']) canonical(io, join(gitdir, name), false);
    if (resolve(gitdir, io.readFileSync(join(gitdir, 'commondir'), 'utf8').trim()) !== join(repo, '.git') || resolve(gitdir, io.readFileSync(join(gitdir, 'gitdir'), 'utf8').trim()) !== dotgit) throw failure('ROOT_UNSAFE');
    return root;
  } catch { throw failure('ROOT_UNSAFE'); }
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
      const credential = mode === 'live' ? (deps.readCredential ?? readDevDeepSeekCredential)() : undefined;
      if (mode === 'live' && (typeof credential !== 'string' || !credential.trim())) throw failure('CREDENTIAL_INVALID');
      privateDir = io.mkdtempSync(join(root, '.test-env-')); io.chmodSync(privateDir, 0o700);
      const paths = { HOME: 'home', DSH_HOME: 'dsh', DSH_AGENTS_HOME: 'agents', XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state', XDG_DATA_HOME: 'data', TMPDIR: 'tmp', TMP: 'tmp', TEMP: 'tmp' };
      const env = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', ELECTRON_RUN_AS_NODE: '1' };
      for (const [name, leaf] of Object.entries(paths)) { env[name] = join(privateDir, leaf); io.mkdirSync(env[name], { recursive: true, mode: 0o700 }); }
      if (mode === 'ui') mock = await startMock();
      const endpoint = mode === 'ui' ? mock.origin : OFFICIAL_ENDPOINT;
      if (mode !== 'onboarding') { env.DEEPSEEK_API_KEY = mode === 'ui' ? SYNTHETIC_KEY : credential; env.DEEPSEEK_BASE_URL = endpoint; }
      // JSON is YAML-compatible. The fresh fixed settings layer wins over bundle adapter defaults.
      io.writeFileSync(join(env.DSH_HOME, 'settings.yaml'), JSON.stringify({ 'llm-deepseek': { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: endpoint } }) + '\n', { mode: 0o600, flag: 'wx' });
      signals.on('SIGINT', onSignal); signals.on('SIGTERM', onSignal);
      const url = await new Promise((yes, no) => {
        startupReject = no;
        let buffer = '';
        const timer = setTimeout(() => no(failure('START_TIMEOUT')), deps.startupTimeoutMs ?? 60000);
        try {
          child = (deps.spawn ?? spawn)(EXECUTABLE, ['--expose-internals', WRAPPER, '--profile', 'web', '--port', '0', '--host', '127.0.0.1', '--no-open'], { cwd: env.HOME, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
      const summary = Object.freeze({ mode, origin: url.origin, evidenceLevel: 'core-only', taskPluginsInstalled: false, realModelRequest: false, modelConfiguration: mode === 'ui' ? 'QA模拟' : mode === 'live' ? 'authorized-dev-reference' : 'unconfigured' });
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
