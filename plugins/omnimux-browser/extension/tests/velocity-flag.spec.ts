// @vitest-environment jsdom
/**
 * X 爆速角标开关：storage 契约（键名 / 默认值 / 非法值不带半开状态）。
 *
 * 内容脚本的实际挂载行为已实机验证（关闭 → 时间线角标 0 个；开启 → 7 个），
 * 证据见 .workbuddy/evidence/velocity-badge-toggle/verify.md；此处固化开关契约，
 * 防止键名或默认值被改坏后实机行为静默漂移。
 */
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAG, isFeatureFlagKey, parseFlagValue, readFlagSync } from '../src/feature-flags.ts'

describe('X 爆速角标开关', () => {
  it('T1: 键名纳入 feature-flags 白名单', () => {
    expect(FEATURE_FLAG.velocity).toBe('omnimux_velocity_badge_enabled')
    expect(isFeatureFlagKey(FEATURE_FLAG.velocity)).toBe(true)
    expect(isFeatureFlagKey('omnimux_unknown_flag')).toBe(false)
  })

  it('T2: 默认开启（用户没关过就必须显示）', () => {
    expect(parseFlagValue(undefined)).toBe(true)
    expect(readFlagSync(FEATURE_FLAG.velocity)).toBe(true)
  })

  it('T3: 显式关闭与非法值', () => {
    expect(parseFlagValue(false)).toBe(false)
    expect(parseFlagValue('false')).toBe(false)
    expect(parseFlagValue('garbage')).toBe(true)
  })
})
