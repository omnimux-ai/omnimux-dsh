import { activateRowKeydown } from './a11y.js'
import { TypeIcon } from './icons.jsx'
import { formatRelative } from './format.js'

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
 * Core-2 table: reported artifacts with source columns.
 * @param {{
 *   t: (key: string) => string,
 *   artifacts: any[],
 *   onOpen: (artifact: any) => void,
 * }} props
 */
export function ArtifactTable({ t, artifacts, onOpen, activeKey }) {
  if (artifacts.length === 0) {
    return <p style={muted}>{t('artifact.empty')}</p>
  }
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...th, width: '34%' }} /* exempt-ui02: 表格定宽列 */>{t('table.name')}</th>
          <th style={th}>{t('artifact.agent')}</th>
          <th style={th}>{t('artifact.model')}</th>
          <th style={th}>{t('table.type')}</th>
          <th style={th}>{t('table.time')}</th>
        </tr>
      </thead>
      <tbody>
        {artifacts.map((artifact) => (
          <tr
            key={String(artifact.id)}
            className="omnimux-assets-focusable"
            style={{ cursor: 'pointer', ...activeRowStyle(activeKey === artifact.id) }} /* exempt-ui02: 激活行动态交互样式 */
            tabIndex={0}
            role="button"
            aria-label={String(artifact.title)}
            onClick={() => { onOpen(artifact) }}
            onKeyDown={activateRowKeydown(() => { onOpen(artifact) })}
          >
            <td style={td} title={String(artifact.title)}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }} /* exempt-ui02 */>
                <TypeIcon type={artifact.type} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} /* exempt-ui02 */>{String(artifact.title)}</span>
              </span>
            </td>
            <td style={td}>{String(artifact.source?.agent ?? '—')}</td>
            <td style={td}>{artifact.source?.model ? String(artifact.source.model) : '—'}</td>
            <td style={td}>{t(`type.${artifact.type}`)}</td>
            <td style={td}>{formatRelative(String(artifact.created_at))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
