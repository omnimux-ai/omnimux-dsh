import { Button } from 'dsh-ui-kit'
import { RecordsTable } from './RecordsTable.jsx'
import { GridView } from './GridView.jsx'
import { CalendarView } from './CalendarView.jsx'

export function PublishBatchBar(props) {
  const { t, selectedCount, totalFiltered, onToggleAll, onBatchRetry, onBatchDeleteDrafts, onExitBatch } = props
  const isAllSelected = selectedCount > 0 && selectedCount === totalFiltered
  return (
    <div className="omnimux-publish-batch-bar">
      <span>已选 {selectedCount} 项</span>
      <div className="omnimux-publish-batch-actions">
        <Button size="xs" variant="outline" onClick={() => onToggleAll(!isAllSelected)}>
          {isAllSelected ? '取消全选' : t('action.selectAll')}
        </Button>
        <Button size="xs" variant="outline" onClick={onBatchRetry}>
          {t('action.batchRetry')}
        </Button>
        <Button size="xs" variant="outline" onClick={onBatchDeleteDrafts}>
          {t('action.batchDeleteDrafts')}
        </Button>
        <Button size="xs" variant="ghost" onClick={onExitBatch}>
          {t('action.exitBatch')}
        </Button>
      </div>
    </div>
  )
}

function renderTable(props) {
  const { t, filteredRecords, selectedIds, batchActions, itemActions } = props
  return (
    <RecordsTable
      t={t}
      records={filteredRecords}
      selectedIds={selectedIds}
      onToggleSelect={itemActions.onToggleSelect}
      onToggleAll={batchActions.onToggleAll}
      onView={itemActions.onView}
      onEdit={itemActions.onEdit}
      onDelete={itemActions.onDelete}
      onRetry={itemActions.onRetry}
      sortField="date"
      sortOrder="desc"
      onSort={() => {}}
    />
  )
}

function renderGrid(props) {
  const { t, filteredRecords, selectedIds, isBatchMode, itemActions } = props
  return (
    <GridView
      t={t}
      records={filteredRecords}
      selectedIds={selectedIds}
      isBatchMode={isBatchMode}
      onToggleSelect={itemActions.onToggleSelect}
      onOpen={itemActions.onView}
      onEdit={itemActions.onEdit}
      onDelete={itemActions.onDelete}
      onRetry={itemActions.onRetry}
    />
  )
}

export function PublishViewContent(props) {
  const { viewMode } = props
  if (viewMode === 'table') return renderTable(props)
  if (viewMode === 'grid') return renderGrid(props)
  if (viewMode === 'calendar') {
    return <CalendarView t={props.t} records={props.filteredRecords} onOpen={props.itemActions.onView} />
  }
  return null
}

export function PublishViewport(props) {
  const { toastMsg, isBatchMode, selectedIds, filteredRecords, batchActions } = props
  return (
    <main className="omnimux-publish-viewport">
      {toastMsg ? <div className="omnimux-publish-alert">{toastMsg}</div> : null}
      {isBatchMode ? (
        <PublishBatchBar
          t={props.t}
          selectedCount={selectedIds.size}
          totalFiltered={filteredRecords.length}
          onToggleAll={batchActions.onToggleAll}
          onBatchRetry={batchActions.onBatchRetry}
          onBatchDeleteDrafts={batchActions.onBatchDeleteDrafts}
          onExitBatch={batchActions.onExitBatch}
        />
      ) : null}
      <PublishViewContent {...props} />
    </main>
  )
}
