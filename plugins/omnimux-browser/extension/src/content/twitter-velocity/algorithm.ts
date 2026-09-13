import type { VelocityTier } from './types.ts'

export const HOURS_ALIVE_MIN = 1 / 60
export const HOURS_ALIVE_MAX = 48
export const VIRAL_PACE_THRESHOLD = 8000
export const SURGING_PACE_THRESHOLD = 1000

export const TIME_DECAY_MAX = 6
export const TIME_DECAY_MIN = 1.2
export const TIME_DECAY_RATE = 0.35

export const FRESHNESS_MAX = 1.28
export const FRESHNESS_MIN = 0.55
export const FRESHNESS_DIVISOR = 18

export const COMPETITION_BASE = 1.14
export const COMPETITION_REPLY_WEIGHT = 0.22
export const COMPETITION_MAX = 1.08
export const COMPETITION_MIN = 0.42

export const EXPOSURE_BASE_RATE = 0.04
export const EXPOSURE_FLOOR = 20

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

export function toHoursAlive(nowMs: number, createdAtMs: number): number {
  const rawHours = (nowMs - createdAtMs) / 3_600_000
  return clamp(rawHours, HOURS_ALIVE_MIN, HOURS_ALIVE_MAX)
}

export function classifyTier(pace: number): VelocityTier {
  if (pace > VIRAL_PACE_THRESHOLD) return 'viral'
  if (pace >= SURGING_PACE_THRESHOLD) return 'surging'
  return 'normal'
}

export function computeExposure(pace: number, hoursAlive: number, replies: number): number {
  const timeDecay = clamp(
    TIME_DECAY_MAX - hoursAlive * TIME_DECAY_RATE,
    TIME_DECAY_MIN,
    TIME_DECAY_MAX,
  )
  const freshnessBonus = clamp(
    FRESHNESS_MAX - hoursAlive / FRESHNESS_DIVISOR,
    FRESHNESS_MIN,
    FRESHNESS_MAX,
  )
  const competition = clamp(
    COMPETITION_BASE - Math.log10(Math.max(0, replies) + 1) * COMPETITION_REPLY_WEIGHT,
    COMPETITION_MIN,
    COMPETITION_MAX,
  )

  const raw = pace * timeDecay * freshnessBonus * competition * EXPOSURE_BASE_RATE
  return Math.max(EXPOSURE_FLOOR, Math.round(Number.isFinite(raw) ? raw : 0))
}

export function formatMetricNumber(num: number): string {
  if (!Number.isFinite(num)) return '0'
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(num >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`
  }
  return String(Math.round(num))
}
