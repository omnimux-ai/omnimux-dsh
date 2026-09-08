import { useMemo, useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from 'dsh-ui-kit'
import { POST_TABLE_COLUMNS } from '../constants.js'
import { formatCount, formatEr } from '../format.js'
import { sortRows, sortTopPostsDefault } from '../sort.js'

function cellText(kind, value) {
  if (kind === 'er') return formatEr(value)
  if (kind === 'count') return formatCount(value)
  if (value == null || value === '') return '-'
  return String(value)
}

/**
 * Top performing posts. Default order is ER desc / views desc; any other
 * header click uses the same null-sinking comparator as PlatformTable.
 */
export function TopPostsTable({ t, rows }) {
  const [sort, setSort] = useState({ key: 'er', dir: 'desc' })
  const sorted = useMemo(() => {
    const list = Array.isArray(rows) ? rows : []
    if (sort.key === 'er' && sort.dir === 'desc') return sortTopPostsDefault(list)
    return sortRows(list, sort.key, sort.dir)
  }, [rows, sort])

  return (
    <section id="omnimux-analytics-top-posts" className="omnimux-analytics-tablewrap">
      <header className="omnimux-analytics-table-head">
        <h3 className="omnimux-analytics-panel-title">{t('table.postsTitle')}</h3>
      </header>
      <div className="omnimux-analytics-tablescroll">
        <Table className="omnimux-analytics-table" stickyHeader dense>
          <TableHeader>
            <TableRow>
              {POST_TABLE_COLUMNS.map((column) => {
                const isSortable = column.sortable !== false
                const active = sort.key === column.key
                return (
                  <TableHead
                    key={column.key}
                    scope="col"
                    sortable={isSortable}
                    sortDirection={isSortable && active ? sort.dir : null}
                    onClick={isSortable ? () => {
                      setSort((prev) => (
                        prev.key === column.key
                          ? { key: column.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                          : { key: column.key, dir: 'desc' }
                      ))
                    } : undefined}
                  >
                    {t(column.labelKey)}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={POST_TABLE_COLUMNS.length}>{t('table.empty')}</TableCell>
              </TableRow>
            ) : sorted.map((row) => (
              <TableRow key={row.postId}>
                {POST_TABLE_COLUMNS.map((column) => {
                  if (column.kind === 'post') {
                    return (
                      <TableCell key={column.key}>
                        <div className="omnimux-analytics-postcell">
                          {row.coverUrl ? (
                            <img className="omnimux-analytics-thumb" src={row.coverUrl} alt="" />
                          ) : (
                            <span className="omnimux-analytics-thumb is-fallback" data-platform={row.platform} />
                          )}
                          <span className="omnimux-analytics-platform-dot" data-platform={row.platform} />
                          <div className="omnimux-analytics-postcopy">
                            <div className="omnimux-analytics-posttitle">{row.title || '-'}</div>
                            <div className="omnimux-analytics-postmeta">{row.publishedLabel || '-'}</div>
                          </div>
                        </div>
                      </TableCell>
                    )
                  }
                  return (
                    <TableCell key={column.key} className="is-num">
                      {column.kind === 'er' && row.er != null
                        ? <span className="omnimux-analytics-er">{formatEr(row.er)}</span>
                        : cellText(column.kind, row[column.key])}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
