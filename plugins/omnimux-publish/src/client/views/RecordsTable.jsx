import React from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from 'dsh-ui-kit'
import { TABLE_COLUMNS, formatMetric } from '../metrics-display.js'
import { displayStatus, statusText } from '../status-display.js'
import { RowActionMenu } from './RowActionMenu.jsx'

/**
 * 14 列完整数据表格视图 (RecordsTable)
 * 依据 spec-ui-client-v2.4.md 规范定义。
 * 列宽/对齐全部走 CSS 类（omnimux-publish-col-*），JSX 内零业务内联样式（UI02）。
 * @param {{
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 *   records: Array<Record<string, unknown>>,
 *   selectedIds: Set<string>,
 *   onToggleSelect: (id: string) => void,
 *   onToggleAll: (allSelected: boolean) => void,
 *   onView: (record: Record<string, unknown>) => void,
 *   onEdit: (record: Record<string, unknown>) => void,
 *   onDelete: (record: Record<string, unknown>) => void,
 *   onRetry: (record: Record<string, unknown>) => void,
 *   sortField: string,
 *   sortOrder: 'asc' | 'desc',
 *   onSort: (field: string) => void,
 * }} props
 */
export function RecordsTable({
  t,
  records,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onView,
  onEdit,
  onDelete,
  onRetry,
  sortField,
  sortOrder,
  onSort,
}) {
  const allSelected = records.length > 0 && records.every((r) => selectedIds.has(String(r.id)))

  if (!records || records.length === 0) {
    return (
      <div className="omnimux-publish-table-wrap">
        <Table className="omnimux-publish-table" stickyHeader dense>
          <TableHeader>
            <TableRow>
              <TableHead className="omnimux-publish-col-check" />
              <TableHead className="omnimux-publish-col-content">Content</TableHead>
              <TableHead className="omnimux-publish-col-platforms">Platforms</TableHead>
              {TABLE_COLUMNS.map((col) => (
                <TableHead key={col.key} style={{ '--pub-min-w': col.minWidth ? `${col.minWidth}px` : undefined }}>
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="omnimux-publish-col-menu" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={14} className="omnimux-publish-table-empty">
                {t('records.empty.all')}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="omnimux-publish-table-wrap">
      <Table className="omnimux-publish-table" stickyHeader dense>
        <TableHeader>
          <TableRow>
            <TableHead className="omnimux-publish-col-check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onToggleAll(e.target.checked)}
                aria-label={t('action.selectAll')}
              />
            </TableHead>
            <TableHead className="omnimux-publish-col-content">Content</TableHead>
            <TableHead className="omnimux-publish-col-platforms">Platforms</TableHead>
            <TableHead
              sortable
              sortDirection={sortField === 'date' ? sortOrder : null}
              className="omnimux-publish-col-sort omnimux-publish-col-date"
              onClick={() => onSort('date')}
            >
              Date
            </TableHead>
            <TableHead
              sortable
              sortDirection={sortField === 'status' ? sortOrder : null}
              className="omnimux-publish-col-sort omnimux-publish-col-status"
              onClick={() => onSort('status')}
            >
              Status
            </TableHead>
            {/* 8 维指标表头 (包含 14px SVG 图标 + 短名，锁定 56px 宽) */}
            {TABLE_COLUMNS.slice(5, 13).map((col) => {
              const IconComp = col.icon
              return (
                <TableHead
                  key={col.key}
                  className="omnimux-publish-th-metric"
                  title={col.label}
                >
                  <div className="omnimux-publish-th-metric-inner">
                    {IconComp ? <IconComp /> : null}
                    <span>{col.label}</span>
                  </div>
                </TableHead>
              )
            })}
            <TableHead className="omnimux-publish-col-menu" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => {
            const id = String(record.id)
            const isSelected = selectedIds.has(id)
            const status = displayStatus(record)
            const statusLabel = statusText(status)
            const isDraft = record.status === 'draft' || status === 'draft'
            const title = String(record.title || record.description || id)
            const isVideo = record.type === 'video'
            const dateStr = record.submitted_at || record.updated_at || record.created_at || '-'

            const subtasks = Array.isArray(record.subtasks) ? record.subtasks : []
            const platforms = isDraft
              ? ['draft']
              : subtasks.map((st) => st.platform || 'unknown')

            return (
              <TableRow
                key={id}
                selected={isSelected}
                className={isSelected ? 'omnimux-publish-row selected' : 'omnimux-publish-row'}
                onClick={() => (isDraft ? onEdit(record) : onView(record))}
              >
                <TableCell className="omnimux-publish-td-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(id)}
                    aria-label={`Select ${title}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="omnimux-publish-td-content">
                    <div className="omnimux-publish-td-thumb">
                      {isVideo ? (
                        <span className="omnimux-publish-type-icon">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
                        </span>
                      ) : (
                        <span className="omnimux-publish-type-icon">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        </span>
                      )}
                    </div>
                    <div className="omnimux-publish-td-title-wrap">
                      <span className="omnimux-publish-td-title" title={title}>
                        {title}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="omnimux-publish-platforms-cluster">
                    {platforms.length > 0 ? (
                      platforms.map((p, idx) => (
                        <span key={idx} className={`omnimux-publish-plat-tag ${p}`} title={p}>
                          {p === 'tiktok' ? '🎵' : p === 'xiaohongshu' || p === 'xhs' ? '小' : p === 'wechat_channels' || p === 'sph' ? '视' : p.slice(0, 1).toUpperCase()} // exempt-ui04: 历史存量待迁移为矢量SVG
                        </span>
                      ))
                    ) : (
                      <span className="omnimux-publish-muted">-</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="omnimux-publish-td-datetime">{dateStr.slice(0, 16).replace('T', ' ')}</TableCell>
                <TableCell>
                  <span className={`omnimux-publish-status-pill ${status}`}>
                    {statusLabel}
                  </span>
                </TableCell>
                {/* 8 维指标单元格：全部使用 formatMetric 渲染为诚实空槽 '-' */}
                <TableCell className="omnimux-publish-td-metric">{formatMetric(record.likes)}</TableCell>
                <TableCell className="omnimux-publish-td-metric">{formatMetric(record.comments)}</TableCell>
                <TableCell className="omnimux-publish-td-metric">{formatMetric(record.shares)}</TableCell>
                <TableCell className="omnimux-publish-td-metric">{formatMetric(record.saves)}</TableCell>
                <TableCell className="omnimux-publish-td-metric">{formatMetric(record.clicks)}</TableCell>
                <TableCell className="omnimux-publish-td-metric">{formatMetric(record.views)}</TableCell>
                <TableCell className="omnimux-publish-td-metric">{formatMetric(record.impressions)}</TableCell>
                <TableCell className="omnimux-publish-td-metric">{formatMetric(record.reach)}</TableCell>
                <TableCell className="omnimux-publish-td-center" onClick={(e) => e.stopPropagation()}>
                  <RowActionMenu
                    t={t}
                    record={record}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onRetry={onRetry}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
