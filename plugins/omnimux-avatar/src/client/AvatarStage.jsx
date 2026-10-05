// 虚拟形象工作台一级页：左栏结构化设定，右栏灵感库 / 历史画廊。
//
// 数据全部来自插件 HTTP 面与中枢模型目录：界面不编造积分、不编造进度，
// 生成中的状态只由任务记录本身驱动（useSheetSubmit / FeedGrid / TaskCard）。
//
// 骨架契约（docs/contracts/first-level-page-layout.md §二·补）：
// 根节点是整页唯一滚动容器（omx-stage-scroll 落在根节点上），
// 页头吸附到顶（omx-stage-sticky 落在页头行上），
// 两个契约类分别落在两个节点上，绝不同时出现在一个 className 里。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { deleteTask, fetchPresets, fetchTaxonomy, syncLibrary } from './api.js'
import { AvatarList } from './components/AvatarList.jsx'
import { BuilderPanel } from './components/BuilderPanel.jsx'
import { ExplorePresetGrid } from './components/ExplorePresetGrid.jsx'
import { FeedGrid, taskIdentity } from './components/FeedGrid.jsx'
import { GenerateBar } from './components/GenerateBar.jsx'
import { ModelPicker } from './components/ModelPicker.jsx'
import { MultiViewDialog } from './components/MultiViewDialog.jsx'
import { PresetPreviewDialog } from './components/PresetPreviewDialog.jsx'
import { SourceTabs } from './components/SourceTabs.jsx'
import { ViewModeToggle } from './components/ViewModeToggle.jsx'
import { useAvatars } from './hooks/use-avatars.js'
import { useBuilder } from './hooks/use-builder.js'
import { useMultiViewSubmit } from './hooks/use-multiview.js'
import { useInfluencerHistory, useSheetSubmit } from './hooks/use-tasks.js'
import { fetchModelCatalog, groupsOfModel, imageModels, pickAutoGroup } from './lib/catalog.js'
import { parseTaskMeta } from './lib/history.js'
import { taskKey, partitionTasks } from './lib/multiview.js'
import { resolvePresetSelection, setPresetSnapshot, usablePresets } from './lib/presets.js'
import { readSource, writeSource } from './lib/source.js'
import { conflictMessage, totalSelected, visOpts } from './lib/taxonomy.js'
import { readViewMode, writeViewMode } from './lib/view-mode.js'
import { createT } from './locales.js'
import { injectAvatarStyles } from './styles.js'

injectAvatarStyles()

/** 设定板的提交尺寸（与源工作台一致）。 */
const SHEET_SIZE = '9:16'

/** 右栏自成滚动区的高度上限：页头与页边距之外都留给画廊。 */
const GALLERY_MAX_HEIGHT = 'calc(100vh - 150px)'

/** 轻提示停留时长（毫秒）。 */
const TOAST_MS = 3200

/**
 * 种子串转数字：空串或非数字交给服务端取默认值，不塞一个假数字进去。
 * @param {unknown} raw
 * @returns {number|undefined}
 */
function seedValue(raw) {
  const parsed = Number.parseInt(String(raw ?? '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * 自动渠道的提交值：pickAutoGroup 给的是渠道 id，下发给服务端的是该渠道的 wireGroup，
 * 两者在中枢可能不同（例如 id `standard` → wireGroup `default`）；查不到就用空串。
 * @param {import('./lib/types.js').ModelCatalogRow[]} rows
 * @param {string} modelId
 * @returns {string}
 */
function wireGroupOf(rows, modelId) {
  const groups = groupsOfModel(rows, modelId)
  const id = pickAutoGroup(groups)
  if (!id) return ''
  const hit = groups.find((group) => group.id === id)
  return hit?.wireGroup || ''
}

/** @param {unknown} error @returns {string} */
function readError(error) {
  if (!error) return ''
  return error instanceof Error ? error.message : String(error)
}

/**
 * 页面内联轻提示：一个 role="status" 区域 + 定时消失，不引入任何提示库。
 * @returns {{ toasts: { id: number, text: string, tone: string }[], push: (text: string, tone?: string) => void }}
 */
function useToasts() {
  const [toasts, setToasts] = useState([])
  const seqRef = useRef(0)
  const timersRef = useRef(new Set())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (text, tone) => {
      if (!text) return
      seqRef.current += 1
      const id = seqRef.current
      setToasts((prev) => [...prev, { id, text, tone: tone ?? 'success' }])
      const timer = setTimeout(() => {
        timersRef.current.delete(timer)
        dismiss(id)
      }, TOAST_MS)
      timersRef.current.add(timer)
    },
    [dismiss]
  )

  // 卸载时清掉所有计时器，避免已卸载组件再被 setState。
  useEffect(
    () => () => {
      for (const timer of timersRef.current) clearTimeout(timer)
      timersRef.current.clear()
    },
    []
  )

  return { toasts, push }
}

/**
 * @param {{
 *   t?: (key: string, vars?: Record<string, unknown>) => string,
 *   locale?: unknown,
 *   visible?: boolean,
 *   stage?: object,
 *   store?: object,
 * }} props
 */
export function AvatarStage(props) {
  const { visible = true } = props
  const seatT = props.t
  const fallbackT = useMemo(() => createT(props.locale ?? 'zh'), [props.locale])
  // 宿主语言座尚未合并本插件词典时，绑定出来的翻译器会把键原样返回（页面标题会显示成 `nav`）。
  // 本插件自带中英词典，因此先用一个已知键探测宿主翻译器是否真的生效：生效就用它（跟随语言切换），
  // 不生效就回落到自带词典——不把「宿主未就绪」渲染成用户可见的键名。
  const t = useMemo(() => {
    if (typeof seatT !== 'function') return fallbackT
    try {
      if (seatT('nav') !== 'nav') return seatT
    } catch {
      /* 宿主翻译器抛错时同样回落到自带词典 */
    }
    return fallbackT
  }, [seatT, fallbackT])

  const [taxonomy, setTaxonomy] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [presetSnapshot, setPresetSnapshotState] = useState(null)
  const [source, setSource] = useState(() => readSource())
  const [viewMode, setViewMode] = useState(() => readViewMode())
  const [previewPreset, setPreviewPreset] = useState(null)
  const [openMultiView, setOpenMultiView] = useState(null)
  const [everOpened, setEverOpened] = useState(visible === true)
  // 归档补偿：已补偿成功的任务键，以及正在补偿的任务键（同一时刻只跑一个）。
  const [syncedKeys, setSyncedKeys] = useState(() => new Set())
  const [syncingKey, setSyncingKey] = useState('')

  const { toasts, push } = useToasts()
  const builderRef = useRef(null)
  const autoPickedRef = useRef(false)

  const builder = useBuilder(taxonomy)
  const b = builder.state
  const avatarsApi = useAvatars()
  const { avatars, currentId } = avatarsApi
  const history = useInfluencerHistory({ avatarId: currentId })
  const sheet = useSheetSubmit({ avatarId: currentId })
  const multiViewApi = useMultiViewSubmit({ avatarId: currentId })

  // 页面一旦打开过就一直留在树上，之后只切 display 与 aria-hidden：
  // 卸载会丢掉左栏设定与画廊滚动位置，也让轮询白白重启。
  useEffect(() => {
    if (visible) setEverOpened(true)
  }, [visible])

  // ── 数据集 / 预设快照 / 模型目录 ────────────────────────────────────────
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const payload = await fetchTaxonomy()
        if (alive) setTaxonomy(payload.taxonomy)
      } catch (error) {
        if (alive) push(readError(error), 'error')
      }
    })()
    return () => {
      alive = false
    }
  }, [push])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const data = await fetchPresets()
        // 必须注入快照，否则 usablePresets() 永远是空的。
        setPresetSnapshot(data)
        if (alive) setPresetSnapshotState(data)
      } catch (error) {
        if (alive) push(readError(error), 'error')
      }
    })()
    return () => {
      alive = false
    }
  }, [push])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const data = await fetchModelCatalog()
        if (alive) setCatalog(data)
      } catch (error) {
        if (alive) push(readError(error), 'error')
      }
    })()
    return () => {
      alive = false
    }
  }, [push])

  // 目录落地后只自动选一次模型与渠道；此后用户手改品牌/模型/渠道都不再被覆盖。
  useEffect(() => {
    if (autoPickedRef.current || !catalog) return
    const rows = imageModels(catalog)
    if (!rows.length) return
    const preferredId = catalog?.defaults?.image
    const row = (preferredId && rows.find((item) => item.id === preferredId)) || rows[0]
    if (!row) return
    autoPickedRef.current = true
    builder.setModel(row.id)
    builder.setGroup(wireGroupOf(rows, row.id))
  }, [builder, catalog])

  // ── 派生数据 ───────────────────────────────────────────────────────────
  const presets = useMemo(
    () => usablePresets(taxonomy),
    // presetSnapshot 参与依赖：快照注入后要重算一次可用预设。
    [taxonomy, presetSnapshot]
  )

  const { roots, childByParent } = useMemo(
    () => partitionTasks(history.items),
    [history.items]
  )

  // 历史里已挂载的派生行 + 本次会话刚提交还在轮询的派生行。
  const mergedChildren = useMemo(() => {
    const merged = new Map(childByParent)
    for (const [parentId, record] of Object.entries(multiViewApi.childByParent ?? {})) {
      merged.set(parentId, record)
    }
    return merged
  }, [childByParent, multiViewApi.childByParent])

  // ── 归档补偿后的显示状态 ───────────────────────────────────────────────
  // 服务端任务记录上的 syncError 要等下一次读取才会更新；界面以本次补偿的应答
  // 为最新事实，先把这一行的「未入库」状态收起来。
  const withoutSyncError = useCallback(
    (task) => {
      if (!task || !task.syncError) return task
      const key = taskIdentity(task)
      return key && syncedKeys.has(key) ? { ...task, syncError: null } : task
    },
    [syncedKeys]
  )

  const displayRoots = useMemo(() => roots.map(withoutSyncError), [roots, withoutSyncError])
  const displayPending = withoutSyncError(sheet.pending)

  // 本次会话提交的行：首次看到就可能已经是 ready，因此它们算一次「转 ready」。
  const sessionChildren = useMemo(
    () => Object.values(multiViewApi.childByParent ?? {}),
    [multiViewApi.childByParent]
  )

  const conflict = conflictMessage(b.tier, b.selection)
  const hasInput = totalSelected(b.selection) > 0 || b.brief.trim() !== ''
  const canGenerate = Boolean(currentId) && Boolean(b.model) && !conflict && hasInput

  // ── 提交失败要看得见 ───────────────────────────────────────────────────
  const sheetError = readError(sheet.error)
  useEffect(() => {
    if (sheetError) push(sheetError, 'error')
  }, [push, sheetError])

  const avatarsError = readError(avatarsApi.error)
  useEffect(() => {
    if (avatarsError) push(avatarsError, 'error')
  }, [avatarsError, push])

  // ── 生成转 ready 且归档成功时给一次轻提示 ───────────────────────────────
  // 只认本次会话观察到的「转 ready」：历史里早已就绪的记录不该在打开页面时重放提示；
  // 本次会话提交的行首次看到就可能已经是 ready，因此它们算一次转移。
  const observedStatusRef = useRef(new Map())
  const savedToastRef = useRef(new Set())

  useEffect(() => {
    const sessionKeys = new Set(sessionChildren.map((task) => taskIdentity(task)).filter(Boolean))
    if (sheet.pending) {
      const pendingKey = taskIdentity(sheet.pending)
      if (pendingKey) sessionKeys.add(pendingKey)
    }

    for (const task of [sheet.pending, ...sessionChildren, ...history.items]) {
      const key = taskIdentity(task)
      if (!key) continue
      const status = String(task.status ?? '').toLowerCase()
      const seenBefore = observedStatusRef.current.has(key)
      const previous = observedStatusRef.current.get(key)
      observedStatusRef.current.set(key, status)
      // 归档失败的行不走轻提示：卡片上会如实显示未入库并给出补偿入口。
      if (status !== 'ready' || task.syncError) continue
      if (savedToastRef.current.has(key)) continue
      if (seenBefore ? previous === 'ready' : !sessionKeys.has(key)) continue
      savedToastRef.current.add(key)
      push(t('toast.savedToLibrary'), 'success')
    }
  }, [history.items, push, sessionChildren, sheet.pending, t])

  // ── 交互 ───────────────────────────────────────────────────────────────
  const onSourceChange = useCallback((next) => {
    setSource(next)
    writeSource(next)
  }, [])

  const onViewModeChange = useCallback((next) => {
    setViewMode(next)
    writeViewMode(next)
  }, [])

  const onTier = useCallback(
    (next) => {
      const dropped = builder.switchTier(next)
      if (Array.isArray(dropped) && dropped.length) {
        push(t('toast.tierDropped', { n: dropped.length }), 'warning')
      }
    },
    [builder, push, t]
  )

  const onPick = useCallback(
    (categoryId, optionId) => {
      const message = builder.pick(categoryId, optionId)
      if (message) push(t(message), 'error')
    },
    [builder, push, t]
  )

  const onRandomize = useCallback(() => {
    builder.randomize()
  }, [builder])

  const onGenerate = useCallback(async () => {
    const hit = conflictMessage(b.tier, b.selection)
    if (hit) {
      push(t(hit), 'error')
      return
    }
    if (!currentId || !b.model) return
    const record = await sheet.submit({
      avatarId: currentId,
      model: b.model,
      group: b.group,
      tier: b.tier,
      selection: b.selection,
      brief: b.brief,
      seed: seedValue(b.seed),
      size: SHEET_SIZE,
      image_url: b.imageUrl,
    })
    if (!record) return
    onSourceChange('history')
    push(t('status.generating'), 'success')
  }, [b, currentId, onSourceChange, push, sheet, t])

  const applyPreset = useCallback(
    (preset) => {
      const resolved = resolvePresetSelection(preset, taxonomy)
      if (!resolved) {
        push(t('preset.updating'), 'error')
        return
      }
      // 档位、选项、brief、seed 一起换，避免只套用一半而造出与卡片不同的形象。
      builder.applySheet({
        tier: preset.tier,
        selection: resolved,
        brief: preset.brief,
        seed: preset.seed,
      })
      setPreviewPreset(null)
      push(t('toast.presetApplied'), 'success')
      builderRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    },
    [builder, push, t, taxonomy]
  )

  /** 点开一条历史记录：把它的设定参数填回左栏，没有参数就如实说明。 */
  const onView = useCallback(
    (task) => {
      const meta = parseTaskMeta(task)
      if (!meta) {
        push(t('toast.noSheetParams'), 'warning')
        return
      }
      builder.applySheet(meta)
      push(t('toast.formFilled'), 'success')
    },
    [builder, push, t]
  )

  /** 失败卡片重试：按记录里存的同一套参数再提交一次。 */
  const onRetry = useCallback(
    async (task) => {
      const meta = parseTaskMeta(task)
      if (!meta || !currentId) {
        push(t('toast.noSheetParams'), 'warning')
        return
      }
      const record = await sheet.submit({
        avatarId: currentId,
        model: meta.model || b.model,
        group: meta.group || b.group,
        tier: meta.tier,
        selection: meta.selection,
        brief: meta.brief,
        seed: seedValue(meta.seed),
        size: meta.size || SHEET_SIZE,
        image_url: meta.image_url,
      })
      if (record) {
        onSourceChange('history')
        push(t('status.generating'), 'success')
      }
    },
    [b.group, b.model, currentId, onSourceChange, push, sheet, t]
  )

  const onOpenMultiView = useCallback((parent, child) => {
    setOpenMultiView({ parent, child })
  }, [])

  /** 归档补偿：把已产出但没入库的图重新存一次，成功后收起该行的未入库状态。 */
  const onSync = useCallback(
    async (task) => {
      if (!currentId || syncingKey) return
      const key = taskIdentity(task)
      if (!key) return
      setSyncingKey(key)
      try {
        await syncLibrary({
          avatarId: currentId,
          kind: task?.kind === 'multiview' ? 'multiview' : 'sheet',
        })
      } catch (error) {
        push(readError(error), 'error')
        return
      } finally {
        setSyncingKey('')
      }
      setSyncedKeys((prev) => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
      push(t('toast.savedToLibrary'), 'success')
    },
    [currentId, push, syncingKey, t]
  )

  const onRegenerateMultiView = useCallback(async () => {
    if (!openMultiView?.parent || !currentId) return
    const meta = parseTaskMeta(openMultiView.parent)
    const record = await multiViewApi.submit({
      avatarId: currentId,
      parentTaskId: taskKey(openMultiView.parent),
      model: meta?.model || b.model,
      group: meta?.group || b.group,
    })
    if (record) {
      setOpenMultiView((prev) => (prev ? { ...prev, child: record } : prev))
    }
  }, [b.group, b.model, currentId, multiViewApi, openMultiView])

  // 第一次多视角：卡片上还没有派生任务，必须由这里发起，否则用户永远开不出第一份多视角。
  const onGenerateMultiView = useCallback(
    async (parent) => {
      if (!parent || !currentId) return
      const meta = parseTaskMeta(parent)
      const record = await multiViewApi.submit({
        avatarId: currentId,
        parentTaskId: taskKey(parent),
        model: meta?.model || b.model,
        group: meta?.group || b.group,
      })
      // 提交后立刻打开弹窗：进度与结果都落在同一处，不需要用户再找一遍入口。
      if (record) setOpenMultiView({ parent, child: record })
    },
    [b.group, b.model, currentId, multiViewApi]
  )

  const onDeleteMultiView = useCallback(async () => {
    if (!openMultiView?.child || !currentId) return
    const parentId = openMultiView.parent ? taskKey(openMultiView.parent) : ''
    try {
      await deleteTask({ avatarId: currentId, taskId: taskKey(openMultiView.child) })
    } catch (error) {
      push(readError(error), 'error')
      return
    }
    if (parentId) multiViewApi.forget(parentId)
    setOpenMultiView(null)
    push(t('toast.removed'), 'success')
  }, [currentId, multiViewApi, openMultiView, push, t])

  const regeneratingMultiView = Boolean(
    openMultiView?.parent && multiViewApi.submittingParent === taskKey(openMultiView.parent)
  )

  if (!everOpened) return null

  return (
    <div
      className="omx-avatar-page omx-stage-scroll"
      data-visible={visible ? 'true' : 'false'}
      aria-hidden={visible ? undefined : 'true'}
    >
      <div className="omx-avatar-head omx-stage-sticky">
        <span className="omx-avatar-head-title">{t('nav')}</span>
      </div>

      <div className="omnimux-avatar-body">
        {/* 左栏：形象行 → 设定面板 → 生成栏 */}
        <section className="omx-avatar-pane" ref={builderRef}>
          <AvatarList
            avatars={avatars}
            currentId={currentId}
            createAvatar={avatarsApi.createAvatar}
            selectAvatar={avatarsApi.selectAvatar}
            t={t}
          />
          <BuilderPanel
            taxonomy={taxonomy}
            tier={b.tier}
            selection={b.selection}
            openGroups={b.openGroups}
            visOpts={visOpts}
            onTier={onTier}
            onPick={onPick}
            onToggleGroup={builder.toggleGroup}
            t={t}
          />
          <GenerateBar
            quote={null} /* 中枢目录不提供按渠道的积分报价，宁可留空也不编数字 */
            canGenerate={canGenerate}
            submitting={sheet.submitting}
            onGenerate={onGenerate}
            onRandomize={onRandomize}
            t={t}
          />
        </section>

        {/* 右栏：模型/渠道与数据源工具行 + 独立滚动的画廊区 */}
        <section
          className="omx-avatar-pane"
          style={{ maxHeight: GALLERY_MAX_HEIGHT }} /* exempt-ui02: 右栏自成滚动区的高度上限 */
        >
          <div className="omx-avatar-pane-head">
            <ModelPicker
              catalog={catalog}
              vendorId={b.vendorId}
              model={b.model}
              group={b.group}
              onVendor={builder.setVendorId}
              onModel={builder.setModel}
              onGroup={builder.setGroup}
              t={t}
            />
            <div className="omx-avatar-pane-tools">
              <SourceTabs value={source} onChange={onSourceChange} t={t} />
              {source === 'history' ? (
                <ViewModeToggle value={viewMode} onChange={onViewModeChange} t={t} />
              ) : null}
            </div>
          </div>

          <div
            className="omx-avatar-pane-body"
            style={{ overflowY: 'auto', minHeight: 0 }} /* exempt-ui02: 画廊区独立滚动 */
          >
            {source === 'explore' ? (
              <ExplorePresetGrid
                presets={presets}
                onPreview={setPreviewPreset}
                onApply={applyPreset}
                t={t}
              />
            ) : (
              <FeedGrid
                tasks={displayRoots}
                pending={displayPending}
                viewMode={viewMode}
                childByParent={mergedChildren}
                isInitialLoading={history.isInitialLoading}
                hasMore={history.hasMore}
                isFetchingMore={history.isFetchingMore}
                loadMoreFailed={history.loadMoreFailed}
                onLoadMore={history.loadMore}
                onView={onView}
                onRetry={onRetry}
                onSync={onSync}
                syncingKey={syncingKey}
                onOpenMultiView={onOpenMultiView}
                onGenerateMultiView={onGenerateMultiView}
                t={t}
              />
            )}
          </div>
        </section>
      </div>

      {/* 覆盖层：预设预览与多视角设定板 */}
      <PresetPreviewDialog
        preset={previewPreset}
        taxonomy={taxonomy}
        onClose={() => setPreviewPreset(null)}
        onApply={applyPreset}
        t={t}
      />

      <MultiViewDialog
        open={Boolean(openMultiView)}
        onOpenChange={(open) => {
          if (!open) setOpenMultiView(null)
        }}
        task={openMultiView?.child ?? null}
        regenerating={regeneratingMultiView}
        onRegenerate={onRegenerateMultiView}
        onDelete={onDeleteMultiView}
        t={t}
      />

      <div className="omx-avatar-toasts" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={
              item.tone === 'error'
                ? 'omx-avatar-toast omx-avatar-toast--error'
                : item.tone === 'warning'
                  ? 'omx-avatar-toast omx-avatar-toast--warning'
                  : 'omx-avatar-toast omx-avatar-toast--success'
            }
          >
            {item.text}
          </div>
        ))}
      </div>
    </div>
  )
}
