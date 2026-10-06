/**
 * Reports basic "is this a real screenshot, not a blank page" statistics for
 * the #3178 acceptance PNGs: dimensions, byte size, unique colours, luminance
 * standard deviation, and the share of non-white pixels.
 *
 * Usage: node png-stats.mjs <file.png> [...]
 * Requires pngjs, resolved from the worktree's node_modules.
 */
import { readFileSync, statSync } from 'node:fs'
import { PNG } from 'pngjs'

const out = []
for (const file of process.argv.slice(2)) {
  const png = PNG.sync.read(readFileSync(file))
  const { width, height, data } = png
  let sum = 0
  let sumSq = 0
  let n = 0
  let nonWhite = 0
  const colors = new Set()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sum += lum
    sumSq += lum * lum
    n++
    if (r < 245 || g < 245 || b < 245) nonWhite++
    if (colors.size < 60000) colors.add((r << 16) | (g << 8) | b)
  }
  const mean = sum / n
  out.push({
    file: file.split('/').pop(),
    bytes: statSync(file).size,
    width,
    height,
    uniqueColors: colors.size,
    meanLuminance: +mean.toFixed(2),
    luminanceStdDev: +Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(2),
    nonWhitePixelPct: +((nonWhite / n) * 100).toFixed(2),
  })
}
console.log(JSON.stringify(out, null, 1))
