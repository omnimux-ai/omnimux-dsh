/**
 * E2E：输入框下方四条快捷方式那一排在多宽度下的横向几何不变量（Issue #2588）。
 *
 * 被验行为：在**任意窗口宽度**下，那一排（及其内部的模型 / 参数控件）都不横向越出输入框卡片的左右缘；
 * 卡片进紧凑列（约 318px）时，参数胶囊与模型回执仍完整可见、不被裁切；四条快捷方式始终整组居中；
 * 卡片不超过自身的宽度上限，页面与这一排都不出现横向滚动条。
 *
 * 为什么是真端到端，而不是结构快照：
 *   - 起的是**本工作树自身构建**的真实应用（现构建 `plugins/omnimux/lib/client.js` 再装进私有 profile），
 *     用的是仓库共享入口 `scripts/test-env-bootstrap.mjs` 的 `ui` 合成模式（应用、模拟端点、私有
 *     profile 全在临时目录内，测完自清理，绝不写开发版 profile）；
 *   - 用真实无头 Chrome 加载真实页面、真实 React 渲染、真实布局引擎量 `getBoundingClientRect()`；
 *   - 断言全是**不变量**（越界量、居中偏差、溢出量、裁切量），没有钉死某一个窗口宽度的黄金数值。
 *
 * 与仓库共享环境的一处差别（否则量到的不是本工作树）：bootstrap 默认把开发版 profile **按条目软链**
 * 进私有 profile，于是宿主读到的会是开发版（已合入 main 的旧构建）。这里在真实 spawn 之前把
 * `node_modules/omnimux` 换成真实文件副本、写进本工作树刚构建的 `lib/client.js`，并登记夹具工作区
 * （`storages/workspace.json` 的 `workspaceIds` 为空时 Hero 会停在「选择工作区」）。
 * 与一次性量测脚本 `.agent-reports/quick-shortcut-link-chip/boot-app.mjs` 同源；本文件自带同一套垫片，
 * 不依赖 `.agent-reports/`（该目录在本机被 `.git/info/exclude` 排除，不是仓库资产）。
 *
 * 运行方式（需要一个工作树环境，而不是纯 node：依赖应用运行时 + 开发版 profile + 本机 Chrome）：
 *   node --test plugins/omnimux/tests/e2e/composer-quick-shortcuts-narrow-layout.e2e.test.mjs
 * 前置条件（缺任一项时整组用例按 `skip` 记并写明缺什么，不会假绿）：
 *   1. 应用运行时：/Applications/OmniMux Dev.app（`scripts/test-env-bootstrap.mjs` 的既有约定）；
 *   2. 开发版 profile：~/.omnimux-dev/profiles/omnimux（只读：仅按条目软链，不写一个字节）；
 *   3. 本机 Chrome / Chromium（可用 CHROME_PATH 指定）；
 *   4. 构建本工作树客户端产物所需的依赖（工作树内 `node_modules`；缺失时按报错提示先 `pnpm install`）。
 *
 * 是否被 CI 收集：**不收集**。本仓的 Hub 测试入口 `plugins/omnimux/scripts/run-tests.mjs` 只收集
 * `src/**\/*.test.js|ts`；`.github/workflows/quality-gate.yml` 也只跑它显式列出的测试路径，其中没有
 * `plugins/*\/tests/e2e/**`。本文件由「质量五步闭环」的端到端完整性门禁按路径识别（`tests/e2e/**`），
 * 由人或 Agent 在本工作树内显式执行。
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { createTestEnvironmentStarter } from '../../../../scripts/test-env-bootstrap.mjs'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
/** 任务工作树根：`plugins/omnimux/tests/e2e/` 向上四级。 */
const WORKTREE_ROOT = resolve(TEST_DIR, '../../../..')
const HUB_DIR = join(WORKTREE_ROOT, 'plugins', 'omnimux')
const HUB_CLIENT = join(HUB_DIR, 'lib', 'client.js')
/** 开发机上的开发版 profile（**只读**：只按条目软链，绝不写入）。 */
const DEV_PROFILE = join(process.env.HOME ?? '', '.omnimux-dev', 'profiles', 'omnimux')
/** bootstrap 预置的夹具工作区 id（`tests/fixtures/qa-workspace-media`）。 */
const SEEDED_WORKSPACE_ID = 'ws_qa_media'
const VIEWPORT_HEIGHT = 900
/** 扫描带：不解「某一个宽度」，而是证明「任意宽度」。步长与上一轮的几何量测一致，读数可逐宽度对拍。 */
const SWEEP = { from: 720, to: 1600, step: 20 }
/** 截图取证的宽度（宽窗 / 用户截图宽度 / 紧凑列）。 */
const EVIDENCE_WIDTHS = [1440, 1167, 900]
const SETTLE_MS = 260
/** 首次启动的内测声明遮罩的「关闭」类按钮文案。 */
const OVERLAY_LABELS = ['继续', '我知道了', '我已知晓', '知道了', '同意', '开始使用', '确定', '关闭']

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** 找到本机 Chrome / Chromium；找不到返回 null（调用方按 skip 记，不假绿）。 */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/homebrew/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path)) ?? null
}

/**
 * 现构建本工作树的 Hub 客户端产物——量到的必须是**这份源码**渲染出来的界面。
 * 复用插件自己的正式构建入口（`plugins/omnimux/package.json` 的 build）。
 */
function buildWorktreeClient() {
  const script = join(HUB_DIR, 'scripts', 'build-client.mjs')
  assert.ok(existsSync(script), `缺少构建入口：${script}`)
  const result = spawnSync(process.execPath, [script], { cwd: HUB_DIR, encoding: 'utf8' })
  if (result.status !== 0) {
    const tail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-12).join('\n')
    assert.fail(`构建本工作树客户端产物失败（工作树内 node_modules 是否已就绪？先跑 pnpm install）：\n${tail}`)
  }
  assert.ok(existsSync(HUB_CLIENT), `构建后仍无产物：${HUB_CLIENT}`)
  return { path: HUB_CLIENT, bytes: readFileSync(HUB_CLIENT).length }
}

/**
 * 把私有 profile 的 node_modules 换成本工作树可写的形态：
 * 除中枢包外的条目按条目软链回开发版（不复制依赖、不写开发版），中枢包复制成真实文件并写回本工作树产物。
 */
function installWorktreeClient(dshHome, bundlePath) {
  const profileDir = join(dshHome, 'profiles', 'omnimux')
  const devModules = join(DEV_PROFILE, 'node_modules')
  if (!existsSync(profileDir)) throw new Error(`SHIM_PROFILE_MISSING: 私有 profile 未生成：${profileDir}`)
  if (!existsSync(devModules)) throw new Error(`SHIM_DEV_MODULES_MISSING: 开发版依赖目录不存在：${devModules}`)

  const modulesDir = join(profileDir, 'node_modules')
  rmSync(modulesDir, { recursive: true, force: true })
  mkdirSync(modulesDir, { recursive: true })
  for (const entry of readdirSync(devModules)) {
    if (entry === 'omnimux') continue
    symlinkSync(join(devModules, entry), join(modulesDir, entry))
  }

  const target = join(modulesDir, 'omnimux')
  cpSync(join(devModules, 'omnimux'), target, { recursive: true, dereference: true })
  rmSync(join(target, 'lib', 'client.js'), { force: true })
  copyFileSync(bundlePath, join(target, 'lib', 'client.js'))
  return { packageDir: target }
}

/**
 * 登记夹具工作区：私有环境里 `storages/workspace.json` 的 `workspaceIds` 为空时 Hero 停在「选择工作区」，
 * 输入框这一片根本不会渲染。v2 工作区记录是严格 schema，缺 `createdAt` / `updatedAt` 会让插件树装载失败。
 */
function registerSeededWorkspace(dshHome) {
  const workspacePath = join(dshHome, 'workspaces', SEEDED_WORKSPACE_ID)
  if (!existsSync(workspacePath)) throw new Error(`SHIM_FIXTURE_MISSING: 夹具工作区不存在：${workspacePath}`)

  const storagePath = join(dshHome, 'storages', 'workspace.json')
  mkdirSync(dirname(storagePath), { recursive: true })
  const storage = existsSync(storagePath)
    ? JSON.parse(readFileSync(storagePath, 'utf8'))
    : { unit: { name: 'workspace', version: 2 }, global: {}, tables: {} }
  storage.unit = storage.unit || { name: 'workspace', version: 2 }
  storage.global = storage.global || {}
  storage.tables = storage.tables || {}
  storage.tables.workspaces = storage.tables.workspaces || {}

  const ids = Array.isArray(storage.global.workspaceIds) ? storage.global.workspaceIds : []
  if (!ids.includes(SEEDED_WORKSPACE_ID)) ids.push(SEEDED_WORKSPACE_ID)
  storage.global.workspaceIds = ids
  storage.global.initialized = true
  storage.global.archivedSessionIds = Array.isArray(storage.global.archivedSessionIds) ? storage.global.archivedSessionIds : []
  const now = new Date().toISOString()
  const previous = storage.tables.workspaces[SEEDED_WORKSPACE_ID] || {}
  storage.tables.workspaces[SEEDED_WORKSPACE_ID] = {
    ...previous,
    path: workspacePath,
    title: '测试工程',
    sessionIds: previous.sessionIds ?? [],
    createdAt: previous.createdAt ?? now,
    updatedAt: now,
  }
  writeFileSync(storagePath, JSON.stringify(storage, null, 2) + '\n')
  return { workspaceId: SEEDED_WORKSPACE_ID }
}

/**
 * 页面内量测：一次取回一个宽度下的全部原始读数（不做任何判定，判定全在本文件里）。
 * 越界量 = 元素右缘 − 卡片右缘（>0 即越界）；裁切量 = scrollWidth − clientWidth（>0 即内容被裁）。
 */
const MEASURE_EXPRESSION = `JSON.stringify((() => {
  const round2 = (value) => Math.round(value * 100) / 100;
  const box = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      left: round2(rect.left),
      right: round2(rect.right),
      top: round2(rect.top),
      bottom: round2(rect.bottom),
      width: round2(rect.width),
      height: round2(rect.height),
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      clipX: round2(node.scrollWidth - node.clientWidth),
    };
  };
  const doc = document.documentElement;
  const card = document.querySelector('[data-composer-card]');
  const row = document.querySelector('[data-omnimux-quick-shortcuts]');
  const controls = document.querySelector('[data-omx-quick-shortcut-controls]');
  const mediaControls = document.querySelector('[data-omx-quick-shortcut-controls] .omx-media-config-controls');
  const cardBox = box(card);
  const rowBox = box(row);
  const cardMaxWidth = card ? getComputedStyle(card).maxWidth : null;

  const descendants = [];
  if (row) {
    for (const node of row.querySelectorAll('*')) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      descendants.push({ cls: String(node.className || node.tagName).slice(0, 48), left: round2(rect.left), right: round2(rect.right) });
    }
  }
  const contentRight = descendants.length ? Math.max(...descendants.map((item) => item.right)) : null;
  const contentLeft = descendants.length ? Math.min(...descendants.map((item) => item.left)) : null;
  const insideCard = (rect) => (rect && cardBox ? rect.left >= cardBox.left - 0.5 && rect.right <= cardBox.right + 0.5 : null);

  const capsules = [...document.querySelectorAll('.omx-capsule-trigger')].map((node) => {
    const rect = box(node);
    return { label: (node.textContent || '').trim().slice(0, 32), ...rect, insideCard: insideCard(rect) };
  });
  const summary = document.querySelector('[data-omx-media-config-summary], .omx-media-config-summary');
  const summaryBox = box(summary);
  const buttons = [...document.querySelectorAll('[data-omx-quick-shortcut]')].map((node) => ({ id: node.getAttribute('data-omx-quick-shortcut'), ...box(node) }));
  const buttonsLeft = buttons.length ? Math.min(...buttons.map((item) => item.left)) : null;
  const buttonsRight = buttons.length ? Math.max(...buttons.map((item) => item.right)) : null;
  const buttonsTops = buttons.map((item) => item.top);
  const controlsTops = mediaControls ? [...mediaControls.children].map((node) => Math.round(node.getBoundingClientRect().top)) : [];
  // 单行渲染所需的宽度（各子节点实测宽之和）：它大于可用宽时，「不越界」就只可能靠折行达成。
  const controlsChildWidthSum = mediaControls
    ? round2([...mediaControls.children].reduce((sum, node) => sum + node.getBoundingClientRect().width, 0))
    : null;

  return {
    viewportWidth: window.innerWidth,
    density: document.documentElement.getAttribute('data-omnimux-composer-density'),
    cardMaxWidth,
    cardMaxWidthPx: cardMaxWidth && cardMaxWidth !== 'none' ? round2(parseFloat(cardMaxWidth)) : null,
    document: { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, overflowX: doc.scrollWidth - doc.clientWidth },
    card: cardBox,
    row: rowBox,
    content: {
      count: descendants.length,
      left: contentLeft,
      right: contentRight,
      rightOverCard: cardBox && contentRight !== null ? round2(contentRight - cardBox.right) : null,
      leftOverCard: cardBox && contentLeft !== null ? round2(cardBox.left - contentLeft) : null,
    },
    controls: box(controls),
    mediaControls: box(mediaControls),
    controlsChildWidthSum,
    controlsRows: new Set(controlsTops).size,
    capsules,
    summary: summaryBox
      ? { ...summaryBox, insideCard: insideCard(summaryBox), text: (summary.textContent || '').trim().slice(0, 40) }
      : null,
    buttons,
    buttonsSameLine: buttonsTops.length > 1 ? round2(Math.max(...buttonsTops) - Math.min(...buttonsTops)) < 2 : null,
    centering: (buttonsLeft !== null && rowBox)
      ? {
        gapLeft: round2(buttonsLeft - rowBox.left),
        gapRight: round2(rowBox.right - buttonsRight),
        delta: round2(Math.abs((buttonsLeft - rowBox.left) - (rowBox.right - buttonsRight))),
      }
      : null,
  };
})())`

/** 每一个宽度都要成立的判定：失败时把出问题的宽度与读数一并报出来。 */
function assertEveryWidth(sweep, judge, label) {
  const failures = []
  for (const item of sweep) {
    const verdict = judge(item)
    if (verdict !== true) failures.push(`${item.viewportWidth}px → ${verdict}`)
  }
  assert.equal(failures.length, 0, `${label}（扫描 ${sweep.length} 个宽度，失败 ${failures.length} 个）：\n${failures.join('\n')}`)
}

/** 全量清扫：CDP 连接、Chrome、私有测试环境，一个都不留。 */
async function closeChrome(session) {
  if (!session) return
  try { session.socket?.close() } catch { /* 连接已断 */ }
  const child = session.chrome
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((done) => child.once('exit', done))
    child.kill('SIGTERM')
    await Promise.race([exited, sleep(4000)])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await Promise.race([exited, sleep(4000)])
    }
  }
  if (session.profileDir) rmSync(session.profileDir, { recursive: true, force: true })
}

/** 起无头 Chrome 并连上 CDP，返回发送 / 求值 / 等待句柄；失败时自己收干净。 */
async function startChrome(chromePath) {
  const profileDir = mkdtempSync(join(tmpdir(), 'omx-narrow-layout-chrome-'))
  const chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', `--user-data-dir=${profileDir}`,
    `--window-size=${SWEEP.from},${VIEWPORT_HEIGHT}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const session = { chrome, profileDir, socket: null }
  try {
    const port = await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('CHROME_START_TIMEOUT: 20s 内没等到 DevTools 端口')), 20000)
      let buffer = ''
      chrome.stderr.on('data', (chunk) => {
        buffer += chunk.toString()
        const matched = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer)
        if (matched) { clearTimeout(timer); done(Number(matched[1])) }
      })
      chrome.once('error', (error) => { clearTimeout(timer); fail(error) })
    })
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const target = targets.find((item) => item.type === 'page')
    assert.ok(target?.webSocketDebuggerUrl, '未找到 Chrome page 目标')

    const socket = new WebSocket(target.webSocketDebuggerUrl)
    session.socket = socket
    await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail })

    let sequence = 0
    const pending = new Map()
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (!message.id || !pending.has(message.id)) return
      const { done, fail } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) fail(new Error(`CDP ${message.method} 失败：${message.error.message}`))
      else done(message.result)
    }
    const send = (method, params) => new Promise((done, fail) => {
      const id = ++sequence
      pending.set(id, { done, fail })
      socket.send(JSON.stringify({ id, method, params: params ?? {} }))
    })
    session.send = send
    session.evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      const raw = result?.result?.value
      if (typeof raw !== 'string') return null
      try { return JSON.parse(raw) } catch { return raw }
    }
    session.waitFor = async (expression, label, budgetMs = 20000) => {
      const deadline = Date.now() + budgetMs
      for (;;) {
        const value = await session.evaluate(expression)
        if (value) return value
        if (Date.now() > deadline) throw new Error(`WAIT_TIMEOUT: ${label}`)
        await sleep(200)
      }
    }
    session.screenshot = async (name) => {
      const result = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(session.evidenceDir, name)
      writeFileSync(file, Buffer.from(result.data, 'base64'))
      return file
    }
    return session
  } catch (error) {
    await closeChrome(session)
    throw error
  }
}

/** 共享状态：一次启动、一次扫描，各条不变量分别断言。 */
const state = {
  skip: null,
  env: null,
  session: null,
  sweep: [],
  shots: [],
  clientBundle: null,
}

before(async () => {
  const chromePath = findChrome()
  if (!chromePath) {
    state.skip = '未找到 Chrome / Chromium 可执行文件：设 CHROME_PATH 或安装 Chrome 后重跑；本用例需要真实布局引擎。'
    return
  }

  state.clientBundle = buildWorktreeClient()

  const startTestEnvironment = createTestEnvironmentStarter({
    spawn: (command, args, spawnOptions) => {
      const dshHome = spawnOptions?.env?.DSH_HOME
      if (!dshHome) throw new Error('PRIVATE_DSH_HOME_MISSING: 私有 profile 未就绪')
      installWorktreeClient(dshHome, state.clientBundle.path)
      registerSeededWorkspace(dshHome)
      return spawn(command, args, spawnOptions)
    },
  })

  try {
    state.env = await startTestEnvironment({ root: WORKTREE_ROOT, mode: 'ui' })
  } catch (error) {
    if (error?.code === 'TEST_ENV_RUNTIME_MISSING') {
      state.skip = `缺少应用运行时（${error.code}）：本用例需要一个可跑的真实应用，请在装有 OmniMux 开发版运行时的机器上重跑。`
      return
    }
    throw error
  }

  state.session = await startChrome(chromePath)
  state.session.evidenceDir = mkdtempSync(join(tmpdir(), 'omx-narrow-layout-shots-'))
  const { send, evaluate, waitFor } = state.session

  // 登录 URL 是含 token 的能力：只在内存里换同源 Cookie，不打印、不落盘。
  const login = await fetch(state.env.loginUrl, { redirect: 'manual' })
  const rawCookie = login.headers.getSetCookie()[0] ?? ''
  const cookieName = rawCookie.split('=')[0]
  const cookieValue = rawCookie.split(';')[0].slice(cookieName.length + 1)
  assert.ok(cookieName && cookieValue, `同源登录未拿到 Cookie（HTTP ${login.status}）`)

  await send('Runtime.enable')
  await send('Network.enable')
  await send('Page.enable')
  await send('Network.setCookie', {
    name: cookieName, value: cookieValue, domain: new URL(state.env.origin).hostname, path: '/',
    url: `${state.env.origin}/`, secure: false, sameSite: 'Lax',
  })
  const version = await send('Browser.getVersion')
  await send('Network.setUserAgentOverride', { userAgent: version.userAgent, acceptLanguage: 'zh-CN,zh;q=0.9' })
  try { await send('Emulation.setLocaleOverride', { locale: 'zh-CN' }) } catch { /* 旧版 Chrome 无此命令 */ }

  await send('Page.navigate', { url: `${state.env.origin}/` })
  await waitFor(`JSON.stringify(Boolean(document.querySelector('[data-composer-input="true"]')))`, '输入框就绪')
  await waitFor(`JSON.stringify(Boolean(document.querySelector('[data-omx-quick-shortcut="clone"]')))`, '四条快捷方式就绪')

  // 点「复刻爆款视频」——出现模型 / 参数控件的两条之一，也正是用户截图里溢出的那一态。
  await evaluate(`(() => { const node = document.querySelector('[data-omx-quick-shortcut="clone"]'); if (node) node.click(); return JSON.stringify({ ok: Boolean(node) }); })()`)
  await waitFor(`JSON.stringify(Boolean(document.querySelector('[data-omx-quick-shortcut-controls] .omx-media-config-controls')))`, '模型 / 参数控件就绪')
  await waitFor(
    `JSON.stringify((() => { const node = document.querySelector('[data-omx-media-config-summary]'); if (!node) return false; const text = (node.textContent || '').trim(); return Boolean(text) && text.indexOf('选择模型') === -1; })())`,
    '模型回执就绪',
  )

  // 首次启动的内测声明浮层会盖住输入框这一片：它只是遮罩、不参与几何量测，但先关掉才能看清被验对象。
  const closed = await evaluate(`JSON.stringify((() => {
    const labels = ${JSON.stringify(OVERLAY_LABELS)};
    const nodes = [...document.querySelectorAll('button, [role="button"], a')];
    const hit = nodes.find((node) => labels.includes((node.textContent || '').trim()));
    if (hit) { hit.click(); return (hit.textContent || '').trim(); }
    return null;
  })())`)
  if (!closed) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  }
  await sleep(400)

  // 多宽度扫描：720px → 1600px。不变量必须**逐宽度**成立，不看某一个宽度是否好看。
  for (let width = SWEEP.from; width <= SWEEP.to; width += SWEEP.step) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false })
    await sleep(SETTLE_MS)
    const geometry = await evaluate(MEASURE_EXPRESSION)
    assert.ok(geometry?.card && geometry?.row, `${width}px：量不到输入框卡片或快捷方式那一排`)
    state.sweep.push(geometry)
  }

  // 证据宽度各留一张整窗截图（放在临时目录，不落进仓库）。
  for (const width of EVIDENCE_WIDTHS) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false })
    await sleep(500)
    state.shots.push(await state.session.screenshot(`narrow-layout-${width}.png`))
  }

  const cardWidths = state.sweep.map((item) => item.card.width)
  console.log(`[e2e] 客户端产物 ${state.clientBundle.bytes} 字节；扫描 ${SWEEP.from}–${SWEEP.to}px（步长 ${SWEEP.step}，${state.sweep.length} 个宽度），卡片宽 ${Math.min(...cardWidths)}–${Math.max(...cardWidths)}`)
  console.log(`[e2e] 证据宽度读数：${state.sweep.filter((item) => EVIDENCE_WIDTHS.includes(item.viewportWidth)).map((item) => `${item.viewportWidth}px 卡片${item.card.width} 内容右溢${item.content.rightOverCard} 居中偏差${item.centering?.delta} 控件行数${item.controlsRows}`).join('；')}`)
  console.log(state.shots.map((file) => `[e2e] 截图 ${file}`).join('\n'))
})

after(async () => {
  await closeChrome(state.session)
  if (state.env) {
    const result = await state.env.cleanup()
    assert.equal(result?.cleaned, true, '私有测试环境未清理干净')
  }
})

describe('E2E(#2588)：输入框下方快捷方式那一排的横向几何不变量（真实浏览器）', () => {
  it('夹具是真的：复刻态的四条快捷方式、两个胶囊、模型回执都在，且扫描覆盖紧凑列与宽列', (t) => {
    if (state.skip) return t.skip(state.skip)
    const sweep = state.sweep
    assert.ok(sweep.length >= 20, `扫描宽度太少（${sweep.length}），不构成「任意宽度」`)

    for (const item of sweep) {
      assert.equal(item.buttons.length, 4, `${item.viewportWidth}px：必须渲染四条快捷方式`)
      assert.deepEqual(
        item.buttons.map((button) => button.id).sort(),
        ['breakdown', 'clone', 'reverse', 'selling'],
        `${item.viewportWidth}px：四条快捷方式的身份不对`,
      )
      assert.equal(item.capsules.length, 2, `${item.viewportWidth}px：复刻态必须有两个胶囊（模型 / 参数）`)
      assert.ok(item.summary, `${item.viewportWidth}px：必须有模型回执`)
      assert.ok(item.summary.text, `${item.viewportWidth}px：模型回执不能是空文本（模型目录未加载完就量了）`)
    }

    const compact = sweep.filter((item) => item.card.width <= 360)
    const wide = sweep.filter((item) => item.card.width >= 680)
    assert.ok(compact.length >= 3, `扫描里没有紧凑列读数（卡片最窄 ${Math.min(...sweep.map((item) => item.card.width))}px），这条用例的病灶态没被覆盖`)
    assert.ok(wide.length >= 3, '扫描里没有宽列读数，无法证明宽窗不回归')
    // 紧凑列下「不越界」不能是碰巧：先证明单行放不下（单行所需宽度 > 可用宽），再证明它确实折了行。
    for (const item of compact) {
      assert.ok(
        item.controlsChildWidthSum > item.card.width,
        `${item.viewportWidth}px（卡片 ${item.card.width}px）：紧凑列下模型 / 参数控件本应放不下单行，实测单行宽 ${item.controlsChildWidthSum}px`,
      )
      assert.ok(item.controlsRows >= 2, `${item.viewportWidth}px（卡片 ${item.card.width}px）：紧凑列下模型 / 参数控件应折行，实测 ${item.controlsRows} 行`)
    }
  })

  it('不变量一：任意宽度下这一排的内容都不越出输入框卡片的左右缘', (t) => {
    if (state.skip) return t.skip(state.skip)
    assertEveryWidth(state.sweep, (item) => {
      if (item.content.rightOverCard === null) return '量不到内容右缘'
      if (item.content.rightOverCard > 0.5) return `内容右缘越出卡片右缘 ${item.content.rightOverCard}px`
      if (item.content.leftOverCard > 0.5) return `内容左缘越出卡片左缘 ${item.content.leftOverCard}px`
      return true
    }, '这一排及其内部内容的右/左缘必须始终落在输入框卡片内')

    assertEveryWidth(state.sweep, (item) => {
      const rightOver = Math.round((item.row.right - item.card.right) * 100) / 100
      const leftOver = Math.round((item.card.left - item.row.left) * 100) / 100
      if (rightOver > 0.5) return `这一排右缘越出卡片 ${rightOver}px`
      if (leftOver > 0.5) return `这一排左缘越出卡片 ${leftOver}px`
      return true
    }, '这一排整体必须在输入框卡片左右缘之内')
  })

  it('不变量二：紧凑列下参数胶囊与模型回执完整落在卡片内，且自身内容不被裁切', (t) => {
    if (state.skip) return t.skip(state.skip)
    assertEveryWidth(state.sweep, (item) => {
      for (const capsule of item.capsules) {
        if (capsule.insideCard !== true) return `胶囊「${capsule.label}」落在卡片外（${capsule.left}→${capsule.right}，卡片 ${item.card.left}→${item.card.right}）`
        if (capsule.clipX > 1) return `胶囊「${capsule.label}」内部被裁切 ${capsule.clipX}px`
      }
      return true
    }, '两个胶囊必须在任意宽度下完整可见（含紧凑列）')

    assertEveryWidth(state.sweep, (item) => {
      if (item.summary.insideCard !== true) return `模型回执落在卡片外（${item.summary.left}→${item.summary.right}，卡片右缘 ${item.card.right}）`
      if (item.summary.width <= 40) return `模型回执被压成 ${item.summary.width}px，等于看不清`
      if (item.summary.clipX > 1) return `模型回执内部被裁切 ${item.summary.clipX}px`
      return true
    }, '模型回执必须在任意宽度下完整可见且不被压扁')
  })

  it('不变量三：任意宽度下四条快捷方式整组居中', (t) => {
    if (state.skip) return t.skip(state.skip)
    assertEveryWidth(state.sweep, (item) => {
      if (!item.centering) return '量不到这一排的居中度'
      if (item.centering.delta >= 2) {
        return `整组不居中：左留白 ${item.centering.gapLeft}px / 右留白 ${item.centering.gapRight}px（差 ${item.centering.delta}px）`
      }
      return true
    }, '四条快捷方式的并集包围盒必须在每一排里左右留白相等（换行后逐行同样成立）')
  })

  it('不变量四：卡片不超过自身宽度上限，页面与这一排都没有横向滚动条', (t) => {
    if (state.skip) return t.skip(state.skip)
    assertEveryWidth(state.sweep, (item) => {
      if (item.cardMaxWidthPx !== null && item.card.width > item.cardMaxWidthPx + 0.5) {
        return `卡片 ${item.card.width}px 超过宽度上限 ${item.cardMaxWidthPx}px`
      }
      if (item.card.width > item.viewportWidth) return `卡片 ${item.card.width}px 比窗口 ${item.viewportWidth}px 还宽`
      if (item.document.overflowX > 0) return `页面出现横向滚动条，横溢 ${item.document.overflowX}px`
      if (item.row.clipX > 1) return `这一排自身横向溢出 ${item.row.clipX}px`
      if (item.controls && item.controls.clipX > 1) return `控件行横向溢出 ${item.controls.clipX}px`
      if (item.mediaControls && item.mediaControls.clipX > 1) return `共享控件本体横向溢出 ${item.mediaControls.clipX}px`
      return true
    }, '卡片宽度受上限约束，且任何一层都不产生横向滚动条')
  })

  it('不回归：这一排的实测宽恒等于输入框卡片实测宽（跟随卡片，而不是各算各的公式）', (t) => {
    if (state.skip) return t.skip(state.skip)
    assertEveryWidth(state.sweep, (item) => {
      const delta = Math.abs(Math.round((item.row.width - item.card.width) * 100) / 100)
      return delta <= 1 ? true : `这一排 ${item.row.width}px 与卡片 ${item.card.width}px 宽差 ${delta}px`
    }, '这一排与输入框卡片必须逐宽度同宽')
  })
})
