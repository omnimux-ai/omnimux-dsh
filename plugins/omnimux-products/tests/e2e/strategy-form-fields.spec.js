/**
 * End-to-end regression for the strategy form UI polish.
 *
 * Case numbers map 1:1 onto `specs/strategy-form-ui-polish.spec.md` §6.3
 * (C1–C4). These cases drive the real normalize → draft → save chain, because
 * the contract this feature had to preserve is a *data* contract: dropping a
 * field from the render tree may never drop its stored value or break the
 * round trip. The rendered structure itself is covered by the static contracts
 * in `src/client/strategy-form-fields.test.js` and the live-layout evidence
 * from the real-browser verify run.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { normalizeBrandStrategy } from '../../src/brand-strategy.js'
import {
  buildPayload,
  draftFrom,
  importedStrategyOf,
  structuredCloneSafe,
} from '../../src/client/useProductFormState.js'

const here = dirname(fileURLToPath(import.meta.url))
const fieldsSource = readFileSync(
  join(here, '../../src/client/ProductStrategyFields.jsx'),
  'utf8',
)

/** The strategy an import carries, including every legacy key. */
const IMPORTED_STRATEGY = {
  brand_basic_info: {
    company: { name: 'MiniMax', website: 'https://platform.example.com', locale: 'cn' },
    product: { name: 'MiniMax 开放平台', category: 'AI 平台' },
  },
  content_angles: [
    { id: 'cost_01', title: '成本焦虑', description: '按量付费', target_audience: 'AI 应用开发者', priority: 1 },
    { id: 'speed_02', title: '上线速度', description: '一个接口接入多模态', target_audience: '独立开发者', priority: 2 },
    { id: 'trust_03', title: '数据合规', description: '境内合规部署', target_audience: '企业技术负责人', priority: 3 },
  ],
  tone_and_voice: { dos: ['用数据说话'], donts: ['夸大效果'] },
  identity_and_product: {
    core_identity: '一站式多模态模型服务',
    product_offering: ['文本模型 API', '语音合成'],
    unique_advantage: ['超长上下文', '成本更低'],
    problems_solved: ['多模型拼接成本高'],
    solutions: ['让开发者一个接口接入多模态'],
  },
  mission_and_positioning: {
    mission: '让智能触手可及',
    differentiation: ['性价比', '中文优化'],
    ownable_space: { statement: '多模态入口', category: 'AI 平台', is_not: ['通用云'] },
  },
  market_and_competition: {
    customer_segments: [{ name: 'AI 应用开发者', percentage: 60 }],
    competitors: [{ name: 'OpenAI', website: 'https://openai.com' }],
  },
}

const IMPORT_PAYLOAD = { kind: 'digital', brand_strategy: IMPORTED_STRATEGY }

/** The form's own write path: clone, mutate, normalize back for storage. */
function save(strategy) {
  return buildPayload({
    name: 'MiniMax 开放平台',
    kind: 'digital',
    link: 'https://platform.example.com',
    categories: ['AI 平台'],
    media: [],
    coverId: null,
    physical: null,
    digital: { strategy, strategyTouched: true },
  })
}

describe('e2e · strategy form · C1 solutions is the live pain-point field', () => {
  it('an imported digital product keeps its solutions value through the form', () => {
    const imported = importedStrategyOf(IMPORT_PAYLOAD)
    assert.notEqual(imported, null)
    assert.deepEqual(imported.identity_and_product.solutions, ['让开发者一个接口接入多模态'])

    const draft = draftFrom({ brand_strategy: IMPORTED_STRATEGY })
    assert.deepEqual(draft.identity_and_product.solutions, ['让开发者一个接口接入多模态'])

    const body = save(draft)
    assert.deepEqual(body.brand_strategy.identity_and_product.solutions, ['让开发者一个接口接入多模态'])
  })

  it('the renderer wires that value to a labelled field and no longer to a solved-problems box', () => {
    assert.match(fieldsSource, /path: 'identity_and_product\.solutions',\s+labelKey: 'strategy\.solutions'/)
    assert.doesNotMatch(fieldsSource, /identity_and_product\.problems_solved/)
  })
})

describe('e2e · strategy form · C2 stored data for retired fields still loads', () => {
  it('a product holding problems_solved / ownable_space.category / is_not loads and saves unchanged', () => {
    const draft = draftFrom({ brand_strategy: IMPORTED_STRATEGY })

    // The values survive into the draft even though nothing renders them.
    assert.deepEqual(draft.identity_and_product.problems_solved, ['多模型拼接成本高'])
    assert.equal(draft.mission_and_positioning.ownable_space.category, 'AI 平台')
    assert.deepEqual(draft.mission_and_positioning.ownable_space.is_not, ['通用云'])

    // …and the save path writes them straight back, so no stored product loses data.
    const body = save(draft)
    assert.deepEqual(body.brand_strategy.identity_and_product.problems_solved, ['多模型拼接成本高'])
    assert.equal(body.brand_strategy.mission_and_positioning.ownable_space.category, 'AI 平台')
    assert.deepEqual(body.brand_strategy.mission_and_positioning.ownable_space.is_not, ['通用云'])
  })

  it('editing another field leaves the retired values untouched', () => {
    const draft = draftFrom({ brand_strategy: IMPORTED_STRATEGY })
    const next = structuredCloneSafe(draft)
    next.identity_and_product.solutions = ['改过的对策']

    const body = save(next)
    assert.deepEqual(body.brand_strategy.identity_and_product.solutions, ['改过的对策'])
    assert.deepEqual(body.brand_strategy.identity_and_product.problems_solved, ['多模型拼接成本高'])
    assert.equal(body.brand_strategy.mission_and_positioning.ownable_space.category, 'AI 平台')
  })

  it('a strategy whose only content is a retired field still resolves, not throws', () => {
    const legacyOnly = { identity_and_product: { problems_solved: ['只有历史字段'] } }
    const normalized = normalizeBrandStrategy(legacyOnly)
    assert.notEqual(normalized, null)
    assert.deepEqual(normalized.identity_and_product.problems_solved, ['只有历史字段'])
  })
})

describe('e2e · strategy form · C3 the dirty and save contract is unchanged', () => {
  it('an untouched strategy is not written to the payload', () => {
    const draft = draftFrom({ brand_strategy: IMPORTED_STRATEGY })
    const body = buildPayload({
      name: 'MiniMax 开放平台',
      kind: 'digital',
      link: '',
      categories: [],
      media: [],
      coverId: null,
      physical: null,
      digital: { strategy: draft, strategyTouched: false },
    })
    assert.equal('brand_strategy' in body, false)
  })

  it('a touched strategy is normalized onto the payload', () => {
    const body = save(draftFrom({ brand_strategy: IMPORTED_STRATEGY }))
    assert.equal(body.kind, 'digital')
    assert.equal(body.brand_strategy.brand_basic_info.product.name, 'MiniMax 开放平台')
    assert.equal(body.brand_strategy.content_angles.length, 3)
  })

  it('an empty strategy saves as null rather than an empty shell', () => {
    const body = buildPayload({
      name: 'MiniMax 开放平台',
      kind: 'digital',
      link: '',
      categories: [],
      media: [],
      coverId: null,
      physical: null,
      digital: { strategy: draftFrom(null), strategyTouched: true },
    })
    assert.equal(body.brand_strategy, null)
  })

  it('a draft is a detached copy, so a mutation never touches the stored product', () => {
    const product = { brand_strategy: IMPORTED_STRATEGY }
    const draft = draftFrom(product)
    draft.content_angles[0].title = '被改掉了'
    assert.equal(product.brand_strategy.content_angles[0].title, '成本焦虑')
  })
})

describe('e2e · strategy form · C4 the angle write path round-trips after the card refactor', () => {
  const write = (strategy, mutator) => {
    const next = structuredCloneSafe(strategy)
    mutator(next)
    return next
  }

  it('add → edit → remove then reopen keeps the surviving angles consistent', () => {
    let strategy = draftFrom({ brand_strategy: IMPORTED_STRATEGY })

    // Add Angle pushes the same row shape the component pushes.
    strategy = write(strategy, (next) => {
      next.content_angles.push({ id: '', title: '', description: '', target_audience: '', priority: 3 })
    })
    assert.equal(strategy.content_angles.length, 4)

    strategy = write(strategy, (next) => { next.content_angles[1].title = '上线速度（改）' })
    strategy = write(strategy, (next) => { next.content_angles[3].target_audience = '增长负责人' })
    strategy = write(strategy, (next) => { next.content_angles.splice(0, 1) })
    assert.equal(strategy.content_angles.length, 3)

    const reopened = normalizeBrandStrategy(save(strategy).brand_strategy)
    assert.deepEqual(
      reopened.content_angles.map((angle) => angle.title),
      ['上线速度（改）', '数据合规', ''],
    )
    assert.deepEqual(
      reopened.content_angles.map((angle) => angle.target_audience),
      ['独立开发者', '企业技术负责人', '增长负责人'],
    )
    assert.deepEqual(reopened.content_angles.map((angle) => angle.priority), [2, 3, 3])
  })

  it('priority edits stay numeric, and the stored domain is still 1–3 (spec D3)', () => {
    const strategy = write(draftFrom({ brand_strategy: IMPORTED_STRATEGY }), (next) => {
      next.content_angles[0].priority = Number('2')
    })
    assert.equal(strategy.content_angles[0].priority, 2)
    assert.equal(normalizeBrandStrategy(save(strategy).brand_strategy).content_angles[0].priority, 2)

    // The header offers 1–5 while the persisted domain is 1–3: a 4 or 5 is
    // stored as 3. Out of scope here (spec §10 D3 keeps both sides as they are),
    // pinned so the mismatch can never drift silently.
    const high = write(draftFrom({ brand_strategy: IMPORTED_STRATEGY }), (next) => {
      next.content_angles[0].priority = Number('5')
    })
    assert.equal(high.content_angles[0].priority, 5)
    assert.equal(normalizeBrandStrategy(save(high).brand_strategy).content_angles[0].priority, 3)
  })

  it('the ceiling stays at ten angles', () => {
    let strategy = draftFrom({ brand_strategy: IMPORTED_STRATEGY })
    for (let i = 0; i < 20; i++) {
      strategy = write(strategy, (next) => {
        if (next.content_angles.length >= 10) return
        next.content_angles.push({ id: '', title: '', description: '', target_audience: '', priority: 3 })
      })
    }
    assert.equal(strategy.content_angles.length, 10)
    assert.match(fieldsSource, /if \(next\.content_angles\.length >= 10\) return/)
  })
})
