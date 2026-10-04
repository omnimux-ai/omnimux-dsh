/**
 * Cloud row -> preview modal item.
 *
 * A cloud row is a catalog descriptor, not a library record: it has no file
 * list, no local path and no extension, so the modal is handed the one URL the
 * Host can serve for it, plus the row's own description. A text row keeps its
 * whole description in `description`, which is what the modal shows as the full
 * text instead of the grid's two-line clamp.
 *
 * Kept free of React and `fetch` so the translation is testable on its own.
 */
import { cloudMediaUrl } from './api.js'
import { isOfficialVoicePreviewAsset, isOfficialVoicePreviewPlayable } from './cloud-feed-helpers.js'

/**
 * Media type -> the kind the preview modal switches on.
 * @param {string} mediaType
 * @returns {'image' | 'video' | 'audio' | 'file'}
 */
export function previewKindOf(mediaType) {
  if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') return mediaType
  return 'file'
}

/**
 * Build the modal's item for one cloud row.
 *
 * The id is namespaced (`cloud:<row id>`) so an open preview can never be
 * confused with a library record that happens to share the row's id; the bare
 * row id travels separately in `sourceAssetId`, which is what a save needs.
 * @param {any} asset normalized cloud row (see `normalizeCloudAsset`)
 * @returns {{
 *   id: string,
 *   title: string,
 *   kind: 'image' | 'video' | 'audio' | 'file',
 *   previewUrl: string,
 *   extension: string,
 *   pathInfo: string,
 *   text: string,
 *   sourceAssetId: string,
 *   cloud: boolean,
 *   sourceAsset: any,
 * } | null}
 */
export function cloudAssetToPreviewItem(asset) {
  const rowId = String(asset?.id ?? '')
  if (rowId === '') return null
  // Issue #3058: an unverified official voice preview is a text detail — its
  // body is the row description, never an unsupported-media placeholder even
  // if a stray media locator slipped in. Verified rows stream as audio.
  const unverifiedVoice = isOfficialVoicePreviewAsset(asset) && !isOfficialVoicePreviewPlayable(asset)
  const kind = unverifiedVoice ? 'file' : previewKindOf(asset?.mediaType)
  const description = String(asset?.description ?? '')
  // Issue #3058（OCR #11）：已验证官方音色直接读 DTO primary 官方 CDN 直链——
  // 详情不绕 media 路由的 302，DTO-only 行（media_url 为空）同样可播。
  const officialAudioUrl = kind === 'audio' && isOfficialVoicePreviewPlayable(asset)
    ? String(asset.preview.primary_url)
    : ''
  return {
    id: `cloud:${rowId}`,
    title: String(asset?.name ?? ''),
    kind,
    // A text row has nothing to stream: its body is the description.
    previewUrl: kind === 'file' ? '' : (officialAudioUrl || cloudMediaUrl(rowId, 'media')),
    extension: '',
    pathInfo: '',
    text: kind === 'file' ? description : '',
    sourceAssetId: rowId,
    cloud: true,
    sourceAsset: asset,
    // The preview DTO must reach the modal so its actions can be gated on
    // purpose — never on the display name or the row id.
    preview: asset?.preview ?? null,
  }
}
