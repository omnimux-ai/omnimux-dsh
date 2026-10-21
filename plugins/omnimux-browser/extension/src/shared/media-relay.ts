/**
 * Media byte relay plan: split a whole media buffer into ordered byte ranges that
 * the content script reads, base64-encodes and hands to the background.
 *
 * Kept pure so the 1MB boundary logic is unit-testable outside a browser.
 *
 * @module
 */

/** Raw bytes per relayed chunk. 1MB → ≈1.37MB base64, under the host 2MB JSON cap. */
export const RELAY_CHUNK_BYTES = 1024 * 1024

/** One chunk's byte range and whether it closes the file. */
export interface RelayChunkRange {
  readonly seq: number
  readonly start: number
  readonly end: number
  readonly final: boolean
}

/**
 * Ordered byte ranges for one media file.
 *
 * A zero-length buffer still gets one (empty, final) range so the host records a
 * completed-but-empty file and rejects it explicitly instead of hanging forever.
 * @param totalBytes whole-file byte length
 * @param chunkBytes raw bytes per chunk
 */
export function planRelayChunks(totalBytes: number, chunkBytes = RELAY_CHUNK_BYTES): RelayChunkRange[] {
  const size = Number.isFinite(chunkBytes) && chunkBytes > 0 ? Math.floor(chunkBytes) : RELAY_CHUNK_BYTES
  const total = Number.isFinite(totalBytes) && totalBytes > 0 ? Math.floor(totalBytes) : 0
  if (total === 0) return [{ seq: 0, start: 0, end: 0, final: true }]
  const ranges: RelayChunkRange[] = []
  let start = 0
  let seq = 0
  while (start < total) {
    const end = Math.min(start + size, total)
    ranges.push({ seq, start, end, final: end >= total })
    start = end
    seq += 1
  }
  return ranges
}

/** JSON-safe summary of a relayed media file. */
export interface RelayedMediaSummary {
  readonly index: number
  readonly bytes: number
  readonly chunks: number
}
