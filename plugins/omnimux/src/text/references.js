import { normalizeLogicalRequest } from '../catalog/contract/submit-guard/normalize.js'
import { OmnimuxError } from '../media/errors.js'

/** @typedef {import('../catalog/contract/submit-guard/normalize.js').LogicalAsset} TextReference */

/**
 * Keep the canonical list ordered, including intentional repeated references.
 * Legacy fields only append media absent from that list, irrespective of role.
 * Invalid rows must fail instead of disappearing during generic normalization.
 * @param {{ references?: TextReference[], image?: string, video?: string, audio?: string, audioTrack?: object, assetMeta?: object }} input
 * @returns {TextReference[]}
 */
export function normalizeTextReferences(input) {
  if (input.references != null && !Array.isArray(input.references)) {
    throw new OmnimuxError('omnimux-invalid-request', 'references must be an array')
  }
  const references = []
  for (const [index, row] of (input.references ?? []).entries()) {
    const assets = normalizeLogicalRequest({ references: [row], assetMeta: input.assetMeta }).assets
    if (assets.length !== 1 || !['image', 'video', 'audio'].includes(assets[0].type)) {
      throw new OmnimuxError('omnimux-invalid-request', `reference ${index + 1} requires image, video or audio and a pathOrUrl`)
    }
    references.push(assets[0])
  }
  for (const key of ['image', 'video', 'audio']) {
    if (input[key] != null && typeof input[key] !== 'string') {
      throw new OmnimuxError('omnimux-invalid-request', `${key} must be a path or URL`)
    }
  }
  if (input.audioTrack != null && normalizeLogicalRequest({ audioTrack: input.audioTrack }).assets.length !== 1) {
    throw new OmnimuxError('omnimux-invalid-request', 'audioTrack requires a pathOrUrl')
  }
  const legacy = normalizeLogicalRequest({
    image: input.image, audio: input.audio,
    audioTrack: input.audioTrack, assetMeta: input.assetMeta,
    references: input.video?.trim() ? [{ type: 'video', role: 'reference', pathOrUrl: input.video }] : [],
  }).assets
  for (const asset of legacy) {
    if (!references.some((row) => row.type === asset.type && row.pathOrUrl === asset.pathOrUrl)) {
      references.push(asset)
    }
  }
  return references
}
