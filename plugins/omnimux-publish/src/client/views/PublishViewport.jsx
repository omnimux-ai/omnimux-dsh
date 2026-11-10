import { Button } from 'dsh-ui-kit'
import { RecordsTable } from './RecordsTable.jsx'
import { GridView } from './GridView.jsx'

export function PublishBatchBar(props) {
  const { t, selectedCount, totalFiltered, isBatchMode, onToggleAll, onBatchRetry, onBatchDeleteDrafts, onExitBatch } = props
  const isAllSelected = selectedCount > 0 && selectedCount === totalFiltered
  const empty = selectedCount === 0
  return (
    <div className="omnimux-publish-batch-bar">
      <span>{t('action.selectedCount').replace('{count}', String(selectedCount))}</span>
      <div className="omnimux-publish-batch-actions">
        <Button size="xs" variant="outline" disabled={totalFiltered === 0} onClick={() => onToggleAll(!isAllSelected)}>
          {isAllSelected ? t('action.clearAll') : t('action.selectAll')}
        </Button>
        <Button size="xs" variant="outline" disabled={empty} onClick={onBatchRetry}>
          {t('action.batchRetry')}
        </Button>
        <Button size="xs" variant="outline" disabled={empty} onClick={onBatchDeleteDrafts}>
          {t('action.batchDeleteDrafts')}
        </Button>
        <Button size="xs" variant="ghost" onClick={onExitBatch}>
          {isBatchMode ? t('action.exitBatch') : t('action.clearSelection')}
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
  return renderGrid(props)
}

export function shouldShowBatchBar(isBatchMode, selectedCount) {
  return Boolean(isBatchMode) || selectedCount > 0
}

export function PublishViewport(props) {
  const { toastMsg, isBatchMode, selectedIds, filteredRecords, batchActions } = props
  return (
    <main className="omnimux-publish-viewport">
      {toastMsg ? <div className="omnimux-publish-alert">{toastMsg}</div> : null}
      {shouldShowBatchBar(isBatchMode, selectedIds.size) ? (
        <PublishBatchBar
          t={props.t}
          selectedCount={selectedIds.size}
          totalFiltered={filteredRecords.length}
          isBatchMode={isBatchMode}
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
