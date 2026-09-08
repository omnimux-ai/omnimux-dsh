import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from 'dsh-ui-kit'
import { activateRowKeydown } from './a11y.js'
import { TypeIcon } from './icons.jsx'
import { formatRelative } from './format.js'

/**
 * Core-2 table: reported artifacts with source columns.
 * @param {{
 *   t: (key: string) => string,
 *   artifacts: any[],
 *   onOpen: (artifact: any) => void,
 *   activeKey?: string,
 * }} props
 */
export function ArtifactTable({ t, artifacts, onOpen, activeKey }) {
  if (artifacts.length === 0) {
    return <p className="omnimux-assets-muted">{t('artifact.empty')}</p>
  }
  return (
    <Table stickyHeader dense className="omnimux-assets-artifact-table">
      <TableHeader>
        <TableRow>
          <TableHead className="omnimux-assets-th-artifact-name">{t('table.name')}</TableHead>
          <TableHead>{t('artifact.agent')}</TableHead>
          <TableHead>{t('artifact.model')}</TableHead>
          <TableHead>{t('table.type')}</TableHead>
          <TableHead>{t('table.time')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {artifacts.map((artifact) => {
          const isSelected = activeKey === artifact.id
          return (
            <TableRow
              key={String(artifact.id)}
              selected={isSelected}
              className="omnimux-assets-focusable omnimux-assets-clickable-row"
              tabIndex={0}
              role="button"
              aria-label={String(artifact.title)}
              onClick={() => { onOpen(artifact) }}
              onKeyDown={activateRowKeydown(() => { onOpen(artifact) })}
            >
              <TableCell title={String(artifact.title)}>
                <span className="omnimux-assets-cell-file-title">
                  <TypeIcon type={artifact.type} />
                  <span className="omnimux-assets-cell-ellipsis">{String(artifact.title)}</span>
                </span>
              </TableCell>
              <TableCell>{String(artifact.source?.agent ?? '—')}</TableCell>
              <TableCell>{artifact.source?.model ? String(artifact.source.model) : '—'}</TableCell>
              <TableCell>{t(`type.${artifact.type}`)}</TableCell>
              <TableCell>{formatRelative(String(artifact.created_at))}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
