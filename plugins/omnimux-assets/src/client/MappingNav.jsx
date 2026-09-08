import { useState } from 'react'
import { activateRowKeydown } from './a11y.js'
import { AlertIcon, DotsIcon, FileIcon, FolderIcon, PlusIcon } from './icons.jsx'

const group = {
  padding: '8px 12px 4px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const groupHeaderRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 8px 6px',
  position: 'relative',
}

const groupHeader = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: '16px',
  letterSpacing: 0.2,
  color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(128,128,128,.9)))',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const headerAddButton = {
  flex: 'none',
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(128,128,128,.9)))',
  cursor: 'pointer',
  borderRadius: 4,
  padding: 0,
}

const row = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 8px 0 22px', // indented under the group header — visual hierarchy
  borderRadius: 8,
  cursor: 'pointer',
  position: 'relative',
  fontSize: 14,
  lineHeight: '20px',
}

const muted = {
  margin: 0,
  padding: '2px 8px',
  fontSize: 12,
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(128,128,128,.9)))',
}

const menuButton = {
  flex: 'none',
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  cursor: 'pointer',
  borderRadius: 4,
  padding: 0,
}

const dropdown = {
  position: 'absolute',
  top: '100%',
  right: 4,
  zIndex: 6,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 108,
  padding: 4,
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-elevated, var(--dsw-bg, #1c1c1c))',
  border: '1px solid var(--dsw-alias-border, var(--dsw-border, rgba(128,128,128,.35)))',
  boxShadow: '0 4px 16px var(--dsw-alias-bg-mask-1, rgba(0,0,0,.24))',
}

const headerDropdown = {
  ...dropdown,
  right: 0,
}

const dropdownItem = {
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  padding: '4px 8px',
  fontSize: 12,
  lineHeight: '18px',
  borderRadius: 4,
  whiteSpace: 'nowrap',
}

const dangerItem = {
  ...dropdownItem,
  color: 'var(--dsw-alias-label-danger, #d45656)',
}

const label = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const count = { flex: 'none', fontSize: 11, opacity: 0.7 }

/**
 * Left-nav group 1: local files & folders mounted as named mappings.
 * The header carries a `＋` menu (add file / add folder via the OS chooser);
 * each row exposes rename / remove behind its `⋯` menu.
 * @param {{
 *   t: (key: string) => string,
 *   mappings: any[],
 *   activeId: string,
 *   busy: boolean,
 *   onSelect: (id: string) => void,
 *   onAddFile: () => void,
 *   onAddDir: () => void,
 *   onRename: (id: string, name: string) => void,
 *   onRemove: (mapping: any) => void,
 * }} props
 */
export function MappingNav({ t, mappings, activeId, busy, onSelect, onAddFile, onAddDir, onRename, onRemove }) {
  const [menuId, setMenuId] = useState('')
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  const closeMenu = () => { setMenuId('') }
  const closeAddMenu = () => { setAddMenuOpen(false) }

  const handleRename = (rowValue) => {
    const next = window.prompt(t('mapping.renamePrompt'), rowValue.display_name)
    if (next === null) return
    const name = next.trim()
    if (name === '' || name === rowValue.display_name) return
    onRename(rowValue.id, name)
  }

  return (
    <div style={group}>
      <div style={groupHeaderRow}>
        <span style={groupHeader}>
          <FolderIcon />
          {t('mapping.group')}
        </span>
        <button /* exempt-ui01 */
          type="button"
          style={headerAddButton}
          aria-label={t('mapping.addDir')}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            setAddMenuOpen(!addMenuOpen)
          }}
        >
          <PlusIcon />
        </button>
        {addMenuOpen ? (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 5 }} /* exempt-ui02 */
              onClick={closeAddMenu}
            />
            <div
              style={headerDropdown}
              role="menu"
              onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); closeAddMenu() } }}
            >
              <button /* exempt-ui01 */
                type="button"
                style={{ ...dropdownItem, display: 'flex', alignItems: 'center', gap: 6 }} /* exempt-ui02 */
                role="menuitem"
                autoFocus
                onClick={() => { closeAddMenu(); onAddDir() }}
              >
                <FolderIcon />
                {t('mapping.addDir')}
              </button>
              <button /* exempt-ui01 */
                type="button"
                style={{ ...dropdownItem, display: 'flex', alignItems: 'center', gap: 6 }} /* exempt-ui02 */
                role="menuitem"
                onClick={() => { closeAddMenu(); onAddFile() }}
              >
                <FileIcon />
                {t('mapping.addFile')}
              </button>
            </div>
          </>
        ) : null}
      </div>
      {mappings.length === 0 ? <p style={muted}>{t('mapping.empty')}</p> : null}
      {mappings.map((mapping) => (
        <div
          key={String(mapping.id)}
          className="omnimux-assets-focusable"
          tabIndex={0}
          role="button"
          aria-label={String(mapping.display_name)}
          onKeyDown={activateRowKeydown(() => { onSelect(String(mapping.id)) })}
          style={{
            ...row,
            background: mapping.id === activeId
              ? 'var(--dsw-alias-interactive-bg-active, rgba(128,128,128,.18))'
              : 'transparent',
          }}
          onClick={() => { onSelect(String(mapping.id)) }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))'
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = mapping.id === activeId
              ? 'var(--dsw-alias-interactive-bg-active, rgba(128,128,128,.18))'
              : 'transparent'
          }}
        >
          <span aria-hidden="true" style={{ display: 'inline-flex', color: mapping.status !== 'ok' ? 'var(--dsw-alias-label-warning, #d48806)' : 'inherit' }} /* exempt-ui02 */>
            {mapping.status !== 'ok' ? <AlertIcon /> : mapping.kind === 'file' ? <FileIcon /> : <FolderIcon />}
          </span>
          <span style={label} title={mapping.real_path}>{mapping.display_name}</span>
          <span style={count}>{mapping.status === 'ok' ? mapping.file_count : '—'}</span>
          <button /* exempt-ui01 */
            type="button"
            aria-label={t('mapping.rename')}
            style={menuButton}
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              setMenuId(menuId === mapping.id ? '' : String(mapping.id))
            }}
          >
            <DotsIcon />
          </button>
          {menuId === mapping.id ? (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 5 }} /* exempt-ui02 */
                onClick={(event) => { event.stopPropagation(); closeMenu() }}
              />
              <div
                style={dropdown}
                role="menu"
                onClick={(event) => { event.stopPropagation() }}
                onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); closeMenu() } }}
              >
                <button /* exempt-ui01 */
                  type="button"
                  style={dropdownItem}
                  role="menuitem"
                  autoFocus
                  onClick={() => { closeMenu(); handleRename(mapping) }}
                >
                  {t('mapping.rename')}
                </button>
                <button /* exempt-ui01 */
                  type="button"
                  style={dangerItem}
                  role="menuitem"
                  onClick={() => { closeMenu(); onRemove(mapping) }}
                >
                  {t('mapping.remove')}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  )
}
