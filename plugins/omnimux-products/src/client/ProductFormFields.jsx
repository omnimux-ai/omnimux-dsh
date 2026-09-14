import { useState } from 'react'
import { Button, InputField } from 'dsh-ui-kit'
import { importFromLink, isHttpUrl } from './api.js'
import { LinkIcon } from './icons.jsx'
import { FormSection, TextareaField } from './ProductFormSections.jsx'
import { CategoriesEditor, CoverDropzone, MediaList } from './ProductMediaSection.jsx'
import { ScreenshotPreview } from './ScreenshotPreview.jsx'
import { StrategyFields } from './ProductStrategyFields.jsx'

export function KindSwitcher(props) {
  const { t, kind, disabled, onSelectPhysical, onSelectDigital } = props
  return (
    <div className="omnimux-products-kind-row">
      <span className="omnimux-products-kind-label">{t('kind.label')}</span>
      <Button
        variant="ghost"
        size="sm"
        className="omnimux-products-kind-chip"
        aria-pressed={kind === 'physical'}
        disabled={disabled}
        onClick={onSelectPhysical}
      >
        {t('kind.physical')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="omnimux-products-kind-chip"
        aria-pressed={kind === 'digital'}
        disabled={disabled}
        onClick={onSelectDigital}
      >
        {t('kind.digital')}
      </Button>
    </div>
  )
}

function ProductCoreFields(props) {
  const { t, values, onChange, busy } = props
  const handleSelling = (e) => { onChange.setSelling(e.target.value) }
  const handleAudience = (e) => { onChange.setAudience(e.target.value) }
  const handleBrand = (e) => { onChange.setBrand(e.target.value) }
  const handleFeatures = (e) => { onChange.setFeatures(e.target.value) }

  return (
    <>
      <TextareaField
        className="omnimux-products-span2"
        label={t('detail.selling')}
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
      <TextareaField
        className="omnimux-products-span2"
        label={t('detail.features')}
        value={values.features}
        placeholder={t('add.featuresPlaceholder')}
        disabled={busy}
        onChange={handleFeatures}
      />
    </>
  )
}

function ProductCommerceFields(props) {
  const { t, values, onChange, busy } = props
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

export function PhysicalFields(props) {
  const { t, values, onChange, busy } = props
  return (
    <div className="omnimux-products-grid-fields">
      <ProductCoreFields
        t={t}
        values={values}
        onChange={onChange}
        busy={busy}
      />
      <ProductCommerceFields
        t={t}
        values={values}
        onChange={onChange}
        busy={busy}
      />
    </div>
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

function FormHeaderSection(props) {
  const { t, state, setters, actions, busy, nameRef } = props
  const handleNameChange = (event) => { setters.setName(event.target.value) }

  return (
    <>
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
      <KindSwitcher
        t={t}
        kind={state.kind}
        disabled={busy}
        onSelectPhysical={actions.handleSelectPhysical}
        onSelectDigital={actions.handleSelectDigital}
      />
    </>
  )
}

/**
 * 商业化设置：实体商品是价格 / SKU / 促销 / 落地页链接；数字产品只有官网地址
 * （价格与库存维度对数字产品无意义，库层也不写这三个键）。
 */
function TradeSection(props) {
  const { t, state, setters, busy } = props
  const handleLinkChange = (event) => { setters.setLink(event.target.value) }

  if (state.kind === 'physical') {
    return (
      <div className="omnimux-products-grid-fields">
        <ProductCommerceFields
          t={t}
          values={state}
          onChange={setters}
          busy={busy}
        />
      </div>
    )
  }

  return (
    <InputField
      label={t('detail.link')}
      value={state.link}
      placeholder={t('add.digitalLinkPlaceholder')}
      disabled={busy}
      onChange={handleLinkChange}
    />
  )
}

/** 素材区：拖拽/选择入口 + 已选素材列表。分类标签是独立分区，不在这里重复渲染。 */
function MediaSection(props) {
  const { t, state, actions, onPick, previewOf } = props

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
          actions={props.mediaActions}
        />
      ) : null}
    </>
  )
}

function ShotsSection(props) {
  const { t, state, actions, previewOf, busy } = props
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

/**
 * Minimal link bar: paste a landing page, press Enter, fields fill in.
 * Failures stay inline and never block manual entry.
 * @param {{ t: (key: string) => string, kind: string, onImported: (data: object) => void }} props
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
          placeholder={t('add.urlImport.placeholder')}
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

/**
 * 表单主体。双栏排布：左栏是「解析 → 基础信息 → 商业化 → 品牌战略」，
 * 右栏是「双端首屏截图 → 分类标签 → 素材列表」。窄容器由样式层折叠成单栏，
 * 两栏常驻 React 树、不重挂载，因此拖窄窗口不会丢输入。
 *
 * @param {{
 *   t: (key: string) => string,
 *   state: Record<string, any>,
 *   setters: Record<string, Function>,
 *   actions: Record<string, Function>,
 *   busy?: boolean,
 *   error?: string,
 *   onPick: (kind: 'file' | 'directory') => Promise<string[]>,
 *   previewOf?: (file: object) => string,
 *   nameRef?: any,
 * }} props
 */
export function ProductFormBody(props) {
  const { t, state, setters, actions, busy = false, error = '', onPick, previewOf, nameRef } = props
  const { strategyHandlers, mediaActions, categoryActions } = assembleFormHandlers(setters, actions)

  return (
    <div className="omnimux-products-form">
      {error ? (
        <p className="omnimux-products-error">{error}</p>
      ) : null}

      <div className="omnimux-products-form-columns">
        <div className="omnimux-products-form-col-left">
          <FormSection
            title={t('section.import')}
            description={t('section.importHint')}
          >
            <UrlImportBar
              t={t}
              kind={state.kind}
              onImported={actions.applyImportedData}
            />
          </FormSection>

          <FormSection title={t('section.basic')}>
            <FormHeaderSection
              t={t}
              state={state}
              setters={setters}
              actions={actions}
              busy={busy}
              nameRef={nameRef}
            />
            <ProductCoreFields
              t={t}
              values={state}
              onChange={setters}
              busy={busy}
            />
          </FormSection>

          <FormSection title={t('section.trade')}>
            <TradeSection
              t={t}
              state={state}
              setters={setters}
              busy={busy}
            />
          </FormSection>

          {state.kind === 'digital' ? (
            <DigitalStrategyPanel
              t={t}
              strategyOpen={state.strategyOpen}
              strategy={state.strategy}
              handlers={strategyHandlers}
            />
          ) : null}
        </div>

        <div className="omnimux-products-form-col-right">
          <FormSection
            title={t('section.shots')}
            description={t('section.shotsHint')}
          >
            <ShotsSection
              t={t}
              state={state}
              actions={actions}
              previewOf={previewOf}
              busy={busy}
            />
          </FormSection>

          <FormSection title={t('section.classification')}>
            <CategoriesEditor
              t={t}
              categories={state.categories}
              tagDraft={state.tagDraft}
              disabled={busy}
              actions={categoryActions}
            />
          </FormSection>

          <FormSection title={t('section.media')}>
            <MediaSection
              t={t}
              state={state}
              actions={actions}
              mediaActions={mediaActions}
              onPick={onPick}
              previewOf={previewOf}
            />
          </FormSection>
        </div>
      </div>
    </div>
  )
}
