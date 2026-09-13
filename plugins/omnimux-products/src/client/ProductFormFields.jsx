import { useState } from 'react'
import { Button, InputField } from 'dsh-ui-kit'
import { importFromLink, isHttpUrl } from './api.js'
import { LinkIcon } from './icons.jsx'
import { StrategyFields } from './ProductStrategyFields.jsx'
import { CategoriesEditor, CoverDropzone, MediaList } from './ProductMediaSection.jsx'

export function KindSwitcher(props) {
  const { t, kind, onSelectPhysical, onSelectDigital } = props
  return (
    <div className="omnimux-products-kind-row">
      <span className="omnimux-products-kind-label">{t('kind.label')}</span>
      <Button
        variant="ghost"
        size="sm"
        className="omnimux-products-kind-chip"
        aria-pressed={kind === 'physical'}
        onClick={onSelectPhysical}
      >
        {t('kind.physical')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="omnimux-products-kind-chip"
        aria-pressed={kind === 'digital'}
        onClick={onSelectDigital}
      >
        {t('kind.digital')}
      </Button>
    </div>
  )
}

export function DirtyBanner(props) {
  const { t, onReload } = props
  const handleReload = () => { onReload?.() }
  return (
    <div className="omnimux-products-dirty">
      <span className="omnimux-products-dirty-text">{t('add.dirty.banner')}</span>
      <Button
        variant="outline"
        size="xs"
        onClick={handleReload}
      >
        {t('add.dirty.reload')}
      </Button>
      <span className="omnimux-products-label">{t('add.dirty.keep')}</span>
    </div>
  )
}

function FormTextarea(props) {
  const { value, placeholder, onChange } = props
  return (
    <textarea
      className="omnimux-products-textarea omnimux-products-span2"
      rows={2}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
    />
  )
}

function ProductCoreFields(props) {
  const { t, values, onChange } = props
  const handleSelling = (e) => { onChange.setSelling(e.target.value) }
  const handleAudience = (e) => { onChange.setAudience(e.target.value) }
  const handleBrand = (e) => { onChange.setBrand(e.target.value) }
  const handleFeatures = (e) => { onChange.setFeatures(e.target.value) }

  return (
    <>
      <FormTextarea
        value={values.selling}
        placeholder={t('add.sellingPlaceholder')}
        onChange={handleSelling}
      />
      <InputField
        value={values.audience}
        placeholder={t('add.audiencePlaceholder')}
        onChange={handleAudience}
      />
      <InputField
        value={values.brand}
        placeholder={t('add.brandPlaceholder')}
        onChange={handleBrand}
      />
      <FormTextarea
        value={values.features}
        placeholder={t('add.featuresPlaceholder')}
        onChange={handleFeatures}
      />
    </>
  )
}

function ProductCommerceFields(props) {
  const { t, values, onChange } = props
  const handlePrice = (e) => { onChange.setPrice(e.target.value) }
  const handleSku = (e) => { onChange.setSku(e.target.value) }
  const handlePromotion = (e) => { onChange.setPromotion(e.target.value) }
  const handleLink = (e) => { onChange.setLink(e.target.value) }

  return (
    <>
      <InputField
        value={values.price}
        placeholder={t('add.pricePlaceholder')}
        onChange={handlePrice}
      />
      <InputField
        value={values.sku}
        placeholder={t('add.skuPlaceholder')}
        onChange={handleSku}
      />
      <InputField
        value={values.promotion}
        placeholder={t('add.promotionPlaceholder')}
        onChange={handlePromotion}
      />
      <InputField
        value={values.link}
        placeholder={t('add.linkPlaceholder')}
        onChange={handleLink}
      />
    </>
  )
}

export function PhysicalFields(props) {
  const { t, values, onChange } = props
  return (
    <div className="omnimux-products-grid-fields">
      <ProductCoreFields
        t={t}
        values={values}
        onChange={onChange}
      />
      <ProductCommerceFields
        t={t}
        values={values}
        onChange={onChange}
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
  const { t, state, setters, actions, dirty, busy, onReload, nameRef } = props
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
          disabled={busy}
          onChange={handleNameChange}
        />
      </div>
      {dirty ? (
        <DirtyBanner
          t={t}
          onReload={onReload}
        />
      ) : null}
      <KindSwitcher
        t={t}
        kind={state.kind}
        onSelectPhysical={actions.handleSelectPhysical}
        onSelectDigital={actions.handleSelectDigital}
      />
    </>
  )
}

function ProductFieldsSection(props) {
  const { t, state, setters } = props
  const handleLinkChange = (event) => { setters.setLink(event.target.value) }

  if (state.kind === 'physical') {
    return (
      <PhysicalFields
        t={t}
        values={state}
        onChange={setters}
      />
    )
  }

  return (
    <InputField
      value={state.link}
      placeholder={t('add.digitalLinkPlaceholder')}
      onChange={handleLinkChange}
    />
  )
}

function MediaAndCategoriesSection(props) {
  const { t, state, actions, mediaActions, categoryActions, onPick } = props

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
          actions={mediaActions}
        />
      ) : null}

      <CategoriesEditor
        t={t}
        categories={state.categories}
        tagDraft={state.tagDraft}
        actions={categoryActions}
      />
    </>
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
      setMessage(t('add.urlImport.success'))
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

export function ProductFormBody(props) {
  const { t, state, setters, actions, dirty, busy, error, onReload, onPick, nameRef } = props
  const { strategyHandlers, mediaActions, categoryActions } = assembleFormHandlers(setters, actions)
  const headerProps = { t, state, setters, actions, dirty, busy, onReload, nameRef }
  const fieldProps = { t, state, setters }
  const mediaSectionProps = { t, state, actions, mediaActions, categoryActions, onPick }

  return (
    <div className="omnimux-products-form">
      <UrlImportBar
        t={t}
        kind={state.kind}
        onImported={actions.applyImportedData}
      />

      <FormHeaderSection {...headerProps} />

      <ProductFieldsSection {...fieldProps} />

      {state.kind === 'digital' ? (
        <DigitalStrategyPanel
          t={t}
          strategyOpen={state.strategyOpen}
          strategy={state.strategy}
          handlers={strategyHandlers}
        />
      ) : null}

      <MediaAndCategoriesSection {...mediaSectionProps} />

      {error ? (
        <p className="omnimux-products-error">{error}</p>
      ) : null}
    </div>
  )
}
