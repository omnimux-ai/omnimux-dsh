import React, { useEffect, useId, useRef, useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import { IconEditOutline16, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { ProjectCover } from './ProjectCover.jsx'
import { injectFolderStyles } from './folderStyles.js'

const POCKET_PATH = 'M1 199C1 171 20 150 48 150H142C171 150 185 163 191 187H467C494 187 515 208 515 237V330C515 356 495 377 467 377H49C22 377 1 356 1 330Z'

export function ProjectFolderCard({ project, onOpen, onRename, onDelete, t }) {
  const glassId = `folder-glass-${useId().replace(/:/g, '')}`
  const [menu, setMenu] = useState(false)
  const root = useRef(null)
  useEffect(() => { injectFolderStyles() }, [])
  useEffect(() => {
    if (!menu) return undefined
    root.current?.querySelector('[role="menuitem"]')?.focus()
    const outside = (event) => { if (!root.current?.contains(event.target)) setMenu(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [menu])
  const date = new Date(project.updatedAt)
  const dateStr = Number.isFinite(date.getTime()) ? `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}` : ''
  const closeMenu = () => { setMenu(false); root.current?.querySelector('[aria-haspopup="menu"]')?.focus() }
  return <article ref={root} className="omnimux-folder" data-cover-kind={project.cover?.kind || 'empty'}>
    <Button variant="ghost" className="omnimux-folder-open" onClick={() => onOpen(project)} aria-label={project.title}>
      <span className="omnimux-folder-back" aria-hidden="true" />
      <span className="omnimux-folder-sheet omnimux-folder-sheet--rear" aria-hidden="true" />
      <span className="omnimux-folder-sheet omnimux-folder-sheet--front"><ProjectCover cover={project.cover} /></span>
      <svg className="omnimux-folder-glass-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={`${glassId}-clip`} clipPathUnits="objectBoundingBox">
            <path d={POCKET_PATH} transform="scale(0.001937984496124 0.002645502645503)" />
          </clipPath>
          <linearGradient id={`${glassId}-rim`} x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="var(--dsw-alias-label-primary)" stopOpacity="0.22" />
            <stop offset="0.48" stopColor="var(--dsw-alias-label-primary)" stopOpacity="0.035" />
            <stop offset="1" stopColor="var(--dsw-alias-label-primary)" stopOpacity="0.11" />
          </linearGradient>
        </defs>
      </svg>
      <span className="omnimux-folder-pocket" style={{ clipPath: `url(#${glassId}-clip)` }} aria-hidden="true" />
      <svg className="omnimux-folder-pocket-rim" viewBox="0 0 516 378" aria-hidden="true" focusable="false">
        <path d={POCKET_PATH} fill="none" stroke={`url(#${glassId}-rim)`} strokeWidth="1.25" />
      </svg>
      <span className="omnimux-folder-caption">
        <span className="omnimux-folder-name" title={project.title}>{project.title}</span>
        <span className="omnimux-folder-date">{dateStr}</span>
      </span>
    </Button>
    <IconButton variant="ghost" className="omnimux-folder-more" aria-label={t('projects.more')} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
    </IconButton>
    {menu && <div className="omnimux-folder-menu" role="menu" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu() }
      if (event.key === 'Tab') setMenu(false)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')]
        const index = items.indexOf(document.activeElement)
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus()
      }
    }}>
      <Button variant="ghost" role="menuitem" onClick={() => { closeMenu(); onRename(project) }}><IconEditOutline16 size={16}/>{t('projects.rename')}</Button>
      <Button variant="ghost" role="menuitem" onClick={() => { closeMenu(); onDelete(project) }}><IconTrashOutline16 size={16}/>{t('projects.delete')}</Button>
    </div>}
  </article>
}
