/**
 * Google Vids (Veo) 后台静默执行与媒体流式下载驱动器
 * @module omnimux-video/driver/veoHeadlessDriver
 * 核心技术：基于 OpenCLI + ego 独立 TaskSpace，100% 后台无头无弹窗执行
 *
 * Issue #2750: Dev/Electron Host PATH 常裁掉 nvm/homebrew。必须用绝对路径解析
 * opencli，并在多个候选中优先选择 bridgeConnected + 最高版本（避免误选 0.9.x）。
 */

import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SESSION_NAME = 'gvids_background'
const DEFAULT_DOC_URL = 'https://docs.google.com/videos/create'

/**
 * @param {string} version
 * @returns {number[]}
 */
export function parseSemverParts(version) {
  const m = String(version || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!m) return [0, 0, 0]
  return [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)]
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} positive if a>b
 */
export function compareSemver(a, b) {
  const pa = parseSemverParts(a)
  const pb = parseSemverParts(b)
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

/**
 * @param {{ existsSync?: typeof fs.existsSync, readdirSync?: typeof fs.readdirSync, env?: NodeJS.ProcessEnv, homedir?: () => string }} [io]
 * @returns {string[]}
 */
export function listOpenCliCandidates(io = {}) {
  const existsSync = io.existsSync || fs.existsSync
  const readdirSync = io.readdirSync || fs.readdirSync
  const env = io.env || process.env
  const home = (io.homedir || os.homedir)()
  /** @type {string[]} */
  const out = []
  const push = (p) => {
    if (p && existsSync(p) && !out.includes(p)) out.push(p)
  }

  push(env.OPENCLI_BIN || '')
  push(env.OMNIMUX_OPENCLI_BIN || '')

  try {
    const nvmNode = path.join(home, '.nvm/versions/node')
    if (existsSync(nvmNode)) {
      const versions = readdirSync(nvmNode)
        .filter((name) => /^v?\d/.test(name))
        .sort((a, b) => compareSemver(a.replace(/^v/, ''), b.replace(/^v/, '')))
        .reverse()
      for (const ver of versions) {
        push(path.join(nvmNode, ver, 'bin/opencli'))
      }
    }
  } catch {}

  push(path.join(home, '.local/bin/opencli'))
  push('/opt/homebrew/bin/opencli')
  push('/usr/local/bin/opencli')

  try {
    const which = execSync('command -v opencli || which opencli', {
      encoding: 'utf-8',
      timeout: 3000,
      shell: '/bin/zsh',
      env,
    }).trim()
    push(which)
  } catch {}

  return out
}

/**
 * @param {string} bin
 * @param {string[]} args
 * @param {{ timeout?: number, encoding?: BufferEncoding, maxBuffer?: number, env?: NodeJS.ProcessEnv }} [opts]
 */
function runOpenCliBin(bin, args, opts = {}) {
  const env = { ...(opts.env || process.env) }
  const dir = path.dirname(bin)
  env.PATH = [dir, env.PATH || ''].filter(Boolean).join(path.delimiter)
  return execFileSync(bin, args, {
    encoding: opts.encoding || 'utf-8',
    timeout: opts.timeout ?? 15000,
    maxBuffer: opts.maxBuffer,
    env,
  })
}

/**
 * Probe one binary for version + bridge.
 * @param {string} bin
 * @param {{ run?: typeof runOpenCliBin }} [deps]
 */
export function probeOpenCliBin(bin, deps = {}) {
  const run = deps.run || runOpenCliBin
  try {
    const version = String(run(bin, ['--version'], { timeout: 3000 })).trim()
    let bridgeConnected = false
    try {
      const doc = String(run(bin, ['doctor'], { timeout: 5000 }))
      bridgeConnected = doc.includes('Extension: connected') || doc.includes('[OK] Connectivity: connected')
    } catch {}
    return { bin, installed: true, version, bridgeConnected }
  } catch {
    return { bin, installed: false, version: '', bridgeConnected: false }
  }
}

/**
 * Choose the best opencli binary:
 * 1) OPENCLI_BIN override if runnable
 * 2) bridgeConnected candidates, highest semver
 * 3) otherwise highest semver installed candidate
 *
 * @param {{ list?: typeof listOpenCliCandidates, probe?: typeof probeOpenCliBin }} [deps]
 * @returns {{ bin: string | null, installed: boolean, version?: string, bridgeConnected: boolean }}
 */
export function resolveOpenCliEnvironment(deps = {}) {
  const list = deps.list || listOpenCliCandidates
  const probe = deps.probe || probeOpenCliBin
  const candidates = list()
  if (candidates.length === 0) {
    return { bin: null, installed: false, bridgeConnected: false }
  }

  const probed = candidates.map((bin) => probe(bin)).filter((item) => item.installed)
  if (probed.length === 0) {
    return { bin: null, installed: false, bridgeConnected: false }
  }

  const bridged = probed.filter((item) => item.bridgeConnected)
  const pool = bridged.length > 0 ? bridged : probed
  pool.sort((a, b) => compareSemver(b.version || '0', a.version || '0'))
  const best = pool[0]
  return {
    bin: best.bin,
    installed: true,
    version: best.version,
    bridgeConnected: best.bridgeConnected,
  }
}

/** @returns {string | null} */
export function resolveOpenCliBin() {
  return resolveOpenCliEnvironment().bin
}

/**
 * @param {string[]} args
 * @param {{ timeout?: number, encoding?: BufferEncoding, maxBuffer?: number }} [opts]
 */
function runOpenCli(args, opts = {}) {
  const bin = resolveOpenCliBin()
  if (!bin) throw new Error('opencli binary not found')
  return runOpenCliBin(bin, args, opts)
}

/**
 * 探测本地 OpenCLI 环境就绪状态
 * @returns {{ installed: boolean, version?: string, bridgeConnected: boolean, bin?: string | null }}
 */
export function detectOpenCliEnvironment() {
  const env = resolveOpenCliEnvironment()
  return {
    installed: env.installed,
    version: env.version,
    bridgeConnected: env.bridgeConnected,
    bin: env.bin,
  }
}

/**
 * 后台静默调度生成视频
 * @param {Object} options
 * @param {string} options.prompt - 提示词
 * @param {number} [options.durationSec=10] - 时长（今日仅回填返回值；不写入 Google Vids 页面控件）
 * @param {string} [options.outputDir] - 安全输出目录（必须在工作区内部）
 * @param {Function} [options.onProgress] - 进度回调
 * @remarks `mode`（create/modify/animate/extend）不被本函数消费；UI 校验用 VEO_TASK_SPEC，
 *   真接模式需另开行为单，勿在此 silently 加分支。
 */
export async function generateVideoSilently({
  prompt,
  durationSec = 10,
  outputDir,
  onProgress = () => {},
}) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('必须提供有效的视频生成提示词')
  }

  if (!resolveOpenCliBin()) {
    throw new Error('本机未找到 opencli 可执行文件（Dev Host PATH 可能被裁剪）')
  }

  const safeDir = outputDir || path.resolve(process.cwd(), '.workbuddy/demo/media')
  if (!fs.existsSync(safeDir)) {
    fs.mkdirSync(safeDir, { recursive: true })
  }

  onProgress({ percent: 3, phase: 'initializing', message: '正在初始化 ego 后台无头沙箱...' })

  // 1. 无头模式拉起会话，严禁前台弹窗
  runOpenCli(['browser', SESSION_NAME, 'open', DEFAULT_DOC_URL, '--window', 'background'], { timeout: 15000 })
  runOpenCli(['browser', SESSION_NAME, 'wait', 'time', '3'], { timeout: 10000 })

  // 2. 注入捕获器
  runOpenCli(['browser', SESSION_NAME, 'eval', `(() => {
    window.__LAST_GEN_URL__ = null;
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const res = await origFetch.apply(this, args);
      const clone = res.clone();
      clone.text().then(t => {
        if (t.includes('contribution-rt.usercontent.google.com/download')) {
          const m = t.match(/https:\\/\\/contribution-rt\\.usercontent\\.google\\.com\\/download[^\\"\\\\\\s]+/);
          if (m) window.__LAST_GEN_URL__ = m[0];
        }
      }).catch(() => {});
      return res;
    };
    return 'hooked';
  })()`], { timeout: 10000 })

  onProgress({ percent: 15, phase: 'ready', message: '沙箱就绪，正在展开创作抽屉...' })

  // 3. 打开抽屉
  runOpenCli(['browser', SESSION_NAME, 'click', '#content-library-rail-video-generation-element'], { timeout: 10000 })
  runOpenCli(['browser', SESSION_NAME, 'wait', 'time', '2'], { timeout: 10000 })

  runOpenCli(['browser', SESSION_NAME, 'eval', `(() => {
    const btn = document.querySelector('.collapsiblePromptBoxToggleExpansionButton');
    if (btn) btn.click();
    return true;
  })()`], { timeout: 10000 })

  onProgress({ percent: 28, phase: 'filling', message: '正在精准注入场景描述提示词...' })

  // 4. 填充提示词
  const fillSuccess = String(runOpenCli(['browser', SESSION_NAME, 'eval', `(() => {
    const tb = document.querySelector('div[role=textbox]');
    if (!tb) return false;
    const text = ${JSON.stringify(prompt)};
    tb.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, text);
    tb.dispatchEvent(new Event('input', { bubbles: true }));
    tb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`], { timeout: 10000 })).trim()

  if (fillSuccess !== 'true') {
    throw new Error('未能在后台页面中定位到 Google Vids 提示词输入框')
  }

  // 5. 触发生成
  onProgress({ percent: 35, phase: 'submitting', message: '正在向谷歌生成中枢派发渲染任务...' })
  runOpenCli(['browser', SESSION_NAME, 'click', '.collapsiblePromptBoxGenerateButton'], { timeout: 10000 })

  // 6. 等待成片直链
  let downloadUrl = null
  for (let round = 0; round < 25; round++) {
    const estimate = Math.min(35 + round * 2.5, 95)
    onProgress({ percent: Math.round(estimate), phase: 'rendering', message: '谷歌 Veo 大模型正在全力渲染多机位画面...' })

    const checkUrl = String(runOpenCli(['browser', SESSION_NAME, 'eval', 'window.__LAST_GEN_URL__'], { timeout: 8000 })).trim()
    if (checkUrl && checkUrl.startsWith('https://')) {
      downloadUrl = checkUrl
      break
    }
    runOpenCli(['browser', SESSION_NAME, 'wait', 'time', '2'], { timeout: 8000 })
  }

  if (!downloadUrl) {
    throw new Error('云端视频渲染排队超时，未能捕获成片媒体直链')
  }

  onProgress({ percent: 96, phase: 'downloading', message: '渲染完毕！正在流式拉取 MP4 落地到工作区...' })

  // 7. 分块流式保存
  const timestamp = Date.now()
  const fileName = `veo_export_${timestamp}.mp4`
  const targetPath = path.join(safeDir, fileName)

  const metaRaw = String(runOpenCli(['browser', SESSION_NAME, 'eval', `(() => {
    return fetch(${JSON.stringify(downloadUrl)}, { credentials: 'include' })
      .then(r => r.blob())
      .then(b => {
        window.__TEMP_VEO_BLOB__ = b;
        return JSON.stringify({ size: b.size, type: b.type });
      });
  })()`], { timeout: 15000 })).trim()

  const meta = JSON.parse(metaRaw)
  if (!meta || !meta.size || meta.size < 1000) {
    throw new Error('拉取的视频媒体字节异常，请检查网络或账号会话')
  }

  const fd = fs.openSync(targetPath, 'w')
  const chunkSize = 2 * 1024 * 1024
  let offset = 0
  while (offset < meta.size) {
    const end = Math.min(offset + chunkSize, meta.size)
    const b64 = String(runOpenCli(['browser', SESSION_NAME, 'eval', `(() => {
      const slice = window.__TEMP_VEO_BLOB__.slice(${offset}, ${end});
      return new Promise(res => {
        const r = new FileReader();
        r.onloadend = () => res(r.result.split(',')[1]);
        r.readAsDataURL(slice);
      });
    })()`], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 })).trim()
    fs.writeSync(fd, Buffer.from(b64, 'base64'))
    offset = end
  }
  fs.closeSync(fd)

  onProgress({ percent: 100, phase: 'completed', message: '成片已安全落盘并就绪！' })

  return {
    success: true,
    taskId: `task_veo_${timestamp}`,
    fileName,
    localPath: targetPath,
    fileSize: meta.size,
    durationSec,
    resolution: '720p',
    aspectRatio: '16:9',
  }
}
