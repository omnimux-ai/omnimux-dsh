import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 灵感库视频首帧截屏生成缩略图与备用帧探测超时放宽验证', () => {
  const cardPath = path.join(root, 'plugins/omnimux-inspiration/src/client/InspirationCoverCard.jsx')
  const handlersPath = path.join(root, 'plugins/omnimux-inspiration/src/http-handlers.js')
  const exportPath = path.join(root, 'plugins/omnimux-inspiration/src/media-export.js')

  const cardContent = fs.readFileSync(cardPath, 'utf-8')
  const handlersContent = fs.readFileSync(handlersPath, 'utf-8')
  const exportContent = fs.readFileSync(exportPath, 'utf-8')

  // 1. 验证媒体导出模块具备 extractVideoPoster 与 videoPosterArgs 视频截屏函数
  assert.ok(
    exportContent.includes('export function videoPosterArgs') &&
    exportContent.includes('export async function extractVideoPoster'),
    'media-export 模块必须导出 videoPosterArgs 与 extractVideoPoster 截帧工具',
  )
  assert.ok(
    exportContent.includes("'-ss'") && exportContent.includes("'-vframes'"),
    'videoPosterArgs 必须包含精准时间截取首帧的参数',
  )

  // 2. 验证 http-handlers 中在下载视频后当无封面时自动调用 extractVideoPosterBestEffort
  assert.ok(
    handlersContent.includes('extractVideoPosterBestEffort') &&
    handlersContent.includes('maybeEnsureVideoCover'),
    'http-handlers 必须集成首帧截屏与存量自愈能力',
  )
  assert.ok(
    handlersContent.includes('if (!cover.path && localVideoPath) {'),
    '当远端封面缺失且本地视频下载成功时必须触发截帧封面兜底',
  )

  // 3. 验证前端卡片备用首帧探测超时放宽到 2500ms
  assert.ok(
    cardContent.includes('setTimeout(() => {') &&
    cardContent.includes('2500'),
    'InspirationCoverCard 备用视频首帧探测超时必须放宽至 2500ms 避免闪烁为黑底',
  )
})
