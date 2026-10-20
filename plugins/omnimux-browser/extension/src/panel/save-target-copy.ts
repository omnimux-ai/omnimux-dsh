/**
 * 保存按钮与 toast 文案：按「保存目标 + 状态」查表，避免把中英文案散落在 JSX 里。
 *
 * 文案是 spec §4 的硬契约：账号主页保存后必须说明「已加入账号监控」，作品保存维持
 * 灵感库原文案；失败态永远不使用成功文案（绝不假成功）。这里不依赖 React 或 DOM，
 * 面板和单测调用的是同一份映射。
 *
 * @module
 */

import type { UiLocale } from '../i18n.ts'

/** 保存动作的目标：账号监控或灵感库。与后台 `save-target.ts` 的 SaveTarget 同义。 */
export type SaveTarget = 'account' | 'inspiration'

/** 保存按钮的生命周期状态。 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

export interface SaveButtonCopyInput {
  /** 按钮文案跟随的目标；成功态应传入实际落库目标。 */
  target: SaveTarget
  status: SaveStatus
  locale: UiLocale
}

function localized(locale: UiLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

/**
 * 把 handle 规整成展示用的 `@name`：剥掉多余前缀再补一个，空 handle 返回空串。
 * host 的 handle 已经带 `@`，主题模板也带 `@`，不去重就会渲染成 `@@name`。
 */
export function accountHandleLabel(handle: string | undefined): string {
  const bare = typeof handle === 'string' ? handle.trim().replace(/^@+/, '') : ''
  return bare === '' ? '' : `@${bare}`
}

/**
 * sticky bar 与 hero 药丸共用的按钮文案。
 *
 * `failed` 与 `idle` 相同：失败后按钮回到可重试的动作文案，不能停在成功态。
 */
export function saveButtonLabel(input: SaveButtonCopyInput): string {
  const { target, status, locale } = input
  if (status === 'saving') return localized(locale, '保存中...', 'Saving...')
  if (status === 'saved') {
    return target === 'account'
      ? localized(locale, '✓ 已加入账号监控', '✓ Added to monitor')
      : localized(locale, '✓ 已保存到灵感库', '✓ Saved to Inspiration Library')
  }
  return target === 'account'
    ? localized(locale, '保存账号到监控', 'Save account to monitor')
    : localized(locale, '保存到灵感库', 'Save to Inspiration Library')
}

export interface SaveSuccessCopyInput {
  target: SaveTarget
  /** 账号目标才有：host 返回的 handle（已带或未带 `@` 均可）。 */
  handle?: string
  /** 账号目标才有：该账号此前已在监控中。 */
  existing?: boolean
  /** 账号目标才有：host 分类出的平台，用来决定 handle 是否可读。 */
  platform?: string
}

/**
 * 只有不透明 uid、没有可读 handle 的平台。
 *
 * 抖音 sec_uid / 小红书 user_id 是一串 base64 或哈希，toast 里拼成 `@MS4wLjAB…`
 * 只会让人误以为那是用户名；账号行本身仍显示该 id 作为唯一身份。
 */
const UID_ONLY_PLATFORMS = new Set(['douyin', 'xiaohongshu'])

/** 保存成功后的 toast。 */
export function saveSuccessToast(input: SaveSuccessCopyInput, locale: UiLocale): string {
  if (input.target === 'account') {
    if (input.existing === true) {
      return localized(locale, '该账号已在账号监控中', 'Already in account monitor')
    }
    const uidOnly = UID_ONLY_PLATFORMS.has(String(input.platform || '').toLowerCase())
    const handle = uidOnly ? '' : accountHandleLabel(input.handle)
    return handle === ''
      ? localized(locale, '已加入账号监控', 'Added to account monitor')
      : localized(locale, `已加入账号监控：${handle}`, `Added to account monitor: ${handle}`)
  }
  return localized(locale, '已保存到 OmniMux 灵感素材库！', 'Saved to Inspiration Library!')
}

/**
 * 保存失败后的 toast。
 *
 * `local-header-overflow` 是 431 的专门解释：host 在跑，问题在 127.0.0.1 残留 cookie，
 * 不能笼统说成「请检查 OmniMux 运行状态」。
 */
export function saveFailureToast(code: string | undefined, locale: UiLocale): string {
  if (code === 'local-header-overflow') {
    return localized(
      locale,
      '保存失败：127.0.0.1 残留 cookie 过多（请求头超限），请清理该站点数据后重试',
      "Failed to save: too many leftover cookies for 127.0.0.1. Clear that site's data and retry.",
    )
  }
  return localized(locale, '保存失败，请检查 OmniMux 运行状态', 'Failed to save (check OmniMux server)')
}
