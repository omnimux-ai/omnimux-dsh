import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ModalDialog } from 'dsh-ui-kit'
import { InspirationPickerCard } from './InspirationPickerCard.jsx'
import {
  INSPIRATION_TABS,
  defaultFetchCategories,
  defaultFetchInspirations,
  isAlreadyAdded,
  remainingQuota,
  toggleSelect,
} from './picker-model.js'
import {
  PICKER_DIALOG_VARIANT_CLASS,
  PICKER_LAYOUTS,
  ensurePickerDialogStyles,
  pickerDialogClassName,
  pickerDialogWidth,
} from '../picker-dialog/pickerDialogContract.js'
import {
  PickerHeaderTabs,
  PickerToolbar,
  PickerFilterPills,
  PickerSearchInput,
  PickerFooter,
  PickerEmpty,
} from '../picker-dialog/index.js'
import { ModalCloseButton } from '../ModalCloseButton.jsx'

const STYLE_ID = 'omx-composer-add-inspiration-picker'

const CSS = `
.${PICKER_DIALOG_VARIANT_CLASS.inspiration} {
  --omnimux-pick-dialog-width: ${pickerDialogWidth(PICKER_LAYOUTS.inspiration)};
}
.omx-inspiration-pick {
  display: flex; flex-direction: column; width: 100%; height: 480px; min-height: 0;
  max-height: calc(80vh - 190px);
  box-sizing: border-box;
}
.omx-inspiration-pick__header {
  flex: none; display: flex; align-items: center; justify-content: flex-start;
  padding: 16px 24px 0;
}
.omx-inspiration-pick__tabs {
  display: flex; align-items: center; gap: 24px;
}
.omx-inspiration-pick__tab {
  appearance: none; background: transparent; border: none; cursor: pointer;
  font: inherit; font-size: 16px; font-weight: 500; color: var(--dsw-alias-label-tertiary);
  padding: 4px 0 10px; position: relative; transition: color 0.15s ease;
  white-space: nowrap;
}
.omx-inspiration-pick__tab:hover,
.omx-inspiration-pick__tab[data-active="true"] { color: var(--dsw-alias-label-primary); }
.omx-inspiration-pick__tab[data-active="true"] { font-weight: 600; }
.omx-inspiration-pick__tab[data-active="true"]::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  background: var(--dsw-alias-label-primary); border-radius: 2px;
}
.omx-inspiration-pick__toolbar {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px 12px; gap: 16px;
}
.omx-inspiration-pick__filter-pills {
  display: flex; align-items: center; gap: 8px; overflow-x: auto;
  scrollbar-width: none;
}
.omx-inspiration-pick__filter-pills::-webkit-scrollbar { display: none; }
.omx-inspiration-pick__pill {
  appearance: none; background: var(--dsw-alias-bg-layer-3);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
  padding: 4px 12px; font-size: 13px; line-height: 18px;
  color: var(--dsw-alias-label-secondary); cursor: pointer; white-space: nowrap;
  transition: all 0.15s ease;
}
.omx-inspiration-pick__pill:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omx-inspiration-pick__pill[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: transparent;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.omx-inspiration-pick__search-wrap {
  position: relative; display: flex; align-items: center; width: 220px; flex-shrink: 0;
}
.omx-inspiration-pick__search-icon {
  position: absolute; left: 12px; color: var(--dsw-alias-label-tertiary);
  pointer-events: none; display: flex; align-items: center;
}
.omx-inspiration-pick__search-input {
  width: 100%; height: 32px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  padding: 0 30px 0 32px; font-size: 13px; color: var(--dsw-alias-label-primary);
  outline: none; box-sizing: border-box;
}
.omx-inspiration-pick__search-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.omx-inspiration-pick__search-clear {
  position: absolute; right: 10px; appearance: none; border: none;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer; padding: 2px; border-radius: 4px; display: flex;
}
.omx-inspiration-pick__scroll {
  flex: 1; overflow-y: auto; padding: 0 24px; min-height: 0;
}
.omx-inspiration-pick__grid {
  display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px;
  align-items: start;
}
.omx-inspiration-pick__empty {
  border: 1px dashed var(--dsw-alias-border-l4); border-radius: 12px; min-height: 200px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  color: var(--dsw-alias-label-tertiary); font-size: 13px; padding: 24px; text-align: center;
}
.omx-inspiration-pick-card {
  display: flex; flex-direction: column; width: 100%;
  background: transparent; border: none; padding: 0; text-align: left;
  cursor: pointer; box-sizing: border-box;
}
.omx-inspiration-pick-card__thumb {
  position: relative; width: 100%; aspect-ratio: 1 / 1;
  background: var(--dsw-alias-bg-module-platform); border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-tertiary); overflow: hidden;
  border: 1.5px solid transparent;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.omx-inspiration-pick-card:hover .omx-inspiration-pick-card__thumb { transform: translateY(-2px); }
.omx-inspiration-pick-card[data-selected="true"] .omx-inspiration-pick-card__thumb {
  border-color: var(--dsw-alias-button-primary-fill);
}
.omx-inspiration-pick-card[aria-disabled="true"] { cursor: default; opacity: 0.72; }
.omx-inspiration-pick-card[aria-disabled="true"]:hover .omx-inspiration-pick-card__thumb { transform: none; }
.omx-inspiration-pick-card__img { width: 100%; height: 100%; object-fit: cover; }
.omx-inspiration-pick-card__placeholder {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.omx-inspiration-pick-card__glyph { font-size: 18px; font-weight: 600; opacity: 0.6; }
.omx-inspiration-pick-card__check {
  position: absolute; top: 8px; left: 8px; width: 18px; height: 18px; border-radius: 5px;
  display: inline-flex; align-items: center; justify-content: center; z-index: 2;
  border: 1.5px solid var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-2);
}
.omx-inspiration-pick-card__check[data-selected="true"] {
  border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omx-inspiration-pick-card__badge {
  position: absolute; left: 8px; bottom: 8px; z-index: 2;
  font-size: 11px; line-height: 16px; font-weight: 600; padding: 2px 8px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
}
.omx-inspiration-pick-card__already {
  position: absolute; right: 8px; top: 8px; z-index: 2;
  font-size: 10px; line-height: 14px; padding: 2px 6px; border-radius: 4px;
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-state-warn-primary);
  border: 1px solid var(--dsw-alias-border-l2);
}
.omx-inspiration-pick-card__body {
  display: flex; flex-direction: column; gap: 2px; margin-top: 6px; padding: 0 2px; min-width: 0;
}
.omx-inspiration-pick-card__title {
  font-size: 13px; font-weight: 600; line-height: 18px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary);
}
.omx-inspiration-pick__footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 16px; width: 100%;
  box-sizing: border-box; padding: 2px 0;
}
.omx-inspiration-pick__meta {
  margin-right: auto; min-width: 0; font-size: 13px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.omx-inspiration-pick__actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.omx-inspiration-pick__error {
  color: var(--dsw-alias-state-error-primary); font-size: 12px; margin: 0 24px 8px;
}
`

function ensureStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  ensurePickerDialogStyles(doc)
  if (!doc || doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head?.appendChild(style)
}

function interpolate(template, vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key])))
}

const DEFAULT_STRINGS = {
  'inspirationPicker.title': '从灵感库选择',
  'inspirationPicker.cancel': '取消',
  'inspirationPicker.confirm': '加入卡槽',
  'inspirationPicker.tab.all': '全部',
  'inspirationPicker.tab.local': '本地',
  'inspirationPicker.tab.public': '云端',
  'inspirationPicker.pill.all': '全部',
  'inspirationPicker.searchPlaceholder': '搜索灵感标题…',
  'inspirationPicker.selectedMeta': '已选 {n} 项 · 还可添加 {m} 项',
  'inspirationPicker.selectedMetaUnbounded': '已选 {n} 项',
  'inspirationPicker.loading': '正在加载灵感库…',
  'inspirationPicker.empty': '灵感库还是空的。先去导入作品，再回到这里添加。',
  'inspirationPicker.emptySearch': '未找到匹配的灵感。',
  'inspirationPicker.needLogin': '登录后可查看云端灵感。',
  'inspirationPicker.goLibrary': '去灵感库',
  'inspirationPicker.libraryTitle': '灵感库',
  'inspirationPicker.alreadyAdded': '已在会话中',
  'inspirationPicker.type.local': '本地',
  'inspirationPicker.type.cloud': '云端',
  'inspirationPicker.categories': '灵感来源',
}

function defaultT(key, vars) {
  return interpolate(DEFAULT_STRINGS[key] || key, vars)
}

/**
 * 可复用灵感多选选择器：不负责确认后去向，不持灵感库客户端依赖。
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   t?: (key: string, vars?: object) => string,
 *   fetchInspirations?: (params: object) => Promise<{ items: object[], phase?: string }>,
 *   fetchCategories?: () => Promise<Array<{ id: string, label: string }>>,
 *   maxSelect?: number,
 *   occupied?: number,
 *   alreadyIds?: Set<string> | string[],
 *   onConfirm: (items: object[]) => void | Promise<void>,
 *   closeOnConfirm?: boolean,
 *   emptyAction?: { label: string, onClick: () => void },
 * }} props
 */
export function InspirationPicker({
  open,
  onClose,
  t,
  fetchInspirations,
  fetchCategories,
  maxSelect,
  occupied = 0,
  alreadyIds,
  onConfirm,
  closeOnConfirm = true,
  emptyAction,
}) {
  const tt = typeof t === 'function' ? t : defaultT
  const [tab, setTab] = useState('all')
  const [category, setCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('ready')
  const [selected, setSelected] = useState(() => new Set())
  const [selectedItems, setSelectedItems] = useState(() => new Map())
  const [busy, setBusy] = useState(false)
  const requestRevision = useRef(0)
  const openRevision = useRef(0)
  const previousOpen = useRef(open)
  const categoriesRevision = useRef(0)

  useEffect(() => {
    ensureStyles()
  }, [])

  useEffect(() => {
    if (previousOpen.current !== open) {
      previousOpen.current = open
      openRevision.current += 1
    }
    if (!open) {
      requestRevision.current += 1
      setBusy(false)
      return undefined
    }
    setTab('all')
    setCategory('all')
    setSearchQuery('')
    setSelected(new Set())
    setSelectedItems(new Map())
    setError('')
    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const revision = ++categoriesRevision.current
    let cancelled = false
    const loader = fetchCategories || defaultFetchCategories
    loader().then((rows) => {
      if (!cancelled && categoriesRevision.current === revision) {
        setCategories(Array.isArray(rows) ? rows : [])
      }
    }).catch(() => {
      if (!cancelled && categoriesRevision.current === revision) {
        setCategories([])
      }
    })
    return () => { cancelled = true }
  }, [open, fetchCategories])

  useEffect(() => {
    if (!open) return undefined
    const revision = ++requestRevision.current
    setLoading(true)
    setError('')
    const loader = fetchInspirations || defaultFetchInspirations
    loader({
      tab,
      q: searchQuery,
      category: category === 'all' ? '' : category,
    }).then((result) => {
      if (requestRevision.current !== revision) return
      setItems(result.items || [])
      setPhase(result.phase || 'ready')
      setLoading(false)
    }).catch((caught) => {
      if (requestRevision.current !== revision) return
      setItems([])
      setError(caught instanceof Error ? caught.message : String(caught))
      setLoading(false)
    })
    return undefined
  }, [open, tab, category, searchQuery, fetchInspirations])

  const pills = useMemo(() => {
    const cloudTab = tab === 'all' || tab === 'public'
    if (!cloudTab) return [{ id: 'all', label: tt('inspirationPicker.pill.all') }]
    return [
      { id: 'all', label: tt('inspirationPicker.pill.all') },
      ...categories.map((row) => ({ id: row.id, label: row.label })),
    ]
  }, [tab, categories, tt])

  const max = maxSelect === undefined || maxSelect === null ? Infinity : Number(maxSelect)
  const quota = remainingQuota({ occupied, selectedCount: selected.size, max })

  const confirm = async () => {
    if (busy) return
    const picked = Array.from(selectedItems.values()).filter(
      (row) => selected.has(row.id) && !isAlreadyAdded(alreadyIds || [], row.id),
    )
    const currentQuota = remainingQuota({ occupied, selectedCount: 0, max })
    if (picked.length === 0 || currentQuota.remaining === 0) return
    const accepted = picked.slice(0, currentQuota.remaining)
    const ownerRevision = openRevision.current
    setBusy(true)
    try {
      await onConfirm(accepted)
      if (closeOnConfirm && open && openRevision.current === ownerRevision) onClose()
    } catch (caught) {
      if (openRevision.current === ownerRevision) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      if (openRevision.current === ownerRevision) setBusy(false)
    }
  }

  const emptyText = phase === 'need-login'
    ? tt('inspirationPicker.needLogin')
    : (searchQuery.trim() ? tt('inspirationPicker.emptySearch') : tt('inspirationPicker.empty'))

  const metaText = Number.isFinite(max)
    ? interpolate(tt('inspirationPicker.selectedMeta'), { n: selected.size, m: quota.remaining })
    : interpolate(tt('inspirationPicker.selectedMetaUnbounded') || '已选 {n} 项', { n: selected.size })

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={tt('inspirationPicker.title')}
      size="lg"
      className={pickerDialogClassName('inspiration')}
      closeLabel={tt('inspirationPicker.cancel')}
      footer={
        <PickerFooter
          className="omx-inspiration-pick__footer"
          metaClassName="omx-inspiration-pick__meta"
          actionsClassName="omx-inspiration-pick__actions"
          meta={metaText}
          cancelLabel={tt('inspirationPicker.cancel')}
          confirmLabel={tt('inspirationPicker.confirm')}
          onCancel={onClose}
          onConfirm={() => { void confirm() }}
          confirmDisabled={busy || selected.size === 0}
          busy={busy}
        />
      }
    >
      <div className="omx-inspiration-pick">
        <ModalCloseButton onClose={onClose} placement="external" ariaLabel={tt('inspirationPicker.cancel')} />
        <PickerHeaderTabs
          tabs={INSPIRATION_TABS.map((row) => ({ id: row.id, label: tt(row.labelKey) }))}
          activeTab={tab}
          onTabChange={(id) => {
            setTab(id)
            setCategory('all')
          }}
          ariaLabel={tt('inspirationPicker.categories')}
          className="omx-inspiration-pick__tabs"
          tabClassName="omx-inspiration-pick__tab"
          headerClassName="omx-inspiration-pick__header"
        />
        <PickerToolbar className="omx-inspiration-pick__toolbar">
          <PickerFilterPills
            pills={pills}
            activePill={category}
            onPillChange={setCategory}
            className="omx-inspiration-pick__filter-pills"
            pillClassName="omx-inspiration-pick__pill"
          />
          <PickerSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={tt('inspirationPicker.searchPlaceholder')}
            className="omx-inspiration-pick__search-wrap"
            inputClassName="omx-inspiration-pick__search-input"
            iconClassName="omx-inspiration-pick__search-icon"
            clearClassName="omx-inspiration-pick__search-clear"
          />
        </PickerToolbar>
        {error ? <div className="omx-inspiration-pick__error">{error}</div> : null}
        <div className="omx-inspiration-pick__scroll">
          {loading ? (
            <PickerEmpty loading loadingText={tt('inspirationPicker.loading')} className="omx-inspiration-pick__empty" />
          ) : items.length === 0 ? (
            <PickerEmpty
              emptyText={emptyText}
              action={emptyAction}
              className="omx-inspiration-pick__empty"
            />
          ) : (
            <div className="omx-inspiration-pick__grid">
              {items.map((item) => {
                const already = isAlreadyAdded(alreadyIds || [], item.id)
                const isSelected = selected.has(item.id)
                const disableNew =
                  !isSelected &&
                  !already &&
                  remainingQuota({ occupied, selectedCount: selected.size, max }).remaining === 0
                return (
                  <InspirationPickerCard
                    key={item.id}
                    item={item}
                    selected={isSelected}
                    alreadyAdded={already}
                    disabled={disableNew}
                    typeLabel={item.is_local ? tt('inspirationPicker.type.local') : tt('inspirationPicker.type.cloud')}
                    alreadyLabel={tt('inspirationPicker.alreadyAdded')}
                    onToggle={(row) => {
                      const next = toggleSelect({
                        selected,
                        id: row.id,
                        occupied,
                        alreadyIds,
                        max,
                      })
                      setSelected(next.selected)
                      setSelectedItems((prev) => {
                        const nextMap = new Map(prev)
                        if (next.selected.has(row.id)) {
                          nextMap.set(row.id, row)
                        } else {
                          nextMap.delete(row.id)
                        }
                        return nextMap
                      })
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </ModalDialog>
  )
}
