import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button, Divider, EmptyState, FilterBar, IconButton, PageHeader, SearchField, Tabs } from 'dsh-ui-kit'
import { GridIcon, ImportIcon, ListIcon, PlusIcon } from './icons.jsx'
import { AddAssetDialog, ASSET_TYPE_KEYS } from './AddAssetDialog.jsx'
import { AssetBrowse } from './AssetBrowse.jsx'
import { AssetGrid } from './AssetGrid.jsx'
import { AssetDetail } from './AssetDetail.jsx'
import { AssetPreviewModal } from './AssetPreviewModal.jsx'
import { CloudAssetsView } from './CloudAssetsView.jsx'
import { cloudAssetToPreviewItem } from './cloud-preview.js'
import { useCloudSave } from './use-cloud-save.js'
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog.jsx'
import { computeEmptyState, countAssetsByType } from './feed-helpers.js'
import { injectAssetsStyles } from './styles.js'
import { useAssetsFeed } from './use-assets-feed.js'

const TAB_ID = 'omnimux-assets:library'

function AssetsHeader(props) {
  const { t, stage, busy, refreshState, setBusy } = props
  const onRefresh = () => {
    setBusy(true)
    void refreshState(true).finally(() => setBusy(false))
  }
  const onClose = () => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (api && typeof api.closeTab === 'function') {
      api.closeTab(TAB_ID)
    } else {
      stage?.set?.(false)
    }
  }

  return (
    <PageHeader
      title={t('stage.title')}
      subtitle={t('stage.subtitle')}
      onRefresh={onRefresh}
      refreshing={busy}
      refreshTitle={t('stage.refresh')}
      onClose={onClose}
      closeTitle={t('stage.close')}
    />
  )
}

function AssetsActionRow(props) {
  const { t, feed } = props
  const onAdd = () => {
    feed.setCreating(feed.filterType || 'character')
    feed.setFormError('')
  }
  const onImport = () => {
    feed.setError(t('import.notice'))
    setTimeout(() => feed.setError(''), 3000)
  }

  return (
    <div className="omnimux-assets-action-row">
      <Button variant="primary" leadingIcon={<PlusIcon />} onClick={onAdd}>
        {t('add.button')}
      </Button>
      <Button variant="outline" leadingIcon={<ImportIcon />} onClick={onImport}>
        {t('import.button')}
      </Button>
    </div>
  )
}

/**
 * Category row for the local library: the same chip treatment and the same
 * shape as the cloud tab's first level, driven by the local type vocabulary
 * instead of catalog categories.
 *
 * The row always leads with 全部 and then lists every asset type. Each chip
 * carries its own count; counts describe the whole library and never the
 * current query, so a chip's number holds still while the search box narrows
 * the grid — the cloud nav reads its totals from the manifest the same way.
 * An empty library still renders the row: 全部 0 is information, and a filter
 * row that appears only after the first asset would move the grid under the
 * user.
 * @param {{
 *   t: (key: string) => string,
 *   assets: any[],
 *   filterType: string,
 *   onTypeChange: (type: string) => void,
 * }} props
 */
function LocalCategoryNav(props) {
  const { t, assets, filterType, onTypeChange } = props
  const rows = useMemo(() => {
    const counts = countAssetsByType(assets)
    return [
      { key: '', label: t('chip.all'), total: Array.isArray(assets) ? assets.length : 0 },
      ...ASSET_TYPE_KEYS.map((key) => ({ key, label: t(`type.${key}`), total: counts[key] ?? 0 })),
    ]
  }, [assets, t])

  return (
    <div className="omnimux-assets-local-nav">
      <div className="omnimux-assets-local-nav-row" role="group" aria-label={t('local.nav.label')}>
        {rows.map((row) => (
          <Button
            key={row.key || 'all'}
            variant="ghost"
            size="sm"
            className="omnimux-assets-cloud-chip"
            aria-pressed={row.key === filterType ? 'true' : 'false'}
            onClick={() => onTypeChange(row.key)}
          >
            {row.label}
            <span className="omnimux-assets-cloud-count">{row.total}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}

function AssetsViewToggle(props) {
  const { t, viewMode, onViewModeChange } = props
  return (
    <div className="omnimux-assets-view-toggle">
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={t('view.grid')}
        aria-pressed={viewMode === 'grid'}
        onClick={() => onViewModeChange('grid')}
      >
        <GridIcon />
      </IconButton>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={t('view.list')}
        aria-pressed={viewMode === 'list'}
        onClick={() => onViewModeChange('list')}
      >
        <ListIcon />
      </IconButton>
    </div>
  )
}

function AssetsFilterBar(props) {
  const { t, feed, sourceTab, onSourceTabChange } = props

  return (
    <FilterBar
      className="omnimux-assets-stage-toolbar"
      filters={
        <Tabs
          variant="underline"
          items={[
            { id: 'local', label: t('source.local') },
            { id: 'cloud', label: t('source.cloud') },
          ]}
          activeId={sourceTab}
          onChange={onSourceTabChange}
        />
      }
      tools={
        <div className="omnimux-assets-tools-cluster">
          <div className="omnimux-assets-search-wrap">
            <SearchField
              placeholder={t('search.placeholder')}
              value={feed.query}
              onChange={feed.setQuery}
              onClear={() => feed.setQuery('')}
            />
          </div>
          <AssetsViewToggle t={t} viewMode={feed.viewMode} onViewModeChange={feed.setViewMode} />
        </div>
      }
    />
  )
}

function AssetsSelectionBar(props) {
  const { t, feed } = props
  if (!feed.selecting) return null

  return (
    <div className="omnimux-assets-selection">
      <span>{t('select.count').replace('{n}', String(feed.selectedCount))}</span>
      <div className="omnimux-assets-selection-actions">
        <Button variant="ghost" size="sm" onClick={feed.clearSelection}>
          {t('select.clear')}
        </Button>
        <Button variant="danger" size="sm" disabled={feed.busy} onClick={feed.handleOpenBatchDelete}>
          {t('select.delete').replace('{n}', String(feed.selectedCount))}
        </Button>
      </div>
    </div>
  )
}

function AssetsMainView(props) {
  const { t, feed, emptyProps, onOpenAdd, onPreview } = props
  const { detail, setDetail, visible, viewMode, copyCite, copiedId, selectedIds, toggleSelect, handleRemoveSingle } = feed
  const { emptyLabel, emptyActionLabel, searching } = emptyProps

  if (detail) {
    return (
      <AssetBrowse
        key={detail.id}
        t={t}
        asset={detail}
        onBack={() => setDetail(null)}
        onPreview={onPreview}
      />
    )
  }

  return (
    <AssetGrid
      t={t}
      assets={visible}
      viewMode={viewMode}
      emptyLabel={emptyLabel}
      emptyActionLabel={emptyActionLabel}
      showEmptyAction={!searching}
      onEmptyAction={onOpenAdd}
      onOpen={setDetail}
      onPreview={onPreview}
      onCopy={copyCite}
      onRemove={handleRemoveSingle}
      copiedId={copiedId}
      selectedIds={selectedIds}
      onToggleSelect={toggleSelect}
      onBrowse={setDetail}
    />
  )
}

function AssetsBody(props) {
  const { t, feed, emptyProps, onPreview, onCloudPreview, cloudSave, sourceTab, visible } = props
  const onOpenAdd = () => {
    feed.setCreating(feed.filterType || 'character')
    feed.setFormError('')
  }

  if (sourceTab === 'cloud') {
    // Mounted only while the cloud tab is selected: leaving it unmounts the
    // feed, which is what stops an in-flight audition and releases its audio.
    // Cards carry no save control — the only route out of a card is into the
    // conversation — so the stage's controller serves the preview modal alone.
    return (
      <div className="omnimux-assets-body">
        <div className="omnimux-assets-main">
          <CloudAssetsView t={t} open={visible} onPreview={onCloudPreview} />
        </div>
      </div>
    )
  }

  return (
    <div className="omnimux-assets-body">
      <div className="omnimux-assets-main">
        <AssetsMainView t={t} feed={feed} emptyProps={emptyProps} onOpenAdd={onOpenAdd} onPreview={onPreview} />
      </div>
      {feed.detail && (
        <AssetDetail
          t={t}
          asset={feed.detail}
          busy={feed.busy}
          onClose={() => feed.setDetail(null)}
          onSave={feed.handleSaveDetail}
        />
      )}
    </div>
  )
}

function AddAssetDialogItem(props) {
  const { t, feed } = props
  const onCancel = () => {
    feed.setCreating(null)
    feed.setFormError('')
  }
  return (
    <AddAssetDialog
      t={t}
      busy={feed.busy}
      presetType={feed.creating || 'character'}
      error={feed.formError}
      onCancel={onCancel}
      onPick={feed.handlePick}
      onSubmit={feed.handleCreate}
    />
  )
}

function ConfirmRemoveDialogItem(props) {
  const { t, feed } = props
  const { pendingRemove, setPendingRemove, busy, handleConfirmDelete } = feed
  const removeTitle = pendingRemove.isBatch
    ? t('confirm.deleteSelected').replace('{n}', String(pendingRemove.ids.length))
    : t('confirm.deleteTitle').replace('{name}', String(pendingRemove.names[0] ?? ''))
  return (
    <ConfirmRemoveDialog
      t={t}
      name={String(pendingRemove.names[0] ?? '')}
      title={removeTitle}
      busy={busy}
      onCancel={() => setPendingRemove(null)}
      onConfirm={handleConfirmDelete}
    />
  )
}

function AssetsDialogs(props) {
  const { t, feed } = props
  return (
    <>
      {feed.creating ? <AddAssetDialogItem t={t} feed={feed} /> : null}
      {feed.pendingRemove ? <ConfirmRemoveDialogItem t={t} feed={feed} /> : null}
    </>
  )
}

/**
 * Creative asset library workbench tab component mounted in dsh-better-sidebar.
 * @param {{
 *   t: (key: string) => string,
 *   stage?: { getSnapshot: () => boolean, subscribe: Function, set: Function },
 *   store?: { reduce?: Function, getSnapshot?: Function },
 *   visible?: boolean,
 * }} props
 */
export function AssetsStage(props) {
  const { t, stage, store, visible = true } = props
  const [previewTarget, setPreviewTarget] = useState(null)
  // One save controller for the whole stage: the cloud cards and the preview
  // modal share it, so a row saved from either one is marked in both.
  const cloudSave = useCloudSave({ t })
  useEffect(() => { injectAssetsStyles() }, [])
  const everOpened = true

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  const feed = useAssetsFeed({ t, open: visible })
  const emptyProps = computeEmptyState(feed.filterType, feed.query, t)
  const [sourceTab, setSourceTab] = useState('local')

  // A cloud row has no library record behind it, so opening its preview means
  // translating the catalog row first — and the translation remembers the row
  // id, which is what the modal's save needs.
  const openCloudPreview = useCallback((asset) => {
    const next = cloudAssetToPreviewItem(asset)
    if (next) setPreviewTarget(next)
  }, [])

  const savePreviewItem = useCallback((item) => {
    const id = String(item?.sourceAssetId ?? '')
    if (id === '') return
    void cloudSave.save({ id, name: String(item?.title ?? '') })
  }, [cloudSave])

  const previewCloudId = previewTarget?.cloud === true ? String(previewTarget.sourceAssetId ?? '') : ''

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.registerContextContributor !== 'function') return undefined
    const unsub = api.registerContextContributor(TAB_ID, () => ({
      view: {
        filterType: feed.filterType,
        query: feed.query,
        sortKey: feed.sortKey,
      },
      selection: Array.from(feed.selectedIds || []).map((id) => {
        const item = feed.assets?.find((a) => a.id === id)
        return { id, name: item?.name, type: item?.type }
      }),
    }))
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [feed.filterType, feed.query, feed.sortKey, feed.selectedIds, feed.assets])

  return (
    <div
      role="region"
      aria-label={t('stage.title')}
      aria-hidden={visible ? undefined : 'true'}
      className="omnimux-assets-stage"
      data-visible={visible ? 'true' : 'false'}
      style={{ display: visible ? 'flex' : 'none', position: 'relative', width: '100%', height: '100%', flexDirection: 'column', overflow: 'hidden' }} /* exempt-ui02: Stage 根容器布局 */
    >
      <AssetsHeader t={t} stage={stage} busy={feed.busy} refreshState={feed.refreshState} setBusy={feed.setBusy} />
      <AssetsActionRow t={t} feed={feed} />
      <Divider />
      <AssetsFilterBar t={t} feed={feed} sourceTab={sourceTab} onSourceTabChange={setSourceTab} />
      {sourceTab === 'local' ? (
        // The local tab draws its own category row here, under the toolbar. The
        // cloud tab draws one from the catalog manifest inside its own view, so
        // mounting this one there as well would stack two rows of chips.
        <LocalCategoryNav
          t={t}
          assets={feed.assets}
          filterType={feed.filterType}
          onTypeChange={feed.setFilterType}
        />
      ) : null}
      <AssetsSelectionBar t={t} feed={feed} />
      {feed.error !== '' ? <p className="omnimux-assets-error">{feed.error}</p> : null}
      {cloudSave.notice !== '' ? <p className="omnimux-assets-cloud-notice">{cloudSave.notice}</p> : null}
      <AssetsBody
        t={t}
        feed={feed}
        emptyProps={emptyProps}
        onPreview={setPreviewTarget}
        onCloudPreview={openCloudPreview}
        cloudSave={cloudSave}
        sourceTab={sourceTab}
        visible={visible}
      />
      <AssetsDialogs t={t} feed={feed} />
      {previewTarget && (
        <AssetPreviewModal
          item={previewTarget}
          t={t}
          onClose={() => setPreviewTarget(null)}
          saved={previewCloudId !== '' && cloudSave.savedIds.has(previewCloudId)}
          saving={previewCloudId !== '' && cloudSave.savingId === previewCloudId}
          onSaveToLocal={previewCloudId !== '' ? savePreviewItem : undefined}
        />
      )}
    </div>
  )
}
