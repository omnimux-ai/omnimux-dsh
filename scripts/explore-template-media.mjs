import { createHash } from 'node:crypto'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEATURED_APPS_CARDS } from '../plugins/omnimux/src/client/session-guide/templates/featured-apps-data.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const targetFile = 'plugins/omnimux/src/client/session-guide/templates/creative-templates.json'
const sourceFile = 'inspiration-library/video/pippit-marketing-agent.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const APPROVED_SCOPE = { templates: 395, pippitTemplates: 96, pippitVideos: 291, applications: 7 }
const MAX_MEDIA_BYTES = 100 * 1024 * 1024

function assertCount(label, actual, expected) {
  if (actual !== expected) throw new Error(`Approved scope mismatch: ${label} actual=${actual}, expected=${expected}`)
}

/** Plan only: no network, upload, credentials or runtime-local media fallback. */
export async function createExploreMediaPlan(sourceRoot) {
  if (!sourceRoot || !isAbsolute(sourceRoot)) throw new Error('An explicit absolute source root is required')
  const sourceBase = await realpath(sourceRoot)
  const raw = await readFile(resolve(root, targetFile))
  const sourceRaw = await readFile(resolve(sourceBase, sourceFile))
  const templates = JSON.parse(raw)
  const items = JSON.parse(sourceRaw).items
  if (!Array.isArray(templates) || !Array.isArray(items)) throw new Error('Templates and Pippit items must be arrays')
  assertCount('templates', templates.length, APPROVED_SCOPE.templates)
  assertCount('pippitTemplates', items.length, APPROVED_SCOPE.pippitTemplates)
  const byId = new Map(items.map(item => ['tpl-pippit-' + item.id, item]))
  const payloads = new Map()
  const references = []
  async function localPayload(path) {
    if (typeof path !== 'string' || !path || isAbsolute(path)) throw new Error('Invalid source-relative media path')
    const absolute = await realpath(resolve(sourceBase, path))
    const rel = relative(sourceBase, absolute)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Media path escapes source root')
    const info = await stat(absolute)
    if (!info.isFile() || info.size > MAX_MEDIA_BYTES) throw new Error('Invalid media size: ' + path)
    if (info.size < 12) throw new Error(`Media too short: ${path} (${info.size} bytes)`)
    const bytes = await readFile(absolute)
    if (bytes.length < 12) throw new Error(`Media too short: ${path} (${bytes.length} bytes)`)
    const mime = bytes.subarray(4, 8).toString() === 'ftyp' ? 'video/mp4'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp'
      : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : ''
    if (!mime) throw new Error('Unknown media header: ' + path)
    const sha256 = hash(bytes)
    const extension = { 'video/mp4': 'mp4', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[mime]
    const id = 'sha256:' + sha256
    if (!payloads.has(id)) payloads.set(id, { id, sha256, bytes: bytes.length, detectedMime: mime, proposedKey: `templates/explore-v1/sha256/${sha256.slice(0,2)}/${sha256}.${extension}`, sourcePaths: [], rights: 'unknown', status: 'blocked-rights-retention-access', publicUrl: null })
    payloads.get(id).sourcePaths.push(path)
    return id
  }
  function remotePayload(url) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS source references are accepted')
    const id = 'url-sha256:' + hash(url)
    if (!payloads.has(id)) payloads.set(id, { id, sourceUrlHash: hash(url), sourceLocation: parsed.origin + parsed.pathname, declaredType: /\.(mp4|webm|mov)$/i.test(parsed.pathname) ? 'video' : 'image', rights: 'unknown', status: 'blocked-source-validation-rights-retention-access', publicUrl: null })
    return id
  }
  for (const template of templates) {
    const refs = { templateId: template.id, sourcePlatform: template.sourcePlatform, cover: null, preview: null, variants: [], source: { file: targetFile, id: template.id } }
    if (template.sourcePlatform === 'pippit') {
      const item = byId.get(template.id)
      if (!item) throw new Error('Pippit source missing: ' + template.id)
      if (!Array.isArray(item.media)) throw new Error('Pippit media must be an array: ' + template.id)
      refs.source = { file: sourceFile, id: item.id }
      refs.cover = await localPayload(item.localCoverPath)
      for (const [index, media] of item.media.entries()) {
        if (!media || typeof media !== 'object') throw new Error(`Invalid Pippit media: ${template.id}[${index}]`)
        if (media.kind !== 'video') continue
        const payloadId = await localPayload(media.localVideoPath)
        if (payloads.get(payloadId).detectedMime !== 'video/mp4') throw new Error('Video source is not an MP4')
        refs.variants.push({ sourceIndex: index, payloadId })
      }
      if (!refs.variants.length) throw new Error('Pippit video variants missing: ' + template.id)
      refs.preview = refs.variants[0].payloadId
    } else {
      if (template.thumbnailUrl) refs.cover = remotePayload(template.thumbnailUrl)
      if (template.previewVideoUrl) {
        const id = remotePayload(template.previewVideoUrl)
        if (payloads.get(id).declaredType === 'video') refs.preview = id
        else refs.staticPreview = id
      }
    }
    references.push(refs)
  }
  const applications = FEATURED_APPS_CARDS.map(app => ({ appId: app.appId, cover: remotePayload(app.coverUrl), preview: remotePayload(app.previewVideoUrl) }))
  const physical = [...payloads.values()].map(p => p.sourcePaths ? { ...p, sourcePaths: [...new Set(p.sourcePaths)].sort() } : p).sort((a,b) => a.id.localeCompare(b.id))
  const pippit = references.filter(r => r.sourcePlatform === 'pippit')
  assertCount('applications', applications.length, APPROVED_SCOPE.applications)
  assertCount('pippitTemplates', pippit.length, APPROVED_SCOPE.pippitTemplates)
  assertCount('pippitVideos', pippit.reduce((n,r)=>n+r.variants.length,0), APPROVED_SCOPE.pippitVideos)
  return { schemaVersion: 1, mode: 'offline-plan', inputHashes: { templates: hash(raw), pippit: hash(sourceRaw) }, target: { bucket: 'omnimux-files', prefix: 'templates/explore-v1/sha256/', status: 'not-authorized-for-publication' }, selectionRule: 'first kind=video in original media array order', summary: { templates: references.length, applications: applications.length, pippitTemplates: pippit.length, pippitVideos: pippit.reduce((n,r)=>n+r.variants.length,0), staticTemplates: references.filter(r=>!r.preview).length, localBytes: physical.reduce((n,p)=>n+(p.bytes||0),0), uploaded: 0, verifiedPublic: 0 }, references, applications, payloads: physical }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 4 || args[0] !== '--source-root' || args[2] !== '--output') throw new Error('Usage: node scripts/explore-template-media.mjs --source-root ABSOLUTE_PATH --output TASK_REPORT_PATH')
    const output = resolve(args[3])
    const rel = relative(root, output)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Output must stay inside the task repository')
    const plan = await createExploreMediaPlan(args[1])
    await writeFile(output, JSON.stringify(plan, null, 2) + '\n')
    console.log(JSON.stringify(plan.summary))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
