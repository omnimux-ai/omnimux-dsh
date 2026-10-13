import { randomUUID, createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { join, sep } from 'node:path'
import { avatarDirOf } from './paths.js'
import { AvatarError } from './store.js'
import { resolveAvatarArtifact,resolveAvatarDestination } from './artifact.js'

const LIMITS = { 'image/png': 5 * 1024 * 1024, 'image/jpeg': 5 * 1024 * 1024, 'image/webp': 5 * 1024 * 1024, 'video/mp4': 100 * 1024 * 1024, 'video/quicktime': 100 * 1024 * 1024 }
const ID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/
const fail = message => new AvatarError('invalid_request', message, 400)

/** Domain-owned immutable files, validated through the public local media service. */
export function createMaterials({ ctx, paths, store, inspect } = {}) {
  const directory = avatarId => { store.get(avatarId); return join(avatarDirOf(paths, avatarId), 'materials') }
  const publicRow = ({ path, ...row }) => row
  function resolve(avatarId, id) {
    if (!ID.test(String(id))) throw fail('素材编号无效')
    const dir = directory(avatarId)
    const record = JSON.parse(readFileSync(join(dir, id + '.json'), 'utf8'))
    const path = resolveAvatarArtifact(paths, avatarId, join(dir, id + '.media'))
    if (!realpathSync(path).startsWith(realpathSync(dir) + sep) || record.id !== id) throw fail('素材归属不匹配')
    const bytes = readFileSync(path)
    if (bytes.length !== record.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== record.digest) throw fail('素材内容已变化，请重新上传')
    return { ...record, path }
  }
  function list(avatarId) {
    const dir = directory(avatarId)
    let names
    try { names = readdirSync(dir) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
    const rows=[]
    for(const name of names.filter(name=>name.endsWith('.json'))) {
      rows.push(publicRow(resolve(avatarId,name.slice(0,-5))))
    }
    return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  }
  async function importFile({ avatarId, name, type, bytes }) {
    const dir = directory(avatarId)
    if (!LIMITS[type] || !Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > LIMITS[type]) throw fail('素材格式或文件大小不符合要求')
    const service = ctx?.get?.('mediaInspect')
    if (!inspect && !service?.inspect) throw new AvatarError('needs-media-inspect', '素材检查能力不可用，请更新创作中枢', 503)
    const digest=createHash('sha256').update(bytes).digest('hex')
    const existing=list(avatarId).find(row=>row.digest===digest&&row.mime===type)
    if(existing)return existing
    const id = randomUUID()
    const path = resolveAvatarDestination(paths,avatarId,join(dir,id+'.media'))
    resolveAvatarDestination(paths,avatarId,join(dir,id+'.json'))
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 })
    try {
      const video = type.startsWith('video/')
      const probe = inspect ? await inspect(path, type) : await service.inspect({ path, type: video ? 'video' : 'image', maxBytes: LIMITS[type] })
      if (!inspect && probe.mime !== type) throw fail('素材真实格式与上传声明不一致')
      if (video && (!(probe.duration >= 4 && probe.duration <= 30))) throw fail('参考视频需要为4–30秒的有效视频')
      if(video&&!inspect&&(!['avc','hevc'].includes(probe.codec)||!(probe.width>=240&&probe.height>=240&&probe.width<=4096&&probe.height<=4096)||!(probe.frameRate>=12&&probe.frameRate<=60)||(probe.audioCodecs??[]).some(codec=>codec!=='aac')))throw fail('参考视频需要常用编码、240–4096像素、12–60帧，音轨仅支持AAC')
      const row = { id, digest, name: String(name || '素材').replace(/[\u0000-\u001f/\\]/g, '_').slice(0,160), type: video ? 'video' : 'image', mime: type, sizeBytes: bytes.length, width: probe.width ?? null, height: probe.height ?? null, duration: video ? probe.duration : null, createdAt: new Date().toISOString() }
      writeFileSync(join(dir, id + '.json'), JSON.stringify(row), { flag: 'wx', mode: 0o600 })
      return row
    } catch (error) {
      const expected = join(dir, id + '.media')
      if (path === expected) rmSync(path, { force: true })
      throw error
    }
  }
  return { importFile, resolve, list }
}
