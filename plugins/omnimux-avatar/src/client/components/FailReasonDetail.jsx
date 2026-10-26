// 任务失败原因的中文化呈现 + 原始错误的可展开详情。
//
// 来源：OmniMux/web/src/features/influencer/components/fail-reason-detail.tsx
// 与 web/src/features/influencer/lib/fail-reason.ts（只读真源，行为对齐，文案与映射表自建）。
//
// 为什么需要这一层：任务记录的 fail_reason 是自由文本——本插件自己的服务端错误已经是中文，
// 但上游提供方回传的常常是英文（超时、任务不存在、查询失败之类）。原样渲染会让中文界面里
// 冒出一句英文；反过来把它吞掉，用户和排查的人又都拿不到真实原因。
//
// 因此分三类处理，不猜、不编：
//   1. 已经是中文的原因 → 原样作为主文案（没有更多信息，就不给详情入口）。
//   2. 已知的英文原因 → 映射成中文主文案，原文留在详情里。
//   3. 未知文本 → 主文案给通用中文失败句，原文完整留在详情里（绝不吞掉）。

import { useState } from 'react'

/**
 * 已知英文原因 → 中文主文案。
 *
 * 只登记本插件与中枢实际会产出的说法；上游新增说法落进「未知」分支，
 * 走通用主文案 + 原文详情，不会因为表里没有就丢信息。
 * @type {[RegExp, string][]}
 */
const KNOWN_REASONS = [
  [/^(task|upstream task) timed out\b/i, '生成超时，请重新生成'],
  [/^upstream task not found\b/i, '上游任务不存在'],
  [/^failed to query the upstream task status\b/i, '查询上游任务状态失败'],
  [/^failed to get the channel information\b/i, '获取渠道信息失败'],
  [/^could not (submit|analy[sz]e)\b/i, '提交任务失败，请重试'],
  [/^(upload|file upload) failed\b/i, '文件上传失败，请重试'],
  [/^(generation|request|task) failed\b/i, '生成失败，请重试'],
  [/^something went wrong\b/i, '生成失败，请重试'],
  [/^needs-provider\b/i, '生成渠道不可用'],
  [/^generation-failed\b/i, '生成失败，请重试'],
]

/** 通用失败主文案（未知原因与空原因都用它）。 */
const GENERIC_KEY = '生成失败，请重试'

/** 含中日韩字符即视为已经中文化，不再翻译也不再加一层详情。 */
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/

/**
 * 把任务记录里的失败原因解析成可渲染的视图。
 *
 * @param {(key: string) => string} t
 * @param {unknown} raw 任务记录的 fail_reason / error
 * @returns {{ message: string, raw: string, showDetail: boolean, kind: 'known'|'unknown'|'empty' }}
 */
export function describeFailReason(t, raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return { message: t(GENERIC_KEY), raw: '', showDetail: false, kind: 'empty' }

  // 1. 已经是中文：主文案就是它本身，没有额外信息可展开。
  if (CJK.test(text)) return { message: text, raw: text, showDetail: false, kind: 'known' }

  // 2. 已知英文原因：主文案中文化，原文仍可展开。
  for (const [pattern, zh] of KNOWN_REASONS) {
    if (pattern.test(text)) return { message: t(zh), raw: text, showDetail: true, kind: 'known' }
  }

  // 3. 未知文本：通用主文案 + 完整原文详情。
  return { message: t(GENERIC_KEY), raw: text, showDetail: true, kind: 'unknown' }
}

/**
 * 失败原因的次级披露：主文案永远是中文，原文一次点击可达。
 *
 * @param {{
 *   view: ReturnType<typeof describeFailReason>,
 *   t: (key: string) => string,
 *   className?: string,
 * }} props
 */
export function FailReasonDetail(props) {
  const { view, t, className } = props
  const [open, setOpen] = useState(false)
  if (!view?.showDetail) return null
  return (
    <div className={className ? `omx-avatar-fail-detail ${className}` : 'omx-avatar-fail-detail'}>
      <button /* exempt-ui01: 展开详情是纯文字披露控件，外观由 omx-avatar-fail-more 类独占 */
        type='button'
        className='omx-avatar-fail-more'
        aria-expanded={open}
        onClick={(event) => {
          // 失败卡本身可能整块可点（打开预览），详情不能顺带把预览也打开。
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        {t('查看失败原因')}
      </button>
      {open ? (
        <div className='omx-avatar-fail-raw' role='region' aria-label={t('原始错误')}>
          {view.raw}
        </div>
      ) : null}
    </div>
  )
}
