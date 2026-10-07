/**
 * Domain error for the omnimux-video plugin.
 *
 * Tools and the `videoProcess` seam throw `VideoError` on failure —
 * they never return `{ ok: false }` as a successful value (fail-closed).
 *
 * @property {string} code    stable machine code (see README error table)
 * @property {string} message human-readable message
 * @property {string} [hint]  extra actionable hint
 * @property {string} [stderrTail] truncated ffmpeg/ffprobe stderr tail
 * @property {string} [upstreamCode] code before this layer re-mapped it, so a
 *   replaced code stays machine-readable downstream
 */
export class VideoError extends Error {
  constructor(code, message, extra) {
    super(message)
    this.name = 'VideoError'
    this.code = code
    if (extra && typeof extra === 'object') {
      if (extra.hint !== undefined) this.hint = extra.hint
      if (extra.stderrTail !== undefined) this.stderrTail = extra.stderrTail
      if (extra.upstreamCode !== undefined) this.upstreamCode = extra.upstreamCode
    }
  }
}