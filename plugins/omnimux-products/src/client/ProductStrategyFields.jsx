import { useId } from 'react'
import { Button, DropdownSelect, IconButton, InputField } from 'dsh-ui-kit'
import { CloseIcon } from './icons.jsx'

/**
 * @param {unknown} list
 */
function linesOf(list) {
  return Array.isArray(list) ? list.join('\n') : ''
}

/**
 * @param {string} text
 */
function listOf(text) {
  return String(text).split('\n').map((row) => row.trim()).filter(Boolean)
}

function getPath(obj, path) {
  if (!obj || !path) return ''
  const parts = path.split('.')
  let cur = obj
  for (const part of parts) {
    if (cur == null) return ''
    cur = cur[part]
  }
  return cur ?? ''
}

function setPath(obj, path, value) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!cur[part]) cur[part] = {}
    cur = cur[part]
  }
  cur[parts[parts.length - 1]] = value
}

/**
 * The six strategy modules. Every field carries a `labelKey` for its persistent
 * label; `subLabelKey` adds the inline "one per line" hint beside the name, and
 * `placeholderKey` survives only where it states a *format* the label cannot.
 * There is no hint-only field variant: every entry owns a `path` and a control.
 */
export const STRATEGY_SECTIONS = [
  {
    titleKey: 'strategy.basic',
    grid: true,
    fields: [
      { path: 'brand_basic_info.company.name', labelKey: 'strategy.companyName', type: 'input' },
      {
        path: 'brand_basic_info.company.website',
        labelKey: 'strategy.companyWebsite',
        type: 'input',
        placeholderKey: 'strategy.websitePlaceholder',
      },
      {
        path: 'brand_basic_info.company.locale',
        labelKey: 'strategy.companyLocale',
        type: 'input',
        placeholderKey: 'strategy.localePlaceholder',
      },
      { path: 'brand_basic_info.product.name', labelKey: 'strategy.productName', type: 'input' },
      { path: 'brand_basic_info.product.category', labelKey: 'strategy.productCategory', type: 'input', span: 2 },
    ],
  },
  {
    titleKey: 'strategy.tone',
    fields: [
      {
        path: 'tone_and_voice.dos',
        labelKey: 'strategy.dos',
        subLabelKey: 'strategy.listHint',
        type: 'list',
        rows: 3,
      },
      {
        path: 'tone_and_voice.donts',
        labelKey: 'strategy.donts',
        subLabelKey: 'strategy.listHint',
        type: 'list',
        rows: 3,
      },
    ],
  },
  {
    titleKey: 'strategy.identity',
    fields: [
      { path: 'identity_and_product.core_identity', labelKey: 'strategy.coreIdentity', type: 'textarea', rows: 2 },
      {
        path: 'identity_and_product.product_offering',
        labelKey: 'strategy.offering',
        subLabelKey: 'strategy.listHint',
        type: 'list',
        rows: 2,
      },
      {
        path: 'identity_and_product.unique_advantage',
        labelKey: 'strategy.advantage',
        subLabelKey: 'strategy.listHint',
        type: 'list',
        rows: 2,
      },
      {
        path: 'identity_and_product.solutions',
        labelKey: 'strategy.solutions',
        subLabelKey: 'strategy.listHint',
        type: 'list',
        rows: 2,
      },
    ],
  },
  {
    titleKey: 'strategy.mission',
    fields: [
      { path: 'mission_and_positioning.mission', labelKey: 'strategy.missionText', type: 'textarea', rows: 2 },
      {
        path: 'mission_and_positioning.differentiation',
        labelKey: 'strategy.diff',
        subLabelKey: 'strategy.listHint',
        type: 'list',
        rows: 2,
      },
      {
        path: 'mission_and_positioning.ownable_space.statement',
        labelKey: 'strategy.ownableStatement',
        type: 'input',
      },
    ],
  },
]

const PRIORITY_OPTIONS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
]

/** `角度 01` — zero-padded from the current position, so a removal reshuffles it. */
function angleIndexText(t, index) {
  return `${t('strategy.angleIndex')} ${String(index + 1).padStart(2, '0')}`
}

/**
 * The persistent label every strategy control wears: a 12px name plus an
 * optional inline sub-label (`产品供给 · 每行一项`). Metrics mirror the kit's
 * own field label, so both control families read identically.
 *
 * @param {{ label: string, subLabel?: string }} props
 */
export function StrategyFieldLabel(props) {
  const { label, subLabel } = props
  return (
    <span className="omnimux-products-field-label" data-testid="strategy-field-label">
      <span className="omnimux-products-field-label-text">{label}</span>
      {subLabel
        ? <span className="omnimux-products-field-tag" data-testid="strategy-field-sublabel">{subLabel}</span>
        : null}
    </span>
  )
}

/**
 * The kit ships no textarea, so the plugin draws one and binds it to a real
 * `<label htmlFor>` — a `<div>` label would not focus the control.
 *
 * @param {{
 *   label: string,
 *   subLabel?: string,
 *   rows: number,
 *   value: string,
 *   placeholder?: string,
 *   onChange: (event: any) => void,
 * }} props
 */
export function LabeledTextarea(props) {
  const { label, subLabel, rows, value, placeholder, onChange } = props
  const controlId = useId()

  return (
    <div className="omnimux-products-field-control">
      <label htmlFor={controlId}>
        <StrategyFieldLabel label={label} subLabel={subLabel} />
      </label>
      <textarea
        id={controlId}
        className="omnimux-products-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
      />
    </div>
  )
}

export function StrategyField(props) {
  const { t, field, strategy, patchStrategy } = props
  const value = getPath(strategy, field.path)
  const label = t(field.labelKey)
  const subLabel = field.subLabelKey ? t(field.subLabelKey) : undefined
  const placeholder = field.placeholderKey ? t(field.placeholderKey) : undefined
  const onTextChange = (event) => {
    patchStrategy((next) => { setPath(next, field.path, event.target.value) })
  }
  const onListChange = (event) => {
    patchStrategy((next) => { setPath(next, field.path, listOf(event.target.value)) })
  }

  const control = field.type === 'input'
    ? (
      <InputField
        label={<StrategyFieldLabel label={label} subLabel={subLabel} />}
        value={value}
        placeholder={placeholder}
        onChange={onTextChange}
      />
    )
    : (
      <LabeledTextarea
        label={label}
        subLabel={subLabel}
        rows={field.rows || 2}
        value={field.type === 'list' ? linesOf(value) : value}
        placeholder={placeholder}
        onChange={field.type === 'list' ? onListChange : onTextChange}
      />
    )

  return (
    <div
      className={field.span === 2 ? 'omnimux-products-field omnimux-products-span2' : 'omnimux-products-field'}
      data-testid="strategy-field"
      data-field-path={field.path}
    >
      {control}
    </div>
  )
}

export function StrategySection(props) {
  const { t, section, strategy, patchStrategy } = props
  const fieldList = section.fields.map((field) => (
    <StrategyField
      key={field.path}
      t={t}
      field={field}
      strategy={strategy}
      patchStrategy={patchStrategy}
    />
  ))

  return (
    <section className="omnimux-products-section">
      <div className="omnimux-products-section-title">{t(section.titleKey)}</div>
      {section.grid ? <div className="omnimux-products-grid-fields">{fieldList}</div> : fieldList}
    </section>
  )
}

export function AngleRow(props) {
  const { t, angle, index, patchStrategy } = props
  const onTitleChange = (event) => {
    patchStrategy((next) => { next.content_angles[index].title = event.target.value })
  }
  const onPriorityChange = (value) => {
    patchStrategy((next) => { next.content_angles[index].priority = Number(value) })
  }
  const onRemove = () => {
    patchStrategy((next) => { next.content_angles.splice(index, 1) })
  }
  const onDescChange = (event) => {
    patchStrategy((next) => { next.content_angles[index].description = event.target.value })
  }
  const onAudienceChange = (event) => {
    patchStrategy((next) => { next.content_angles[index].target_audience = event.target.value })
  }

  return (
    <div
      className="omnimux-products-angle-card"
      data-testid="strategy-angle-card"
      data-angle-index={index}
    >
      <div className="omnimux-products-angle-head">
        <span className="omnimux-products-angle-index" data-testid="strategy-angle-index">
          {angleIndexText(t, index)}
        </span>
        <DropdownSelect
          className="omnimux-products-angle-priority"
          value={String(angle.priority || 3)}
          options={PRIORITY_OPTIONS}
          aria-label={t('strategy.anglePriority')}
          onChange={onPriorityChange}
        />
        <IconButton
          className="omnimux-products-angle-remove"
          variant="ghost"
          size="xs"
          aria-label={t('strategy.removeAngle')}
          data-testid="strategy-angle-remove"
          onClick={onRemove}
        >
          <CloseIcon size={14} />
        </IconButton>
      </div>
      <InputField
        label={<StrategyFieldLabel label={t('strategy.angleTitle')} />}
        value={angle.title}
        onChange={onTitleChange}
      />
      <LabeledTextarea
        label={t('strategy.angleDesc')}
        rows={2}
        value={angle.description}
        onChange={onDescChange}
      />
      <InputField
        label={<StrategyFieldLabel label={t('strategy.angleAudience')} />}
        value={angle.target_audience}
        onChange={onAudienceChange}
      />
    </div>
  )
}

export function AnglesSection(props) {
  const { t, angles, patchStrategy } = props
  const onAddAngle = () => {
    patchStrategy((next) => {
      if (next.content_angles.length >= 10) return
      next.content_angles.push({ id: '', title: '', description: '', target_audience: '', priority: 3 })
    })
  }

  return (
    <section className="omnimux-products-section">
      <div className="omnimux-products-section-head">
        <div className="omnimux-products-section-title">{t('strategy.angles')}</div>
        <Button variant="outline" size="xs" onClick={onAddAngle}>
          {t('strategy.addAngle')}
        </Button>
      </div>
      <div className="omnimux-products-angle-list">
        {angles.map((angle, index) => (
          <AngleRow
            key={angle.id || ('new-' + index)}
            t={t}
            angle={angle}
            index={index}
            patchStrategy={patchStrategy}
          />
        ))}
      </div>
    </section>
  )
}

export function SegmentRow(props) {
  const { t, row, index, patchStrategy } = props
  const onNameChange = (event) => {
    patchStrategy((next) => { next.market_and_competition.customer_segments[index].name = event.target.value })
  }
  const onPercentageChange = (event) => {
    patchStrategy((next) => { next.market_and_competition.customer_segments[index].percentage = Number(event.target.value) })
  }
  const onRemove = () => {
    patchStrategy((next) => { next.market_and_competition.customer_segments.splice(index, 1) })
  }

  return (
    <div className="omnimux-products-seg-row">
      <InputField
        value={row.name}
        placeholder={t('strategy.segmentName')}
        onChange={onNameChange}
      />
      <InputField
        type="number"
        min={0}
        max={100}
        value={row.percentage}
        onChange={onPercentageChange}
      />
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={t('remove.confirm')}
        onClick={onRemove}
      >
        <CloseIcon size={14} />
      </IconButton>
    </div>
  )
}

export function CompetitorRow(props) {
  const { t, row, index, patchStrategy } = props
  const onNameChange = (event) => {
    patchStrategy((next) => { next.market_and_competition.competitors[index].name = event.target.value })
  }
  const onWebsiteChange = (event) => {
    patchStrategy((next) => { next.market_and_competition.competitors[index].website = event.target.value })
  }
  const onRemove = () => {
    patchStrategy((next) => { next.market_and_competition.competitors.splice(index, 1) })
  }

  return (
    <div className="omnimux-products-comp-row">
      <InputField
        value={row.name}
        placeholder={t('strategy.competitorName')}
        onChange={onNameChange}
      />
      <InputField
        value={row.website}
        placeholder={t('strategy.competitorWebsite')}
        onChange={onWebsiteChange}
      />
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={t('remove.confirm')}
        onClick={onRemove}
      >
        <CloseIcon size={14} />
      </IconButton>
    </div>
  )
}

export function MarketSection(props) {
  const { t, market, patchStrategy } = props
  const onAddSegment = () => {
    patchStrategy((next) => {
      if (next.market_and_competition.customer_segments.length >= 10) return
      next.market_and_competition.customer_segments.push({ name: '', percentage: 0 })
    })
  }

  const onAddCompetitor = () => {
    patchStrategy((next) => {
      if (next.market_and_competition.competitors.length >= 10) return
      next.market_and_competition.competitors.push({ name: '', website: '' })
    })
  }

  return (
    <section className="omnimux-products-section">
      <div className="omnimux-products-section-head">
        <div className="omnimux-products-section-title">{t('strategy.market')}</div>
      </div>
      <div className="omnimux-products-section-head">
        <span className="omnimux-products-label">{t('strategy.segments')}</span>
        <Button variant="outline" size="xs" onClick={onAddSegment}>
          {t('strategy.addSegment')}
        </Button>
      </div>
      {market.customer_segments.map((row, index) => (
        <SegmentRow
          key={'seg-' + index}
          t={t}
          row={row}
          index={index}
          patchStrategy={patchStrategy}
        />
      ))}
      <div className="omnimux-products-section-head">
        <span className="omnimux-products-label">{t('strategy.competitors')}</span>
        <Button variant="outline" size="xs" onClick={onAddCompetitor}>
          {t('strategy.addCompetitor')}
        </Button>
      </div>
      {market.competitors.map((row, index) => (
        <CompetitorRow
          key={'comp-' + index}
          t={t}
          row={row}
          index={index}
          patchStrategy={patchStrategy}
        />
      ))}
    </section>
  )
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   strategy: any,
 *   patchStrategy: (fn: (next: any) => void) => void,
 * }} props
 */
export function StrategyFields(props) {
  const { t, strategy, patchStrategy } = props
  const basicSection = STRATEGY_SECTIONS[0]
  const otherSections = STRATEGY_SECTIONS.slice(1)

  return (
    <div className="omnimux-products-form">
      <StrategySection
        t={t}
        section={basicSection}
        strategy={strategy}
        patchStrategy={patchStrategy}
      />
      <AnglesSection
        t={t}
        angles={strategy.content_angles}
        patchStrategy={patchStrategy}
      />
      {otherSections.map((section) => (
        <StrategySection
          key={section.titleKey}
          t={t}
          section={section}
          strategy={strategy}
          patchStrategy={patchStrategy}
        />
      ))}
      <MarketSection
        t={t}
        market={strategy.market_and_competition}
        patchStrategy={patchStrategy}
      />
    </div>
  )
}
