import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

export const GENERATION_INGEST_TOOLS = new Set([
  'image_generate',
  'video_generate',
  'omnimux_image_submit',
  'omnimux_video_submit',
])

const VIDEO_PATH_RE = /Saved video to\s+((?:\/|[A-Za-z]:[\\/])[^\r\n\0]+\.(?:mp4|mov|webm|mkv))/i
const IMAGE_PATH_RE = /Saved image to\s+((?:\/|[A-Za-z]:[\\/])[^\r\n\0]+\.(?:png|jpe?g|webp|gif|svg))/i

/**
 * 从工具执行参数和结果中提取生成产物信息
 * @param {object} exec
 * @param {object} result
 * @returns {{ filePath: string, title?: string, source: object } | null}
 */
export function extractGeneratedMedia(exec, result) {
  if (!exec || typeof exec.name !== 'string' || !GENERATION_INGEST_TOOLS.has(exec.name)) {
    return null
  }
  if (!result || result.isError) {
    return null
  }

  const args = (exec.arguments && typeof exec.arguments === 'object') ? exec.arguments : {}
  let filePath = ''

  // 1. 从结果 content 文本块中提取
  const content = Array.isArray(result.content) ? result.content : []
  for (const block of content) {
    if (!block || typeof block.text !== 'string') continue
    const text = block.text.trim()

    // 匹配视频保存路径
    const matchVideo = VIDEO_PATH_RE.exec(text)
    if (matchVideo && matchVideo[1]) {
      filePath = matchVideo[1]
      break
    }

    // 匹配图片保存路径
    const matchImage = IMAGE_PATH_RE.exec(text)
    if (matchImage && matchImage[1]) {
      filePath = matchImage[1]
      break
    }

    // 解析 JSON 响应
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed?.path === 'string' && parsed.path !== '') {
        filePath = parsed.path
        break
      }
      if (typeof parsed?.dest === 'string' && parsed.dest !== '') {
        filePath = parsed.dest
        break
      }
    } catch {
      // 非 JSON 文本忽略
    }
  }

  // 2. 若文本块未提取到，且参数显式指定了 dest
  if (!filePath && typeof args.dest === 'string' && args.dest !== '') {
    filePath = args.dest
  }

  if (!filePath || !isAbsolute(filePath)) {
    return null
  }

  // 3. 构建来源与标题元数据
  const prompt = typeof args.prompt === 'string' && args.prompt.trim() !== ''
    ? args.prompt.trim()
    : (typeof args.text_prompt === 'string' ? args.text_prompt.trim() : '')

  const model = typeof args.model === 'string'
    ? args.model.trim()
    : (typeof args.provider === 'string' ? args.provider.trim() : '')

  let channel = 'agent'
  if (exec.name === 'omnimux_image_submit' || exec.name === 'image_generate') {
    channel = 'image'
  }
  if (typeof args.channel === 'string' && args.channel !== '') {
    channel = args.channel
  }
  if (String(exec.agent?.name || '').toLowerCase().includes('canvas')) {
    channel = 'canvas'
  }

  const title = prompt !== '' ? prompt : (args.title || '未命名生成物')

  return {
    filePath,
    title,
    source: {
      agent: exec.agent?.name ?? exec.agent?.id ?? exec.name,
      model,
      channel,
      run_id: String(exec.agent?.runId || ''),
      session_id: String(exec.agent?.session?.id || ''),
    },
  }
}

/**
 * 挂载生成工具静默自动收敛监听器
 *
 * @param {object} ctx Cordis context
 * @param {{ artifacts: ReturnType<typeof import('./artifacts.js').createArtifactStore>, fs?: typeof import('node:fs') }} deps
 * @returns {() => void} disposer
 */
export function mountGenerationIngest(ctx, deps) {
  if (!ctx || typeof ctx.on !== 'function' || !deps?.artifacts) {
    return () => {}
  }

  const { artifacts } = deps
  const checkFile = (p) => {
    try {
      const st = (deps.fs?.statSync ?? statSync)(p)
      return st.isFile()
    } catch {
      return false
    }
  }

  const off = ctx.on('tools/result', (exec, result) => {
    try {
      const extracted = extractGeneratedMedia(exec, result)
      if (!extracted || !extracted.filePath) return

      if (checkFile(extracted.filePath)) {
        artifacts.report(extracted.filePath, extracted.source, extracted.title)
      }
    } catch {
      // 静默安全兜底：不因收敛逻辑异常影响主会话执行流
    }
  })

  return () => {
    if (typeof off === 'function') off()
  }
}
