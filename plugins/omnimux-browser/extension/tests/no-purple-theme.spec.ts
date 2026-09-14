// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * 防复发硬门禁：扩展源码内不得再出现紫色。
 * design.md 规定主行动色为黑白高对比、坚决禁用紫色；历史残留曾散落在填入层、
 * 推特小面板与设置页三处，这里用确定性的源码扫描守住回归。
 */

const SRC_ROOT = resolve(__dirname, '../src')
const SCAN_EXT = ['.ts', '.tsx', '.css']

/** 历史出现过的紫色精确值（hex 与 rgb/rgba 两种写法都拦） */
const PURPLE_DENYLIST = [
  '#a855f7',
  '#8b5cf6',
  '#7c3aed',
  '#9333ea',
  '#c084fc',
  '#a78bfa',
  '#6366f1',
  '#818cf8',
  '#e879f9',
  '#d946ef',
  '#db2777',
  '#7961f2',
  '#6757e7',
  '#5644d6',
  '#ede9fe',
  '#f5f3ff',
  '#250b44',
  '#f3e8ff',
  '168, 85, 247',
  '139, 92, 246',
  '124, 58, 237',
  '147, 51, 234',
  '192, 132, 252',
  '167, 139, 250',
  '99, 102, 241',
  '121, 97, 242',
  '103, 87, 231',
  '86, 68, 214',
  '237, 233, 254',
  '245, 243, 255',
  '37, 11, 68',
  '243, 232, 255',
].map((v) => v.toLowerCase().replace(/\s+/g, ''))

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (SCAN_EXT.some((ext) => entry.endsWith(ext))) acc.push(full)
  }
  return acc
}

function hexToRgb(hex: string): [number, number, number] | null {
  const body = hex.replace('#', '')
  const full = body.length === 3 ? body.split('').map((c) => c + c).join('') : body
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** 饱和度不为零且色相落在紫/洋红区间（240°~300°）即视为紫色家族 */
function isPurpleRgb(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return false
  const s = d / (1 - Math.abs(2 * l - 1))
  if (s < 0.18) return false
  let h: number
  if (max === r / 255) h = 60 * (((g - b) / 255 / d) % 6)
  else if (max === g / 255) h = 60 * ((b - r) / 255 / d + 2)
  else h = 60 * ((r - g) / 255 / d + 4)
  if (h < 0) h += 360
  return h >= 240 && h <= 300 && l * 100 >= 8 && l * 100 <= 98
}

function findPurpleHits(source: string): string[] {
  const hits: string[] = []
  const lowered = source.toLowerCase()

  for (const token of PURPLE_DENYLIST) {
    if (lowered.includes(token)) hits.push(`禁用值 ${token}`)
  }

  const colorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/g
  for (const match of source.matchAll(colorPattern)) {
    const raw = match[0]
    if (raw.startsWith('#')) {
      const rgb = hexToRgb(raw)
      if (rgb && isPurpleRgb(...rgb)) hits.push(`紫色 ${raw}`)
    } else {
      const nums = raw.match(/\d{1,3}/g)
      if (nums && nums.length >= 3) {
        const rgb = nums.slice(0, 3).map(Number) as [number, number, number]
        if (isPurpleRgb(...rgb)) hits.push(`紫色 ${raw})`)
      }
    }
  }

  return Array.from(new Set(hits))
}

describe('扩展主题硬门禁：源码不得出现紫色', () => {
  it('T1: 全量扫描 src/**/*.{ts,tsx,css} 无紫色字面量', () => {
    const offenders: string[] = []

    for (const file of walk(SRC_ROOT)) {
      const source = readFileSync(file, 'utf8')
      const hits = findPurpleHits(source)
      if (hits.length > 0) {
        offenders.push(`${relative(SRC_ROOT, file)} → ${hits.join(' / ')}`)
      }
    }

    expect(offenders, `以下文件仍含紫色，请改用 design.md 的黑白中性/状态色：\n${offenders.join('\n')}`).toEqual([])
  })

  it('T2: 三处历史残留表面已改为黑白口径', () => {
    const panelCss = readFileSync(join(SRC_ROOT, 'panel/styles.css'), 'utf8')
    const domFill = readFileSync(join(SRC_ROOT, 'content/dom-fill.ts'), 'utf8')
    const velocityCss = readFileSync(join(SRC_ROOT, 'content/twitter-velocity/styles.css'), 'utf8')

    // 设置页 Light 主题强调色令牌改为黑白中性
    expect(panelCss).toContain('--blue: #111827')
    expect(panelCss).toContain('--blue-hover: #374151')

    // 网页自动填写：白色描边 + 深色外圈（与助手填入层同一口径）
    expect(domFill).toContain("element.style.outline = '2.5px solid #ffffff'")
    expect(domFill).toContain("element.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.55)'")

    // 推特小面板：曝光数值白色
    expect(velocityCss).toMatch(/\.omnimux-velocity-panel__exposure-val\s*\{[^}]*color: #ffffff/)

    // 三档热度深色分层：半透明底 + 暖→冷色系 + 不出现纯白描边
    expect(velocityCss).toContain('linear-gradient(180deg, rgba(92, 28, 16, 0.6), rgba(46, 14, 9, 0.52))')
    expect(velocityCss).toContain('linear-gradient(180deg, rgba(72, 46, 8, 0.54), rgba(38, 24, 5, 0.48))')
    expect(velocityCss).toContain('background-color: rgba(22, 28, 38, 0.46)')
    expect(velocityCss).toContain('border-color: rgba(255, 122, 74, 0.34)')
    expect(velocityCss).toContain('border-color: rgba(150, 166, 186, 0.22)')
    expect(velocityCss).not.toContain('border-color: #ffffff')
    expect(velocityCss).toContain('backdrop-filter: blur(10px) saturate(115%)')
  })
})
