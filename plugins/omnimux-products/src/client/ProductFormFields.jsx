/**
 * 两种产品形态共用的表单构件。
 *
 * 实物表单与数字表单不是两套状态机，而是同一份 state/setters/actions 上的两套
 * 渲染取舍：本文件只提供可复用的字段块，形态差异（哪些块出现、什么顺序）留给
 * `PhysicalProductForm.jsx` 与 `DigitalProductForm.jsx` 各自表达。
 *
 * 因此这里没有形态切换控件，也没有「按 kind 分支渲染」的上帝组件 —— 形态在进入
 * 二级页时就已经定了，表单内部不再有第二种可能。
 */
import { useState } from 'react'
import { Button, InputField } from 'dsh-ui-kit'
import { importFromLink, isHttpUrl } from './api.js'
import { LinkIcon } from './icons.jsx'
import { TextareaField } from './ProductFormSections.jsx'
import { CoverDropzone, MediaList } from './ProductMediaSection.jsx'
import { ScreenshotPreview } from './ScreenshotPreview.jsx'
import { StrategyFields } from './ProductStrategyFields.jsx'

/**
 * 名称行：@ 前缀 + 必填名称输入。名称是两种形态唯一的共同必填项。
 * @param {{
 *   t: (key: string) => string,
 *   state: Record<string, any>,
 *   setters: Record<string, Function>,
 *   busy?: boolean,
 *   nameRef?: any,
 * }} props
 */
export function ProductNameRow(props) {
  const { t, state, setters, busy = false, nameRef } = props
  const handleNameChange = (event) => { setters.setName(event.target.value) }

  return (
    <div className="omnimux-products-name-row">
      <span className="omnimux-products-at" aria-hidden="true">@</span>
      <InputField
        ref={nameRef}
        className="omnimux-products-name-field"
        value={state.name}
        placeholder={t('add.namePlaceholder')}
        aria-label={t('detail.name')}
        disabled={busy}
        onChange={handleNameChange}
      />
    </div>
  )
}

/**
 * 基础信息字段块：卖点 / 受众 / 品牌，外加实物专属的产品特性。
 * 数字产品不渲染特性输入（六维品牌战略已经覆盖了它的表达面）。
 *
 * @param {{
 *   t: (key: string) => string,
 *   values: Record<string, any>,
 *   onChange: Record<string, Function>,
 *   busy?: boolean,
 *   kind?: 'physical' | 'digital',
 * }} props
 */
export function ProductCoreFields(props) {
  const { t, values, onChange, busy = false, kind = 'physical' } = props
  const handleSelling = (e) => { onChange.setSelling(e.target.value) }
  const handleAudience = (e) => { onChange.setAudience(e.target.value) }
  const handleBrand = (e) => { onChange.setBrand(e.target.value) }
  const handleFeatures = (e) => { onChange.setFeatures(e.target.value) }

  return (
    <>
      <TextareaField
        className="omnimux-products-span2"
        label={t(kind === 'digital' ? 'detail.positioning' : 'detail.selling')}
        value={values.selling}
        placeholder={t('add.sellingPlaceholder')}
        disabled={busy}
        onChange={handleSelling}
      />
      <InputField
        label={t('detail.audience')}
        value={values.audience}
        placeholder={t('add.audiencePlaceholder')}
        disabled={busy}
        onChange={handleAudience}
      />
      <InputField
        label={t('detail.brand')}
        value={values.brand}
        placeholder={t('add.brandPlaceholder')}
        disabled={busy}
        onChange={handleBrand}
      />
      {kind === 'physical' ? (
        <TextareaField
          className="omnimux-products-span2"
          label={t('detail.features')}
          value={values.features}
          placeholder={t('add.featuresPlaceholder')}
          disabled={busy}
          onChange={handleFeatures}
        />
      ) : null}
    </>
  )
}

/**
 * 商业化字段块：价格 / SKU / 促销 / 商品落地页链接。只有实物产品会渲染它。
 * @param {{
 *   t: (key: string) => string,
 *   values: Record<string, any>,
 *   onChange: Record<string, Function>,
 *   busy?: boolean,
 * }} props
 */
export function ProductCommerceFields(props) {
  const { t, values, onChange, busy = false } = props
  const handlePrice = (e) => { onChange.setPrice(e.target.value) }
  const handleSku = (e) => { onChange.setSku(e.target.value) }
  const handlePromotion = (e) => { onChange.setPromotion(e.target.value) }
  const handleLink = (e) => { onChange.setLink(e.target.value) }

  return (
    <>
      <InputField
        label={t('detail.price')}
        value={values.price}
        placeholder={t('add.pricePlaceholder')}
        disabled={busy}
        onChange={handlePrice}
      />
      <InputField
        label={t('detail.sku')}
        value={values.sku}
        placeholder={t('add.skuPlaceholder')}
        disabled={busy}
        onChange={handleSku}
      />
      <InputField
        label={t('detail.promotion')}
        value={values.promotion}
        placeholder={t('add.promotionPlaceholder')}
        disabled={busy}
        onChange={handlePromotion}
      />
      <InputField
        className="omnimux-products-span2"
        label={t('detail.link')}
        value={values.link}
        placeholder={t('add.linkPlaceholder')}
        disabled={busy}
        onChange={handleLink}
      />
    </>
  )
}

/**
 * Minimal link bar: paste a landing page, press Enter, fields fill in.
 * Failures stay inline and never block manual entry. `kind` rides along so the
 * server can take the physical route (product images, no browser) or the
 * digital one (two viewports, brand strategy).
 *
 * @param {{ t: (key: string) => string, kind: 'physical' | 'digital', onImported: (data: object) => void }} props
 */
export function UrlImportBar(props) {
  const { t, kind, onImported } = props
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState('idle')
  const [message, setMessage] = useState('')

  const submit = async () => {
    if (phase === 'loading') return
    const value = url.trim()
    if (!isHttpUrl(value)) {
      setPhase('error')
      setMessage(t('add.urlImport.invalidUrl'))
      return
    }
    setPhase('loading')
    setMessage(t('add.urlImport.loading'))
    try {
      const result = await importFromLink(value, kind)
      const data = result.ok ? result.body?.data : null
      if (!data || typeof data !== 'object') {
        setPhase('error')
        setMessage(t(result.body?.error === 'link-import-empty' ? 'add.urlImport.empty' : 'add.urlImport.failed'))
        return
      }
      onImported(data)
      setPhase('success')
      // The import itself succeeded; only the model step was unavailable, so the
      // strategy modules may be thin. Say which of the two happened.
      setMessage(t(data.analysis?.mode === 'heuristic' ? 'add.urlImport.degraded' : 'add.urlImport.success'))
    } catch {
      setPhase('error')
      setMessage(t('add.urlImport.failed'))
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
    }
  }

  const handleChange = (event) => {
    setUrl(event.target.value)
    if (phase === 'idle') return
    setPhase('idle')
    setMessage('')
  }

  return (
    <div className="omnimux-products-url-import-group">
      <div className="omnimux-products-url-import-row">
        <InputField
          className="omnimux-products-url-import-field"
          prefix={<LinkIcon size={14} />}
          type="url"
          value={url}
          placeholder={t(kind === 'digital' ? 'add.urlImport.placeholderDigital' : 'add.urlImport.placeholderPhysical')}
          aria-label={t('add.urlImport.placeholder')}
          disabled={phase === 'loading'}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <Button
          variant="secondary"
          loading={phase === 'loading'}
          disabled={url.trim() === ''}
          onClick={() => { void submit() }}
        >
          {t('add.urlImport.button')}
        </Button>
      </div>
      {message === '' ? null : (
        <p className={`omnimux-products-url-import-status omnimux-products-url-import-status-${phase}`} role="status">
          {message}
        </p>
      )}
    </div>
  )
}

/** 素材区：拖拽/选择入口 + 已选素材列表。分类标签是独立分区，不在这里重复渲染。 */
export function MediaSection(props) {
  const { t, state, actions, mediaActions, onPick, previewOf } = props

  return (
    <>
      <CoverDropzone
        t={t}
        onAddPaths={actions.handleAddPaths}
        onPick={onPick}
      />

      {state.media.length > 0 ? (
        <MediaList
          t={t}
          media={state.media}
          coverId={state.coverId}
          previewOf={previewOf}
          actions={mediaActions}
        />
      ) : null}
    </>
  )
}

/** 双端首屏截图卡片群。只有数字产品会渲染它。 */
export function ShotsSection(props) {
  const { t, state, actions, previewOf, busy = false } = props
  return (
    <ScreenshotPreview
      t={t}
      media={state.media}
      coverId={state.coverId}
      srcOf={previewOf}
      disabled={busy}
      onSetCover={actions.handleSetCover}
    />
  )
}

function StrategyPanelHead(props) {
  const { t, strategyOpen, onToggle } = props
  const toggleLabel = strategyOpen ? t('strategy.collapse') : t('strategy.expand')
  return (
    <div className="omnimux-products-strategy-head">
      <div>
        <div className="omnimux-products-strategy-title">{t('strategy.title')}</div>
        <div className="omnimux-products-strategy-hint">{t('strategy.hintDigital')}</div>
      </div>
      <Button
        variant="outline"
        size="xs"
        onClick={onToggle}
      >
        {toggleLabel}
      </Button>
    </div>
  )
}

/**
 * 六维品牌战略面板。只有数字产品会渲染它。
 * @param {{
 *   t: (key: string) => string,
 *   strategyOpen: boolean,
 *   strategy: object,
 *   handlers: { patchStrategy: Function, onCollapse: Function, onExpand: Function },
 * }} props
 */
export function DigitalStrategyPanel(props) {
  const { t, strategyOpen, strategy, handlers } = props
  const { patchStrategy, onCollapse, onExpand } = handlers
  const onToggle = strategyOpen ? onCollapse : onExpand

  return (
    <div className="omnimux-products-strategy">
      <StrategyPanelHead
        t={t}
        strategyOpen={strategyOpen}
        onToggle={onToggle}
      />
      {strategyOpen ? (
        <StrategyFields
          t={t}
          strategy={strategy}
          patchStrategy={patchStrategy}
        />
      ) : null}
    </div>
  )
}

/**
 * 把 hook 的 setters/actions 折成各字段块要的回调形状。
 * @param {Record<string, Function>} setters
 * @param {Record<string, Function>} actions
 */
export function assembleFormHandlers(setters, actions) {
  return {
    strategyHandlers: {
      patchStrategy: actions.patchStrategy,
      onCollapse: () => setters.setStrategyOpen(false),
      onExpand: actions.openStrategy,
    },
    mediaActions: {
      onSetCover: actions.handleSetCover,
      onRemove: actions.handleRemoveMedia,
    },
    categoryActions: {
      onDraftChange: (event) => setters.setTagDraft(event.target.value),
      onAddTag: actions.handleAddTag,
      onRemoveTag: actions.handleRemoveTag,
    },
  }
}
