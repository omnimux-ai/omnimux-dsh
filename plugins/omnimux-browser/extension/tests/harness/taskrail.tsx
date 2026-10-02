/**
 * Task rail harness: renders the REAL TurnRail + queue dock markup + row DOM
 * contract (data-turn attributes) from src/panel inside a fixed side-panel
 * width, so a real browser can verify hover previews, mark states, and the
 * click-to-locate scroll without a live dsh host.
 *
 *   taskrail.html?theme=dark&width=400&locale=zh
 */

import { useMemo, useRef, useState } from 'react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { TurnRail, buildRailItems } from '../../src/panel/TurnRail.tsx'
import { QueueDock } from '../../src/panel/QueueDock.tsx'
import type { PanelApi } from '../../src/panel/api.ts'
import { PANEL_COPY } from '../../src/panel/strings.ts'
import type { Row, QueuedMessage, TurnOutlineEntry } from '../../src/panel/events.ts'
import '../../src/panel/styles.css'

const params = new URLSearchParams(window.location.search)
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
const width = Number.parseInt(params.get('width') ?? '400', 10)
const locale = params.get('locale') === 'en' ? 'en' : 'zh'

document.documentElement.dataset.theme = theme
document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'

const host = document.getElementById('root')
if (host === null) throw new Error('harness: #root is missing')
const copy = PANEL_COPY[locale]

const ROWS: Row[] = [
  { seq: 1, kind: 'user', turn: 1, text: '总结这条帖子' },
  { seq: 2, kind: 'assistant', turn: 1, text: '帖子核心观点：作者认为 AI 视频生成的分水岭不是画质，而是「可导演性」——分镜可控、角色一致、节奏可剪。' },
  { seq: 3, kind: 'user', turn: 2, text: '帮我写一条中文点评' },
  { seq: 4, kind: 'assistant', turn: 2, text: '「画质卷到头了，接下来卷的是导演能力。谁能让 AI 听话按分镜走，谁就赢。」' },
  { seq: 5, kind: 'user', turn: 3, text: '把这条帖子改写成英文推广文案' },
  { seq: 6, kind: 'assistant', turn: 3, text: 'The era of pixel-perfect AI video is over. What matters now is directability.' },
  { seq: 7, kind: 'user', turn: 4, text: '基于帖子配图生成一张封面图' },
  { seq: 8, kind: 'assistant', turn: 4, text: '正在生成：横版封面，主体为分镜板与光束，极简深色底…' },
]
const PENDING_ITEMS: QueuedMessage[] = [
  { id: 'q1', text: '再帮我写 3 个回复角度' },
  { id: 'q2', text: '把生成结果导出成 markdown 发给我' },
]
const TURNS_DATA: TurnOutlineEntry[] = [
  { turn: 1, seq: 2, prompt: '总结这条帖子', response: '帖子核心观点：作者认为 AI 视频生成的分水岭不是画质' },
  { turn: 2, seq: 9, prompt: '帮我写一条中文点评', response: '「画质卷到头了，接下来卷的是导演能力。」' },
  { turn: 3, seq: 16, prompt: '把这条帖子改写成英文推广文案', response: 'The era of pixel-perfect AI video is over.' },
  { turn: 4, seq: 24, prompt: '基于帖子配图生成一张封面图', response: '' },
]

const harnessRpcLog: { method: string; payload: unknown }[] = []
;(window as unknown as { __harnessRpc: { method: string; payload: unknown }[] }).__harnessRpc = harnessRpcLog

function Panel() {
  const [landedSeq, setLandedSeq] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [queuedItems, setQueuedItems] = useState(PENDING_ITEMS)
  const scrollRef = useRef<HTMLDivElement>(null)
  const queueDockCopy = {
    count: copy.app.queueDockBadge,
    sending: copy.app.queueSending,
    edit: copy.app.queueEdit,
    remove: copy.app.queueRemove,
    save: copy.app.queueSave,
    cancelEdit: copy.app.queueCancelEdit,
    editFailed: copy.app.queueEditFailed,
    removeFailed: copy.app.queueRemoveFailed,
    taskN: copy.app.railTaskN,
  }
  const harnessApi = {
    rpc: async (method: string, payload: unknown) => {
      const p = payload as { itemId?: string; action?: { kind?: string; content?: { text?: string }[] } }
      ;(window as unknown as { __harnessRpc: { method: string; payload: unknown }[] }).__harnessRpc.push({ method, payload })
      if (p.action?.kind === 'remove') setQueuedItems((q) => q.filter((x) => x.id !== p.itemId))
      if (p.action?.kind === 'edit') setQueuedItems((q) => q.map((x) => x.id === p.itemId ? { ...x, text: p.action!.content![0]!.text ?? x.text } : x))
      return { accepted: true }
    },
  } as unknown as PanelApi

  const railItems = useMemo(
    () => buildRailItems(ROWS, TURNS_DATA, PENDING_ITEMS, 4, null),
    [],
  )
  const railCopy = {
    queued: copy.app.railQueued,
    running: copy.app.railRunning,
    done: copy.app.railDone,
    failed: copy.app.railFailed,
    taskN: copy.app.railTaskN,
    jumpTo: copy.app.railJumpTo,
  }

  function locateTurn(turn: number): void {
    const target = ROWS.find((row) => row.turn === turn && row.kind === 'assistant')
      ?? [...ROWS].reverse().find((row) => row.turn === turn)
    if (target === undefined) return
    scrollRef.current?.querySelector(`[data-turn="${turn}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setLandedSeq(target.seq)
    window.setTimeout(() => setLandedSeq((current) => (current === target.seq ? null : current)), 1800)
  }

  return (
    <div className="app harness-app">
      <div className="messages" ref={scrollRef}>
        {ROWS.map((row) => (
          <div key={row.seq} className={`row ${row.kind}${landedSeq === row.seq ? ' landed-flash' : ''}`} {...(row.turn === undefined ? {} : { 'data-turn': row.turn })}>
            <div className="harness-bubble">{row.text}</div>
          </div>
        ))}
      </div>
      <TurnRail items={railItems} activeTurn={3} onLocate={locateTurn} copy={railCopy} />
      <footer>
        <QueueDock
          items={queuedItems}
          sessionId="harness-session"
          api={harnessApi}
          copy={queueDockCopy}
          onError={(m) => setErrorMsg(m)}
        />
        {errorMsg !== null && <div className="harness-error" role="alert">{errorMsg}</div>}
        <div className="composer-box clean-chat-box">
          <textarea placeholder={locale === 'en' ? 'Ask anything...' : '随便问点什么'} rows={1} />
          <div className="composer-actions clean-actions-row">
            <button className="clean-send-btn active" type="button" aria-label={copy.app.sendMessage}>↑</button>
            <button className="stop-button clean-send-btn" type="button" aria-label={copy.app.stopTurn}><span className="stop-glyph" aria-hidden="true" /></button>
          </div>
        </div>
      </footer>
    </div>
  )
}

const style = document.createElement('style')
style.textContent = `
  html, body { margin: 0; padding: 0; }
  body { width: ${width}px; height: 560px; background: var(--canvas); }
  .harness-app { height: 560px; }
  .harness-app .messages { padding: 16px 40px 16px 16px; }
  .harness-bubble {
    max-width: 86%;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.55;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
  }
  .row.user .harness-bubble { margin-left: auto; background: var(--canvas-deep); }
  .row.landed-flash .harness-bubble { animation: row-landed-flash 1.6s ease-out 1; }
  .harness-app footer { padding: 0 12px 12px; }
  .harness-error { padding: 6px 12px; margin-bottom: 6px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 12px; }
`
document.head.append(style)

createRoot(host).render(createElement(Panel))
