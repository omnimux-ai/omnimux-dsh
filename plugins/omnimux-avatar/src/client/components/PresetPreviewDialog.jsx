// 灵感预设预览弹窗：左侧放大整张角色设定板，右侧是参数摘要与唯一主行动点。
//
// 来源：OmniMux/web/src/features/influencer/components/preset-preview-dialog.tsx（只读真源），行为 1:1。
//
// 与真源的差异（本仓硬门禁强制）：
// 1. 真源依赖 @/components/dialog 与 lucide-react；插件客户端只允许依赖 react，
//    因此这里自带一个最小模态外壳（DialogFrame，MultiViewDialog 复用同一份）与内联矢量图标。
// 2. 全英文文案改为中文源串，英文原文由 locales.js 作为 en 词条承载。
//
// 打开本弹窗绝不改动左侧面板：只有「套用」会，并在退出时关闭弹窗，
// 让用户直接落在刚刚变化的那块面板上。

import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { presetAssetUrl } from '../api.js'

import { presetParamRows, resolvePresetSelection } from '../lib/presets.js'

/** 焦点陷阱与焦点恢复共用的可聚焦元素选择器。 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 关闭图标：矢量，替代真源 Dialog 自带的字符图标。 */
function CloseIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='14'
      height='14'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      aria-hidden='true'
    >
      <path d='M6 6l12 12' />
      <path d='M18 6L6 18' />
    </svg>
  )
}

/** 「套用」按钮里的魔杖图标：矢量，替代真源的 Wand2 组件。 */
function WandIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='16'
      height='16'
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

/** 适应视图图标。 */
function FitIcon() {
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
      <path d='M9 4H4v5' />
      <path d='M15 20h5v-5' />
      <path d='M20 9V4h-5' />
      <path d='M4 15v5h5' />
    </svg>
  )
}

/** 原始尺寸图标。 */
function ActualSizeIcon() {
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
      <path d='M14 4h6v6' />
      <path d='M10 20H4v-6' />
      <path d='M20 4l-7 7' />
      <path d='M4 20l7-7' />
    </svg>
  )
}

/**
 * 最小模态外壳：遮罩点击关闭、Escape 关闭、焦点锁在面板内并落在首个控件上。
 * MultiViewDialog 复用同一份实现，避免两处焦点陷阱各自漂移。
 *
 * @param {{
 *   title: string,
 *   onClose: () => void,
 *   children: any,
 *   footer?: any,
 *   t: (key: string) => string,
 * }} props
 */
export function DialogFrame(props) {
  const { title, onClose, children, footer, t } = props
  const panelRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const panel = panelRef.current
    const first = panel ? panel.querySelector(FOCUSABLE) : null
    if (first && typeof first.focus === 'function') first.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE))
      if (!nodes.length) return
      const head = nodes[0]
      const tail = nodes[nodes.length - 1]
      const active = typeof document === 'undefined' ? null : document.activeElement
      if (event.shiftKey && active === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && active === tail) {
        event.preventDefault()
        head.focus()
      }
    }

    if (typeof document !== 'undefined') document.addEventListener('keydown', onKeyDown)
    return () => {
      if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div
      className='omx-avatar-dialog-backdrop'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        tabIndex={-1}
        className='omx-avatar-dialog'
      >
        <header className='omx-avatar-dialog-head'>
          <h2 id={titleId} className='omx-avatar-dialog-title'>
            {title}
          </h2>
          <button /* exempt-ui01: 模态关闭按钮，外观由 omx-avatar-dialog-close 类独占 */
            type='button'
            className='omx-avatar-dialog-close'
            aria-label={t('关闭')}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className='omx-avatar-dialog-body'>{children}</div>

        {footer ? <footer className='omx-avatar-dialog-footer'>{footer}</footer> : null}
      </div>
    </div>
  )
}

/**
 * @param {{
 *   preset: import('../lib/types.js').ExplorePreset | null,
 *   taxonomy: import('../lib/types.js').InfluencerTaxonomy | null,
 *   onClose: () => void,
 *   onApply: (preset: import('../lib/types.js').ExplorePreset) => void,
 *   t: (key: string) => string,
 * }} props
 */
export function PresetPreviewDialog(props) {
  const { preset, taxonomy, onClose, onApply, t } = props
  const [actualSize, setActualSize] = useState(false)
  const presetId = preset ? preset.id : null

  // 每张预设都从「适应视图」打开；残留的缩放会带到下一张卡片上。
  useEffect(() => {
    setActualSize(false)
  }, [presetId])

  const rows = useMemo(
    () => (preset && taxonomy ? presetParamRows(preset, taxonomy) : []),
    [preset, taxonomy]
  )
  const canApply = useMemo(
    () => Boolean(preset && taxonomy && resolvePresetSelection(preset, taxonomy)),
    [preset, taxonomy]
  )

  if (!preset) return null

  return (
    <DialogFrame
      title={preset.name}
      onClose={onClose}
      t={t}
      footer={
        <div className='omx-avatar-preset-actions'>
          {canApply ? null : (
            <p role='status' className='omx-avatar-preset-note'>
              {t('预设设置正在更新，请稍后再试。')}
            </p>
          )}
          <button /* exempt-ui01: 主行动点，外观由 omx-avatar-cta 类独占 */
            type='button'
            className='omx-avatar-cta'
            disabled={!canApply}
            onClick={() => onApply(preset)}
          >
            <WandIcon />
            <span>{t('套用')}</span>
          </button>
        </div>
      }
    >
      <div className='omx-avatar-preset-cols'>
        {/* 素材区：整张角色设定图，默认适应窗口，可切到原始尺寸滚动查看 */}
        <div className='omx-avatar-preset-media'>
          <div className={actualSize ? 'omx-avatar-preset-view is-actual' : 'omx-avatar-preset-view'}>
            <img
              src={presetAssetUrl(preset.sheet.path)}
              alt={preset.name}
              width={preset.sheet.width}
              height={preset.sheet.height}
              className='omx-avatar-preset-sheet'
            />
          </div>

          <button /* exempt-ui01: 视图模式切换，外观由 omx-avatar-abtn 类独占 */
            type='button'
            className='omx-avatar-abtn omx-avatar-preset-fit'
            aria-pressed={actualSize}
            onClick={() => setActualSize((prev) => !prev)}
          >
            {actualSize ? <FitIcon /> : <ActualSizeIcon />}
            <span>{actualSize ? t('适应视图') : t('原始尺寸')}</span>
          </button>
        </div>

        {/* 参数区：画面描述 + 结构化参数摘要 */}
        <div className='omx-avatar-preset-panel'>
          {preset.brief ? (
            <section className='omx-avatar-preset-section'>
              <h3 className='omx-avatar-preset-label'>{t('方向')}</h3>
              <p className='omx-avatar-preset-brief'>{preset.brief}</p>
            </section>
          ) : null}

          {rows.length ? (
            <section className='omx-avatar-preset-section'>
              <h3 className='omx-avatar-preset-label'>{t('设定')}</h3>
              <dl className='omx-avatar-preset-chips'>
                {rows.map((row) => (
                  <div key={row.categoryId} className='omx-avatar-preset-chip-row'>
                    <dt className='omx-avatar-preset-chip-key'>{row.label}</dt>
                    <dd className='omx-avatar-preset-chip-values'>
                      {row.options.map((option) => (
                        <span key={option} className='omx-avatar-preset-chip'>
                          {option}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </DialogFrame>
  )
}
