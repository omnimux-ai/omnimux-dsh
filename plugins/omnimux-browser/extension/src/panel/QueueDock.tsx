/**
 * 排队坞：复刻 dsh 官方 QueueDock 的形态与交互——输入框上方一块可折叠面板，
 * 头部为「队列图标 + N 条排队消息 + 折叠箭头」，列表行 1px 分隔，
 * 每行预览文本 + 编辑/删除两个 28px 圆形操作钮；编辑态为行内 textarea。
 * 数据回流走宿主 inbox 投影与 agent/inbox/spliced，本组件不做本地乐观更新。
 *
 * @module
 */

import { useEffect, useRef, useState } from 'react'
import type { PanelApi } from './api.ts'
import type { QueuedMessage } from './events.ts'
import {
  ArrowUpIcon,
  CheckMarkIcon,
  ChevronDownIcon,
  CloseIcon,
  EditPencilIcon,
  QueueIcon,
  TrashIcon,
} from './components/icons.tsx'

interface QueueDockProps {
  items: QueuedMessage[]
  sessionId: string | null
  api: PanelApi
  /** 当前轮是否接受插话（原生：仅运行中可插话发送）。 */
  steerAvailable: boolean
  copy: {
    count: (n: number) => string
    steer: string
    /** 任务未运行时的置灰说明；缺省回落到 steer 文案。 */
    steerUnavailable?: string
    steerFailed: string
    sending: string
    edit: string
    remove: string
    save: string
    cancelEdit: string
    editFailed: string
    removeFailed: string
    taskN: (index: number) => string
  }
  onError: (message: string) => void
}

/** 编辑态中的单行：textarea + 保存/取消。 */
function QueueEditRow({
  initialText,
  copy,
  busy,
  onSave,
  onCancel,
}: {
  initialText: string
  copy: QueueDockProps['copy']
  busy: boolean
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialText)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    areaRef.current?.focus()
    areaRef.current?.select()
  }, [])
  return (
    <>
      <textarea
        ref={areaRef}
        className="queue-dock-editor"
        value={text}
        rows={Math.min(4, Math.max(1, text.split('\n').length))}
        disabled={busy}
        aria-label={copy.edit}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (text.trim() !== '') onSave(text)
          }
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="queue-dock-actions">
        <button
          type="button"
          className="queue-dock-action queue-dock-action-save"
          aria-label={copy.save}
          title={copy.save}
          disabled={busy || text.trim() === ''}
          onClick={() => onSave(text)}
        >
          <CheckMarkIcon size={13} />
        </button>
        <button
          type="button"
          className="queue-dock-action queue-dock-action-cancel"
          aria-label={copy.cancelEdit}
          title={copy.cancelEdit}
          disabled={busy}
          onClick={onCancel}
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </>
  )
}

export function QueueDock({ items, sessionId, api, steerAvailable, copy, onError }: QueueDockProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // 队列为空自动收起；编辑项从队列消失（开始发送/被别处删除）时退出编辑态。
  useEffect(() => {
    if (items.length === 0 && !collapsed) setCollapsed(true)
    if (editing !== null && !items.some((item) => item.id === editing.id)) setEditing(null)
  }, [items, collapsed, editing])

  if (items.length === 0 || sessionId === null) return null

  const expanded = !collapsed || editing !== null
  const listVisible = items.length === 1 || expanded

  async function applyAction(itemId: string, action: unknown, failure: string): Promise<boolean> {
    setBusy(itemId)
    try {
      await api.rpc('session.updateQueue', { sessionId, itemId, action })
      return true
    } catch {
      onError(failure)
      return false
    } finally {
      setBusy((current) => (current === itemId ? null : current))
    }
  }

  /**
   * 插话发送：把该条排队消息并入正在运行的任务（原生语义）。
   * 宿主在插话窗口已关闭或条目已消失时返回 steer-unavailable / queue-item-not-found，
   * 这两种情况不提示错误——队列投影会自行刷新出真实状态。
   */
  async function steerItem(itemId: string): Promise<void> {
    setBusy(itemId)
    try {
      await api.rpc('session.updateQueue', { sessionId, itemId, action: { kind: 'steer' } })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (!/steer-unavailable|queue-item-not-found/.test(message)) onError(copy.steerFailed)
    } finally {
      setBusy((current) => (current === itemId ? null : current))
    }
  }

  return (
    <div className="queue-dock" data-queue-dock="">
      <div className="queue-dock-panel">
        {items.length > 1 && (
          <button
            type="button"
            className="queue-dock-header"
            aria-expanded={expanded}
            disabled={busy !== null}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span className="queue-dock-lead" aria-hidden="true"><QueueIcon size={14} /></span>
            <span className="queue-dock-count">{copy.count(items.length)}</span>
            <span className={`queue-dock-chevron${expanded ? ' open' : ''}`} aria-hidden="true">
              <ChevronDownIcon size={14} />
            </span>
          </button>
        )}
        {listVisible && (
          <ul className="queue-dock-list">
            {items.map((item, index) => (
              <li className="queue-dock-row" key={item.id || `q${index}`}>
                {items.length === 1 && (
                  <span className="queue-dock-lead" aria-hidden="true"><QueueIcon size={14} /></span>
                )}
                {editing?.id === item.id ? (
                  <QueueEditRow
                    initialText={editing.text}
                    copy={copy}
                    busy={busy === item.id}
                    onSave={async (text) => {
                      const ok = await applyAction(item.id, {
                        kind: 'edit',
                        content: [{ type: 'text', text }],
                      }, copy.editFailed)
                      if (ok) setEditing(null)
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <span className="queue-dock-preview" title={item.text}>
                      {item.text === '' ? copy.taskN(index + 1) : item.text}
                    </span>
                    <div className="queue-dock-actions">
                      <button
                        type="button"
                        className="queue-dock-action queue-dock-action-steer"
                        aria-label={copy.steer}
                        title={steerAvailable ? copy.steer : copy.steerUnavailable ?? copy.steer}
                        disabled={busy !== null || !steerAvailable}
                        onClick={() => {
                          void steerItem(item.id)
                        }}
                      >
                        <ArrowUpIcon size={13} />
                      </button>
                      <button
                        type="button"
                        className="queue-dock-action"
                        aria-label={copy.edit}
                        title={copy.edit}
                        disabled={busy !== null}
                        onClick={() => setEditing({ id: item.id, text: item.text })}
                      >
                        <EditPencilIcon size={13} />
                      </button>
                      <button
                        type="button"
                        className="queue-dock-action"
                        aria-label={copy.remove}
                        title={copy.remove}
                        disabled={busy !== null}
                        onClick={() => {
                          void applyAction(item.id, { kind: 'remove' }, copy.removeFailed)
                        }}
                      >
                        <TrashIcon size={13} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
