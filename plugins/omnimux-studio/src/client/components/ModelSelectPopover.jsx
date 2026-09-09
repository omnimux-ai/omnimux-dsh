import React, { useEffect, useRef } from 'react'
import { Button } from './Button.jsx'
import { modelsFor } from '../fixtures.js'

export function ModelSelectPopover({ isOpen, type = 'video', selectedModel, onSelect, onClose }) {
  const root = useRef(null)
  useEffect(() => {
    if (!isOpen) return
    const close = event => { if (event.type === 'keydown' ? event.key === 'Escape' : !root.current?.parentElement?.contains(event.target)) onClose() }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [isOpen, onClose])
  if (!isOpen) return null
  const models = modelsFor(type)
  return <div ref={root} className="studio-popover" role="dialog" aria-label="演示模型目录">
    {[...new Set(models.map(item => item.category))].map(group => <section key={group}>
      <p>{group} · Mock</p>
      {models.filter(item => item.category === group).map(item => <Button key={item.id} aria-pressed={item.id === selectedModel} onClick={() => { onSelect(item.id); onClose() }}>{item.name} · {item.cost} 演示点</Button>)}
    </section>)}
  </div>
}
