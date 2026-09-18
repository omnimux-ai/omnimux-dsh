/**
 * scripts/model-test-sample.mjs
 *
 * 中枢模型检索面板 · 契约测试样本生成器与执行测试器。
 *
 * 核心职责：
 * 1. deriveTestSample(model, group): 根据模型契约及线路分组约束，自动生成最小合法测试样本。
 *    若操作需要素材（如首帧生视频、垫图生图、语音转写等），按槽位约束（mime, sizeBytes, role）自动预设最小测试素材。
 * 2. executeModelTest(options): 运行契约 SubmitGuard 门禁 + 上游网关连通性调用，返回大白话结构化测试结果。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 标准合规的轻量测试图片（JPEG 格式样本）与测试音频素材
const SAMPLE_IMAGE_URL = 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=200';
const SAMPLE_AUDIO_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

/**
 * 从 constraints 对象中提取单一合法值（解包 { only: [...] }, { fixed: ... } 等结构）。
 * @param {unknown} c
 * @param {unknown} fallback
 * @returns {unknown}
 */
export function resolveParamConstraint(c, fallback) {
  if (c === undefined || c === null) return fallback;
  if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') return c;
  if (Array.isArray(c)) return c[0];
  if (typeof c === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (c);
    if (obj.fixed !== undefined) return obj.fixed;
    if (Array.isArray(obj.only) && obj.only.length > 0) return obj.only[0];
    if (obj.min !== undefined) return obj.min;
  }
  return fallback;
}

/**
 * 根据模型契约与线路分组，推导出一份合规的最小测试样本。
 *
 * @param {Record<string, unknown>} model 契约模型对象
 * @param {Record<string, unknown>} [group] 线路分组对象
 * @returns {{
 *   operationId: string,
 *   operationLabel: string,
 *   prompt: string,
 *   parameters: Record<string, unknown>,
 *   assets?: Array<Record<string, unknown>>,
 *   hasMaterial: boolean,
 *   materialHint: string,
 * }}
 */
export function deriveTestSample(model, group = {}) {
  const ops = Array.isArray(model.operations) ? model.operations : [];
  
  // 1. 优先在分组约束的操作范围内选择，其次优先 listed 的，最后兜底首个操作
  let selectedOp = ops.find((o) => o.listed) || ops[0];
  const allowedOps = group?.constraints?.operations;
  if (Array.isArray(allowedOps) && allowedOps.length > 0) {
    const matched = ops.find((o) => allowedOps.includes(o.id));
    if (matched) selectedOp = matched;
  }
  if (!selectedOp) {
    return {
      operationId: 'unknown',
      operationLabel: '未定义操作',
      prompt: 'test',
      parameters: {},
      hasMaterial: false,
      materialHint: '无需素材',
    };
  }

  const allParams = { ...(model.parameters || {}), ...(selectedOp.parameters || {}) };
  const parameters = {};

  // 2. 预设 Prompt
  const groupKey = model.groupKey || model.managementGroup || 'text';
  let prompt = '你好，请回复 OK。';
  if (groupKey === 'image') {
    prompt = '极简咖啡杯图标，纯白背景，扁平矢量风格';
  } else if (groupKey === 'video') {
    prompt = '水面泛起微波，宁静抽象简约视觉';
  } else if (groupKey === 'audio') {
    prompt = '你好，这是一条音频连通性测试。';
  } else if (groupKey === 'reader') {
    prompt = 'https://example.com';
  }

  // 3. 分辨率 resolution
  if (allParams.resolution) {
    const opts = (allParams.resolution.options || []).map((o) => (typeof o === 'string' ? o : o?.value));
    let resVal = resolveParamConstraint(
      group?.constraints?.parameters?.resolution,
      allParams.resolution.defaultValue,
    );
    if (String(model.id).startsWith('minimax-h3')) {
      resVal = '768P';
    } else if (!resVal || (opts.length && !opts.includes(resVal))) {
      resVal = opts[0];
    }
    if (resVal) parameters.resolution = resVal;
  }

  // 4. 时长 duration
  if (allParams.duration) {
    const opts = (allParams.duration.options || []).map((o) => (typeof o === 'string' ? o : o?.value));
    let durVal = resolveParamConstraint(
      group?.constraints?.parameters?.duration,
      allParams.duration.defaultValue,
    );
    if (!durVal && opts.length) durVal = opts[0];
    if (!durVal && typeof allParams.duration.min === 'number') durVal = allParams.duration.min;
    if (!durVal) durVal = 5;
    parameters.duration = Number(durVal);
  }

  // 5. 画幅 aspectRatio
  if (allParams.aspectRatio) {
    const opts = (allParams.aspectRatio.options || []).map((o) => (typeof o === 'string' ? o : o?.value));
    let arVal = resolveParamConstraint(
      group?.constraints?.parameters?.aspectRatio,
      allParams.aspectRatio.defaultValue,
    );
    if (opts.includes('1:1') && groupKey === 'image') {
      arVal = '1:1';
    } else if (opts.includes('16:9')) {
      arVal = '16:9';
    } else if (!arVal || (opts.length && !opts.includes(arVal))) {
      arVal = opts[0];
    }
    if (arVal) parameters.aspectRatio = arVal;
  }

  // 6. 音色 voice
  if (allParams.voice) {
    const opts = (allParams.voice.options || []).map((o) => (typeof o === 'string' ? o : o?.value));
    parameters.voice = allParams.voice.defaultValue || opts[0] || 'alloy';
  }

  // 7. 参考素材 Slots / Assets
  const assets = [];
  const inputs = Array.isArray(selectedOp.inputs) ? selectedOp.inputs : [];
  let materialHint = '无需素材（纯文本生成）';
  let hasMaterial = false;

  for (const input of inputs) {
    if (input.slot === 'prompt') continue;
    const isRequired = input.min && input.min >= 1;
    if (isRequired) {
      hasMaterial = true;
      if (input.type === 'image') {
        materialHint = '已预设合规测试图片（20KB JPEG 标准样本）';
        assets.push({
          role: input.role || 'reference',
          type: 'image',
          pathOrUrl: SAMPLE_IMAGE_URL,
          mime: 'image/jpeg',
          sizeBytes: 20480,
          width: 200,
          height: 200,
        });
      } else if (input.type === 'audio') {
        materialHint = '已预设合规测试音频（10KB OGG 音频样本）';
        assets.push({
          role: input.role || 'audio',
          type: 'audio',
          pathOrUrl: SAMPLE_AUDIO_URL,
          mime: 'audio/ogg',
          sizeBytes: 10240,
          durationSec: 1,
        });
      }
    }
  }

  return {
    operationId: selectedOp.id,
    operationLabel: selectedOp.label || selectedOp.id,
    prompt,
    parameters,
    ...(assets.length > 0 ? { assets } : {}),
    hasMaterial,
    materialHint,
  };
}

/**
 * 读取当前机器上已配置的中枢 API 密钥。
 * @returns {string}
 */
export function resolveOmnimuxApiKey() {
  if (process.env.OMNIMUX_API_KEY && process.env.OMNIMUX_API_KEY.trim()) {
    return process.env.OMNIMUX_API_KEY.trim();
  }
  const home = process.env.HOME || '';
  const dshEnvPath = path.join(home, '.config/omnimux/dsh.env');
  if (fs.existsSync(dshEnvPath)) {
    try {
      const content = fs.readFileSync(dshEnvPath, 'utf8');
      const m = content.match(/export\s+OMNIMUX_API_KEY=["']?([^"'\r\n]+)/);
      if (m && m[1]) return m[1].trim();
    } catch {
      // ignore read failure
    }
  }
  const secretsPath = path.join(home, '.config/omnimux/secrets.json');
  if (fs.existsSync(secretsPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
      if (raw.access_token) return raw.access_token;
    } catch {
      // ignore json failure
    }
  }
  return '';
}

/**
 * 翻译并格式化错误原因，符合大白话与交付要求。
 * @param {number} status
 * @param {string} rawMessage
 * @returns {string}
 */
function formatFailureReason(status, rawMessage) {
  const msg = (rawMessage || '').trim();
  if (status === 401) {
    return '上游返回 401 Unauthorized（未授权或 API 密钥无效）';
  }
  if (status === 402) {
    return '上游返回 402 Payment Required（账户积分/额度不足）';
  }
  if (status === 403) {
    return '上游返回 403 Forbidden（当前线路分组无权限访问此模型）';
  }
  if (status === 404) {
    return '上游返回 404 Not Found（上游网关未找到该型号或线路分组）';
  }
  if (status === 429) {
    return '上游返回 429 Too Many Requests（线路限流或并发已满，请稍后重试）';
  }
  if (status >= 500) {
    return `上游服务暂时不可用（HTTP ${status}${msg ? '：' + msg.slice(0, 150) : ''}）`;
  }
  if (msg) {
    return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
  }
  return `上游请求异常（HTTP ${status}）`;
}

/**
 * 执行单次模型在线测试。
 *
 * @param {{
 *   modelId: string,
 *   groupId?: string,
 *   wireModel?: string,
 *   wireGroup?: string,
 *   groupKey?: string,
 *   sample: ReturnType<typeof deriveTestSample>,
 *   apiKey?: string,
 * }} options
 * @returns {Promise<{
 *   ok: boolean,
 *   durationMs: number,
 *   message?: string,
 *   error?: string,
 *   taskId?: string,
 *   rawStatus?: number,
 * }>}
 */
export async function executeModelTest(options) {
  const { modelId, wireModel, wireGroup, groupKey = 'text', sample } = options;
  const targetWireModel = wireModel || modelId;
  const startedAt = Date.now();

  // 1. 本地 SubmitGuard 契约门禁静态校验
  try {
    const { loadAll, DEFAULT_SPECS_DIR } = await import(
      path.join(rootDir, 'plugins/omnimux/src/catalog/contract/load.js')
    );
    const { guardSubmit } = await import(
      path.join(rootDir, 'plugins/omnimux/src/catalog/contract/submit-guard/index.js')
    );
    const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
    const req = {
      model: modelId,
      operation: sample.operationId,
      prompt: sample.prompt,
      ...sample.parameters,
      ...(sample.assets ? { assets: sample.assets } : {}),
    };
    const plan = guardSubmit(req, { index, requireListed: false });
    if (!plan.ok) {
      const elapsed = Date.now() - startedAt;
      return {
        ok: false,
        durationMs: elapsed,
        error: `失败错误原因：契约校验未通过（${plan.message || '参数或槽位不满足契约规范'}）`,
      };
    }
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    return {
      ok: false,
      durationMs: elapsed,
      error: `失败错误原因：契约加载异常（${err instanceof Error ? err.message : String(err)}）`,
    };
  }

  // 2. 凭据获取（若显式传入空字符串则不回退至环境变量）
  const apiKey = options.apiKey !== undefined ? options.apiKey : resolveOmnimuxApiKey();
  if (!apiKey) {
    const elapsed = Date.now() - startedAt;
    return {
      ok: false,
      durationMs: elapsed,
      error: '失败错误原因：未检测到可用中枢凭据（请在环境变量设置 OMNIMUX_API_KEY 或 ~/.config/omnimux/dsh.env）',
    };
  }

  // 3. 上游网络请求发送
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    ...(wireGroup ? { 'x-channel-group': wireGroup } : {}),
  };

  let endpoint = 'https://api.omnimux.ai/v1/chat/completions';
  let bodyPayload = {};

  if (groupKey === 'image') {
    endpoint = 'https://api.omnimux.ai/v1/images/generations';
    bodyPayload = {
      model: targetWireModel,
      prompt: sample.prompt,
      size: sample.parameters.resolution || '1024x1024',
      n: 1,
      ...(sample.parameters.aspectRatio ? { aspect_ratio: sample.parameters.aspectRatio } : {}),
      ...(sample.assets?.[0]?.pathOrUrl ? { image: sample.assets[0].pathOrUrl } : {}),
    };
  } else if (groupKey === 'video') {
    endpoint = 'https://api.omnimux.ai/v1/video/generations';
    bodyPayload = {
      model: targetWireModel,
      prompt: sample.prompt,
      duration: sample.parameters.duration || 5,
      aspect_ratio: sample.parameters.aspectRatio || '16:9',
      resolution: sample.parameters.resolution || '720p',
      ...(sample.assets?.[0]?.pathOrUrl ? { image: sample.assets[0].pathOrUrl } : {}),
    };
  } else if (groupKey === 'audio') {
    endpoint = 'https://api.omnimux.ai/v1/audio/speech';
    bodyPayload = {
      model: targetWireModel,
      input: sample.prompt,
      voice: sample.parameters.voice || 'alloy',
    };
  } else {
    // text, reader, etc.
    endpoint = 'https://api.omnimux.ai/v1/chat/completions';
    bodyPayload = {
      model: targetWireModel,
      messages: [{ role: 'user', content: sample.prompt }],
      max_tokens: 16,
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(25000),
    });

    const elapsed = Date.now() - startedAt;
    const responseText = await res.text();
    let responseJson = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      // text only
    }

    if (res.ok) {
      const taskId = responseJson?.task_id || responseJson?.taskId || responseJson?.id || undefined;
      return {
        ok: true,
        durationMs: elapsed,
        message: '调用成功，上游服务就绪响应正常',
        taskId: taskId ? String(taskId) : undefined,
        rawStatus: res.status,
      };
    }

    const rawError = responseJson?.error?.message || responseJson?.message || responseText;
    const reason = formatFailureReason(res.status, rawError);
    return {
      ok: false,
      durationMs: elapsed,
      rawStatus: res.status,
      error: `失败错误原因：${reason}`,
    };
  } catch (netErr) {
    const elapsed = Date.now() - startedAt;
    const isTimeout = netErr instanceof Error && (netErr.name === 'TimeoutError' || netErr.message.includes('timeout'));
    const message = isTimeout
      ? '请求超时（25 秒内上游无响应，请重试）'
      : (netErr instanceof Error ? netErr.message : String(netErr));
    return {
      ok: false,
      durationMs: elapsed,
      error: `失败错误原因：网络请求失败（${message}）`,
    };
  }
}
