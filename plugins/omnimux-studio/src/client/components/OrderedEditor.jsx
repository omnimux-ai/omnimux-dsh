import React, { useRef, useState } from 'react'
import { Button } from './Button.jsx'
import { isComposing, reduceEditor, serializeDocument, textPart, tokenPart, validateToken } from '../editor-document.js'

/** Ordered text segments and inline URL inputs; never parses HTML. */
export function OrderedEditor({ document, onChange, onSubmit, allowTokens = false }) {
  const root = useRef(null)
  const composing = useRef(false)
  const selection = useRef(null)
  const [selected, setSelected] = useState(null)
  const [copyError, setCopyError] = useState('')
  const update = operation => onChange(reduceEditor(document, operation))
  const focus = (id, end = false) => requestAnimationFrame(() => {
    const input = root.current?.querySelector(`[data-part-id="${id}"]`)
    input?.focus()
    if (input) input.setSelectionRange(end ? input.value.length : 0, end ? input.value.length : 0)
  })
  const remove = id => {
    const index = document.parts.findIndex(part => part.id === id)
    const neighbor = document.parts.slice(0, index).reverse().find(part => part.kind === 'text') ?? document.parts.slice(index + 1).find(part => part.kind === 'text')
    update({ type: 'remove', id })
    setSelected(null)
    if (neighbor) focus(neighbor.id, true)
  }
  const insert = type => {
    const token = tokenPart(type)
    const index = document.parts.findIndex(part => part.id === selection.current?.id && part.kind === 'text')
    const parts = document.parts.slice()
    if (index >= 0) {
      const original = parts[index]
      const offset = selection.current.offset
      parts.splice(index, 1, { ...original, text: original.text.slice(0, offset) }, token, textPart(original.text.slice(offset)))
    } else parts.push(token, textPart())
    onChange({ version: 1, parts })
    focus(token.id)
  }
  return <div ref={root} className="studio-editor">
    {allowTokens && <div className="studio-toolbar">
      <Button onClick={() => insert('product')}>插入商品链接</Button>
      <Button onClick={() => insert('video')}>插入视频链接</Button>
      <Button onClick={async () => { try { await navigator.clipboard.writeText(serializeDocument(document)); setCopyError('') } catch { setCopyError('剪贴板不可用，请选中文字复制') } }}>复制有序正文</Button>
    </div>}
    {copyError && <p role="status">{copyError}</p>}
    <div className="studio-document" aria-label="有序创作正文">
      {document.parts.map((part, index) => part.kind === 'text' ? <textarea
        key={part.id} data-part-id={part.id} aria-label={`正文片段 ${index + 1}`} rows={2}
        value={part.text} placeholder="描述创作要求…"
        onCompositionStart={() => { composing.current = true }}
        onCompositionEnd={event => { composing.current = false; update({ type: 'update', id: part.id, patch: { text: event.currentTarget.value } }) }}
        onChange={event => update({ type: 'update', id: part.id, patch: { text: event.target.value } })}
        onSelect={event => { selection.current = { id: part.id, offset: event.currentTarget.selectionStart } }}
        onKeyDown={event => {
          if (isComposing(event, composing.current)) return
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onSubmit(); return }
          const previous = document.parts[index - 1]
          if (event.key === 'Backspace' && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0 && previous?.kind === 'url-token') {
            event.preventDefault()
            if (selected === previous.id) remove(previous.id)
            else setSelected(previous.id)
          } else setSelected(null)
        }}
      /> : <span key={part.id} className="studio-token" data-selected={selected === part.id}>
        <span>{part.tokenType === 'product' ? '商品' : '视频'}</span>
        <input data-part-id={part.id} aria-label={part.tokenType === 'product' ? '商品链接或 ID' : '视频链接'} value={part.value} aria-invalid={part.validation !== 'valid'}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={event => { composing.current = false; update({ type: 'update', id: part.id, patch: { value: event.currentTarget.value } }) }}
          onChange={event => update({ type: 'update', id: part.id, patch: { value: event.target.value } })}
          onKeyDown={event => {
            if (isComposing(event, composing.current)) return
            if (event.key === 'Enter') {
              event.preventDefault(); event.stopPropagation()
              update({ type: 'update', id: part.id, patch: { value: event.currentTarget.value } })
              if (validateToken({ ...part, value: event.currentTarget.value }).validation === 'valid') {
                const next = document.parts.slice(index + 1).find(item => item.kind === 'text')
                if (next) focus(next.id)
              }
            }
            if (event.key === 'Backspace' && !event.currentTarget.value) { event.preventDefault(); remove(part.id) }
          }} />
        <Button onClick={() => remove(part.id)} aria-label="删除此链接">删除</Button>
        <span className="studio-token-validation">{part.validation === 'valid' ? '语法有效（未访问）' : part.error}</span>
      </span>)}
    </div>
  </div>
}
