import { Button, DropdownSelect, IconButton, InputField } from 'dsh-ui-kit'

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

export const STRATEGY_SECTIONS = [
  {
    titleKey: 'strategy.basic',
    grid: true,
    fields: [
      { path: 'brand_basic_info.company.name', placeholderKey: 'strategy.companyName', type: 'input' },
      { path: 'brand_basic_info.company.website', placeholderKey: 'strategy.companyWebsite', type: 'input' },
      { path: 'brand_basic_info.company.locale', placeholderKey: 'strategy.companyLocale', type: 'input' },
      { path: 'brand_basic_info.product.name', placeholderKey: 'strategy.productName', type: 'input' },
      { path: 'brand_basic_info.product.category', placeholderKey: 'strategy.productCategory', type: 'input', span: 2 },
    ],
  },
  {
    titleKey: 'strategy.tone',
    hintKey: 'strategy.listHint',
    fields: [
      { path: 'tone_and_voice.dos', placeholderKey: 'strategy.dos', type: 'list', rows: 3 },
      { path: 'tone_and_voice.donts', placeholderKey: 'strategy.donts', type: 'list', rows: 3 },
    ],
  },
  {
    titleKey: 'strategy.identity',
    fields: [
      { path: 'identity_and_product.core_identity', placeholderKey: 'strategy.coreIdentity', type: 'textarea', rows: 2 },
      { type: 'hint', hintKey: 'strategy.listHint' },
      { path: 'identity_and_product.product_offering', placeholderKey: 'strategy.offering', type: 'list', rows: 2 },
      { path: 'identity_and_product.unique_advantage', placeholderKey: 'strategy.advantage', type: 'list', rows: 2 },
      { path: 'identity_and_product.problems_solved', placeholderKey: 'strategy.problems', type: 'list', rows: 2 },
      { path: 'identity_and_product.solutions', placeholderKey: 'strategy.solutions', type: 'list', rows: 2 },
    ],
  },
  {
    titleKey: 'strategy.mission',
    fields: [
      { path: 'mission_and_positioning.mission', placeholderKey: 'strategy.missionText', type: 'textarea', rows: 2 },
      { type: 'hint', hintKey: 'strategy.listHint' },
      { path: 'mission_and_positioning.differentiation', placeholderKey: 'strategy.diff', type: 'list', rows: 2 },
      { path: 'mission_and_positioning.ownable_space.statement', placeholderKey: 'strategy.ownableStatement', type: 'input' },
      { path: 'mission_and_positioning.ownable_space.category', placeholderKey: 'strategy.ownableCategory', type: 'input' },
      { path: 'mission_and_positioning.ownable_space.is_not', placeholderKey: 'strategy.ownableNot', type: 'list', rows: 2 },
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

export function StrategyField(props) {
  const { t, field, strategy, patchStrategy } = props
  if (field.type === 'hint') {
    return <p className="omnimux-products-label">{t(field.hintKey)}</p>
  }
  const value = getPath(strategy, field.path)
  const placeholder = t(field.placeholderKey)
  const onTextChange = (event) => {
    patchStrategy((next) => { setPath(next, field.path, event.target.value) })
  }
  const onListChange = (event) => {
    patchStrategy((next) => { setPath(next, field.path, listOf(event.target.value)) })
  }

  if (field.type === 'list') {
    return (
      <textarea
        className="omnimux-products-textarea"
        rows={field.rows || 2}
        value={linesOf(value)}
        placeholder={placeholder}
        onChange={onListChange}
      />
    )
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        className="omnimux-products-textarea"
        rows={field.rows || 2}
        value={value}
        placeholder={placeholder}
        onChange={onTextChange}
      />
    )
  }

  return (
    <InputField
      className={field.span === 2 ? 'omnimux-products-span2' : undefined}
      value={value}
      placeholder={placeholder}
      onChange={onTextChange}
    />
  )
}

export function StrategySection(props) {
  const { t, section, strategy, patchStrategy } = props
  const hintNode = section.hintKey ? <p className="omnimux-products-label">{t(section.hintKey)}</p> : null
  const fieldList = section.fields.map((field, idx) => (
    <StrategyField
      key={field.path || ('field-' + idx)}
      t={t}
      field={field}
      strategy={strategy}
      patchStrategy={patchStrategy}
    />
  ))

  const body = (
    <>
      {hintNode}
      {fieldList}
    </>
  )

  return (
    <section className="omnimux-products-section">
      <div className="omnimux-products-section-title">{t(section.titleKey)}</div>
      {section.grid ? <div className="omnimux-products-grid-fields">{body}</div> : body}
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
    <div className="omnimux-products-section">
      <div className="omnimux-products-angle-row">
        <InputField
          value={angle.title}
          placeholder={t('strategy.angleTitle')}
          onChange={onTitleChange}
        />
        <DropdownSelect
          value={String(angle.priority || 3)}
          options={PRIORITY_OPTIONS}
          aria-label={t('strategy.angleTitle')}
          onChange={onPriorityChange}
        />
        <IconButton
          variant="ghost"
          size="xs"
          aria-label={t('remove.confirm')}
          onClick={onRemove}
        >
          × {/* exempt-ui04: 历史存量待迁移为矢量SVG */}
        </IconButton>
      </div>
      <textarea
        className="omnimux-products-textarea"
        rows={2}
        value={angle.description}
        placeholder={t('strategy.angleDesc')}
        onChange={onDescChange}
      />
      <InputField
        value={angle.target_audience}
        placeholder={t('strategy.angleAudience')}
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
      {angles.map((angle, index) => (
        <AngleRow
          key={angle.id || ('new-' + index)}
          t={t}
          angle={angle}
          index={index}
          patchStrategy={patchStrategy}
        />
      ))}
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
        × {/* exempt-ui04: 历史存量待迁移为矢量SVG */}
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
        × {/* exempt-ui04: 历史存量待迁移为矢量SVG */}
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
