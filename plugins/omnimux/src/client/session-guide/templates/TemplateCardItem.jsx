import React, { useState } from 'react'
import { resolveSkillAuroraStyle } from '../skills/auroraGradients.js'
import { ICON_VERIFIED, ICON_FIRE, CategoryIcon, CATEGORY_NAMES } from '../skills/SkillCard.jsx'

const ICON_REPLICATE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="13" height="13">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

const ICON_OPEN_APP = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="13" height="13">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

const ICON_SPARKLES = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
  </svg>
)

/**
 * 格式化紧凑数字 (例如 5820000 -> 5.82M)
 */
function formatMetric(num) {
  if (typeof num !== 'number' || !Number.isFinite(num) || num <= 0) return ''
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2).replace(/\.0+$/, '')}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0+$/, '')}K`
  return String(num)
}

/**
 * 统一创意模板 / 热门 / 技能单张卡片
 * 
 * 1. 彻底移除模型名称标签、渠道来源平台标签、右上角声音波形图标；
 * 2. Skills 卡片绝不展示任何虚假指标；仅当具有真实数据（如 TikTok 热门）时展示互动率与播放量；
 * 3. 默认状态绝不展示复刻按钮，底端只靠底部显示两行纯白标题；
 * 4. 鼠标悬停 (Hover) 时，标题平滑上移，底部升起 1:1 复用创作灵感官方深灰毛玻璃圆角按键「↺ 复刻」。
 *
 * @param {object} props
 * @param {object} props.template
 * @param {(template: object) => void} props.onSelect
 * @param {(template: object) => void} props.onOpenDetail
 */
export function TemplateCardItem({ template, onSelect, onOpenDetail }) {
  const [imgError, setImgError] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)

  if (!template) return null

  const handleCardClick = () => {
    if (onOpenDetail) onOpenDetail(template)
  }

  const handleRecreateClick = (e) => {
    e.stopPropagation()
    if (onSelect) onSelect(template)
  }

  // 区分是否为带有真实指标的 TikTok 热门卡片与 AI 应用
  const isTikTok = template.type === 'tiktok' || template.categorySlug === 'tiktok' || (typeof template.views === 'number' && template.views > 0)
  const isSkill = template.type === 'skill' || template.categorySlug === 'skills'
  const isApp = template.isApp === true || (template.type === 'app' && !!template.manifest)
  const actionText = isApp ? '打开应用' : (isSkill ? '使用' : '复刻')
  const actionIcon = isApp ? ICON_OPEN_APP : ICON_REPLICATE
  const viewsText = isTikTok ? formatMetric(template.views) : null
  const engagementText = isTikTok && typeof template.engagement === 'number' ? `${(template.engagement * 100).toFixed(1)}%` : null

  const title = template.title || template.titleZh || template.nameZh || template.name || ''
  const coverUrl = template.thumbnailUrl || template.cover || template.img || ''

  // 技能卡片：1:1 对标技能插件高饱和度极光流光样式（图 2 标杆视觉）
  if (isSkill) {
    const aurora = resolveSkillAuroraStyle(template)
    const isHot = Boolean(template.isHot || template.tags?.includes('热门精选'))
    const isNew = Boolean(template.isNew || template.tags?.includes('新品上市'))
    const catLabel = CATEGORY_NAMES[template.category] || (Array.isArray(template.tags) ? template.tags[0] : '') || '营销技能'
    const usesText = template.downloads ? `${template.downloads} uses` : '100+ uses'
    const desc = template.summary || template.desc || template.description || '专业营销脚本与分镜方案'

    return (
      <div
        className="omnimux-tpl-card is-skill-card omnimux-creatify-card omnimux-skill-card"
        onClick={handleCardClick}
        data-template-id={template.id}
        data-template-type="skill"
        data-skill-id={template.id}
        data-is-app="false"
        role="button"
        tabIndex={0}
        aria-label={title}
        style={{ background: aurora.bg }} /* exempt-ui02: 极光算法动态流光背景 */
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleCardClick()
          }
        }}
      >
        {/* 1. 动态极光流光背景层 */}
        <div
          className="omnimux-creatify-card-bg-img omnimux-skill-card-cover-img"
          style={{
            background: aurora.bg, /* exempt-ui02: 极光算法动态流光背景 */
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />

        {/* 2. 点阵纹理 Overlay (Dot Matrix) */}
        <div className="omnimux-creatify-dot-overlay" aria-hidden="true" />

        {/* 3. 左上角徽章组合 (热门火苗 / 新品微标 + 分类胶囊) */}
        <div className="omnimux-creatify-card-top-left">
          {isHot ? (
            <span className="omnimux-creatify-badge-hot" title="热门精选">
              {ICON_FIRE}
            </span>
          ) : isNew ? (
            <span className="omnimux-creatify-badge-new">新</span>
          ) : null}

          {catLabel ? (
            <div className="omnimux-creatify-pill-cat">
              <CategoryIcon category={template.category} />
              <span>{catLabel}</span>
            </div>
          ) : null}
        </div>

        {/* 4. 右上角收藏星标 */}
        <button /* exempt-ui01: 收藏按钮 */
          type="button"
          className={`omnimux-creatify-star-btn ${isFavorite ? 'active' : ''}`}
          aria-label="收藏技能"
          onClick={(e) => {
            e.stopPropagation()
            setIsFavorite(!isFavorite)
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>

        {/* 5. 居中白色加粗大标题与认证徽章 */}
        <div className="omnimux-creatify-card-center">
          <h3 className="omnimux-creatify-center-title omnimux-skill-card-title omnimux-tpl-title" title={title}>
            <span>{title}</span>
            {ICON_VERIFIED}
          </h3>
        </div>

        {/* 6. 悬停浮层：深色平滑渐变底 + 简介 + 使用量 + 快捷使用入口 */}
        <div className="omnimux-creatify-card-hover-drawer">
          <div className="omnimux-creatify-drawer-bg" />
          <div className="omnimux-creatify-drawer-content">
            <p className="omnimux-creatify-drawer-desc omnimux-skill-card-summary" title={desc}>
              {desc}
            </p>
            <div className="omnimux-creatify-drawer-footer">
              <div className="omnimux-creatify-drawer-uses">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{usesText}</span>
              </div>
              <button /* exempt-ui01: session-guide card recreate button */
                type="button"
                className="omnimux-trending-recreate-btn omnimux-skill-card-btn"
                onClick={handleRecreateClick}
                aria-label={`${actionText}：${title}`}
              >
                <span className="omnimux-trending-recreate-icon" aria-hidden="true">
                  {actionIcon}
                </span>
                <span>{actionText}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="omnimux-tpl-card"
      onClick={handleCardClick}
      data-template-id={template.id}
      data-template-type={template.type || 'template'}
      data-is-app={isApp ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCardClick()
        }
      }}
    >
      <div className="omnimux-tpl-media-box">
        {!imgError && coverUrl ? (
          <img
            className="omnimux-tpl-img"
            src={coverUrl}
            alt={title}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="omnimux-tpl-placeholder">
            <span className="omnimux-tpl-ph-icon">{ICON_SPARKLES}</span>
          </div>
        )}

        {/* 底部暗黑渐变遮罩 */}
        <div className="omnimux-tpl-gradient-layer" aria-hidden="true" />

        {/* 底部内容区：靠底部默认只显示标题或真实指标，Hover 平滑上移 */}
        <div className="omnimux-tpl-bottom-bar">
          {isTikTok && (viewsText || engagementText) && (
            <div className="omnimux-tpl-metrics-row">
              {engagementText && (
                <div className="omnimux-tpl-metric-col">
                  <span className="omnimux-tpl-metric-value">{engagementText}</span>
                  <span className="omnimux-tpl-metric-label">互动率</span>
                </div>
              )}
              {viewsText && (
                <div className="omnimux-tpl-metric-col">
                  <span className="omnimux-tpl-metric-value">{viewsText}</span>
                  <span className="omnimux-tpl-metric-label">播放量</span>
                </div>
              )}
            </div>
          )}

          <div className="omnimux-tpl-title" title={title}>
            {title}
          </div>
        </div>

        {/* 悬停平滑浮现的毛玻璃圆角按键（直接复用创作灵感样式） */}
        <div className="omnimux-tpl-hover-action">
          <button /* exempt-ui01: session-guide card recreate button */
            type="button"
            className="omnimux-trending-recreate-btn"
            onClick={handleRecreateClick}
            aria-label={`${actionText}：${title}`}
          >
            <span className="omnimux-trending-recreate-icon" aria-hidden="true">
              {actionIcon}
            </span>
            <span>{actionText}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
