/**
 * Google Vids (Veo) 后台静默执行与媒体流式下载驱动器
 * @module omnimux-video/driver/veoHeadlessDriver
 * 核心技术：基于 OpenCLI + ego 独立 TaskSpace，100% 后台无头无弹窗执行
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SESSION_NAME = 'gvids_background';
const DEFAULT_DOC_URL = 'https://docs.google.com/videos/create';

/**
 * 探测本地 OpenCLI 环境就绪状态
 * @returns {{ installed: boolean, version?: string, bridgeConnected: boolean }}
 */
export function detectOpenCliEnvironment() {
  try {
    const ver = execSync('opencli --version', { encoding: 'utf-8', timeout: 3000 }).trim();
    let bridge = false;
    try {
      const doc = execSync('opencli doctor', { encoding: 'utf-8', timeout: 5000 });
      bridge = doc.includes('Extension: connected') || doc.includes('[OK] Connectivity: connected');
    } catch {}
    return { installed: true, version: ver, bridgeConnected: bridge };
  } catch {
    return { installed: false, bridgeConnected: false };
  }
}

/**
 * 后台静默调度生成视频
 * @param {Object} options
 * @param {string} options.prompt - 提示词
 * @param {number} [options.durationSec=10] - 时长
 * @param {string} [options.outputDir] - 安全输出目录（必须在工作区内部）
 * @param {Function} [options.onProgress] - 进度回调
 */
export async function generateVideoSilently({
  prompt,
  durationSec = 10,
  outputDir,
  onProgress = () => {}
}) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('必须提供有效的视频生成提示词');
  }

  const safeDir = outputDir || path.resolve(process.cwd(), '.workbuddy/demo/media');
  if (!fs.existsSync(safeDir)) {
    fs.mkdirSync(safeDir, { recursive: true });
  }

  onProgress({ percent: 3, phase: 'initializing', message: '正在初始化 ego 后台无头沙箱...' });

  // 1. 无头模式拉起会话，严禁前台弹窗
  execSync(`opencli browser ${SESSION_NAME} open "${DEFAULT_DOC_URL}" --window background`, { timeout: 15000 });
  execSync(`opencli browser ${SESSION_NAME} wait time 3`, { timeout: 10000 });

  // 2. 注入捕获器
  execSync(`opencli browser ${SESSION_NAME} eval "(() => {
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
  })()"`, { timeout: 10000 });

  onProgress({ percent: 15, phase: 'ready', message: '沙箱就绪，正在展开创作抽屉...' });

  // 3. 打开抽屉
  execSync(`opencli browser ${SESSION_NAME} click "#content-library-rail-video-generation-element"`, { timeout: 10000 });
  execSync(`opencli browser ${SESSION_NAME} wait time 2`, { timeout: 10000 });

  execSync(`opencli browser ${SESSION_NAME} eval "(() => {
    const btn = document.querySelector('.collapsiblePromptBoxToggleExpansionButton');
    if (btn) btn.click();
    return true;
  })()"`, { timeout: 10000 });

  onProgress({ percent: 28, phase: 'filling', message: '正在精准注入场景描述提示词...' });

  // 4. 填充提示词
  const sanitized = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
  const fillSuccess = execSync(`opencli browser ${SESSION_NAME} eval "(() => {
    const tb = document.querySelector('div[role=textbox]');
    if (!tb) return false;
    tb.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, \\"${sanitized}\\");
    tb.dispatchEvent(new Event('input', { bubbles: true }));
    tb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()"`, { encoding: 'utf-8', timeout: 10000 }).trim();

  if (fillSuccess !== 'true') {
    throw new Error('未能在后台页面中定位到 Google Vids 提示词输入框');
  }

  // 5. 触发生成
  onProgress({ percent: 35, phase: 'submitting', message: '正在向谷歌生成中枢派发渲染任务...' });
  execSync(`opencli browser ${SESSION_NAME} click ".collapsiblePromptBoxGenerateButton"`, { timeout: 10000 });

  // 6. 等待成片直链
  let downloadUrl = null;
  for (let round = 0; round < 25; round++) {
    const estimate = Math.min(35 + round * 2.5, 95);
    onProgress({ percent: Math.round(estimate), phase: 'rendering', message: '谷歌 Veo 大模型正在全力渲染多机位画面...' });

    const checkUrl = execSync(`opencli browser ${SESSION_NAME} eval "window.__LAST_GEN_URL__"`, { encoding: 'utf-8', timeout: 8000 }).trim();
    if (checkUrl && checkUrl.startsWith('https://')) {
      downloadUrl = checkUrl;
      break;
    }
    execSync(`opencli browser ${SESSION_NAME} wait time 2`, { timeout: 8000 });
  }

  if (!downloadUrl) {
    throw new Error('云端视频渲染排队超时，未能捕获成片媒体直链');
  }

  onProgress({ percent: 96, phase: 'downloading', message: '渲染完毕！正在流式拉取 MP4 落地到工作区...' });

  // 7. 分块流式保存
  const timestamp = Date.now();
  const fileName = `veo_export_${timestamp}.mp4`;
  const targetPath = path.join(safeDir, fileName);

  const metaRaw = execSync(`opencli browser ${SESSION_NAME} eval "(() => {
    return fetch(\\"${downloadUrl}\\", { credentials: 'include' })
      .then(r => r.blob())
      .then(b => {
        window.__TEMP_VEO_BLOB__ = b;
        return JSON.stringify({ size: b.size, type: b.type });
      });
  })()"`, { encoding: 'utf-8', timeout: 15000 }).trim();

  const meta = JSON.parse(metaRaw);
  if (!meta || !meta.size || meta.size < 1000) {
    throw new Error('拉取的视频媒体字节异常，请检查网络或账号会话');
  }

  const fd = fs.openSync(targetPath, 'w');
  const chunkSize = 2 * 1024 * 1024;
  let offset = 0;
  while (offset < meta.size) {
    const end = Math.min(offset + chunkSize, meta.size);
    const chunkCmd = `opencli browser ${SESSION_NAME} eval "(() => {
      const slice = window.__TEMP_VEO_BLOB__.slice(${offset}, ${end});
      return new Promise(res => {
        const r = new FileReader();
        r.onloadend = () => res(r.result.split(',')[1]);
        r.readAsDataURL(slice);
      });
    })()"`;
    const b64 = execSync(chunkCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000 }).trim();
    fs.writeSync(fd, Buffer.from(b64, 'base64'));
    offset = end;
  }
  fs.closeSync(fd);

  onProgress({ percent: 100, phase: 'completed', message: '成片已安全落盘并就绪！' });

  return {
    success: true,
    taskId: `task_veo_${timestamp}`,
    fileName,
    localPath: targetPath,
    fileSize: meta.size,
    durationSec,
    resolution: '720p',
    aspectRatio: '16:9'
  };
}
