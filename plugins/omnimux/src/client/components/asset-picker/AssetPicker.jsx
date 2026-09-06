import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ModalDialog } from 'dsh-ui-kit'
import { AssetPickerCard } from './AssetPickerCard.jsx'
import { ASSET_CATEGORIES, isAlreadyAdded, remainingQuota, toggleSelect } from './picker-model.js'

const STYLE_ID = 'omx-composer-add-asset-picker'

const CSS = `
.omx-asset-pick { display:flex; min-height:420px; max-height:70vh; }
.omx-asset-pick__nav {
  width: 148px; flex:none; display:flex; flex-direction:column; gap:4px;
  padding: 8px 8px 8px 0; border-right:1px solid var(--dsw-alias-border-l2);
  overflow:auto;
}
.omx-asset-pick__tab {
  appearance:none; font:inherit; text-align:left; cursor:pointer;
  height:32px; border:none; border-radius:8px; padding:0 10px;
  background:transparent; color:var(--dsw-alias-label-secondary);
}
.omx-asset-pick__tab[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-primary);
}
.omx-asset-pick__main { flex:1; min-width:0; overflow:auto; padding: 0 0 0 12px; }
.omx-asset-pick__grid {
  display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;
}
.omx-asset-pick__empty {
  border:1px dashed var(--dsw-alias-border-l4); border-radius:12px; min-height:160px;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
  color:var(--dsw-alias-label-tertiary); font-size:13px;
}
.omx-asset-pick-card {
  border:1px solid var(--dsw-alias-border-l2); border-radius:12px; overflow:hidden; cursor:pointer;
  background: var(--dsw-alias-bg-base, var(--dsw-bg)); display:flex; flex-direction:column;
}
.omx-asset-pick-card[data-selected="true"] { border-color: var(--dsw-alias-label-primary); }
.omx-asset-pick-card[aria-disabled="true"] { cursor:default; opacity:0.72; }
.omx-asset-pick-card__thumb {
  height:112px; background:var(--dsw-alias-bg-module-platform); position:relative;
  display:flex; align-items:center; justify-content:center; color:var(--dsw-alias-label-tertiary);
}
.omx-asset-pick-card__check {
  position:absolute; top:8px; left:8px; width:22px; height:22px; border-radius:50%;
  display:inline-flex; align-items:center; justify-content:center;
  border:1px solid var(--dsw-alias-border-l3); background:var(--dsw-alias-bg-base, var(--dsw-bg));
}
.omx-asset-pick-card__check[data-selected="true"] {
  border:none; background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground);
}
.omx-asset-pick-card__badge {
  position:absolute; top:8px; right:8px; font-size:11px; line-height:16px; padding:2px 8px;
  border-radius:999px; background:var(--dsw-alias-bg-base, var(--dsw-bg));
  border:1px solid var(--dsw-alias-border-l2);
}
.omx-asset-pick-card__missing, .omx-asset-pick-card__already {
  position:absolute; bottom:8px; left:8px; font-size:11px; color:var(--dsw-alias-state-warn-primary);
}
.omx-asset-pick-card__body { padding:10px 12px 12px; display:flex; flex-direction:column; gap:4px; min-height:72px; }
.omx-asset-pick-card__title { font-size:14px; font-weight:500; line-height:20px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.omx-asset-pick-card__desc { font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.omx-asset-pick__footer { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; }
.omx-asset-pick__meta { font-size:12px; color:var(--dsw-alias-label-secondary); }
.omx-asset-pick__error { color:var(--dsw-alias-state-error-primary); font-size:12px; margin:0 0 8px; }
`

function ensureStyles(doc = (typeof document !== 'undefined' ? document : null)) {
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

/** 内置 zh-CN 兜底文案（调用方通常注入宿主 t） */
const DEFAULT_STRINGS = {
  'composerAdd.fromLibrary': '从资产库添加',
  'composerAdd.cancel': '取消',
  'composerAdd.confirm': '确认添加',
  'composerAdd.categories': '资产分类',
  'composerAdd.cat.all': '全部',
  'composerAdd.cat.character': '角色',
  'composerAdd.cat.scene': '场景',
  'composerAdd.cat.style': '风格包',
  'composerAdd.cat.prop': '道具',
  'composerAdd.cat.knowledge': '知识包',
  'composerAdd.cat.custom': '自定义',
  'composerAdd.selectedMeta': '已选 {n} 项 · 还可添加 {m} 项',
  'composerAdd.selectedMetaUnbounded': '已选 {n} 项',
  'composerAdd.loading': '正在加载资产库…',
  'composerAdd.empty': '资产库还是空的。先去导入素材，再回到这里添加。',
  'composerAdd.alreadyAdded': '已在会话中',
  'composerAdd.missing': '素材缺失',
}

function defaultT(key, vars) {
  return interpolate(DEFAULT_STRINGS[key] || key, vars)
}

async function defaultFetchAssets() {
  const response = await fetch('/omnimux/assets/library')
  let json = {}
  try { json = await response.json() } catch { json = {} }
  if (!response.ok) throw new Error(json.message || json.error || `HTTP ${response.status}`)
  return Array.isArray(json.assets) ? json.assets : []
}

/**
 * 纯受控资产多选选择器（共享组件）：不负责确认后去向，不持 hub 内部依赖。
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   t?: (key: string, vars?: object) => string,
 *   title?: string,
 *   fetchAssets?: () => Promise<object[]>,
 *   categories?: string[],
 *   maxSelect?: number,
 *   occupied?: number,
 *   alreadyIds?: Set<string> | string[],
 *   onConfirm: (assets: object[]) => void | Promise<void>,
 *   closeOnConfirm?: boolean,
 *   emptyAction?: { label: string, onClick: () => void },
 * }} props
 */
export function AssetPicker({
  open,
  onClose,
  t,
  title,
  fetchAssets,
  categories,
  maxSelect,
  occupied = 0,
  alreadyIds,
  onConfirm,
  closeOnConfirm = true,
  emptyAction,
}) {
  const tt = typeof t === 'function' ? t : defaultT
  const [category, setCategory] = useState('all')
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const requestRevision = useRef(0)
  const openRevision = useRef(0)
  const previousOpen = useRef(open)
  if (previousOpen.current !== open) {
    previousOpen.current = open
    openRevision.current += 1
  }

  useEffect(() => { ensureStyles() }, [])
  useEffect(() => {
    if (!open) {
      requestRevision.current += 1
      setBusy(false)
      return undefined
    }
    const revision = requestRevision.current + 1
    requestRevision.current = revision
    setCategory('all')
    setSelected(new Set())
    setError('')
    setLoading(true)
    Promise.resolve()
      .then(() => (fetchAssets || defaultFetchAssets)())
      .then((rows) => {
        if (requestRevision.current === revision) setAssets(Array.isArray(rows) ? rows : [])
      })
      .catch((caught) => {
        if (requestRevision.current === revision) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      })
      .finally(() => {
        if (requestRevision.current === revision) setLoading(false)
      })
    return () => {
      if (requestRevision.current === revision) requestRevision.current += 1
    }
  }, [open, fetchAssets])

  const visible = useMemo(() => {
    if (category === 'all') return assets
    return assets.filter((row) => row && row.type === category)
  }, [assets, category])

  const max = maxSelect === undefined || maxSelect === null ? Infinity : Number(maxSelect)
  const quota = remainingQuota({ occupied, selectedCount: selected.size, max })
  const tabs = ['all', ...(Array.isArray(categories) && categories.length > 0 ? categories : ASSET_CATEGORIES)]

  const confirm = async () => {
    if (busy) return
    const selectedIds = new Set(selected)
    const picked = assets.filter((row) => selectedIds.has(row.id) && !isAlreadyAdded(alreadyIds || [], row.id))
    const currentQuota = remainingQuota({ occupied, selectedCount: 0, max })
    if (picked.length === 0 || currentQuota.remaining === 0) return
    const accepted = picked.slice(0, currentQuota.remaining)
    if (accepted.length === 0) return
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

  const metaKey = Number.isFinite(max) ? 'composerAdd.selectedMeta' : 'composerAdd.selectedMetaUnbounded'

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={title || tt('composerAdd.fromLibrary')}
      size="lg"
      closeLabel={tt('composerAdd.cancel')}
      footer={(
        <div className="omx-asset-pick__footer">
          <span className="omx-asset-pick__meta">
            {interpolate(tt(metaKey), { n: selected.size, m: quota.remaining })}
          </span>
          <span>
            <Button variant="outline" onClick={onClose} disabled={busy}>{tt('composerAdd.cancel')}</Button>
            {' '}
            <Button variant="primary" onClick={() => { void confirm() }} disabled={busy || selected.size === 0}>
              {tt('composerAdd.confirm')}
            </Button>
          </span>
        </div>
      )}
    >
      <div className="omx-asset-pick">
        <nav className="omx-asset-pick__nav" aria-label={tt('composerAdd.categories')}>
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              className="omx-asset-pick__tab"
              data-active={category === id ? 'true' : 'false'}
              onClick={() => { setCategory(id) }}
            >
              {tt(id === 'all' ? 'composerAdd.cat.all' : `composerAdd.cat.${id}`)}
            </button>
          ))}
        </nav>
        <div className="omx-asset-pick__main">
          {error ? <p className="omx-asset-pick__error">{error}</p> : null}
          {loading ? <p className="omx-asset-pick__meta">{tt('composerAdd.loading')}</p> : null}
          {!loading && !error && visible.length === 0 ? (
            <div className="omx-asset-pick__empty">
              <p>{tt('composerAdd.empty')}</p>
              {emptyAction ? (
                <Button variant="primary" size="sm" onClick={emptyAction.onClick}>{emptyAction.label}</Button>
              ) : null}
            </div>
          ) : null}
          {!loading && visible.length > 0 ? (
            <div className="omx-asset-pick__grid">
              {visible.map((asset) => {
                const already = isAlreadyAdded(alreadyIds || [], asset.id)
                const isSelected = selected.has(asset.id)
                const disableNew = !isSelected && !already
                  && remainingQuota({ occupied, selectedCount: selected.size, max }).remaining === 0
                return (
                  <AssetPickerCard
                    key={asset.id}
                    asset={asset}
                    selected={isSelected}
                    alreadyAdded={already}
                    disabled={disableNew}
                    typeLabel={tt(`composerAdd.cat.${asset.type || 'custom'}`)}
                    alreadyLabel={tt('composerAdd.alreadyAdded')}
                    missingLabel={tt('composerAdd.missing')}
                    onToggle={(row) => {
                      const next = toggleSelect({
                        selected,
                        id: row.id,
                        occupied,
                        alreadyIds,
                        max,
                      })
                      setSelected(next.selected)
                    }}
                  />
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </ModalDialog>
  )
}
