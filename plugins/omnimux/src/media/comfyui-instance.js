/**
 * ComfyUI 专属 GPU 算力实例客户端与 U06 工作流接入 (Issue / Spec: docs/comfyui-instance-api-spec.md)
 *
 * 遵循双平面架构：
 * 1. 控制中台平面 (8443)：获取 44 款预置工作流蓝本、健康巡检。
 * 2. 计算推理引擎平面 (6006/8443)：素材上传、任务提交、队列轮询、成片下载。
 * 
 * 核心工作流：U06 (API-U06-无加速多参.json)，海螺 H3 换人与参考生视频。
 * 默认模式：全能参考模式 (video_multi_ref)，支持 9 图 3 视频 3 音频契约。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { OmnimuxError } from './errors.js'

export const DEFAULT_COMFYUI_PANEL_URL = 'https://uu14326-79121a894bb2.westd.seetacloud.com:8443'
export const DEFAULT_COMFYUI_ENGINE_URL = 'https://u14326-79121a894bb2.westd.seetacloud.com:8443'
export const U06_WORKFLOW_FILENAME = 'API-U06-无加速多参.json'
export const DEFAULT_COMFYUI_OPERATION = 'video_multi_ref'

/** 渠道组 id：画布与路由层以 minimax-h3@comfyui 选中本实例 */
export const COMFYUI_CHANNEL_GROUP_ID = 'comfyui'

export const COMFYUI_MODEL_ALIASES = Object.freeze([
  'u06',
  'comfyui-u06',
  'API-U06',
  'minimax-h3-u06',
])

/**
 * 判定本次调用是否路由到 ComfyUI 专属算力实例。
 * 触发条件：视频能力 + 渠道组命中 comfyui（显式 @comfyui 或候选首条为 comfyui 组）。
 *
 * @param {object} params
 * @param {string} params.capability
 * @param {string} [params.group]
 * @param {string[]} [params.candidates]
 * @param {string} [params.modelId]
 * @returns {boolean}
 */
export function isComfyUiVideoRoute({ capability, group, candidates = [], modelId }) {
  if (capability !== 'video') return false
  const g = typeof group === 'string' ? group.trim().toLowerCase() : ''
  if (g === COMFYUI_CHANNEL_GROUP_ID || g === 'u06') return true
  const first = Array.isArray(candidates) && candidates.length ? String(candidates[0]).toLowerCase() : ''
  if (first.includes(`@${COMFYUI_CHANNEL_GROUP_ID}`) || first.includes('u06')) return true
  if (typeof modelId === 'string' && COMFYUI_MODEL_ALIASES.includes(modelId.trim())) return true
  return false
}

/**
 * 自动解析控制中台与计算推理引擎的双平面 URL。
 * 若只传入一个，自动互转（uu <-> u）。
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ panelBase: string, engineBase: string }}
 */
export function resolveComfyUiEndpoints(env = process.env) {
  let panelBase = env.OMNIMUX_COMFYUI_PANEL_URL || ''
  let engineBase = env.OMNIMUX_COMFYUI_ENGINE_URL || ''

  if (!panelBase && !engineBase) {
    return {
      panelBase: DEFAULT_COMFYUI_PANEL_URL,
      engineBase: DEFAULT_COMFYUI_ENGINE_URL,
    }
  }

  if (panelBase && !engineBase) {
    // 将开头的 uu 替换为单个 u
    try {
      const url = new URL(panelBase)
      if (url.hostname.startsWith('uu')) {
        url.hostname = 'u' + url.hostname.slice(2)
      }
      engineBase = url.origin
    } catch {
      engineBase = panelBase.replace(/uu/, 'u')
    }
  } else if (!panelBase && engineBase) {
    // 将开头的 u 替换为 uu
    try {
      const url = new URL(engineBase)
      if (url.hostname.startsWith('u') && !url.hostname.startsWith('uu')) {
        url.hostname = 'uu' + url.hostname.slice(1)
      }
      panelBase = url.origin
    } catch {
      panelBase = engineBase.replace(/^u/, 'uu')
    }
  }

  return { panelBase, engineBase }
}

/**
 * 上传二进制多模态素材（图片、视频、音频）到计算引擎实例。
 *
 * @param {object} params
 * @param {string} params.engineBase
 * @param {string | Buffer | Blob} params.fileSource 本地路径、Buffer 或 Blob
 * @param {string} [params.filename]
 * @param {typeof fetch} [params.fetcher]
 * @returns {Promise<string>} 上传成功后的服务器文件名（在 prompt 节点中引用）
 */
export async function uploadComfyAsset({ engineBase, fileSource, filename, fetcher = fetch }) {
  const formData = new FormData()
  let fileBlob
  let finalName = filename || 'asset'

  if (typeof fileSource === 'string') {
    if (existsSync(fileSource)) {
      const buf = readFileSync(fileSource)
      fileBlob = new Blob([buf])
      finalName = filename || basename(fileSource)
    } else {
      // 远程 URL 或虚拟引用，拉取其内容
      const res = await fetcher(fileSource)
      if (!res.ok) {
        throw new OmnimuxError('omnimux-upstream-error', `无法读取素材文件: ${fileSource}`)
      }
      const buf = await res.arrayBuffer()
      fileBlob = new Blob([buf])
      finalName = filename || basename(fileSource.split('?')[0])
    }
  } else if (Buffer.isBuffer(fileSource)) {
    fileBlob = new Blob([fileSource])
  } else if (fileSource instanceof Blob) {
    fileBlob = fileSource
  } else {
    throw new OmnimuxError('omnimux-invalid-request', '不支持的素材文件输入类型')
  }

  formData.append('image', fileBlob, finalName)
  formData.append('overwrite', 'true')

  const url = `${engineBase.replace(/\/+$/, '')}/upload/image`
  const res = await fetcher(url, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new OmnimuxError('omnimux-upstream-error', `ComfyUI 实例素材上传失败: ${res.status} ${text}`)
  }

  const json = await res.json()
  if (!json?.name) {
    throw new OmnimuxError('omnimux-upstream-error', 'ComfyUI 实例素材上传未返回文件名')
  }
  return json.name
}

/**
 * 从控制中台拉取指定工作流 JSON 蓝本。
 *
 * @param {object} params
 * @param {string} params.panelBase
 * @param {string} [params.workflowName]
 * @param {typeof fetch} [params.fetcher]
 * @returns {Promise<Record<string, any>>}
 */
export async function fetchWorkflowBlueprint({ panelBase, workflowName = U06_WORKFLOW_FILENAME, fetcher = fetch }) {
  const url = `${panelBase.replace(/\/+$/, '')}/api/workflows/download/${encodeURIComponent(workflowName)}`
  const res = await fetcher(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new OmnimuxError('omnimux-upstream-error', `拉取工作流蓝本 [${workflowName}] 失败: ${res.status} ${text}`)
  }
  return res.json()
}

/**
 * 根据全能参考契约（9 图 3 视频 3 音频）与业务参数，动态组装重写 U06 工作流节点字典。
 *
 * @param {object} params
 * @param {Record<string, any>} params.workflow 原始工作流母版
 * @param {string} params.prompt 正向提示词
 * @param {string[]} [params.uploadedImages] 已上传的图片文件名列表（最多9图）
 * @param {string[]} [params.uploadedVideos] 已上传的视频文件名列表（最多3视频）
 * @param {string[]} [params.uploadedAudios] 已上传的音频文件名列表（最多3音频）
 * @param {number} [params.duration] 视频时长（秒，默认 12）
 * @param {number} [params.steps] 推理步数（默认 8）
 * @param {number} [params.seed] 随机种子
 * @returns {Record<string, any>}
 */
export function buildU06Prompt({
  workflow,
  prompt,
  uploadedImages = [],
  uploadedVideos = [],
  uploadedAudios = [],
  duration = 12,
  steps = 8,
  seed,
}) {
  const wf = JSON.parse(JSON.stringify(workflow))

  // 1. UNET 模型锁定大显存版
  if (wf['620']?.inputs) {
    wf['620'].inputs.unet_name = 'minimax/minimax_h3_ref2va_pruned_fp8_scaled.safetensors'
  }

  // 2. 参考图片绑定 (最多 9 图，节点 137 绑定首图)
  if (wf['137']?.inputs && uploadedImages.length > 0) {
    wf['137'].inputs.image = uploadedImages[0]
  }

  // 3. 参考视频绑定 (最多 3 视频，节点 638 绑定首个参考视频)
  if (wf['638']?.inputs && uploadedVideos.length > 0) {
    wf['638'].inputs.video = uploadedVideos[0]
  }

  // 4. 正向提示词注入 (节点 664 CR Prompt Text)
  if (wf['664']?.inputs) {
    wf['664'].inputs.prompt = prompt || ''
  }

  // 5. 视频生成时长 (节点 132 PrimitiveFloat)
  if (wf['132']?.inputs) {
    wf['132'].inputs.value = Number(duration) || 12
  }

  // 6. 渲染推理步数 (节点 728 BasicScheduler)
  if (wf['728']?.inputs) {
    wf['728'].inputs.steps = Number(steps) || 8
  }

  // 7. 随机种子 (节点 142 easy seed)
  if (wf['142']?.inputs) {
    const finalSeed = Number.isInteger(seed) && seed >= 0
      ? seed
      : Math.floor(Math.random() * 1e14)
    wf['142'].inputs.seed = finalSeed
  }

  return wf
}

/**
 * 提交任务至渲染队列。
 *
 * @param {object} params
 * @param {string} params.engineBase
 * @param {Record<string, any>} params.promptPayload 组装后的工作流节点结构
 * @param {string} [params.clientId]
 * @param {typeof fetch} [params.fetcher]
 * @returns {Promise<string>} prompt_id
 */
export async function submitComfyPrompt({ engineBase, promptPayload, clientId = 'omnimux_hub', fetcher = fetch }) {
  const url = `${engineBase.replace(/\/+$/, '')}/prompt`
  const res = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      prompt: promptPayload,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new OmnimuxError('omnimux-upstream-error', `ComfyUI 任务提交失败: ${res.status} ${text}`)
  }

  const json = await res.json()
  if (!json?.prompt_id) {
    throw new OmnimuxError('omnimux-upstream-error', 'ComfyUI 任务提交未返回 prompt_id')
  }
  return json.prompt_id
}

/**
 * 轮询任务历史记录直到生成完成。
 *
 * @param {object} params
 * @param {string} params.engineBase
 * @param {string} params.promptId
 * @param {number} [params.timeoutMs] 超时毫秒数 (默认 600,000ms = 10分钟)
 * @param {number} [params.intervalMs] 轮询间隔 (默认 3000ms)
 * @param {AbortSignal} [params.signal]
 * @param {typeof fetch} [params.fetcher]
 * @returns {Promise<{ filename: string, subfolder: string, type: string }>} 输出视频元数据
 */
export async function pollComfyResult({
  engineBase,
  promptId,
  timeoutMs = 600_000,
  intervalMs = 3000,
  signal,
  fetcher = fetch,
}) {
  const startTime = Date.now()
  const historyUrl = `${engineBase.replace(/\/+$/, '')}/history/${promptId}`

  while (true) {
    if (signal?.aborted) {
      throw new OmnimuxError('omnimux-aborted', '任务已被调用方中止')
    }
    if (Date.now() - startTime > timeoutMs) {
      throw new OmnimuxError('omnimux-timeout', `ComfyUI 渲染任务等待超时 (${Math.round(timeoutMs / 1000)}s)`)
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))

    const res = await fetcher(historyUrl).catch((err) => {
      // 网络偶发闪断允许继续尝试
      return null
    })

    if (!res || !res.ok) continue

    const data = await res.json().catch(() => null)
    const taskInfo = data?.[promptId]
    if (!taskInfo) continue

    // 检查是否有节点错误
    if (taskInfo.status?.status_str === 'error') {
      const msg = JSON.stringify(taskInfo.status?.messages || [])
      throw new OmnimuxError('omnimux-failed', `ComfyUI 工作流执行失败: ${msg}`)
    }

    if (taskInfo.status?.completed) {
      // 提取输出视频节点 732
      const outputNode = taskInfo.outputs?.['732'] || Object.values(taskInfo.outputs || {})[0]
      const video = outputNode?.videos?.[0] || outputNode?.gifs?.[0]
      if (!video?.filename) {
        throw new OmnimuxError('omnimux-failed', 'ComfyUI 任务完成但未找到视频输出产物')
      }
      return video
    }
  }
}

/**
 * 下载并保存生成视频。
 *
 * @param {object} params
 * @param {string} params.engineBase
 * @param {string} params.filename
 * @param {string} [params.subfolder]
 * @param {string} params.dest 本地保存目标路径
 * @param {typeof fetch} [params.fetcher]
 * @returns {Promise<string>} 本地保存路径
 */
export async function downloadComfyOutput({
  engineBase,
  filename,
  subfolder = '',
  dest,
  fetcher = fetch,
}) {
  const url = `${engineBase.replace(/\/+$/, '')}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`
  const res = await fetcher(url)
  if (!res.ok) {
    throw new OmnimuxError('omnimux-upstream-error', `成片视频下载失败: ${res.status}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(dest, buf)
  return dest
}

/**
 * 执行 ComfyUI 专属算力实例工作流 U06 全流程管道。
 *
 * @param {object} options
 * @param {Record<string, any>} options.payload
 * @param {string} [options.dest]
 * @param {AbortSignal} [options.signal]
 * @param {Record<string, string | undefined>} [options.env]
 * @param {typeof fetch} [options.fetcher]
 * @param {number} [options.deadlineMs]
 * @param {number} [options.pollIntervalMs]
 * @returns {Promise<{ mode: 'live', taskId: string, videoUrl: string, filePath?: string }>}
 */
export async function generateComfyUiVideo({
  payload,
  dest,
  signal,
  env = process.env,
  fetcher = fetch,
  deadlineMs = 600_000,
  pollIntervalMs = 3000,
}) {
  const { panelBase, engineBase } = resolveComfyUiEndpoints(env)

  // 1. 解析素材引用（按 9 图 3 视频 3 音频契约）。
  // 兼容两种载荷形状：
  //  - guard 映射后的 vendor 形状：image_urls / video_urls / audio_urls（纯 URL 字符串数组）
  //  - 直接调用形状：references: [{type, pathOrUrl}] / image / video
  const references = Array.isArray(payload.references) ? payload.references : []
  const urlOf = (r) => (typeof r === 'string' ? r : (r?.pathOrUrl ?? r?.url ?? r?.path ?? ''))
  const imageRefs = [
    ...(Array.isArray(payload.image_urls) ? payload.image_urls : []),
    ...references.filter((r) => r.type === 'image' || r.targetSlot === 'reference_images').map(urlOf),
  ].filter(Boolean).slice(0, 9)
  const videoRefs = [
    ...(Array.isArray(payload.video_urls) ? payload.video_urls : []),
    ...references.filter((r) => r.type === 'video' || r.targetSlot === 'reference_videos').map(urlOf),
  ].filter(Boolean).slice(0, 3)
  const audioRefs = [
    ...(Array.isArray(payload.audio_urls) ? payload.audio_urls : []),
    ...references.filter((r) => r.type === 'audio' || r.targetSlot === 'reference_audios').map(urlOf),
  ].filter(Boolean).slice(0, 3)

  // 兼容单项字段
  if (imageRefs.length === 0 && payload.image) {
    imageRefs.push(payload.image)
  }
  if (videoRefs.length === 0 && payload.video) {
    videoRefs.push(payload.video)
  }

  // 2. 上传素材到计算引擎
  const uploadedImages = []
  for (const src of imageRefs) {
    if (src) {
      const name = await uploadComfyAsset({ engineBase, fileSource: src, fetcher })
      uploadedImages.push(name)
    }
  }

  const uploadedVideos = []
  for (const src of videoRefs) {
    if (src) {
      const name = await uploadComfyAsset({ engineBase, fileSource: src, fetcher })
      uploadedVideos.push(name)
    }
  }

  const uploadedAudios = []
  for (const src of audioRefs) {
    if (src) {
      const name = await uploadComfyAsset({ engineBase, fileSource: src, fetcher })
      uploadedAudios.push(name)
    }
  }

  // 3. 拉取工作流 U06 母版
  const blueprint = await fetchWorkflowBlueprint({ panelBase, workflowName: U06_WORKFLOW_FILENAME, fetcher })

  // 4. 重写节点参数
  const duration = payload.duration ? Number(payload.duration) : 12
  const steps = payload.steps ? Number(payload.steps) : 8
  const promptPayload = buildU06Prompt({
    workflow: blueprint,
    prompt: payload.prompt || '',
    uploadedImages,
    uploadedVideos,
    uploadedAudios,
    duration,
    steps,
    seed: payload.seed,
  })

  // 5. 提交渲染队列
  const promptId = await submitComfyPrompt({ engineBase, promptPayload, fetcher })

  // 6. 异步轮询历史结果
  const outputVideo = await pollComfyResult({
    engineBase,
    promptId,
    timeoutMs: deadlineMs,
    intervalMs: pollIntervalMs,
    signal,
    fetcher,
  })

  const videoUrl = `${engineBase.replace(/\/+$/, '')}/view?filename=${encodeURIComponent(outputVideo.filename)}&type=output`

  // 7. 若有目标本地路径，下载文件
  let finalPath
  if (dest) {
    finalPath = await downloadComfyOutput({
      engineBase,
      filename: outputVideo.filename,
      subfolder: outputVideo.subfolder || '',
      dest,
      fetcher,
    })
  }

  return {
    mode: 'live',
    taskId: promptId,
    videoUrl,
    filePath: finalPath,
  }
}
