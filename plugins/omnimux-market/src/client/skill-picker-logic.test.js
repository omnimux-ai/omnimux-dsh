import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CREATE_SKILL,
  PLAZA_DEFAULT_CHANNELS,
  PLAZA_HIDDEN_TABS,
  PLAZA_INTENT_KEY,
  PLAZA_QUERY_CHANNELS,
  PLAZA_TABS,
  SKILL_SHELF_TAGS,
  SKILL_SHELF_TAXONOMY,
  appendSkillGesture,
  buildPlazaSearchPayload,
  buildSearchPayload,
  consumePlazaIntent,
  filterPickerItems,
  filterPlazaShelf,
  inSkillShelf,
  installPayload,
  keywordsForTag,
  matchesDomainTag,
  skillGesture,
  writePlazaIntent,
  loadPickerSearch,
  peekPickerCache,
  pickerCacheKey,
  writePickerCache,
  PICKER_CACHE_TTL_MS,
  AGENT_PRESET_SKILL_BINDINGS,
  getPresetSkillBinding,
  hasPresetSkillBinding,
  resolveActivePreset,
  filterPresetSkills,
} from './skill-picker-logic.js'

describe('skill shelf taxonomy', () => {
  it('locks the shelf order: 电商 first, 平台工具 last', () => {
    assert.deepEqual([...SKILL_SHELF_TAGS], [
      '电商', '商业广告', '短剧漫剧', '专业影视', '动画', '教育', '创意实验', '音频音乐', '平台工具',
    ])
  })

  it('taxonomy rows carry unique ids, label keys and keyword lists', () => {
    assert.equal(SKILL_SHELF_TAXONOMY.length, SKILL_SHELF_TAGS.length)
    const ids = new Set()
    const labelKeys = new Set()
    for (const row of SKILL_SHELF_TAXONOMY) {
      assert.ok(row.id && typeof row.id === 'string')
      assert.ok(/^picker\.tab\./.test(row.labelKey), `labelKey for ${row.id}`)
      assert.ok(Array.isArray(row.keywords) && row.keywords.includes(row.id))
      assert.ok(!ids.has(row.id), `duplicate id ${row.id}`)
      assert.ok(!labelKeys.has(row.labelKey), `duplicate labelKey ${row.labelKey}`)
      ids.add(row.id)
      labelKeys.add(row.labelKey)
    }
    assert.ok(Object.isFrozen(SKILL_SHELF_TAXONOMY))
    assert.ok(Object.isFrozen(SKILL_SHELF_TAGS))
  })
})

describe('skill picker logic', () => {
  it('builds /slug gestures with a trailing space', () => {
    assert.equal(skillGesture({ skill: 'audiobook' }), '/audiobook ')
    assert.equal(skillGesture({ slug: 'storyboard' }), '/storyboard ')
    assert.equal(skillGesture({ skill: '/clip-export' }), '/clip-export ')
    assert.equal(skillGesture({}), '')
  })

  it('appends the gesture after existing draft text', () => {
    assert.equal(appendSkillGesture('', '/audiobook '), '/audiobook ')
    assert.equal(appendSkillGesture('hello', '/audiobook '), 'hello /audiobook ')
    assert.equal(appendSkillGesture('hello ', '/audiobook '), 'hello /audiobook ')
  })

  it('uses custom channel for featured and tag query for domain tabs', () => {
    assert.deepEqual(buildSearchPayload('all', ''), { query: '', limit: 20, offset: 0 })
    assert.deepEqual(buildSearchPayload('featured', '分镜'), {
      query: '分镜',
      limit: 20,
      offset: 0,
      channels: ['custom'],
    })
    assert.deepEqual(buildSearchPayload('短剧漫剧', ''), {
      query: '短剧漫剧',
      limit: 20,
      offset: 0,
    })
    assert.deepEqual(buildSearchPayload('短剧漫剧', '分镜'), {
      query: '分镜 短剧漫剧',
      limit: 20,
      offset: 0,
    })
  })

  it('filters mine / domain tabs without dropping all/featured lists', () => {
    const items = [
      { slug: 'a', installed: true, tags: ['短剧漫剧'] },
      { slug: 'b', installed: false, name: '专业影视配乐', tags: [] },
      { slug: 'c', installed: false, tags: ['动画'] },
      { slug: 'gmail', installed: false, tags: [] },
      { slug: 'ad', installed: false, tags: ['商业广告'] },
    ]
    assert.deepEqual(filterPickerItems(items, 'mine').map((it) => it.slug), ['a'])
    assert.deepEqual(filterPickerItems(items, '短剧漫剧').map((it) => it.slug), ['a'])
    assert.deepEqual(filterPickerItems(items, '专业影视').map((it) => it.slug), ['b'])
    assert.deepEqual(filterPickerItems(items, '商业广告').map((it) => it.slug), ['ad'])
    assert.deepEqual(filterPickerItems(items, 'all').map((it) => it.slug), ['a', 'b', 'c', 'ad'])
  })

  it('installs only when the card is not already installed', () => {
    assert.equal(installPayload({ slug: 'audiobook', installed: true }), null)
    assert.deepEqual(
      installPayload({ slug: 'audiobook', id: 'sk-omx-audiobook', installed: false }),
      { slug: 'audiobook', catalogId: 'sk-omx-audiobook' },
    )
    assert.deepEqual(installPayload({ slug: 'drama-soundtrack' }), { slug: 'drama-soundtrack' })
  })

  it('create-skill identity is sk-omx-skill-creator / skill-creator', () => {
    assert.equal(CREATE_SKILL.id, 'sk-omx-skill-creator')
    assert.equal(skillGesture(CREATE_SKILL), '/skill-creator ')
    assert.notEqual(CREATE_SKILL.id, 'sk-skill-creator')
  })

  it('writes and consumes plaza skills intent once', () => {
    const store = new Map()
    const storage = {
      setItem(k, v) { store.set(k, v) },
      getItem(k) { return store.has(k) ? store.get(k) : null },
      removeItem(k) { store.delete(k) },
    }
    assert.equal(writePlazaIntent('skills', storage), 'skills')
    assert.equal(store.get(PLAZA_INTENT_KEY), JSON.stringify({ tab: 'skills' }))
    assert.equal(consumePlazaIntent(storage), 'skills')
    assert.equal(consumePlazaIntent(storage), null)
  })

  it('hidden plaza tabs are not valid intents (Issue #502)', () => {
    const store = new Map()
    const storage = {
      setItem(k, v) { store.set(k, v) },
      getItem(k) { return store.has(k) ? store.get(k) : null },
      removeItem(k) { store.delete(k) },
    }
    assert.ok(PLAZA_HIDDEN_TABS.includes('connectors'))
    assert.ok(!PLAZA_TABS.includes('connectors'))
    assert.equal(writePlazaIntent('connectors', storage), 'skills')
    storage.setItem(PLAZA_INTENT_KEY, JSON.stringify({ tab: 'connectors' }))
    assert.equal(consumePlazaIntent(storage), null)
  })

  it('picker cache returns hits within TTL and misses after expiry', () => {    const cache = new Map()
    const key = pickerCacheKey({ query: '', limit: 20 })
    const body = { items: [{ slug: 'audiobook' }] }
    writePickerCache(cache, key, body, 1_000)
    assert.deepEqual(peekPickerCache(cache, key, 1_000 + 1_000), body)
    assert.equal(peekPickerCache(cache, key, 1_000 + PICKER_CACHE_TTL_MS), null)
  })

  it('loadPickerSearch skips fetch on cache hit and dedupes inflight', async () => {
    const cache = new Map()
    const inflight = new Map()
    let calls = 0
    const fetchSearch = async () => {
      calls += 1
      return { items: [{ slug: 'a' }], ok: true }
    }
    const first = loadPickerSearch({ query: '' }, { cache, inflight, fetchSearch, now: 10 })
    const second = loadPickerSearch({ query: '' }, { cache, inflight, fetchSearch, now: 10 })
    const [a, b] = await Promise.all([first, second])
    assert.equal(calls, 1)
    assert.equal(a.fromCache, false)
    assert.equal(b.fromCache, false)
    const cached = await loadPickerSearch({ query: '' }, { cache, inflight, fetchSearch, now: 20 })
    assert.equal(calls, 1)
    assert.equal(cached.fromCache, true)
    assert.equal(cached.body.items[0].slug, 'a')
  })

  it('loadPickerSearch starts the TTL at completion time, not request start', async () => {
    const cache = new Map()
    const inflight = new Map()
    let release
    const fetchSearch = () => new Promise((resolve) => { release = resolve })
    const completedAt = () => 5000
    const pending = loadPickerSearch(
      { query: '' },
      { cache, inflight, fetchSearch, now: 100, completedAt },
    )
    release({ items: [{ slug: 'a' }] })
    await pending
    const key = pickerCacheKey({ query: '' })
    // at 必须等于完成时刻 5000，而非发起时刻 100
    assert.equal(cache.get(key).at, 5000)
    // 以完成时刻起算：4900 后仍未过期
    assert.ok(peekPickerCache(cache, key, 5000 + PICKER_CACHE_TTL_MS - 1))
    assert.equal(peekPickerCache(cache, key, 5000 + PICKER_CACHE_TTL_MS), null)
    // 若以发起时刻（100）起算，100 + TTL 时必然已过期；实测仍命中，证明起算点是完成时刻
    assert.ok(peekPickerCache(cache, key, 100 + PICKER_CACHE_TTL_MS))
  })
})

describe('ecommerce keyword expansion (Issue #504)', () => {
  const ecom = SKILL_SHELF_TAXONOMY.find((row) => row.id === '电商')

  it('电商 row carries the five frozen keywords', () => {
    assert.deepEqual([...ecom.keywords], ['电商', '独立站', '跨境', 'shopify', '选品'])
    assert.ok(Object.isFrozen(ecom.keywords))
  })

  it('matches Shopify / SHOPIFY case-insensitively across fields', () => {
    assert.ok(matchesDomainTag({ name: 'Shopify 店铺装修' }, '电商'))
    assert.ok(matchesDomainTag({ description: 'SHOPIFY app connector' }, '电商'))
    assert.ok(matchesDomainTag({ summary: 'shopify theme publisher' }, '电商'))
  })

  it('matches 独立站 / 选品 / 跨境 in untagged descriptions', () => {
    const untagged = [
      { slug: 'dp1', name: '独立站落地页生成', tags: [] },
      { slug: 'dp2', description: '跨境选品调研助手', tags: [] },
      { slug: 'dp3', summary: '为跨境电商写详情页', tags: [] },
    ]
    for (const item of untagged) {
      assert.ok(matchesDomainTag(item, '电商'), `${item.slug} should match 电商`)
      assert.ok(inSkillShelf(item), `${item.slug} should enter the shelf`)
    }
    assert.deepEqual(filterPickerItems(untagged, '电商').map((it) => it.slug), ['dp1', 'dp2', 'dp3'])
    assert.deepEqual(filterPickerItems(untagged, 'all').map((it) => it.slug), ['dp1', 'dp2', 'dp3'])
    assert.deepEqual(filterPlazaShelf(untagged, '电商').map((it) => it.slug), ['dp1', 'dp2', 'dp3'])
    assert.deepEqual(filterPlazaShelf(untagged, '').map((it) => it.slug), ['dp1', 'dp2', 'dp3'])
  })

  it('unknown tags keep literal matching without crashing', () => {
    assert.deepEqual(keywordsForTag('不存在分类'), ['不存在分类'])
    assert.ok(matchesDomainTag({ description: '这个 item 属于 不存在分类 吗' }, '不存在分类'))
    assert.ok(!matchesDomainTag({ description: 'unrelated' }, '不存在分类'))
    const items = [
      { slug: 'x', tags: ['电商'] },
      { slug: 'y', name: '不存在分类 专用', tags: [] },
      { slug: 'z', name: 'plain', tags: [] },
    ]
    // 未知分类：货架全集按字面过滤，y 的 name 含该词但不在货架内 → 空
    assert.deepEqual(filterPlazaShelf(items, '不存在分类'), [])
  })

  it('filterPlazaShelf never falls back to all for unknown categories', () => {
    const items = [{ slug: 'a', tags: ['电商'] }, { slug: 'b', tags: ['动画'] }]
    assert.deepEqual(filterPlazaShelf(items, '  '), items)
    assert.deepEqual(filterPlazaShelf(items, '未知').map((it) => it.slug), [])
  })
})

describe('plaza search payload channels (Issue #504)', () => {
  it('submitted query adds skillhub; browsing stays on the default two channels', () => {
    assert.deepEqual(buildPlazaSearchPayload('', '', 1), {
      query: '',
      limit: 48,
      offset: 0,
      channels: ['custom', 'workbuddy'],
    })
    assert.deepEqual(buildPlazaSearchPayload('键盘', '', 1).channels, [...PLAZA_QUERY_CHANNELS])
    assert.ok(buildPlazaSearchPayload('键盘', '', 1).channels.includes('skillhub'))
    // 分类浏览（q 空、cat 有值）保持默认双渠道
    assert.deepEqual(buildPlazaSearchPayload('', '电商', 2), {
      query: '电商',
      limit: 48,
      offset: 48,
      channels: [...PLAZA_DEFAULT_CHANNELS],
    })
    // 同时有提交词与分类：query 拼接且打三渠道
    assert.deepEqual(buildPlazaSearchPayload('键盘', '电商', 3), {
      query: '键盘 电商',
      limit: 48,
      offset: 96,
      channels: ['custom', 'workbuddy', 'skillhub'],
    })
    assert.deepEqual(buildPlazaSearchPayload('  ', '  ', 1).channels, ['custom', 'workbuddy'])
  })
})

describe('agent preset skill bindings', () => {
  it('exposes AGENT_PRESET_SKILL_BINDINGS containing tiktok-agent', () => {
    assert.ok(AGENT_PRESET_SKILL_BINDINGS['tiktok-agent'])
    assert.equal(AGENT_PRESET_SKILL_BINDINGS['tiktok-agent'].presetId, 'tiktok-agent')
  })

  it('getPresetSkillBinding resolves tiktok-agent and TikTokAgent', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    assert.ok(binding)
    assert.equal(binding.name, 'TikTokAgent')
    assert.equal(getPresetSkillBinding('TikTokAgent')?.presetId, 'tiktok-agent')
    assert.equal(getPresetSkillBinding('tiktok')?.presetId, 'tiktok-agent')
  })

  it('unbound presets return null and hasPresetSkillBinding is false', () => {
    for (const id of ['standard', 'daily-work', 'cordis', 'unknown', '', null, undefined]) {
      assert.equal(getPresetSkillBinding(id), null)
      assert.equal(hasPresetSkillBinding(id), false)
    }
    assert.equal(hasPresetSkillBinding('tiktok-agent'), true)
    assert.equal(hasPresetSkillBinding('TikTokAgent'), true)
  })

  it('tiktok-agent contains the 6 categories from the screenshots', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    const catIds = binding.categories.map((c) => c.id)
    assert.deepEqual(catIds, ['选品', '搜索爆款视频', '创作视频', '生成电商图', '创作图片', '数据分析'])
    assert.equal(binding.tabs.length, 7)
    assert.equal(binding.tabs[0].id, 'all')
  })

  it('tiktok-agent contains all 44 skills from the 7 screenshots with complete metadata', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    assert.equal(binding.skills.length, 44)

    const titles = new Set(binding.skills.map((s) => s.name))
    // 选品 (Screenshot 4)
    assert.ok(titles.has('TikTok 蓝海爆品发现'))
    assert.ok(titles.has('以图找同款商品'))
    assert.ok(titles.has('头部跨境店爆品参考'))
    assert.ok(titles.has('商品口碑与差评洞察'))
    assert.ok(titles.has('高佣金潜力品筛选'))
    assert.ok(titles.has('TK品类视频热度与洞察报告'))

    // 搜索爆款视频 (Screenshot 5)
    assert.ok(titles.has('爆款带货提示词生成器'))
    assert.ok(titles.has('采集爆款视频'))
    assert.ok(titles.has('视频分析'))
    assert.ok(titles.has('反推视频提示词'))
    assert.ok(titles.has('下载TK视频'))
    assert.ok(titles.has('生成带货脚本提示词'))
    assert.ok(titles.has('反推视频提示词并改写脚本'))
    assert.ok(titles.has('爆款批量搜索 + 深度拆解报告'))
    assert.ok(titles.has('生成长时间视频脚本'))
    assert.ok(titles.has('爆款选题与话题tag挖掘'))

    // 创作视频 (Screenshot 1)
    assert.ok(titles.has('复刻爆款视频'))
    assert.ok(titles.has('创作带货视频'))
    assert.ok(titles.has('视频脚本创作'))
    assert.ok(titles.has('视频提示词生成'))
    assert.ok(titles.has('视频生成'))

    // 生成电商图 (Screenshot 6)
    assert.ok(titles.has('图片翻译'))
    assert.ok(titles.has('生成白底图'))
    assert.ok(titles.has('生成场景图'))
    assert.ok(titles.has('生成卖点图'))
    assert.ok(titles.has('生成细节特写四宫格'))
    assert.ok(titles.has('一键买家秀'))
    assert.ok(titles.has('基于参考人物生成角色'))
    assert.ok(titles.has('生成试穿套装'))
    assert.ok(titles.has('生成电商套图'))
    assert.ok(titles.has('去除图片背景'))

    // 创作图片 (Screenshot 2)
    assert.ok(titles.has('视频分镜图'))
    assert.ok(titles.has('商品套图'))
    assert.ok(titles.has('A+内容'))
    assert.ok(titles.has('图片复刻'))
    assert.ok(titles.has('多角度产品图'))
    assert.ok(titles.has('AI 换装'))

    // 数据分析 (Screenshot 7 & 3)
    assert.ok(titles.has('TK博主蒸馏器'))
    assert.ok(titles.has('采集创作者账号视频'))
    assert.ok(titles.has('TK 视频批量拆解'))
    assert.ok(titles.has('关键词赛道速览(商品/视频/达人)'))
    assert.ok(titles.has('TK账号内容复盘与优化建议'))
    assert.ok(titles.has('分析账号'))
  })

  it('filterPresetSkills filters by category and search query', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    const xuanpin = filterPresetSkills(binding.skills, '选品')
    assert.equal(xuanpin.length, 6)

    const searchViral = filterPresetSkills(binding.skills, '搜索爆款视频')
    assert.equal(searchViral.length, 10)

    const creativeVideo = filterPresetSkills(binding.skills, '创作视频')
    assert.equal(creativeVideo.length, 6)

    const ecomImg = filterPresetSkills(binding.skills, '生成电商图')
    assert.equal(ecomImg.length, 10)

    const creativeImg = filterPresetSkills(binding.skills, '创作图片')
    assert.equal(creativeImg.length, 6)

    const dataAnalysis = filterPresetSkills(binding.skills, '数据分析')
    assert.equal(dataAnalysis.length, 6)

    const allSkills = filterPresetSkills(binding.skills, 'all')
    assert.equal(allSkills.length, 44)

    const searchMatch = filterPresetSkills(binding.skills, 'all', '蓝海')
    assert.equal(searchMatch.length, 1)
    assert.equal(searchMatch[0].name, 'TikTok 蓝海爆品发现')

    const buyerShow = filterPresetSkills(binding.skills, 'all', '买家秀')
    assert.equal(buyerShow.length, 1)
    assert.equal(buyerShow[0].name, '一键买家秀')
  })

  it('filterPickerItems delegates to filterPresetSkills when presetBinding is passed', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    const res = filterPickerItems([], '选品', binding)
    assert.equal(res.length, 6)
    assert.equal(res[0].category, '选品')
  })

  it('resolveActivePreset extracts preset from props or sessions', () => {
    assert.equal(resolveActivePreset({ props: { agentPreset: 'custom-preset' } }), 'custom-preset')

    const fakeSessions = {
      list: {
        getSnapshot: () => ({
          current: 's1',
          byId: {
            s1: { projectionValues: { agentPreset: 'tiktok-agent' } },
            s2: { projectionValues: { agentPreset: 'standard' } },
          },
        }),
      },
    }
    assert.equal(resolveActivePreset({ sessions: fakeSessions }), 'tiktok-agent')
    assert.equal(resolveActivePreset({ props: { sessionId: 's2' }, sessions: fakeSessions }), 'standard')
    assert.equal(resolveActivePreset({}), undefined)
  })

  it('getPresetSkillBinding resolves content-creation-team and binds default content taxonomy', () => {
    const binding = getPresetSkillBinding('content-creation-team')
    assert.ok(binding)
    assert.equal(binding.name, '内容创作专家团')
    assert.equal(binding.useDefaultContentCatalog, true)
    // 12 tabs: all, mine, featured, and 9 shelf categories
    assert.equal(binding.tabs.length, 12)
    assert.equal(binding.tabs[0].id, 'all')
    assert.equal(binding.tabs[1].id, 'mine')
    assert.equal(binding.tabs[2].id, 'featured')
    assert.equal(binding.tabs[3].id, '电商')
    assert.equal(binding.tabs[4].id, '商业广告')
    assert.equal(binding.tabs[5].id, '短剧漫剧')
    assert.equal(binding.tabs[6].id, '专业影视')
    assert.equal(binding.tabs[7].id, '动画')

    // Aliases also resolve to content-creation-team
    assert.equal(getPresetSkillBinding('content-creator-team')?.presetId, 'content-creation-team')
    assert.equal(getPresetSkillBinding('exp-ai-content-creator-team')?.presetId, 'content-creation-team')
    assert.equal(getPresetSkillBinding('内容创作专家团')?.presetId, 'content-creation-team')
    assert.equal(hasPresetSkillBinding('content-creation-team'), true)
    assert.equal(hasPresetSkillBinding('内容创作专家团'), true)
  })
})
