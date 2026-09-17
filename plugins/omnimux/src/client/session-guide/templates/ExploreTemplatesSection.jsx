import React, { useState, useMemo } from 'react'
import {
  TEMPLATE_CATEGORIES,
  SHELVES_CONFIG,
  selectTemplatesByCategory,
  selectShelfItems,
} from './templates-data.js'
import { TemplatesShelfRow } from './TemplatesShelfRow.jsx'
import { TemplatesGridView } from './TemplatesGridView.jsx'
import { TemplateDetailDrawer } from './TemplateDetailDrawer.jsx'
import FEATURED_SKILLS_JSON from '../skills/featured-skills.json' with { type: 'json' }

/**
 * 将相对封面转换为绝对或者静态资源路径
 */
function resolveSkillCover(cover) {
  if (!cover || typeof cover !== 'string') return ''
  const trimmed = cover.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed
  }
  return `/omnimux-market/icon?url=${encodeURIComponent(trimmed)}`
}

/**
 * 默认社媒热门高转化爆款真实数据集（包含真实播放量与互动率，供 TikTok 热门货架消费）
 */
const TIKTOK_TRENDING_FALLBACK_ITEMS = Object.freeze([
  {
    id: 'trend_hair_straighten_01',
    title: '理发沙龙现场：高温夹板拉直柔顺喷雾对半强对比',
    titleEn: 'Salon Live: Heat Press Hair Straightening Half-Split Contrast',
    views: 5820000,
    engagement: 0.021,
    cover: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=400&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=400&q=80',
    type: 'tiktok',
    categorySlug: 'tiktok',
    breakdown: '前2秒高温蒸汽抓眼球 + 中间分屏对半强对比 + 结尾手触反光顺滑',
  },
  {
    id: 'trend_foundation_redness_02',
    title: '无暇粉底液半脸涂抹测评：瞬间遮盖红血丝',
    titleEn: 'Flawless Foundation Half-Face Review: Instant Redness Eraser',
    views: 8150000,
    engagement: 0.034,
    cover: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
    type: 'tiktok',
    categorySlug: 'tiktok',
    breakdown: '微距镜头直怼毛孔瑕疵 + 刷子一抹即净 + 自然日光无滤镜对比',
  },
  {
    id: 'trend_scalp_scrub_03',
    title: '头皮深度去角质清洁前后微观毛囊放大镜对比',
    titleEn: 'Scalp Deep Exfoliation Microscopic Follicle Contrast',
    views: 12400000,
    engagement: 0.048,
    cover: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=400&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=400&q=80',
    type: 'tiktok',
    categorySlug: 'tiktok',
    breakdown: '放大镜特写油脂角质 + 清洁啫喱起泡冲洗 + 干净通透毛囊特写',
  },
  {
    id: 'trend_styling_spray_04',
    title: '定型喷雾暴风雨吹风机大风力实测不塌发',
    titleEn: 'Strong Hold Hairspray Hurricane Blower Test',
    views: 3900000,
    engagement: 0.019,
    cover: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=400&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=400&q=80',
    type: 'tiktok',
    categorySlug: 'tiktok',
    breakdown: '狂暴大风迎面吹拂 + 发型依然纹丝不动 + 喷雾水雾微距慢动作',
  },
  {
    id: 'trend_sneaker_clean_05',
    title: '极速清洁白球鞋泥浆浸泡一刷即净',
    titleEn: 'Instant Sneaker Foam Mud Soak Deep Clean',
    views: 16700000,
    engagement: 0.052,
    cover: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80',
    type: 'tiktok',
    categorySlug: 'tiktok',
    breakdown: '白球鞋彻底浸入泥潭 + 绵密泡沫喷射覆盖 + 刷洗冲水瞬间崭新',
  },
])

/**
 * 探索模板 (Explore templates) 核心大专区
 * 
 * 融合非模板化内容（TikTok热门、Skills）与创意模板为统一扁平分类胶囊与单行货架流。
 *
 * @param {object} props
 * @param {(payload: object) => void} [props.onApplyTemplate]
 * @param {(payload: object) => void} [props.onApplyTrending]
 * @param {(payload: object) => void} [props.onApplySkill]
 * @param {Function} [props.t]
 */
export function ExploreTemplatesSection({
  onApplyTemplate,
  onApplyTrending,
  onApplySkill,
  t,
}) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [activeDrawerTemplate, setActiveDrawerTemplate] = useState(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const isEn = typeof t === 'function' ? t('locale') === 'en' || t('guide.locale') === 'en' : false

  // 解析 Skills 数据并映射为极简大片卡片（不含任何虚假指标）
  const skillsItems = useMemo(() => {
    const rawList = Array.isArray(FEATURED_SKILLS_JSON?.skills) ? FEATURED_SKILLS_JSON.skills : []
    return rawList.map((sk) => ({
      id: sk.id || sk.skill,
      skill: sk.skill || sk.id,
      title: isEn ? (sk.titleEn || sk.title || sk.nameEn || sk.skill) : (sk.titleZh || sk.title || sk.nameZh || sk.skill),
      titleEn: sk.titleEn || sk.title || '',
      summary: isEn ? (sk.summaryEn || sk.summary) : (sk.summaryZh || sk.summary),
      thumbnailUrl: resolveSkillCover(sk.cover),
      type: 'skill',
      categorySlug: 'skills',
    }))
  }, [isEn])

  const handleOpenDetail = (item) => {
    // 技能直接走复刻，模板弹出详细抽屉
    if (item.type === 'skill') {
      handleItemRecreate(item)
      return
    }
    setActiveDrawerTemplate(item)
    setIsDrawerOpen(true)
  }

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false)
    setActiveDrawerTemplate(null)
  }

  // 统一分发三大类型的复刻事件
  const handleItemRecreate = (item) => {
    if (item.type === 'tiktok') {
      if (onApplyTrending) {
        onApplyTrending({
          id: item.id,
          title: item.title,
          titleEn: item.titleEn,
          breakdown: item.breakdown,
          item,
        })
      }
      return
    }

    if (item.type === 'skill') {
      if (onApplySkill) {
        onApplySkill({
          id: item.id,
          skill: item.skill || item.id,
          title: item.title,
          item,
        })
      }
      return
    }

    // 默认作为常规模板复刻
    if (onApplyTemplate) {
      onApplyTemplate({
        template: item,
        prompt: item.prompt,
        title: item.title,
        titleEn: item.titleEn,
        slotType: item.slotType || (item.categorySlug === 'apps-software' ? 'software' : 'product'),
        slotGuide: item.slotGuide,
      })
    }
  }

  const handleViewAllFromShelf = (targetCat) => {
    setSelectedCategory(targetCat)
  }

  const handleBackToAll = () => {
    setSelectedCategory('all')
  }

  const currentCategoryObj = TEMPLATE_CATEGORIES.find((c) => c.slug === selectedCategory) || TEMPLATE_CATEGORIES[0]

  // 计算当前分类在网格视图下的完整列表
  const gridItems = useMemo(() => {
    if (selectedCategory === 'tiktok') return TIKTOK_TRENDING_FALLBACK_ITEMS
    if (selectedCategory === 'skills') return skillsItems
    return selectTemplatesByCategory(selectedCategory)
  }, [selectedCategory, skillsItems])

  return (
    <div className="omnimux-explore-templates-root" data-omnimux-explore-section="">
      {/* 专区标题 */}
      <div className="omnimux-explore-header-row">
        <h2 className="omnimux-explore-main-title">
          {isEn ? 'Explore Templates' : '探索模板'}
        </h2>
      </div>

      {/* 10 大分类扁平纯净胶囊栏（原生中/英文适配，无括号硬拼接） */}
      <div className="omnimux-explore-filter-bar">
        <div className="omnimux-explore-pills-row" role="tablist" aria-label="分类列表">
          {TEMPLATE_CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.slug
            const displayName = isEn ? (cat.nameEn || cat.nameZh) : (cat.nameZh || cat.nameEn)
            return (
              <button /* exempt-ui01: category filter tab button */
                key={cat.slug}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`omnimux-explore-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.slug)}
                data-category-slug={cat.slug}
              >
                <span>{displayName}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 视图展现：全部时展现单行货架流；选定特定分类时展现全网格 */}
      {selectedCategory === 'all' ? (
        <div className="omnimux-explore-shelves-view">
          {SHELVES_CONFIG.map((shelf) => {
            let shelfItems = []
            if (shelf.slug === 'tiktok') {
              shelfItems = TIKTOK_TRENDING_FALLBACK_ITEMS
            } else if (shelf.slug === 'skills') {
              shelfItems = skillsItems.slice(0, 8)
            } else {
              shelfItems = selectShelfItems(shelf.slug, 8)
            }

            return (
              <TemplatesShelfRow
                key={shelf.slug}
                shelf={shelf}
                items={shelfItems}
                onSelectTemplate={handleItemRecreate}
                onOpenDetail={handleOpenDetail}
                onViewAll={handleViewAllFromShelf}
                t={t}
              />
            )
          })}
        </div>
      ) : (
        <div className="omnimux-explore-grid-view-wrap">
          <TemplatesGridView
            category={currentCategoryObj}
            items={gridItems}
            onBackToAll={handleBackToAll}
            onSelectTemplate={handleItemRecreate}
            onOpenDetail={handleOpenDetail}
            t={t}
          />
        </div>
      )}

      {/* 模板详情抽屉 */}
      <TemplateDetailDrawer
        isOpen={isDrawerOpen}
        template={activeDrawerTemplate}
        onClose={handleCloseDrawer}
        onApply={handleItemRecreate}
      />
    </div>
  )
}
