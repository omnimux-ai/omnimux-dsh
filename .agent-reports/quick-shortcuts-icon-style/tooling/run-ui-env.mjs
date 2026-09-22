#!/usr/bin/env node
/**
 * 在任务工作树内起一套 `ui` 模式的完整应用测试环境，供 ego-browser 目视验收。
 *
 * 与 `scripts/test-env-bootstrap.mjs` 的差别只有两处，都是本任务必须的：
 *
 * 1. **加载本工作树的构建**：bootstrap 默认把开发版 profile 以**软链**挂进私有
 *    profile，客户端产物因此仍然是开发版（已合入 main 的旧构建）。这里在应用进程
 *    真正启动前（包一层 spawn）把 `node_modules/omnimux` 换成**真实文件**副本，
 *    并用工作树 `plugins/omnimux/lib/client.js` 覆盖它的客户端产物。
 *    `node_modules` 本身保留为按条目软链的目录，避免整份 1.6G 依赖被复制。
 * 2. **登记工作区**：环境的 `storages/workspace.json` 里 `workspaceIds` 为空时，
 *    Hero 停在「选择工作区才能开始」，界面上没有工作区可选。这里在启动前把
 *    bootstrap 已经铺好的 `qa-workspace-media` 夹具登记进 v2 工作区存储。
 *
 * 用法：node run-ui-env.mjs [--client <工作树 lib/client.js 路径>]
 * 输出：一行 JSON（origin + 摘要），随后常驻；SIGTERM/SIGINT 触发自清理。
 */
import { spawn as realSpawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestEnvironmentStarter } from '../../../scripts/test-env-bootstrap.mjs';

const WORKTREE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEV_PROFILE = join(process.env.HOME || '', '.omnimux-dev', 'profiles', 'omnimux');
const SEEDED_WORKSPACE_ID = 'ws_qa_media';

/** 解析 `--client <路径>`，默认取本工作树的客户端产物。 */
function resolveClientBundle(argv) {
  const at = argv.indexOf('--client');
  const candidate = at !== -1 && argv[at + 1] ? argv[at + 1] : join(WORKTREE_ROOT, 'plugins/omnimux/lib/client.js');
  const abs = resolve(candidate);
  if (!fs.existsSync(abs)) throw new Error(`CLIENT_BUNDLE_MISSING: ${abs}`);
  return abs;
}

/**
 * 把私有 profile 的 `node_modules/omnimux` 换成本工作树的真实文件副本。
 * 其余条目一律按条目软链回开发版，保证依赖解析不变、也不写开发版任何文件。
 */
function installWorktreeClient(dshHome, clientBundle) {
  const profileDir = join(dshHome, 'profiles', 'omnimux');
  const devModules = join(DEV_PROFILE, 'node_modules');
  if (!fs.existsSync(profileDir) || !fs.existsSync(devModules)) return { applied: false, reason: 'profile-missing' };

  const modulesDir = join(profileDir, 'node_modules');
  fs.rmSync(modulesDir, { recursive: true, force: true });
  fs.mkdirSync(modulesDir, { recursive: true });

  for (const entry of fs.readdirSync(devModules)) {
    if (entry === 'omnimux') continue;
    fs.symlinkSync(join(devModules, entry), join(modulesDir, entry));
  }

  const target = join(modulesDir, 'omnimux');
  fs.cpSync(join(devModules, 'omnimux'), target, { recursive: true, dereference: true });
  const clientPath = join(target, 'lib', 'client.js');
  fs.rmSync(clientPath, { force: true });
  fs.copyFileSync(clientBundle, clientPath);

  const marker = fs.readFileSync(clientPath, 'utf8').length;
  return { applied: true, clientPath, bytes: marker };
}

/** 把已铺好的夹具目录登记进工作区存储，否则 Hero 停在「选择工作区才能开始」。 */
function registerSeededWorkspace(dshHome) {
  const workspacePath = join(dshHome, 'workspaces', SEEDED_WORKSPACE_ID);
  if (!fs.existsSync(workspacePath)) return { applied: false, reason: 'fixture-missing' };

  const storagePath = join(dshHome, 'storages', 'workspace.json');
  fs.mkdirSync(dirname(storagePath), { recursive: true });
  const storage = fs.existsSync(storagePath)
    ? JSON.parse(fs.readFileSync(storagePath, 'utf8'))
    : { unit: { name: 'workspace', version: 2 }, global: {}, tables: {} };
  storage.unit = storage.unit || { name: 'workspace', version: 2 };
  storage.global = storage.global || {};
  storage.tables = storage.tables || {};
  storage.tables.workspaces = storage.tables.workspaces || {};

  const ids = Array.isArray(storage.global.workspaceIds) ? storage.global.workspaceIds : [];
  if (!ids.includes(SEEDED_WORKSPACE_ID)) ids.push(SEEDED_WORKSPACE_ID);
  storage.global.workspaceIds = ids;
  storage.global.initialized = true;
  storage.global.archivedSessionIds = Array.isArray(storage.global.archivedSessionIds)
    ? storage.global.archivedSessionIds
    : [];
  const now = new Date().toISOString();
  const previous = storage.tables.workspaces[SEEDED_WORKSPACE_ID] || {};
  storage.tables.workspaces[SEEDED_WORKSPACE_ID] = {
    ...previous,
    path: workspacePath,
    title: '测试工程',
    sessionIds: previous.sessionIds ?? [],
    // v2 工作区记录是严格 schema：缺 createdAt / updatedAt 会让插件树装载失败
    // （workspace 域报 “does not match its schema”），必须一并补上。
    createdAt: previous.createdAt ?? now,
    updatedAt: now,
  };

  fs.writeFileSync(storagePath, JSON.stringify(storage, null, 2) + '\n');
  return { applied: true, workspacePath };
}

/**
 * 让界面走中文：产品文案是中文，验收截图必须看到四条中文文案。
 * 只往隔离的私有 settings.yaml 里补一条语言偏好，不读也不写任何开发机私有状态。
 * 注意这份文件由 bootstrap 以 **JSON**（JSON 是 YAML 子集）写出，所以只能整体以
 * JSON 重写；在 JSON 文档后面追加 YAML 片段是非法文档，会让插件树装载失败。
 */
function applyChineseLocale(dshHome) {
  const settingsPath = join(dshHome, 'settings.yaml');
  if (!fs.existsSync(settingsPath)) return { applied: false, reason: 'settings-missing' };
  const current = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (current.locale) return { applied: false, reason: 'already-set' };
  fs.writeFileSync(settingsPath, JSON.stringify({ ...current, locale: { preference: 'zh' } }) + '\n', { mode: 0o600 });
  return { applied: true, settingsPath };
}

const argv = process.argv.slice(2);
const clientBundle = resolveClientBundle(argv);
const skipPrepare = argv.includes('--no-prepare');
const logPath = resolve(dirname(fileURLToPath(import.meta.url)), 'app-runtime.log');
const preparation = [];

const startTestEnvironment = createTestEnvironmentStarter({
  spawn: (command, args, options) => {
    const dshHome = options?.env?.DSH_HOME;
    if (dshHome && !skipPrepare) {
      preparation.push({ step: 'worktree-client', ...installWorktreeClient(dshHome, clientBundle) });
      preparation.push({ step: 'seeded-workspace', ...registerSeededWorkspace(dshHome) });
      preparation.push({ step: 'zh-locale', ...applyChineseLocale(dshHome) });
    }
    const child = realSpawn(command, args, options);
    // 应用起不来时唯一能看的证据就是它自己的输出，追加到本目录的 app-runtime.log 供排障。
    // 应用会把一次性登录链接（含 token）打到 stdout，落盘前必须脱敏。
    const log = fs.createWriteStream(logPath, { flags: 'a' });
    const write = (chunk) => log.write(String(chunk).replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1***'));
    child.stdout?.on('data', write);
    child.stderr?.on('data', write);
    return child;
  },
});

let env;
let closing = false;
const shutdown = async (code) => {
  if (closing) return;
  closing = true;
  try { await env?.cleanup(); } catch (error) { console.error(`cleanup: ${error?.code ?? error?.message}`); }
  process.exit(code);
};
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

try {
  env = await startTestEnvironment({ root: WORKTREE_ROOT, mode: 'ui' });
} catch (error) {
  console.error(JSON.stringify({ error: error?.code ?? error?.message, hint: error?.hint }));
  process.exit(1);
}

// loginUrl 是一次性能力：只交给驱动脚本，不打印、不写进任何报告。
// 落点选系统临时目录下的 0600 文件，且随环境关闭一并删除，不进仓库。
const HANDSHAKE_PATH = join(os.tmpdir(), 'omx-quick-shortcuts-qa-handshake.json');
fs.writeFileSync(HANDSHAKE_PATH, JSON.stringify({ origin: env.origin, loginUrl: env.loginUrl }), { mode: 0o600 });
const dropHandshake = () => { try { fs.rmSync(HANDSHAKE_PATH, { force: true }); } catch { /* 已清理 */ } };
process.on('exit', dropHandshake);

process.stdout.write(JSON.stringify({
  origin: env.origin,
  summary: env.summary,
  preparation,
  clientBundle,
  handshake: HANDSHAKE_PATH,
}) + '\n');

// 常驻等待外部信号；浏览器驱动脚本读上面的 stdout 拿 origin。
// 句柄留给收尾清理：收到终止信号或进程退出时一并清掉，不留悬挂定时器。
const keepAlive = setInterval(() => {}, 1 << 30);
const stopKeepAlive = () => { clearInterval(keepAlive); dropHandshake(); };
process.on('exit', stopKeepAlive);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { stopKeepAlive(); process.exit(0); });
}
