// 生成栏：52px 随机按钮 + 52px 主 CTA。
// 与源工作台 generate-bar.tsx 1:1；✦ 与随机图标一律矢量 SVG，不用字符图标。
// 源引用的 .inf-spin 在源样式表里没有定义（源是真实缺陷），这里用真实存在的
// .omx-avatar-spin 关键帧动画。

/** 随机：矢量洗牌图标。 */
function ShuffleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 5.5h2.2c1.1 0 2.1.5 2.8 1.4l3 3.9c.7.9 1.7 1.4 2.8 1.4h2.2M13.5 3.5l2.5 2-2.5 2M2.5 14.5h2.2c1.1 0 2.1-.5 2.8-1.4l.9-1.1M13.5 10.2l2.5 2-2.5 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 积分星标：矢量 SVG 四角星（源用 ✦ 字符）。 */
function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M6 1.2 7.1 4.9 10.8 6 7.1 7.1 6 10.8 4.9 7.1 1.2 6 4.9 4.9Z"
        fill="currentColor"
      />
    </svg>
  )
}

/**
 * @param {{
 *   quote: { usd?: number, credits?: number }|null,
 *   canGenerate: boolean,
 *   submitting: boolean,
 *   onGenerate: () => void,
 *   onRandomize: () => void,
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 * }} props
 */
export function GenerateBar(props) {
  const { quote, canGenerate, submitting, onGenerate, onRandomize, t } = props
  const credits = typeof quote?.credits === 'number' ? quote.credits : null

  return (
    <div className="omx-avatar-bar">
      <button type="button" /* exempt-ui01: 图标按钮是自定义控件，非 kit 组件语义 */
        className="omx-avatar-iconbtn"
        title={t('action.randomize')}
        aria-label={t('action.randomize')}
        onClick={onRandomize}
      >
        <ShuffleIcon />
      </button>

      <button type="button" /* exempt-ui01: 主 CTA 由本插件样式族承载 */
        className="omx-avatar-cta"
        disabled={!canGenerate || submitting}
        onClick={onGenerate}
      >
        {submitting ? (
          <span className="omx-avatar-spin" role="presentation" aria-hidden="true" />
        ) : (
          <span>{t('action.generate')}</span>
        )}
        {credits !== null && !submitting ? (
          <span className="omx-avatar-cta-credits">
            <StarIcon />
            {credits.toFixed(2)}
          </span>
        ) : null}
      </button>
    </div>
  )
}
