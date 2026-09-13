// @vitest-environment jsdom
/**
 * Brand micro-mark contract.
 *
 * The capsule's stage-one trigger must be the *official* OmniMux ghost. An
 * earlier revision was a hand-drawn approximation (narrower body, circular
 * eyes) and read as a different character next to the real logo.
 *
 * The digest below is the anti-redraw lock. The mark is a transcription of
 * `assets/ip_design/octo_ghost_vector.svg` under one exact affine transform,
 * verified by rasterising the candidate against a reference render of the
 * official path: identical ink bbox `198x240+21+0` at 240px, normalised RMSE
 * 0.0004 over 57600 pixels, both eye holes fully formed from 24px up. Changing
 * this digest is only legitimate together with a fresh run of that comparison.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SVG_FILLED_ROOT_ATTRS, svgIcon } from '../src/content/media-hover/overlay-icons.ts'

/** sha256 of the transcribed path, produced by the brand verification script. */
const OFFICIAL_PATH_SHA256 = '781710a580b35f9bf0a211b1d962203f898ea6a12780f4b71775adc89db75608'

/** The `d` attribute the capsule actually renders, read from the real markup. */
function brandPathD(): string {
  const match = svgIcon('brand', 20).match(/<path d="([^"]+)"\/>/)
  expect(match).not.toBeNull()
  return (match as RegExpMatchArray)[1]
}

/** One `M ... Z` drawing command, reduced to the points it reaches. */
interface Subpath {
  /** On-curve endpoints, in declaration order. */
  points: Array<[number, number]>
  /** Radii of every arc, so a capsule can be told from a circle. */
  arcs: Array<{ rx: number; ry: number }>
  lines: number
}

/**
 * Walks the path commands.
 *
 * A regex over the numbers is not enough here: an arc carries three flags
 * between its radii and its endpoint, so naive pairing reads `0 0 1` as
 * coordinates and reports a body-width eye. The parser below tracks each
 * command's own argument count instead.
 */
function parsePath(d: string): Subpath[] {
  const tokens = d.match(/[MmLlCcAaZzHhVv]|-?\d*\.?\d+/g) ?? []
  let index = 0
  const next = (): number => Number(tokens[index++])
  const subpaths: Subpath[] = []
  let current: Subpath | null = null
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0

  while (index < tokens.length) {
    const command = tokens[index]
    index += 1
    if (command === 'M' || command === 'm') {
      let x = next()
      let y = next()
      if (command === 'm') {
        x += cx
        y += cy
      }
      cx = x
      cy = y
      startX = x
      startY = y
      current = { points: [[x, y]], arcs: [], lines: 0 }
      subpaths.push(current)
    } else if (command === 'Z' || command === 'z') {
      cx = startX
      cy = startY
    } else if (command === 'L' || command === 'l') {
      let x = next()
      let y = next()
      if (command === 'l') {
        x += cx
        y += cy
      }
      cx = x
      cy = y
      current?.points.push([x, y])
      if (current !== null) current.lines += 1
    } else if (command === 'A' || command === 'a') {
      const rx = next()
      const ry = next()
      next() // x-axis rotation
      next() // large-arc flag
      next() // sweep flag
      let x = next()
      let y = next()
      if (command === 'a') {
        x += cx
        y += cy
      }
      cx = x
      cy = y
      current?.points.push([x, y])
      current?.arcs.push({ rx, ry })
    } else if (command === 'C' || command === 'c') {
      for (let step = 0; step < 3; step += 1) {
        let x = next()
        let y = next()
        if (command === 'c') {
          x += cx
          y += cy
        }
        cx = x
        cy = y
      }
    } else {
      throw new Error(`unhandled path command: ${String(command)}`)
    }
  }
  return subpaths
}

/** Bounding box of the on-curve endpoints of one subpath. */
function spanOf(subpath: Subpath): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = subpath.points.map(([x]) => x)
  const ys = subpath.points.map(([, y]) => y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

/** The three subpaths of the rendered mark: body, left eye, right eye. */
function markSubpaths(): Subpath[] {
  return parsePath(brandPathD())
}

describe('official brand mark', () => {
  it('renders the transcription byte-for-byte', () => {
    const path = brandPathD()
    expect(path).toHaveLength(2256)
    expect(createHash('sha256').update(path).digest('hex')).toBe(OFFICIAL_PATH_SHA256)
    // The retired hand-drawn mark, in the shape it was written: a quad-curved
    // body with two circular eyes. None of it may come back.
    expect(path).not.toContain('Q8.4 21')
    expect(path).not.toContain('a1.15 1.15')
  })

  it('paints the body and both eyes out of a single path', () => {
    // One `path` is what lets a single `fill-rule="evenodd"` cut the eye holes;
    // separate elements would each fill and the eyes would vanish at 20px.
    expect(svgIcon('brand', 20).match(/<path/g)).toHaveLength(1)
    expect(markSubpaths()).toHaveLength(3)
  })

  it('carves two vertical capsule eyes, not circles', () => {
    const eyes = markSubpaths().slice(1)
    expect(eyes).toHaveLength(2)
    for (const eye of eyes) {
      // Two 180-degree arcs of the official radius plus the straight flank.
      expect(eye.arcs).toHaveLength(2)
      expect(eye.lines).toBe(1)
      for (const arc of eye.arcs) {
        expect(arc.rx).toBeCloseTo(0.9526, 4)
        expect(arc.ry).toBeCloseTo(0.9526, 4)
      }
      const span = spanOf(eye)
      const width = span.maxX - span.minX
      const height = span.maxY - span.minY
      // The official rect is 75 x 172 with rx = 37.5: `rx = w / 2` makes it a
      // perfect capsule, so it must be visibly taller than it is wide.
      expect(width).toBeCloseTo(1.9053, 3)
      expect(height).toBeCloseTo(2.4641, 3)
      expect(height).toBeGreaterThan(width)
    }
  })

  it('is horizontally centred on the 24-unit grid and left/right symmetric', () => {
    const eyes = markSubpaths().slice(1)
    const centres = eyes.map((eye) => {
      const span = spanOf(eye)
      return (span.minX + span.maxX) / 2
    })
    // The official artwork carries a 1.25-unit asymmetry across 1254 (the left
    // eye sits 209.75 from the ink edge, the right 211), which is 0.03 units
    // here; anything larger means the eyes were placed by hand.
    expect(Math.abs((centres[0] + centres[1]) / 2 - 12)).toBeLessThan(0.05)
    expect(centres[0]).toBeLessThan(12)
    expect(centres[1]).toBeGreaterThan(12)
    // The eyes stay inside the drawing grid, never overhanging the viewBox.
    for (const eye of eyes) {
      const span = spanOf(eye)
      expect(span.minX).toBeGreaterThan(0)
      expect(span.maxX).toBeLessThan(24)
      expect(span.minY).toBeGreaterThan(0)
      expect(span.maxY).toBeLessThan(24)
    }
  })

  it('keeps the filled silhouette contract the stylesheet colours', () => {
    const markup = svgIcon('brand', 20)
    expect(markup.startsWith(`<svg ${SVG_FILLED_ROOT_ATTRS} width="20" height="20">`)).toBe(true)
    // `currentColor` is what lets CSS drive the mark; a hard-coded fill would
    // freeze the brand colour against every capsule state.
    expect(SVG_FILLED_ROOT_ATTRS).toContain('fill="currentColor"')
    expect(SVG_FILLED_ROOT_ATTRS).toContain('fill-rule="evenodd"')
    expect(SVG_FILLED_ROOT_ATTRS).toContain('stroke="none"')
    expect(markup).not.toContain('#')
  })

  it('renders at both capsule sizes', () => {
    for (const size of [20, 24]) {
      const markup = svgIcon('brand', size)
      expect(markup).toContain(`width="${size}" height="${size}"`)
    }
  })
})
