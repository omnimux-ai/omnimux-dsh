import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from 'dsh-ui-kit'
import { activateRowKeydown } from './a11y.js'
import { AlertIcon, ChevronRightIcon, FolderIcon, TypeIcon } from './icons.jsx'
import { formatBytes, formatRelative } from './format.js'

/**
 * Core-1 table: one mapped folder's current level. Directory rows drill
 * into the sub directory; file rows open the detail panel.
 * @param {{
 *   t: (key: string) => string,
 *   mapping: any,
 *   files: any[],
 *   onOpenFile: (file: any) => void,
 *   onEnterDir: (file: any) => void,
 *   activeKey?: string,
 * }} props
 */
export function FileTable({ t, mapping, files, onOpenFile, onEnterDir, activeKey }) {
  if (!mapping) {
    return <p className="omnimux-assets-muted">{t('loading')}</p>
  }
  if (mapping.status !== 'ok') {
    return (
      <p className="omnimux-assets-mapping-invalid">
        <AlertIcon />
        {t('mapping.invalid')}
      </p>
    )
  }
  if (files.length === 0) {
    return <p className="omnimux-assets-muted">{t('table.empty')}</p>
  }
  return (
    <Table stickyHeader dense className="omnimux-assets-file-table">
      <TableHeader>
        <TableRow>
          <TableHead className="omnimux-assets-th-file-name">{t('table.name')}</TableHead>
          <TableHead>{t('table.size')}</TableHead>
          <TableHead>{t('table.mtime')}</TableHead>
          <TableHead>{t('table.type')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => {
          const activate = () => {
            if (file.is_dir) onEnterDir(file)
            else onOpenFile(file)
          }
          const isSelected = !file.is_dir && activeKey === file.relative_path
          return (
            <TableRow
              key={String(file.relative_path)}
              selected={isSelected}
              className="omnimux-assets-focusable omnimux-assets-clickable-row"
              tabIndex={0}
              role="button"
              aria-label={String(file.name)}
              onClick={activate}
              onKeyDown={activateRowKeydown(activate)}
            >
              <TableCell title={String(file.relative_path)}>
                <span className="omnimux-assets-cell-file-title">
                  {file.is_dir ? <FolderIcon /> : <TypeIcon type={file.type} />}
                  <span className="omnimux-assets-cell-ellipsis">{String(file.name)}</span>
                  {file.is_dir ? (
                    <span className="omnimux-assets-cell-dir-arrow">
                      <ChevronRightIcon />
                    </span>
                  ) : null}
                </span>
              </TableCell>
              <TableCell>{file.is_dir ? '—' : formatBytes(Number(file.size))}</TableCell>
              <TableCell>{formatRelative(String(file.mtime))}</TableCell>
              <TableCell>{file.is_dir ? t('type.other') : t(`type.${file.type}`)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
