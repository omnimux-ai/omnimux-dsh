import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { findPresetSkill, getPresetSkillBinding } from './skill-picker-logic.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const MARKET_ROOT = join(HERE, '..', '..')

/** 最小绑定表：只有一条预设内置了目标技能。 */
const bindings = {
  'tiktok-agent': {
    skills: [
      { id: 'sk-tk-other', slug: 'other-skill', installed: true },
      { id: 'sk-tk-video-hook', slug: 'video-hook-analysis', name: '视频拆解', title: '视频拆解', installed: true },
    ],
  },
  'omni-agent': {
    skills: [
      { id: 'sk-omx-reverse', slug: 'reverse-video-prompt', name: '反推视频提示词', installed: false },
    ],
  },
  'drama-agent': {
    skills: [
      { id: 'sk-dr-reverse', slug: 'reverse-video-prompt', name: '反推视频提示词', installed: true },
    ],
  },
}

describe('按 slug 从出厂预设技能库解析技能', () => {
  it('命中已内置条目，并标明来源预设', () => {
    const hit = findPresetSkill('video-hook-analysis', bindings)
    assert.ok(hit)
    assert.equal(hit.slug, 'video-hook-analysis')
    assert.equal(hit.presetId, 'tiktok-agent')
  })

  it('未内置的条目视为解析不到，绝不返回', () => {
    // omni-agent 里有同名 slug 但 installed=false；drama-agent 里才是已内置的
    const hit = findPresetSkill('reverse-video-prompt', bindings)
    assert.ok(hit)
    assert.equal(hit.installed, true)
    assert.equal(hit.presetId, 'drama-agent')
  })

  it('技能库整体没有该 slug 时返回 null，不抛错', () => {
    assert.equal(findPresetSkill('not-a-skill', bindings), null)
    assert.equal(findPresetSkill('', bindings), null)
    assert.equal(findPresetSkill(null, bindings), null)
    assert.equal(findPresetSkill('video-hook-analysis', {}), null)
  })

  it('允许带前导斜杠的 slug（技能手势形态）', () => {
    assert.ok(findPresetSkill('/video-hook-analysis', bindings))
  })
})

/** 四条快捷方式（Issue #2562）默认绑定的技能。 */
const QUICK_SHORTCUT_SKILLS = [
  { slug: 'replicate-viral-video', name: '复刻爆款视频' },
  { slug: 'video-hook-analysis', name: '视频拆解' },
  { slug: 'create-selling-video', name: '创作带货视频' },
  { slug: 'reverse-video-prompt', name: '反推视频提示词' },
]

describe('出厂预设技能库的四个快捷方式技能', () => {
  it('四条 slug 都在出厂 Agent 预设技能表里，且均为已内置', async () => {
    const { readFileSync } = await import('node:fs')
    // 出厂 Agent 预设真源（仓库根 presets/），与 Issue #2562 引用的数据一致
    const raw = JSON.parse(readFileSync(join(HERE, '../../../../presets/tiktok-agent/skills.json'), 'utf8'))
    const list = Array.isArray(raw) ? raw : (raw.skills || [])
    for (const { slug } of QUICK_SHORTCUT_SKILLS) {
      const hit = list.find((item) => String(item.slug || item.skill || '') === slug)
      assert.ok(hit, `${slug} 必须在出厂 Agent 预设技能表里`)
      assert.equal(hit.installed, true, `${slug} 必须是已内置技能`)
    }
  })

  it('四条 slug 现在都能从会话技能选择器的预设绑定解析到', () => {
    // 上一轮曾把「四条 slug 不在货架」钉在这里（数据分叉的临时护栏）。
    // 用户已拍板恢复这批技能，assertion 方向随之翻转：现在必须解析得到，
    // 且解析结果带上快捷方式渲染所依赖的 slug / name。
    for (const { slug, name } of QUICK_SHORTCUT_SKILLS) {
      const hit = findPresetSkill(slug)
      assert.ok(hit, `${slug} 必须能从 catalog/preset-skills.json 解析到`)
      assert.equal(hit.slug, slug)
      assert.equal(hit.installed, true, `${slug} 必须是已内置（installed: true）`)
      assert.equal(hit.name, name, `${slug} 的名称必须与快捷方式胶囊一致`)
      assert.ok(
        hit.presetId === 'tiktok-agent' || hit.presetId === 'omni-agent',
        `${slug} 应来自默认绑定的社媒预设，实际 ${hit.presetId}`,
      )
    }
  })
})

/**
 * 创作视频 / 创作图片两个分类的钉住清单。
 *
 * 13 款恢复技能逐字取自预设真源 `presets/tiktok-agent/skills.json`；
 * 「商品轮播图」「图文复刻」是 Issue #2609 预装的电商图文技能，真源即
 * `catalog/preset-skills.json` 自身。
 */
const RESTORED_CATEGORIES = [
  {
    id: '创作视频',
    skills: [
      { slug: 'replicate-viral-video', name: '复刻爆款视频', titleEn: 'Replicate Viral Video', description: '参考爆款视频结构，为你的产品一键生成同款带货视频。' },
      { slug: 'create-selling-video', name: '创作带货视频', titleEn: 'Create Selling Video', description: '从商品或参考视频出发，自动编排分析、脚本、提示词与生成全流程。' },
      { slug: 'video-hook-analysis', name: '视频拆解', titleEn: 'Video Breakdown', description: '拆解短视频叙事结构、黄金Hook与逐镜头分镜脚本。' },
      { slug: 'video-script-creation', name: '视频脚本创作', titleEn: 'Video Script Writing', description: '复刻爆款结构或基于商品原创，生成可执行的带货分镜脚本。' },
      { slug: 'video-prompt-generation', name: '视频提示词生成', titleEn: 'Video Prompt Generator', description: '把脚本或视频转换为可直接使用的 AI 视频生成提示词。' },
      { slug: 'video-generation', name: '视频生成', titleEn: 'Video Generation', description: '将分镜或提示词渲染为成片视频。' },
      // 反推视频提示词在预设真源里原始分类是「搜索爆款视频」；按产品口径只恢复
      // 创作视频 / 创作图片两个分类，因此它并入创作视频，不额外立第三个分类。
      { slug: 'reverse-video-prompt', name: '反推视频提示词', titleEn: 'Reverse Video Prompt', description: '上传TK视频链接，自动反推出该视频背后，可用于AI视频生成的高质量提示词。' },
    ],
  },
  {
    id: '创作图片',
    skills: [
      { slug: 'video-storyboard-image', name: '视频分镜图', titleEn: 'Video Storyboard', description: '为视频脚本生成连贯的分镜画面。' },
      { slug: 'product-image-set', name: '商品套图', titleEn: 'Product Image Set', description: '为商品一键生成一套高质量主图。' },
      { slug: 'aplus-content', name: 'A+内容', titleEn: 'A+ Content', description: '生成电商平台 A+ 详情页图文。' },
      { slug: 'image-replication', name: '图片复刻', titleEn: 'Image Replication', description: '基于参考图风格批量复刻产品图。' },
      { slug: 'multi-angle-product-images', name: '多角度产品图', titleEn: 'Multi-Angle Product Shots', description: '为同一商品生成多个角度的展示图。' },
      { slug: 'ai-virtual-try-on', name: 'AI 换装', titleEn: 'AI Virtual Try-On', description: '为模特生成 AI 换装效果。' },
      // Issue #2609 预装的两款电商图文技能（真源即 catalog/preset-skills.json 本条数据）
      { slug: 'shoppable-carousel', name: '商品轮播图', titleEn: 'Shoppable Carousel', description: '根据商品图片规划逐页轮播图方案与生图提示词。' },
      { slug: 'replicate-carousel', name: '图文复刻', titleEn: 'Carousel Replication', description: '拆解参考图文结构，为新商品生成原创轮播方案。' },
    ],
  },
]

describe('恢复的创作视频 / 创作图片分类与 15 款技能', () => {
  it('tiktok-agent 的分类里含创作视频与创作图片', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    assert.ok(binding)
    const ids = binding.categories.map((c) => c.id)
    for (const { id } of RESTORED_CATEGORIES) {
      assert.ok(ids.includes(id), `${id} 必须出现在技能菜单分类里，实际 ${ids.join('/')}`)
    }
    // 分类页签同步出现，且不影响既有的「全部」首位
    const tabIds = binding.tabs.map((t) => t.id)
    assert.equal(tabIds[0], 'all')
    for (const { id } of RESTORED_CATEGORIES) {
      assert.ok(tabIds.includes(id), `${id} 必须出现在分类页签里`)
    }
  })

  it('15 款技能都在货架上，且分类、文案、封面齐备', () => {
    const binding = getPresetSkillBinding('tiktok-agent')
    const bySlug = new Map(binding.skills.map((s) => [String(s.slug || s.skill), s]))
    for (const category of RESTORED_CATEGORIES) {
      const inCategory = binding.skills.filter((s) => s.category === category.id)
      assert.equal(inCategory.length, category.skills.length, `${category.id} 应恰好 ${category.skills.length} 款技能，实际 ${inCategory.length}`)
      for (const expected of category.skills) {
        const hit = bySlug.get(expected.slug)
        assert.ok(hit, `${expected.slug} 必须在 tiktok-agent 货架上`)
        assert.equal(hit.skill, expected.slug, `${expected.slug} 的 skill 应与 slug 同值`)
        assert.equal(hit.name, expected.name)
        assert.equal(hit.title, expected.name)
        assert.equal(hit.titleZh, expected.name)
        assert.equal(hit.titleEn, expected.titleEn, `${expected.slug} 的英文标题必须是行业通行英文名`)
        assert.equal(hit.category, category.id)
        assert.equal(hit.description, expected.description, `${expected.slug} 文案必须逐字取自预设真源`)
        assert.equal(hit.summary, expected.description)
        assert.equal(hit.installed, true)
        assert.equal(hit.isHot, false)
        assert.equal(hit.isNew, false)
        assert.equal(hit.downloads, 0)
        assert.equal(hit.cover, `catalog/covers/skills/skill-card-${hit.coverIndex}.webp`)
        assert.ok(existsSync(join(MARKET_ROOT, hit.cover)), `${expected.slug} 的封面文件必须真实存在：${hit.cover}`)
      }
    }
  })

  it('omni-agent 与 tiktok-agent 保持同一份恢复内容（默认菜单与快捷方式不打架）', () => {
    const tiktok = getPresetSkillBinding('tiktok-agent')
    const omni = getPresetSkillBinding('omni-agent')
    assert.ok(omni)
    for (const { id } of RESTORED_CATEGORIES) {
      assert.ok(omni.categories.some((c) => c.id === id), `omni-agent 缺分类 ${id}`)
      assert.equal(
        omni.skills.filter((s) => s.category === id).length,
        tiktok.skills.filter((s) => s.category === id).length,
        `omni-agent 的 ${id} 技能数与 tiktok-agent 不一致`,
      )
    }
    for (const { slug } of QUICK_SHORTCUT_SKILLS) {
      assert.ok(omni.skills.some((s) => String(s.slug || s.skill) === slug), `omni-agent 缺 ${slug}`)
    }
  })

  it('新增 15 款的字段集与既有条目完全一致（不再漏 titleEn）', () => {
    const newSlugs = new Set(RESTORED_CATEGORIES.flatMap((c) => c.skills.map((s) => s.slug)))
    for (const presetId of ['tiktok-agent', 'omni-agent']) {
      const binding = getPresetSkillBinding(presetId)
      const fieldsOf = (item) => Object.keys(item).sort().join(',')
      const legacyFields = new Set(
        binding.skills
          .filter((s) => !newSlugs.has(String(s.slug || s.skill)))
          .map(fieldsOf),
      )
      assert.equal(legacyFields.size, 1, `${presetId} 既有条目的字段集必须只有一种形状`)
      const expectedFields = [...legacyFields][0]
      const added = binding.skills.filter((s) => newSlugs.has(String(s.slug || s.skill)))
      assert.equal(added.length, newSlugs.size, `${presetId} 新增条目数应为 ${newSlugs.size}`)
      for (const item of added) {
        assert.equal(fieldsOf(item), expectedFields, `${presetId} 的 ${item.slug} 字段集必须与既有条目一致`)
        assert.ok(
          typeof item.titleEn === 'string' && item.titleEn.trim().length > 0,
          `${presetId} 的 ${item.slug} 必须有非空 titleEn（英文界面标题）`,
        )
      }
    }
  })
})
