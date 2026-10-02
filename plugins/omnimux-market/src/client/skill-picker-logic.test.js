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
  SUITE_SHELF_TAG,
  appendSkillGesture,
  buildPlazaSearchPayload,
  buildSearchPayload,
  consumePlazaIntent,
  filterPickerItems,
  filterPlazaShelf,
  inSkillShelf,
  installPayload,
  isLocalOnlyShelfTag,
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
  plazaDiscoverySections,
  skillDesc,
  skillTitle,
} from './skill-picker-logic.js'

describe('skill shelf taxonomy', () => {
  it('locks the shelf order: AIGC 创作 first, 套件 last', () => {
    assert.deepEqual([...SKILL_SHELF_TAGS], [
      'AIGC 创作', '电商', '商业广告', '短剧漫剧', '专业影视', '动画', '教育', '创意实验', '音频音乐', '平台工具', '套件',
    ])
  })

  it('suite tag is local-only and matches only kind === suite', () => {
    assert.equal(isLocalOnlyShelfTag(SUITE_SHELF_TAG), true)
    assert.equal(isLocalOnlyShelfTag('动画'), false)
    assert.equal(isLocalOnlyShelfTag(''), false)
    const suite = { kind: 'suite', tags: ['社媒创作'], name: '社媒多模态内容创作工坊' }
    assert.equal(matchesDomainTag(suite, SUITE_SHELF_TAG), true)
    assert.equal(matchesDomainTag(suite, '动画'), false)
    assert.equal(matchesDomainTag(suite, '电商'), false)
    const skill = { kind: 'skill', tags: ['动画'] }
    assert.equal(matchesDomainTag(skill, SUITE_SHELF_TAG), false)
    assert.equal(matchesDomainTag(skill, '动画'), true)
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

  it('exposes AGENT_PRESET_SKILL_BINDINGS containing drama-agent', () => {
    assert.ok(AGENT_PRESET_SKILL_BINDINGS['drama-agent'])
    assert.equal(AGENT_PRESET_SKILL_BINDINGS['drama-agent'].presetId, 'drama-agent')
    assert.equal(AGENT_PRESET_SKILL_BINDINGS['drama-agent'].name, '短剧制作人')
  })

  it('getPresetSkillBinding resolves drama-agent, drama, 短剧 and mode === drama', () => {
    const binding1 = getPresetSkillBinding('drama-agent')
    assert.ok(binding1)
    assert.equal(binding1.name, '短剧制作人')
    assert.equal(getPresetSkillBinding('drama')?.presetId, 'drama-agent')
    assert.equal(getPresetSkillBinding('短剧')?.presetId, 'drama-agent')
    assert.equal(getPresetSkillBinding('短剧制作人')?.presetId, 'drama-agent')

    // 验证 mode === 'drama' 时无缝解析短剧货架
    const modeBinding = getPresetSkillBinding(null, 'drama')
    assert.ok(modeBinding)
    assert.equal(modeBinding.presetId, 'drama-agent')
    assert.equal(modeBinding.name, '短剧制作人')
  })

  it('mode === agent resolves tiktok-agent as original skill shelf fallback', () => {
    const agentBinding = getPresetSkillBinding(null, 'agent')
    assert.ok(agentBinding)
    assert.equal(agentBinding.presetId, 'tiktok-agent')
    assert.equal(agentBinding.name, 'TikTok 运营操盘手')
    assert.equal(agentBinding.skills.length, agentBinding.categories.length ? AGENT_PRESET_SKILL_BINDINGS['tiktok-agent'].skills.length : 0)
  })

  it('drama-agent binds the current preset shelf (ec1590182 社媒纯化后为营销分类)', () => {
    const binding = getPresetSkillBinding('drama-agent')
    assert.equal(binding.name, '短剧制作人')
    const catIds = binding.categories.map((c) => c.id)
    assert.deepEqual(catIds, ['ugc-testimonial', 'storytelling-script', 'image-static', 'video-ads', 'product-showcase', 'meme-native', 'other'])
    assert.equal(binding.tabs.length, catIds.length + 1)
    assert.equal(binding.tabs[0].id, 'all')
    assert.equal(binding.skills.length, AGENT_PRESET_SKILL_BINDINGS['drama-agent'].skills.length)

    // 验证分类过滤
    const ugc = filterPresetSkills(binding.skills, 'ugc-testimonial')
    assert.ok(ugc.length > 0)
    const videoAds = filterPresetSkills(binding.skills, 'video-ads')
    assert.ok(videoAds.length > 0)
  })

  it('getPresetSkillBinding resolves tiktok-agent, TikTokAgent and 全能社媒操盘手', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    assert.ok(binding)
    assert.equal(binding.name, 'TikTok 运营操盘手')
    assert.equal(getPresetSkillBinding('TikTokAgent')?.presetId, 'tiktok-agent')
    assert.equal(getPresetSkillBinding('tiktok')?.presetId, 'tiktok-agent')
    assert.equal(getPresetSkillBinding('全能社媒操盘手')?.presetId, 'tiktok-agent')
  })

  it('getPresetSkillBinding resolves omni-agent and omni-social-agent', () => {
    const binding = getPresetSkillBinding('omni-agent')
    assert.ok(binding)
    assert.equal(binding.presetId, 'omni-agent')
    assert.equal(binding.name, '全域社媒操盘手')
    assert.equal(binding.skills.length, AGENT_PRESET_SKILL_BINDINGS['omni-agent'].skills.length)
    assert.equal(getPresetSkillBinding('omni')?.presetId, 'omni-agent')
    assert.equal(getPresetSkillBinding('omni-social-agent')?.presetId, 'omni-agent')
    assert.equal(hasPresetSkillBinding('omni-agent'), true)
  })

  it('getPresetSkillBinding resolves marketing-agent and mode === marketing', () => {
    const binding = getPresetSkillBinding('marketing-agent')
    assert.ok(binding)
    assert.equal(binding.presetId, 'marketing-agent')
    assert.equal(binding.name, '全能营销操盘手')
    assert.equal(binding.categories.length, AGENT_PRESET_SKILL_BINDINGS['marketing-agent'].categories.length)
    assert.equal(getPresetSkillBinding('marketing')?.presetId, 'marketing-agent')
    assert.equal(getPresetSkillBinding(null, 'marketing')?.presetId, 'marketing-agent')
    assert.equal(hasPresetSkillBinding('marketing-agent'), true)
  })

  it('unbound presets return null and hasPresetSkillBinding is false', () => {
    for (const id of ['standard', 'daily-work', 'cordis', 'unknown', '', null, undefined]) {
      assert.equal(getPresetSkillBinding(id), null)
      assert.equal(hasPresetSkillBinding(id), false)
    }
    assert.equal(hasPresetSkillBinding('tiktok-agent'), true)
    assert.equal(hasPresetSkillBinding('TikTokAgent'), true)
    assert.equal(hasPresetSkillBinding('全能社媒操盘手'), true)
  })

  it('tiktok-agent contains the 6 preset categories (ec1590182 社媒纯化)', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    const catIds = binding.categories.map((c) => c.id)
    assert.deepEqual(catIds, ['创作视频', '创作图片', '蓝海选品', '爆款短视频', '达人与账号复盘', '创作者中心'])
    assert.equal(binding.tabs.length, 7)
    assert.equal(binding.tabs[0].id, 'all')
  })

  it('tiktok-agent preset carries complete per-skill metadata (ec1590182 社媒纯化后 22 款)', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    assert.equal(binding.skills.length, AGENT_PRESET_SKILL_BINDINGS['tiktok-agent'].skills.length)

    const titles = new Set(binding.skills.map((s) => s.name))
    // 蓝海选品
    assert.ok(titles.has('TikTok 蓝海爆品发现'))
    assert.ok(titles.has('以图找同款商品'))
    // 爆款短视频
    assert.ok(titles.has('下载 TikTok 无水印视频'))
    assert.ok(titles.has('TikTok 爆款带货提示词生成器'))
    // 创作视频
    assert.ok(titles.has('复刻爆款视频'))
    assert.ok(titles.has('创作带货视频'))
    assert.ok(titles.has('视频拆解'))
    assert.ok(titles.has('视频脚本创作'))
    assert.ok(titles.has('视频提示词生成'))
    assert.ok(titles.has('视频生成'))
    assert.ok(titles.has('反推视频提示词'))
    // 创作图片
    assert.ok(titles.has('视频分镜图'))
    assert.ok(titles.has('商品套图'))
    assert.ok(titles.has('A+内容'))
    assert.ok(titles.has('图片复刻'))
    assert.ok(titles.has('多角度产品图'))
    assert.ok(titles.has('AI 换装'))
    assert.ok(titles.has('图文复刻'))
    assert.ok(titles.has('商品轮播图'))
    // 达人与账号复盘 + 创作者中心
    assert.ok(titles.has('TikTok 账号复盘与优化建议'))
    assert.ok(titles.has('TikTok 头部博主对标蒸馏'))
    assert.ok(titles.has('TikTok 官方创作者与短剧中心'))

    // 每条技能都必须有完整元数据
    const catIds = new Set(binding.categories.map((c) => c.id))
    for (const skill of binding.skills) {
      assert.ok(skill.slug || skill.skill, 'skill must carry a slug')
      assert.ok(skill.name || skill.title, 'skill must carry a title')
      assert.ok(catIds.has(skill.category), `${skill.slug} must belong to a declared category`)
      assert.ok(skill.cover, `${skill.slug} must carry a cover`)
    }
  })

  it('filterPresetSkills filters by category and search query', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    const counts = {}
    for (const skill of binding.skills) counts[skill.category] = (counts[skill.category] || 0) + 1

    for (const cat of binding.categories.map((c) => c.id)) {
      assert.equal(filterPresetSkills(binding.skills, cat).length, counts[cat] || 0, `category ${cat}`)
    }

    const allSkills = filterPresetSkills(binding.skills, 'all')
    assert.equal(allSkills.length, binding.skills.length)

    const searchMatch = filterPresetSkills(binding.skills, 'all', '蓝海')
    assert.ok(searchMatch.length >= 1)
    assert.ok(searchMatch.some((s) => s.name === 'TikTok 蓝海爆品发现'))

    const viral = filterPresetSkills(binding.skills, 'all', '复刻')
    assert.ok(viral.length >= 1)
    assert.ok(viral.some((s) => s.name === '复刻爆款视频'))
  })

  it('filterPickerItems delegates to filterPresetSkills when presetBinding is passed', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    const res = filterPickerItems([], '蓝海选品', binding)
    assert.equal(res.length, 2)
    assert.equal(res[0].category, '蓝海选品')
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
    assert.equal(binding.name, '内容创作')
    assert.equal(binding.useDefaultContentCatalog, true)
    // 14 tabs: all, mine, featured, and 11 shelf categories
    assert.equal(binding.tabs.length, 14)
    assert.equal(binding.tabs[0].id, 'all')
    assert.equal(binding.tabs[1].id, 'mine')
    assert.equal(binding.tabs[2].id, 'featured')
    assert.equal(binding.tabs[3].id, 'AIGC 创作')
    assert.equal(binding.tabs[4].id, '电商')
    assert.equal(binding.tabs[5].id, '商业广告')
    assert.equal(binding.tabs[6].id, '短剧漫剧')
    assert.equal(binding.tabs[7].id, '专业影视')
    assert.equal(binding.tabs[8].id, '动画')
    assert.equal(binding.tabs[13].id, '套件')

    // Aliases also resolve to content-creation-team
    assert.equal(getPresetSkillBinding('content-creator-team')?.presetId, 'content-creation-team')
    assert.equal(getPresetSkillBinding('exp-ai-content-creator-team')?.presetId, 'content-creation-team')
    assert.equal(getPresetSkillBinding('内容创作')?.presetId, 'content-creation-team')
    assert.equal(getPresetSkillBinding('内容创作专家团')?.presetId, 'content-creation-team')
    assert.equal(hasPresetSkillBinding('content-creation-team'), true)
    assert.equal(hasPresetSkillBinding('内容创作'), true)
    assert.equal(hasPresetSkillBinding('内容创作专家团'), true)
  })

  it('Issue #1280: tiktok-agent 创作视频 category lists the preset viral video skills with covers', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    assert.ok(binding)
    const { featured, regular } = plazaDiscoverySections([], {
      category: '创作视频',
      presetBinding: binding,
    })

    // ec1590182 社媒纯化后：创作视频分类的 7 款预设技能全部可见，
    // 同时混入命中「创作视频」关键词的本地目录卡片（实现内的宽匹配）。
    const all = [...featured, ...regular]
    const names = new Set(all.map((s) => s.name || s.title))
    for (const name of ['复刻爆款视频', '创作带货视频', '视频拆解', '视频生成', '视频脚本创作', '视频提示词生成', '反推视频提示词']) {
      assert.ok(names.has(name), `${name} must appear under 创作视频`)
    }
    const presetCount = filterPresetSkills(binding.skills, '创作视频').length
    assert.equal(all.filter((s) => binding.skills.some((b) => (b.slug || b.skill) === (s.slug || s.skill))).length, presetCount)

    // 预设技能全部配上封面图
    for (const item of all.filter((s) => binding.skills.some((b) => (b.slug || b.skill) === (s.slug || s.skill)))) {
      assert.ok(item.cover, `${item.name} must have cover`)
    }

    // featured 与 regular 不重复
    const regularSlugs = new Set(regular.map((s) => s.slug || s.skill || s.id))
    for (const item of featured) {
      assert.ok(!regularSlugs.has(item.slug || item.skill || item.id), `${item.name} should not duplicate in regular`)
    }
  })
})

describe('skill bilingual selection (skillTitle/skillDesc)', () => {
  const bilingual = {
    slug: 'demo-skill',
    id: 'sk-omx-demo-skill',
    name: '中文标题',
    title: '中文标题',
    description: '中文摘要',
    summary: '中文摘要',
    titleZh: '中文标题',
    titleEn: 'English title',
    summaryZh: '中文摘要',
    summaryEn: 'English summary',
  }
  const dict = {
    locale: 'zh',
    'skill.name.some-key': '字典标题',
    'skill.desc.some-key': '字典摘要',
  }
  const tr = (locale, extra = {}) => {
    const table = { ...dict, ...extra, locale }
    return (key) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key)
  }

  it('picks the EN fields under locale en and the ZH fields under locale zh', () => {
    assert.equal(skillTitle(bilingual, tr('en')), 'English title')
    assert.equal(skillDesc(bilingual, tr('en')), 'English summary')
    assert.equal(skillTitle(bilingual, tr('zh')), '中文标题')
    assert.equal(skillDesc(bilingual, tr('zh')), '中文摘要')
  })

  it('keeps the i18n dictionary ahead of the catalog fields', () => {
    const item = { ...bilingual, slug: 'some-key', skill: 'some-key' }
    assert.equal(skillTitle(item, tr('en')), '字典标题')
    assert.equal(skillDesc(item, tr('en')), '字典摘要')
    assert.equal(skillTitle(item, tr('zh')), '字典标题')
  })

  it('falls back to the single-language fields, then the slug, when bilingual is absent', () => {
    const legacy = { slug: 'legacy-skill', name: '中文标题', description: '中文摘要' }
    assert.equal(skillTitle(legacy, tr('en')), '中文标题')
    assert.equal(skillDesc(legacy, tr('en')), '中文摘要')
    assert.equal(skillTitle({ slug: 'bare-skill' }, tr('en')), 'bare-skill')
    assert.equal(skillDesc({ slug: 'bare-skill' }, tr('en')), '')
  })

  it('without a translator, zh is the default selection (no document in node)', () => {
    assert.equal(skillTitle(bilingual), '中文标题')
    assert.equal(skillDesc(bilingual), '中文摘要')
    assert.equal(skillTitle(null), '')
    assert.equal(skillDesc(null), '')
  })
})
