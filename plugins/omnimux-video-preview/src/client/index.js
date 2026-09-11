import React from 'react'
import { VideoPlayer } from './VideoPlayer.js'
import { VideoBreakdownViewer } from './VideoBreakdownViewer.jsx'
import { installRichVideoLinkTransformer } from './message-link-card.js'
import { ensureBreakdownStyles } from './styles.js'

export const name = 'omnimux-video-preview'
export const inject = []

function IconVideo({ size = 16 }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('polygon', { points: '23 7 16 12 23 17 23 7' }),
    React.createElement('rect', {
      x: 1,
      y: 5,
      width: 15,
      height: 14,
      rx: 2,
      ry: 2,
    })
  )
}

function IconBreakdown({ size = 16 }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }),
    React.createElement('line', { x1: 8, y1: 21, x2: 16, y2: 21 }),
    React.createElement('line', { x1: 12, y1: 17, x2: 12, y2: 21 }),
    React.createElement('path', { d: 'm10 8 5 3-5 3V8z' })
  )
}

/**
 * Client entry point for omnimux-video-preview.
 */
export function apply(ctx) {
  if (typeof ctx.inject !== 'function') return

  if (typeof document !== 'undefined') {
    ensureBreakdownStyles()
  }

  ctx.inject(['betterSidebar'], (inner) => {
    const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
    if (!sidebar || typeof sidebar.registerFileViewer !== 'function') return

    if (typeof document !== 'undefined') {
      const stopTransformer = installRichVideoLinkTransformer(document, sidebar)
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => stopTransformer(), 'omnimux-video-preview: link-transformer')
      }
    }

    // 1. Video files viewer
    const videoDescriptor = {
      id: 'omnimux-video-preview',
      title: '视频',
      icon: (size) => React.createElement(IconVideo, { size }),
      exts: [
        'mp4',
        'webm',
        'mov',
        'mkv',
        'avi',
        'ogg',
        'ogv',
        'm4v',
        'flv',
        'wmv',
        'ts',
        'mp3',
        'wav',
        'm4a',
        'aac',
      ],
      priority: 20,
      fetchStrategy: 'mediaUrl',
      component: (props) => React.createElement(VideoPlayer, props),
    }

    // 2. Video breakdown and shots analysis viewer
    const breakdownDescriptor = {
      id: 'omnimux-video-breakdown',
      title: '视频分析',
      icon: (size) => React.createElement(IconBreakdown, { size }),
      exts: [
        'vbreakdown',
        'vbreakdown.json',
        'breakdown.json',
        'video-analysis.json',
      ],
      priority: 50,
      fetchStrategy: 'fsRead',
      detect: (filePath, head) => {
        if (filePath.endsWith('.vbreakdown') || filePath.endsWith('.vbreakdown.json') || filePath.endsWith('.video-analysis.json')) return true
        if (head && head.length > 0) {
          try {
            const sample = new TextDecoder().decode(head.slice(0, 500))
            if (sample.includes('"is_video_breakdown"') || (sample.includes('"shots"') && sample.includes('"structure"'))) {
              return true
            }
          } catch {
            // ignore
          }
        }
        return false
      },
      component: (props) => React.createElement(VideoBreakdownViewer, props),
    }

    const unreg1 = sidebar.registerFileViewer(videoDescriptor)
    const unreg2 = sidebar.registerFileViewer(breakdownDescriptor)

    const effectTarget = typeof inner.effect === 'function' ? inner : ctx
    if (typeof effectTarget.effect === 'function') {
      effectTarget.effect(
        () => () => {
          try {
            unreg1()
            unreg2()
          } catch {
            // already disposed
          }
        },
        'omnimux-video-preview: file-viewers'
      )
    }
  })
}

