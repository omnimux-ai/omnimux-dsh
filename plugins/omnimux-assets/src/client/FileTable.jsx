import { activateRowKeydown } from './a11y.js'
import { AlertIcon, ChevronRightIcon, FolderIcon, TypeIcon } from './icons.jsx'
import { formatBytes, formatRelative } from './format.js'

/** Active row: active-token background + 2px accent bar on the left edge. */
function activeRowStyle(isActive) {
  return isActive
    ? {
        background: 'var(--dsw-alias-interactive-bg-active, rgba(128,128,128,.18))',
        boxShadow: 'inset 2px 0 0 var(--dsw-alias-bg-interactive-primary, #3b6fbd)',
      }
    : {}
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  lineHeight: '20px',
}

const th = {
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(128,128,128,.9)))',
  padding: '6px 10px',
  borderBottom: '1px solid var(--dsw-alias-border, var(--dsw-border, rgba(128,128,128,.25)))',
  position: 'sticky',
  top: 0,
  background: 'var(--dsw-alias-bg-primary, var(--dsw-bg, #111))',
}

const td = {
  padding: '6px 10px',
  borderBottom: '1px solid var(--dsw-alias-border, var(--dsw-border, rgba(128,128,128,.15)))',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 0,
}

const muted = {
  margin: 0,
  fontSize: 12,
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, rgba(128,128,128,.9)))',
}

/**
 * Core-1 table: one mapped folder's current level. Directory rows drill
 * into the sub directory; file rows open the detail panel.
 * @param {{
 *   t: (key: string) => string,
 *   mapping: any,
 *   files: any[],
 *   onOpenFile: (file: any) => void,
 *   onEnterDir: (file: any) => void,
 * }} props
 */
export function FileTable({ t, mapping, files, onOpenFile, onEnterDir, activeKey }) {
  if (!mapping) {
    return <p style={muted}>{t('loading')}</p>
  }
  if (mapping.status !== 'ok') {
    return (
      <p style={{ ...muted, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--dsw-alias-label-warning, #d48806)' }} /* exempt-ui02 */>
        <AlertIcon />
        {t('mapping.invalid')}
      </p>
    )
  }
  if (files.length === 0) {
    return <p style={muted}>{t('table.empty')}</p>
  }
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...th, width: '40%' }} /* exempt-ui02 */>{t('table.name')}</th>
          <th style={th}>{t('table.size')}</th>
          <th style={th}>{t('table.mtime')}</th>
          <th style={th}>{t('table.type')}</th>
        </tr>
      </thead>
      <tbody>
        {files.map((file) => {
          const activate = () => {
            if (file.is_dir) onEnterDir(file)
            else onOpenFile(file)
          }
          return (
            <tr
              key={String(file.relative_path)}
              className="omnimux-assets-focusable"
              style={{ cursor: 'pointer', ...activeRowStyle(!file.is_dir && activeKey === file.relative_path) }} /* exempt-ui02 */
              tabIndex={0}
              role="button"
              aria-label={String(file.name)}
              onClick={activate}
              onKeyDown={activateRowKeydown(activate)}
            >
              <td style={td} title={String(file.relative_path)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }} /* exempt-ui02 */>
                  {file.is_dir ? <FolderIcon /> : <TypeIcon type={file.type} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} /* exempt-ui02 */>{String(file.name)}</span>
                  {file.is_dir ? (
                    <span style={{ display: 'inline-flex', color: 'var(--dsw-alias-label-secondary, rgba(128,128,128,.9))' }} /* exempt-ui02 */>
                      <ChevronRightIcon />
                    </span>
                  ) : null}
                </span>
              </td>
              <td style={td}>{file.is_dir ? '—' : formatBytes(Number(file.size))}</td>
              <td style={td}>{formatRelative(String(file.mtime))}</td>
              <td style={td}>{file.is_dir ? t('type.other') : t(`type.${file.type}`)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
