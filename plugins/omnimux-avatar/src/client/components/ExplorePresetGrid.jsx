// 灵感预设网格：镜像预设以瀑布流铺开——每张卡片的美术比例各不相同，固定网格会裁切画面。
//
// 来源：OmniMux/web/src/features/influencer/components/explore-preset-grid.tsx（只读真源），行为 1:1。
//
// 与真源的差异（本仓硬门禁强制）：
// 1. 真源用 Tailwind 的 columns-2 / sm:columns-3 / xl:columns-4；插件客户端没有 Tailwind，
//    列数改由 matchMedia 求值后经 CSS 变量 --omx-avatar-preset-columns 交给样式表
//    （内联 CSS 变量是本仓 UI02 允许的唯一传参通道，颜色与排版仍全部来自类）。
// 2. 图标不再依赖 lucide-react（客户端只允许依赖 react），一律内联矢量 SVG。

import { useEffect, useState } from 'react'

import { presetAssetUrl } from '../api.js'

/** 窄屏列数，与真源 columns-2 一致。 */
export const PRESET_COLUMNS_BASE = 2
/** 真源 sm 断点。 */
const SM_QUERY = '(min-width: 640px)'
/** 真源 xl 断点。 */
const XL_QUERY = '(min-width: 1280px)'

/** 当前视口该铺几列；没有 matchMedia 的环境（宿主渲染、Node 单测）回落 2 列。 */
function readPresetColumns() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return PRESET_COLUMNS_BASE
  }
  if (window.matchMedia(XL_QUERY).matches) return 4
  if (window.matchMedia(SM_QUERY).matches) return 3
  return PRESET_COLUMNS_BASE
}

/** 订阅两个断点，视口变化时重算列数。 */
function usePresetColumns() {
  const [columns, setColumns] = useState(readPresetColumns)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const sync = () => setColumns(readPresetColumns())
    const lists = [window.matchMedia(SM_QUERY), window.matchMedia(XL_QUERY)]
    sync()
    for (const list of lists) list.addEventListener('change', sync)
    return () => {
      for (const list of lists) list.removeEventListener('change', sync)
    }
  }, [])

  return columns
}

/**
 * 无悬停能力的设备（触屏）上，「套用」胶囊必须常显。
 *
 * 样式表用 @media (hover: none) 覆盖同一件事；这里再补一个显式类，
 * 因为媒体查询在宿主内嵌渲染与截图工具里并不可靠。
 */
function useTouchFallback() {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const list = window.matchMedia('(hover: none)')
    const sync = () => setIsTouch(list.matches)
    sync()
    list.addEventListener('change', sync)
    return () => list.removeEventListener('change', sync)
  }, [])

  return isTouch
}

/** 空态图标：矢量星芒，不用字符充当图标。 */
function SparkleIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='28'
      height='28'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.6'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5 8.4 11.1 4 9.5l4.4-1.6z' />
      <path d='M17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z' />
    </svg>
  )
}

/** 「套用」胶囊里的魔杖图标：矢量，替代真源的 Wand2 组件。 */
function WandIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='14'
      height='14'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M4 20l9.5-9.5' />
      <path d='M15.5 3.5l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z' />
      <path d='M20 13.5l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z' />
    </svg>
  )
}

/**
 * 两个兄弟按钮，绝不嵌套：整块表面打开预览，右下角的胶囊直接套用。
 * 胶囊悬停或聚焦时显现，无悬停设备上常显，因此永远可达。
 */
function ExplorePresetCard({ preset, isTouch, onPreview, onApply, t }) {
  return (
    <article className='omx-avatar-preset-card'>
      <button /* exempt-ui01: 整张卡片即预览入口，外观由 omx-avatar-preset-card 类族独占 */
        type='button'
        aria-label={preset.name}
        className='omx-avatar-preset-open'
        onClick={() => onPreview(preset)}
      >
        <img
          src={presetAssetUrl(preset.preview.path)}
          alt=''
          width={preset.preview.width}
          height={preset.preview.height}
          loading='lazy'
          decoding='async'
          className='omx-avatar-preset-img'
          style={{ aspectRatio: `${preset.preview.width} / ${preset.preview.height}` }} /* exempt-ui02: 每张预设的原始画幅，图片到达前不重排瀑布流 */
        />
      </button>

      <button /* exempt-ui01: 覆盖在卡片右下角的次级动作，与预览按钮是兄弟而非嵌套 */
        type='button'
        className={isTouch
          ? 'omx-avatar-abtn omx-avatar-preset-recreate is-touch'
          : 'omx-avatar-abtn omx-avatar-preset-recreate'}
        onClick={() => onApply(preset)}
      >
        <WandIcon />
        <span>{t('套用')}</span>
      </button>
    </article>
  )
}

/**
 * @param {{
 *   presets: import('../lib/types.js').ExplorePreset[],
 *   onPreview: (preset: import('../lib/types.js').ExplorePreset) => void,
 *   onApply: (preset: import('../lib/types.js').ExplorePreset) => void,
 *   t: (key: string) => string,
 * }} props
 */
export function ExplorePresetGrid(props) {
  const { presets, onPreview, onApply, t } = props
  // 钩子先于分支调用，空态与网格之间切换不会改变调用顺序。
  const columns = usePresetColumns()
  const isTouch = useTouchFallback()
  const items = Array.isArray(presets) ? presets : []

  // 空态类族与历史空态共用：同一种「居中图标 + 标题 + 说明」的版式
  if (!items.length) {
    return (
      <div className='omx-avatar-empty'>
        <SparkleIcon />
        <p className='omx-avatar-empty-title'>{t('暂无预设')}</p>
        <p className='omx-avatar-empty-desc'>{t('灵感预设当前不可用')}</p>
      </div>
    )
  }

  return (
    <div
      className='omx-avatar-preset-grid'
      style={{ '--omx-avatar-preset-columns': String(columns) }}
    >
      {items.map((preset) => (
        <ExplorePresetCard
          key={preset.id}
          preset={preset}
          isTouch={isTouch}
          onPreview={onPreview}
          onApply={onApply}
          t={t}
        />
      ))}
    </div>
  )
}
