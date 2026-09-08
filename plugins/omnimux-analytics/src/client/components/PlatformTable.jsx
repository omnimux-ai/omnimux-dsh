import { useMemo, useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from 'dsh-ui-kit'
import { PLATFORM_TABLE_COLUMNS } from '../constants.js'
import { formatCount, formatEr } from '../format.js'
import { sortRows } from '../sort.js'

function cellText(kind, value) {
  if (kind === 'er') return formatEr(value)
  if (kind === 'count') return formatCount(value)
  if (value == null || value === '') return '-'
  return String(value)
}

/**
 * Platform breakdown. Header click toggles asc/desc; nulls sink both ways.
 */
export function PlatformTable({ t, rows }) {
  const [sort, setSort] = useState({ key: 'posts', dir: 'desc' })
  const sorted = useMemo(
    () => sortRows(Array.isArray(rows) ? rows : [], sort.key, sort.dir),
    [rows, sort],
  )

  return (
    <section className="omnimux-analytics-tablewrap">
      <header className="omnimux-analytics-table-head">
        <h3 className="omnimux-analytics-panel-title">{t('table.platformTitle')}</h3>
      </header>
      <div className="omnimux-analytics-tablescroll">
        <Table className="omnimux-analytics-table" stickyHeader dense>
          <TableHeader>
            <TableRow>
              {PLATFORM_TABLE_COLUMNS.map((column) => {
                const active = sort.key === column.key
                return (
                  <TableHead
                    key={column.key}
                    scope="col"
                    sortable
                    sortDirection={active ? sort.dir : null}
                    onClick={() => {
                      setSort((prev) => (
                        prev.key === column.key
                          ? { key: column.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                          : { key: column.key, dir: 'desc' }
                      ))
                    }}
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
                <TableCell colSpan={PLATFORM_TABLE_COLUMNS.length}>{t('table.empty')}</TableCell>
              </TableRow>
            ) : sorted.map((row) => (
              <TableRow key={row.platform}>
                {PLATFORM_TABLE_COLUMNS.map((column) => (
                  <TableCell key={column.key} className={column.kind === 'text' ? '' : 'is-num'}>
                    {column.key === 'platformLabel' ? (
                      <span className="omnimux-analytics-platform">
                        <span className="omnimux-analytics-platform-dot" data-platform={row.platform} />
                        {row.platformLabel || t(`platform.${row.platform}`)}
                      </span>
                    ) : column.kind === 'er' && row.er != null ? (
                      <span className="omnimux-analytics-er">{formatEr(row.er)}</span>
                    ) : cellText(column.kind, row[column.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
