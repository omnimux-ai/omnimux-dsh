// 插件入口：装配路径、存储、生成编排与资产同步，并挂载 HTTP 路由、Agent 工具与提示词段落。
import { createGeneration } from './generation.js'
import { registerAvatarRoutes } from './http.js'
import { createLibrarySync } from './library-sync.js'
import { resolveAvatarPaths } from './paths.js'
import { createAvatarStore } from './store.js'
import { registerAvatarTools } from './tools.js'
import { createMaterials } from './materials.js'
import { createMotion } from './motion.js'
import { AvatarError } from './store.js'
import { resolveAvatarArtifact } from './artifact.js'

export const name = 'omnimux-avatar'
export const inject = ['webServer', 'tools', 'systemPrompt']

export const AVATAR_PROMPT = `This workspace may use the OmniMux virtual avatar library (omnimux-avatar).
Prefer avatar_list / avatar_get before inventing a character: an avatar is a first-class, reusable entity whose sheet (tier + options + brief) can be regenerated and accumulated over time.
Generation results are auto-saved into the asset library under 角色 (character) as one asset per avatar, and multi-view renders land in that avatar's own 「多视角」 folder inside the same asset.
Never modify, move, or delete any file under an avatar's data directory.
Use avatar_library_sync to re-sync an avatar's main image and multi-view folder when they are missing from the asset library.`

/**
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 *   systemPrompt?: { section: (spec: object) => unknown },
 *   get?: (name: string) => unknown,
 *   effect?: (fn: () => unknown, label?: string) => unknown,
 *   inject?: (deps: string[], callback: (inner: object) => void) => void,
 *   webServer?: { register: (route: object) => unknown },
 * }} ctx
 */
export function apply(ctx) {
  const paths = resolveAvatarPaths()
  const store = createAvatarStore({ paths })
  const librarySync = createLibrarySync({ ctx, store, paths })
  // 首次生成成功即自动入库：主图建档到「角色」，多视角挂到该形象自己的「多视角」文件夹。
  const onReady = async (avatarId, kind, taskId) => {
    if (kind === 'multiview') await librarySync.syncMultiView(avatarId, taskId)
    else await librarySync.syncSheet(avatarId, taskId)
  }
  const generation = createGeneration({ ctx, store, paths, onReady })
  const materials = createMaterials({ ctx, paths, store })
  const motion = createMotion({ ctx, paths, store, resolveAssets: async input => {
    const resolve = async (reference, type) => {
      if (!reference || typeof reference !== 'object') throw new AvatarError('invalid_request', '请选择受管素材', 400)
      if (reference.materialId) {
        const row = materials.resolve(input.avatarId, reference.materialId)
        if (row.type !== type) throw new AvatarError('invalid_request', '素材类型不匹配', 400)
        return row
      }
      const task = store.findTask(input.avatarId, reference.taskId)
      if (!task || task.status !== 'ready' || (type === 'video' ? task.kind !== 'motion' : task.kind === 'motion')) throw new AvatarError('invalid_request', '历史素材不可用', 400)
      const path = resolveAvatarArtifact(paths, input.avatarId, task.destPath)
      const metadata = await ctx.get('mediaInspect').inspect({ path, type })
      return { path, ...metadata, species: task.input?.tier }
    }
    const images = await Promise.all(input.images.map(reference => resolve(reference, 'image')))
    const video = await resolve(input.video, 'video')
    const inspector = ctx.get('mediaInspect')
    if (!inspector?.inspect) throw new AvatarError('needs-media-inspect', '素材检查能力不可用，请更新创作中枢', 503)
    const data = await inspector.inspect({ path: video.path, type: 'video' })
    const ratio = ['16:9','9:16','3:4'].find(value => { const [w,h] = value.split(':').map(Number); return Math.abs(data.width * h - data.height * w) <= (w+h)/2 })
    const assets = [...images.map(row => ({ type: 'image', role: 'reference', targetSlot: 'reference_images', pathOrUrl: row.path, mime: row.mime, ...(row.sizeBytes ? { sizeBytes: row.sizeBytes } : {}) })),
      { type: 'video', role: 'reference', targetSlot: 'reference_videos', pathOrUrl: video.path, mime: video.mime, durationSec: data.duration, ...(video.sizeBytes ? { sizeBytes: video.sizeBytes } : {}) }]
    return { assets, duration: data.duration, aspectRatio: ratio, species: images[0].species }
  }, onReady: async (avatarId, task) => {
    const avatar = store.get(avatarId)
    const library = ctx.get('assetLibrary')
    if (!library) throw new AvatarError('needs-assets', '资产库不可用', 503)
    const source=`omnimux-avatar:${task.taskId}`
    if(library.findBySource?.(source))return
    await library.saveTypedAsset({ name: `${avatar.name.slice(0,25)} 视频 ${task.taskId.slice(-8)}`, type: 'custom', files: [resolveAvatarArtifact(paths,avatarId,task.destPath)], source, tags: ['角色视频'] })
  } })
  const deps = { store, generation, librarySync, paths, ctx, materials, motion }

  const mountHttp = (httpCtx) => {
    const webServer = httpCtx.webServer ?? httpCtx.get?.('webServer')
    if (!webServer || typeof webServer.register !== 'function') return
    const mount = () => registerAvatarRoutes(webServer, deps)
    if (typeof httpCtx.effect === 'function') httpCtx.effect(mount, 'omnimux-avatar: http routes')
    else mount()
  }
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mountHttp)
  else mountHttp(ctx)

  registerAvatarTools(ctx, deps)

  if (typeof ctx.systemPrompt?.section === 'function') {
    const registerPrompt = () => ctx.systemPrompt.section({
      name: 'avatar:ops',
      order: 51,
      text: AVATAR_PROMPT,
    })
    if (typeof ctx.effect === 'function') ctx.effect(registerPrompt, 'omnimux-avatar: system prompt')
    else registerPrompt()
  }
}
