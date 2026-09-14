/**
 * 实物 / 数字分治的状态层契约（AC-205、AC-501、AC-502）。
 *
 * 分治有两半：**渲染**上两个表单各渲染自己那一半字段（在
 * `client-form-subscreen.test.js` 里按源码断言），**状态**上形态在进入二级页时
 * 就被钉死，导入回填不能改写它，指纹也只折叠自己那一半字段域。这里盯的是后半。
 */
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./useProductFormState.js', import.meta.url))],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react'],
  logLevel: 'silent',
})

const bundleText = bundle.outputFiles[0].text

/**
 * 每次调用都开一个全新的 vm 上下文：hook 槽是按调用顺序落位的，同一个上下文里
 * 连跑两个「表单」会把上一个的状态带过来，那测的就不是新开的表单了。
 *
 * 最小 React：状态写在槽里，重复调用同一个 hook 函数即「重渲染」。只看状态，
 * 所以没有 effects。
 */
function fresh() {
  const slots = []
  let index = 0
  let mounted = false
  const react = {
    useState(initial) {
      const slot = index++
      if (!mounted) slots[slot] = typeof initial === 'function' ? initial() : initial
      return [slots[slot], (next) => {
        slots[slot] = typeof next === 'function' ? next(slots[slot]) : next
      }]
    },
    useRef(initial) {
      const slot = index++
      if (!mounted) slots[slot] = { current: initial }
      return slots[slot]
    },
    useEffect() {},
    useCallback(fn) { return fn },
    useMemo(fn) { return fn() },
  }
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
      throw new Error(`unexpected dependency ${name}`)
    },
  }
  runInNewContext(bundleText, context)
  return {
    ...context.module.exports,
    /** 跑一次 hook（首次 = 挂载，之后 = 重渲染）并回答它的返回值。 */
    call(hook, ...args) {
      index = 0
      const out = hook(...args)
      mounted = true
      return out
    },
  }
}

/** vm 里造出来的数组与本进程的 `Array` 不是同一个原型，断言前统一成宿主数组。 */
const hostArray = (value) => Array.from(value)

/* ---------------------------------------------------------------- 空白基线 */

describe('products forms · the empty baseline belongs to one kind', () => {
  const { computeProductFingerprint, emptyProductSnapshot, formSnapshotOf, isFingerprintDirty } = fresh()

  it('builds a physical and a digital baseline that differ exactly where they should', () => {
    const physical = emptyProductSnapshot()
    const digital = emptyProductSnapshot('digital')

    assert.equal(physical.kind, 'physical')
    assert.equal(physical.asDigital, false)
    assert.equal(physical.strategyTouched, false)

    assert.equal(digital.kind, 'digital')
    assert.equal(digital.asDigital, true, 'a digital create form opens with the strategy panel writable')
    assert.equal(digital.strategyTouched, true)
    assert.deepEqual(Object.keys(physical), Object.keys(digital), 'same field domain, different values')
  })

  it('an unknown kind falls back to physical instead of inventing a third one', () => {
    for (const value of [undefined, null, '', 'nope', 42]) {
      assert.equal(emptyProductSnapshot(value).kind, 'physical')
    }
  })

  it('a digital create form is never dirty on arrival', () => {
    const baseline = computeProductFingerprint(formSnapshotOf(null, 'digital'))
    const live = computeProductFingerprint(emptyProductSnapshot('digital'))
    assert.equal(live, baseline)
    assert.equal(isFingerprintDirty(live, baseline), false)
  })

  it('an edit snapshot still wins over the requested kind', () => {
    const product = { id: 'prd_1', name: '实体杯子', kind: 'physical', selling_points: '保温' }
    assert.equal(formSnapshotOf(product, 'digital').kind, 'physical')
    assert.equal(formSnapshotOf(product, 'digital').selling, '保温')
  })
})

/* ------------------------------------------------------------ 指纹字段域 */

describe('products forms · the fingerprint folds only its own half', () => {
  const { computeProductFingerprint, emptyProductSnapshot } = fresh()

  const digitalState = (overrides = {}) => ({ ...emptyProductSnapshot('digital'), ...overrides })
  const physicalState = (overrides = {}) => ({ ...emptyProductSnapshot(), ...overrides })

  // 「写过的战略」从空战略就地改值得到：它必须与被测代码同域，跨 realm 的裸对象
  // 不是普通对象，归一化会直接判空。
  function filledState(kind) {
    const state = emptyProductSnapshot(kind)
    state.strategy.brand_basic_info.company.name = 'Aurora'
    state.strategy.brand_basic_info.product.name = 'Aurora Mug'
    state.strategyTouched = true
    return state
  }

  it('price, sku and promotion move a physical form and are invisible to a digital one', () => {
    const physical = computeProductFingerprint(physicalState())
    assert.notEqual(computeProductFingerprint(physicalState({ price: '24.9' })), physical)
    assert.notEqual(computeProductFingerprint(physicalState({ sku: 'AM-350' })), physical)
    assert.notEqual(computeProductFingerprint(physicalState({ promotion: '免运费' })), physical)

    const digital = computeProductFingerprint(digitalState())
    for (const patch of [{ price: '24.9' }, { sku: 'AM-350' }, { promotion: '免运费' }]) {
      assert.equal(
        computeProductFingerprint(digitalState(patch)),
        digital,
        `digital must ignore ${JSON.stringify(patch)}`,
      )
    }
  })

  it('a written strategy moves a digital form and is invisible to a physical one', () => {
    const digital = computeProductFingerprint(digitalState())
    const written = computeProductFingerprint(filledState('digital'))
    assert.notEqual(written, digital, 'a touched strategy is a real change')
    assert.equal(
      written,
      computeProductFingerprint(filledState('digital')),
      'the fold is stable',
    )

    const physical = computeProductFingerprint(physicalState())
    const carried = filledState('digital').strategy
    assert.equal(
      computeProductFingerprint({ ...physicalState(), strategy: carried, strategyTouched: true }),
      physical,
    )
  })

  it('expanding the panel without touching a value is not a change', () => {
    const baseline = computeProductFingerprint(digitalState({ strategyTouched: false }))
    assert.equal(
      computeProductFingerprint(digitalState({ strategyTouched: true, strategy: emptyProductSnapshot('digital').strategy })),
      baseline,
      'an untouched empty strategy folds like no strategy at all',
    )
  })
})

/* -------------------------------------------------------------- 形态锚定 */

describe('products forms · the kind is pinned by the page that opened it', () => {
  it('a pinned form ignores setKind, an unpinned one still honours it', () => {
    const pinned = fresh()
    const form = pinned.call(pinned.useProductBaseFields, null, 'digital')
    assert.equal(form.fields.kind, 'digital')
    form.setters.setKind('physical')
    assert.equal(
      pinned.call(pinned.useProductBaseFields, null, 'digital').fields.kind,
      'digital',
      'the pinned kind must survive setKind',
    )

    // 对照组：不钉形态时同一个 setter 真的会写，所以上面「没变」是钉住的结果。
    const loose = fresh()
    assert.equal(loose.call(loose.useProductBaseFields, null).fields.kind, 'physical')
    loose.call(loose.useProductBaseFields, null).setters.setKind('digital')
    assert.equal(loose.call(loose.useProductBaseFields, null).fields.kind, 'digital')
  })

  it('resetting onto a snapshot keeps the pinned kind, not the snapshot kind', () => {
    const runner = fresh()
    const base = runner.call(runner.useProductBaseFields, null, 'digital')
    base.resetBaseFields({
      name: '某平台',
      kind: 'physical',
      selling: '一站式模型服务',
      audience: '',
      brand: '',
      features: '',
      price: '',
      sku: '',
      promotion: '',
      link: 'https://platform.example.com',
    })
    const after = runner.call(runner.useProductBaseFields, null, 'digital')
    assert.equal(after.fields.kind, 'digital')
    assert.equal(after.fields.name, '某平台')
    assert.equal(after.fields.link, 'https://platform.example.com')
  })

  it('a digital page opens with the six strategy modules writable, a physical one does not', () => {
    const digitalRunner = fresh()
    const digital = digitalRunner.call(digitalRunner.useStrategyState, null, 'digital')
    assert.equal(digital.strategyOpen, true)
    assert.equal(digital.strategyTouched, true)

    const physicalRunner = fresh()
    const physical = physicalRunner.call(physicalRunner.useStrategyState, null, 'physical')
    assert.equal(physical.strategyOpen, false)
    assert.equal(physical.strategyTouched, false)
  })
})

/* --------------------------------------------------------- 实物导入媒体 */

describe('products forms · a physical import lands in the media list', () => {
  const { bundleFormReturn } = fresh()

  /**
   * 会真的写回的 setter，因此可以读回提交内容。`setKind` 特意做成空操作：
   * 二级页锚定形态后，真实 hook 里的 setKind 就是这个行为。
   */
  function liveHarness() {
    const fields = {
      name: '', kind: 'physical', selling: '', audience: '', brand: '', features: '',
      price: '', sku: '', promotion: '', link: '',
    }
    const setters = { setKind: () => {} }
    for (const key of Object.keys(fields)) {
      if (key === 'kind') continue
      setters[`set${key.charAt(0).toUpperCase()}${key.slice(1)}`] = (value) => { fields[key] = value }
    }
    const mediaState = {
      categories: [],
      media: [],
      coverId: null,
      setCategories: (next) => { mediaState.categories = typeof next === 'function' ? next(mediaState.categories) : next },
      setMedia: (next) => { mediaState.media = typeof next === 'function' ? next(mediaState.media) : next },
      setCoverId: (next) => { mediaState.coverId = next },
    }
    const strategyState = {
      strategyOpen: false,
      strategyTouched: false,
      strategy: {},
      setStrategyOpen: (value) => { strategyState.strategyOpen = value },
      setStrategyTouched: (value) => { strategyState.strategyTouched = value },
      setStrategy: (value) => { strategyState.strategy = value },
    }
    return {
      bundle: bundleFormReturn({ fields, setters, resetBaseFields: () => {} }, mediaState, strategyState, false),
      fields,
      mediaState,
      strategyState,
    }
  }

  const IMAGES = {
    name: 'Aurora Mug 350ml',
    selling_points: '6 小时长效保温',
    link: 'https://shop.example.com/p/aurora-mug',
    kind: 'physical',
    images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
    media: [
      { id: 'med_img1', real_path: '/media/product-aurora-01.png', original_name: 'product-aurora-01.png' },
      { id: 'med_img2', real_path: '/media/product-aurora-02.png', original_name: 'product-aurora-02.png' },
    ],
    cover_media_id: 'med_img1',
  }

  it('appends the downloaded product images and covers with the first one', () => {
    const { bundle, mediaState } = liveHarness()
    bundle.actions.applyImportedData(IMAGES)
    assert.deepEqual(hostArray(mediaState.media).map((row) => row.id), ['med_img1', 'med_img2'])
    assert.equal(mediaState.coverId, 'med_img1')
  })

  it('covers with the first imported image even when the payload names no cover', () => {
    const { bundle, mediaState } = liveHarness()
    bundle.actions.applyImportedData({
      name: IMAGES.name,
      kind: 'physical',
      media: IMAGES.media,
    })
    assert.equal(mediaState.coverId, 'med_img1')
  })

  it('never overwrites a cover the user picked by hand', () => {
    const { bundle, mediaState } = liveHarness()
    mediaState.setCoverId('med_handpicked')
    bundle.actions.applyImportedData(IMAGES)
    assert.equal(mediaState.coverId, 'med_handpicked')
  })

  it('keeps a digital answer from turning the pinned physical form into a digital one', () => {
    const { bundle, fields } = liveHarness()
    bundle.actions.applyImportedData({ ...IMAGES, kind: 'digital', price: '99', sku: 'X-1' })
    assert.equal(fields.kind, 'physical', 'the kind is the page\'s decision, not the payload\'s')
    const payload = bundle.payload()
    assert.equal(payload.selling_points, '6 小时长效保温')
    assert.equal(payload.brand_strategy, undefined)
  })
})

/* ------------------------------------------------------------ payload 分域 */

describe('products forms · the payload writes one half per kind', () => {
  const { buildPayload } = fresh()

  it('never sends price, sku or promotion for a digital product', () => {
    const payload = buildPayload({
      name: 'MiniMax 开放平台',
      kind: 'digital',
      link: 'https://platform.example.com',
      categories: [],
      media: [],
      coverId: null,
      physical: { selling: '一站式模型服务', audience: '开发者', brand: 'MiniMax', features: '', price: '99', sku: 'X-1', promotion: '限时' },
      digital: { strategy: {}, strategyTouched: false },
    })
    assert.equal(payload.price, undefined)
    assert.equal(payload.sku, undefined)
    assert.equal(payload.promotion, undefined)
  })

  it('writes the commerce triple for a physical product', () => {
    const payload = buildPayload({
      name: 'Aurora Mug',
      kind: 'physical',
      link: 'https://shop.example.com/p/aurora-mug',
      categories: [],
      media: [],
      coverId: null,
      physical: { selling: '保温', audience: '通勤族', brand: 'Aurora', features: '350ml', price: '24.9', sku: 'AM-350', promotion: '免运费' },
    })
    assert.equal(payload.price, '24.9')
    assert.equal(payload.sku, 'AM-350')
    assert.equal(payload.promotion, '免运费')
    assert.equal(payload.brand_strategy, undefined)
  })
})
