/**
 * Fixed harness data for real-browser acceptance of the conversation gallery.
 *
 * Every media file is served from `public/media`, so the fake host has real
 * bytes to hand back and the browser has real dimensions to lay out.
 */

import type { MediaAttachmentRef } from '../../src/panel/attachments.ts'

export interface HarnessAttachment extends MediaAttachmentRef {
  /** Path served from the harness static root. */
  readonly file: string
  /** Fail the first `session.attachment` call, so the retry path is reachable. */
  readonly failFirst?: boolean
}

export interface HarnessCase {
  readonly id: string
  readonly title: string
  readonly align: 'start' | 'end'
  readonly images: readonly HarnessAttachment[]
}

function attachment(
  attachmentId: string,
  file: string,
  mediaType: string,
  width: number,
  height: number,
  bytes: number,
  name: string,
): HarnessAttachment {
  return { attachmentId, file, mediaType, bytes, width, height, name }
}

const LAND = ['media/photo_land.jpg', 'image/jpeg', 480, 270, 28990, '关键帧 01 · 微笑'] as const
const PORT = ['media/photo_port.jpg', 'image/jpeg', 360, 468, 28396, '关键帧 05 · 惊讶'] as const
const SQUARE = ['media/photo_sq.png', 'image/png', 380, 380, 229532, '关键帧 07 · 释然'] as const
const WIDE = ['media/photo_wide.jpg', 'image/jpeg', 460, 198, 21238, '背景环境帧'] as const
const CLIP = ['media/clip.mp4', 'video/mp4', 520, 318, 61686, '原片片段'] as const

type Spec = readonly [string, string, number, number, number, string]

function make(id: string, [file, mediaType, width, height, bytes, name]: Spec, failFirst = false): HarnessAttachment {
  return { ...attachment(id, file, mediaType, width, height, bytes, name), ...(failFirst ? { failFirst } : {}) }
}

export const CASES: readonly HarnessCase[] = [
  {
    id: 'single',
    title: '助手回复 · 单素材（只有画廊舞台，无小图条、无计数）',
    align: 'start',
    images: [make('single-land', LAND)],
  },
  {
    id: 'assistant-quad',
    title: '助手回复 · 4 张素材（画廊：大图 + 小图条 + 计数）',
    align: 'start',
    images: [make('aq-1', LAND), make('aq-2', PORT), make('aq-3', SQUARE), make('aq-4', WIDE)],
  },
  {
    id: 'quad',
    title: '用户消息 · 4 张素材（48px 小缩略图，无舞台/小图条/计数）',
    align: 'end',
    images: [make('quad-1', LAND), make('quad-2', PORT), make('quad-3', SQUARE), make('quad-4', WIDE)],
  },
  {
    id: 'mixed',
    title: '用户消息 · 含 1 个视频素材（小缩略图 + 播放图标）',
    align: 'end',
    images: [make('mixed-1', CLIP), make('mixed-2', LAND), make('mixed-3', PORT), make('mixed-4', SQUARE)],
  },
  {
    id: 'oct',
    title: '用户消息 · 8 张素材（小缩略图换行铺满窄栏）',
    align: 'end',
    images: [
      make('oct-1', LAND), make('oct-2', PORT), make('oct-3', SQUARE), make('oct-4', WIDE),
      make('oct-5', LAND), make('oct-6', PORT), make('oct-7', SQUARE), make('oct-8', WIDE),
    ],
  },
  {
    id: 'flaky',
    title: '助手回复 · 失败态：点「重试」后第二次请求成功',
    align: 'start',
    images: [make('flaky-1', LAND, true)],
  },
]

export const ATTACHMENTS: readonly HarnessAttachment[] = CASES.flatMap((testCase) => testCase.images)
