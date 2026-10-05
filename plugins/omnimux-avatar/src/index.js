// 插件入口：装配路径、存储、生成编排与资产同步，并挂载 HTTP 路由、Agent 工具与提示词段落。
import { createGeneration } from './generation.js'
import { registerAvatarRoutes } from './http.js'
import { createLibrarySync } from './library-sync.js'
import { resolveAvatarPaths } from './paths.js'
import { createAvatarStore } from './store.js'
import { registerAvatarTools } from './tools.js'

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
  const onReady = async (avatarId, kind) => {
    if (kind === 'multiview') await librarySync.syncMultiView(avatarId)
    else await librarySync.syncSheet(avatarId)
  }
  const generation = createGeneration({ ctx, store, paths, onReady })
  const deps = { store, generation, librarySync, paths, ctx }

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
