// @vitest-environment jsdom
/**
 * Which side of the trigger the toolbar opens on.
 *
 * The decision is pure arithmetic over three measured numbers, so it is tested
 * as arithmetic: the cases below pin the preference rule, the confirmation of the
 * chosen side against the exact box it would occupy, and the clamp that keeps the
 * toolbar inside the viewport. Two of them matter most: `中心到右缘够、实际盒
 * 放不下` — a rule that looked only at the room to the right of the button's
 * centre would open the toolbar off-screen there — and the clamp landing on the
 * button, which leaves the trigger unclickable unless the other side is preferred.
 */

import { describe, it, expect } from 'vitest'
import { resolveMenuSide } from '../src/content/tiktok-scene/menu-side.ts'

/**
 * The width the toolbar renders at, used as the measured value throughout.
 *
 * 226, not the 204 an earlier version of this file used: it is the stylesheet's
 * own arithmetic — three 68px columns, two 4px gaps, two 6px paddings and two 1px
 * borders — and it is the same number `menu.ts` falls back to. The two are held
 * equal by `tests/tiktok-menu.spec.ts`, which reads those numbers out of the
 * stylesheet.
 */
const W = 226

describe('菜单方向 — 默认靠右', () => {
  it('⑥ 右侧空间充裕时贴着按钮右缘展开 (AC-401)', () => {
    expect(resolveMenuSide({ buttonLeft: 20, buttonBox: 48, menuWidth: W, viewportWidth: 1920 }))
      .toEqual({ side: 'right', left: 20 + 48 })
  })

  it('刚好放得下时仍靠右（边界取等号）', () => {
    // 按钮 100..148，菜单 328 宽时右缘正好落在视口右缘 476 上。
    expect(resolveMenuSide({ buttonLeft: 100, buttonBox: 48, menuWidth: 328, viewportWidth: 476 }))
      .toEqual({ side: 'right', left: 148 })
  })
})

describe('菜单方向 — 右侧不足则翻左', () => {
  it('⑦ 按钮贴右缘时翻左，菜单右缘对齐按钮左缘 (AC-402)', () => {
    // 实测 C 的形状：视口 430，按钮 379..427。
    expect(resolveMenuSide({ buttonLeft: 379, buttonBox: 48, menuWidth: W, viewportWidth: 430 }))
      .toEqual({ side: 'left', left: 379 - W })
  })

  it('⑦ 翻左后整块菜单仍在视口内 (AC-405)', () => {
    const placement = resolveMenuSide({ buttonLeft: 379, buttonBox: 48, menuWidth: W, viewportWidth: 430 })
    expect(placement.left).toBeGreaterThanOrEqual(0)
    expect(placement.left + W).toBeLessThanOrEqual(430)
  })

  it('双向校验：中心到右缘够，但实际盒子放不下 —— 仍然翻左 (AC-404)', () => {
    // 中心 374 到右缘 56 ≥ 菜单宽 40，只看这个量会判「够」；
    // 实际盒子 398+40 = 438 > 430，放不下，所以必须翻左。
    expect(resolveMenuSide({ buttonLeft: 350, buttonBox: 48, menuWidth: 40, viewportWidth: 430 }))
      .toEqual({ side: 'left', left: 310 })
  })

  it('左侧也放不下时，钳在视口内而不是照搬候选位 (AC-405)', () => {
    const placement = resolveMenuSide({ buttonLeft: 100, buttonBox: 48, menuWidth: 400, viewportWidth: 430 })
    expect(placement.left).toBeGreaterThanOrEqual(0)
    expect(placement.left + 400).toBeLessThanOrEqual(430)
  })

  it('菜单比视口还宽时不出现负坐标', () => {
    expect(resolveMenuSide({ buttonLeft: 10, buttonBox: 48, menuWidth: 600, viewportWidth: 430 }))
      .toEqual({ side: 'right', left: 0 })
  })

  it('钳位把面板压到按钮上时，改取盖得少的那一侧（按钮中心仍露在外面）', () => {
    // 评审实测的形态：按钮 379..427，面板被长文件名撑到 400 宽，视口 430。
    // 右侧候选被钳到 30 → 面板 30..430，整块盖住按钮；左侧候选钳到 0 →
    // 面板 0..400，只压住按钮左边 21px，按钮中心 403 仍然可点。
    const placement = resolveMenuSide({ buttonLeft: 379, buttonBox: 48, menuWidth: 400, viewportWidth: 430 })

    // 报出来的方向必须与真实落位一致，不能再是「压在按钮上却报 right」。
    expect(placement).toEqual({ side: 'left', left: 0 })
    expect(placement.left + 400).toBeLessThanOrEqual(430)
    expect(placement.left + 400).toBeLessThanOrEqual(379 + 48 / 2)
  })

  it('按钮不在视口内时钳位不把面板推到按钮上（负 left 的按钮）', () => {
    // 按钮整个在视口左侧之外：面板贴着视口左缘，与按钮的残余部分不重叠。
    const placement = resolveMenuSide({ buttonLeft: -100, buttonBox: 48, menuWidth: W, viewportWidth: 1000 })
    expect(placement).toEqual({ side: 'right', left: 0 })
  })
})

describe('菜单方向 — 判定依据是测量值，不是固定阈值', () => {
  it('同一按钮，菜单越宽越可能翻左 (AC-403)', () => {
    const at = (menuWidth: number) =>
      resolveMenuSide({ buttonLeft: 200, buttonBox: 48, menuWidth, viewportWidth: 430 })

    expect(at(150).side).toBe('right')
    expect(at(W).side).toBe('left')
  })

  it('同一按钮，视口越窄越可能翻左', () => {
    const at = (viewportWidth: number) =>
      resolveMenuSide({ buttonLeft: 379, buttonBox: 48, menuWidth: W, viewportWidth })

    expect(at(1920).side).toBe('right')
    expect(at(430).side).toBe('left')
  })

  it('宽度为 0（尚未渲染出尺寸）时按最窄处理', () => {
    expect(resolveMenuSide({ buttonLeft: 20, buttonBox: 48, menuWidth: 0, viewportWidth: 430 }))
      .toEqual({ side: 'right', left: 68 })
  })
})
