/**
 * 任务刻度轨：复刻 dsh 主会话「轮次导航」交互——每个任务轮次一条横线，
 * 悬停浮出预览卡（提问 1 行 + 回复 3 行），点击定位到该轮结果消息。
 * 数据完全来自会话事件与 turnOutline/inbox 投影，不新增宿主接口。
 *
 * @module
 */

import { useState } from 'react'
import type { Row, TurnOutlineEntry, QueuedMessage } from './events.ts'
import { previewClip, TURN_PROMPT_PREVIEW_LIMIT, TURN_RESPONSE_PREVIEW_LIMIT } from './events.ts'

/** 一条刻度：已完成轮次、进行中轮次或排队中的提交。 */
export interface RailItem {
  /** 刻度在轨内的序号（展示用）。 */
  index: number
  kind: 'turn' | 'queued'
  status: 'done' | 'running' | 'queued' | 'failed'
  /** 已完成/进行中轮次对应 turn；排队项为 undefined。 */
  turn?: number
  prompt: string
  response: string
}

interface TurnRailProps {
  items: RailItem[]
  /** 当前视口所在轮次（可选高亮）。 */
  activeTurn?: number
  onLocate: (turn: number) => void
  copy: {
    queued: string
    running: string
    done: string
    failed: string
    taskN: (index: number) => string
    jumpTo: (index: number) => string
  }
}

const MARK_SPACING = 14

/** 从行集与轮次摘要合成刻度列表。 */
export function buildRailItems(
  rows: Row[],
  outline: TurnOutlineEntry[],
  queued: QueuedMessage[],
  runningTurn: number | null,
  failedTurn: number | null,
): RailItem[] {
  const items: RailItem[] = []
  // 行内可见的轮次集合（含其提问/回复文本兜底）。
  const rowPrompt = new Map<number, string>()
  const rowResponse = new Map<number, string>()
  for (const row of rows) {
    if (row.turn === undefined) continue
    if (row.kind === 'user' && !rowPrompt.has(row.turn)) rowPrompt.set(row.turn, row.text)
    if (row.kind === 'assistant') rowResponse.set(row.turn, row.text)
  }
  const turns = new Set<number>()
  for (const entry of outline) turns.add(entry.turn)
  for (const turn of rowPrompt.keys()) turns.add(turn)
  for (const turn of rowResponse.keys()) turns.add(turn)
  const ordered = [...turns].sort((a, b) => a - b)
  let index = 0
  for (const turn of ordered) {
    index += 1
    const outlineEntry = outline.find((entry) => entry.turn === turn)
    const prompt = rowPrompt.get(turn) ?? outlineEntry?.prompt ?? ''
    const response = rowResponse.get(turn) ?? outlineEntry?.response ?? ''
    const status = turn === failedTurn
      ? 'failed'
      : turn === runningTurn
        ? 'running'
        : 'done'
    items.push({
      index,
      kind: 'turn',
      status,
      turn,
      prompt: previewClip(prompt, TURN_PROMPT_PREVIEW_LIMIT),
      response: previewClip(response, TURN_RESPONSE_PREVIEW_LIMIT),
    })
  }
  for (const message of queued) {
    index += 1
    items.push({
      index,
      kind: 'queued',
      status: 'queued',
      prompt: previewClip(message.text, TURN_PROMPT_PREVIEW_LIMIT),
      response: '',
    })
  }
  return items
}

function statusLabel(item: RailItem, copy: TurnRailProps['copy']): string {
  switch (item.status) {
    case 'running': return copy.running
    case 'queued': return copy.queued
    case 'failed': return copy.failed
    default: return copy.done
  }
}

export function TurnRail({ items, activeTurn, onLocate, copy }: TurnRailProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  // 少于 2 个刻度不渲染（官方同款门槛）。
  if (items.length < 2) return null

  const previewItem = previewIndex === null ? null : items[previewIndex] ?? null

  return (
    <div className="turn-rail-wrap">
      <div className="turn-rail" role="navigation" aria-label="任务轮次导航">
        <div className="turn-rail-marks">
          {items.map((item, i) => {
            const classes = ['turn-rail-mark']
            if (item.status === 'running') classes.push('is-busy')
            if (item.status === 'queued') classes.push('is-queued')
            if (item.status === 'failed') classes.push('is-failed')
            if (item.turn !== undefined && item.turn === activeTurn) classes.push('is-active')
            return (
              <button
                key={item.kind === 'turn' ? `t${item.turn}` : `q${i}`}
                type="button"
                className={classes.join(' ')}
                style={{ top: i * MARK_SPACING + 4 }}
                aria-label={copy.jumpTo(item.index)}
                onMouseEnter={() => setPreviewIndex(i)}
                onMouseLeave={() => setPreviewIndex((current) => (current === i ? null : current))}
                onFocus={() => setPreviewIndex(i)}
                onBlur={() => setPreviewIndex((current) => (current === i ? null : current))}
                onClick={() => { if (item.turn !== undefined) onLocate(item.turn) }}
              />
            )
          })}
        </div>
      </div>
      {previewItem !== null && (
        <div
          className="turn-rail-preview"
          role="tooltip"
          style={{ top: Math.max(0, (previewIndex ?? 0) * MARK_SPACING - 24) }}
        >
          <div className="turn-rail-preview-prompt">
            {previewItem.prompt === '' ? copy.taskN(previewItem.index) : previewItem.prompt}
          </div>
          {previewItem.response !== '' && (
            <div className="turn-rail-preview-response">{previewItem.response}</div>
          )}
          <div className="turn-rail-preview-status">{statusLabel(previewItem, copy)}</div>
        </div>
      )}
    </div>
  )
}
