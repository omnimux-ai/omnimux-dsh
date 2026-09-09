import { createAssetsDispatcher, registerAssetsRoutes } from './http-routes.js'
import { createArtifactStore } from './artifacts.js'
import { createLibraryStore } from './library.js'
import { createMappingStore, AssetsError } from './mappings.js'
import { resolveAssetsPaths } from './paths.js'
import { formatAssetUri, isAssetUri, parseAssetUri, resolveAssetUri, toAssetUri } from './protocol.js'

export { formatAssetUri, isAssetUri, parseAssetUri, resolveAssetUri, toAssetUri }

export const name = 'omnimux-assets'
export const inject = ['tools', 'systemPrompt']

const ASSETS_PROMPT = `This workspace may use the OmniMux creative asset library (omnimux-assets).
Prefer assets_list with scope "assets" (optional type: character/scene/style/prop/knowledge/custom) and assets_search by name/description/tags.
Each asset is a reusable creative object (name + type + description + materialized files under the assets store). Cite it as @类型/名称 (example: @角色/林晓). Missing managed copies are omitted from files — do not invent them.
assets_upload still reports produced files; it does not create a typed asset.
Never modify, move, or delete the user's original desktop file; deleting an asset drops the library record and may remove the managed copy under omnimux/assets/data/files/.`

/**
 * Compile a flat field table into a JSON Schema object. Raw `register`
 * does not run defineTool, so the wire schema must already be type:object.
 * @param {Record<string, Record<string, unknown> & { required?: boolean }>} fields
 */
function objectParams(fields) {
  /** @type {Record<string, unknown>} */
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(fields)) {
    const { required: isRequired, ...rest } = spec
    properties[key] = rest
    if (isRequired) required.push(key)
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/**
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 *   systemPrompt?: { section: (spec: object) => unknown },
 *   effect?: (fn: () => unknown, label?: string) => unknown,
 *   inject?: (deps: string[], callback: (inner: object) => void) => void,
 * }} ctx
 */
export function apply(ctx) {
  const paths = resolveAssetsPaths()
  const mappings = createMappingStore({ paths })
  const artifacts = createArtifactStore({ paths })
  const library = createLibraryStore({ paths })
  library.migrateMappings(mappings)
  const dispatcher = createAssetsDispatcher({ mappings, artifacts, library })

  const mountHttp = (httpCtx) => {
    const webServer = httpCtx.webServer ?? httpCtx.get?.('webServer')
    if (!webServer || typeof webServer.register !== 'function') return
    const mount = () => registerAssetsRoutes(webServer, dispatcher)
    if (typeof httpCtx.effect === 'function') httpCtx.effect(mount, 'omnimux-assets: http routes')
    else mount()
  }
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mountHttp)
  else mountHttp(ctx)

  if (ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
    const registerPrompt = () => ctx.systemPrompt.section({
      name: 'assets:ops',
      order: 50,
      text: ASSETS_PROMPT,
    })
    if (typeof ctx.effect === 'function') ctx.effect(registerPrompt, 'assets.ops')
    else registerPrompt()
  }

  ctx.tools.register({
    name: 'assets_list',
    description:
      'Read the OmniMux creative asset library. Prefer scope "assets" (optional type: character/scene/style/prop/knowledge/custom). Legacy scopes "mappings" / "mapping_files" / "artifacts" remain. Missing file paths are omitted. Read-only. Data lives under $DSH_HOME/omnimux/assets.',
    parameters: objectParams({
      scope: {
        type: 'string',
        required: true,
        enum: ['assets', 'mappings', 'mapping_files', 'artifacts'],
        description: 'What to list: creative assets (preferred), legacy mappings, one mapping\'s files, or artifacts',
      },
      mapping_id: { type: 'string', description: 'Required when scope is mapping_files' },
      type: { type: 'string', description: 'Optional type filter for assets or artifacts' },
    }),
    output: jsonOut,
    async execute(args) {
      const scope = args.scope
      if (scope === 'assets') {
        const type = typeof args.type === 'string' && args.type.trim() !== '' ? args.type.trim() : ''
        return { assets: library.list(type ? { type } : {}) }
      }
      if (scope === 'mappings') {
        return { mappings: mappings.list() }
      }
      if (scope === 'mapping_files') {
        const id = typeof args.mapping_id === 'string' ? args.mapping_id : ''
        if (!id) throw new AssetsError('mapping-not-found', 'mapping_id is required when scope is mapping_files')
        const mapping = mappings.get(id)
        if (!mapping) throw new AssetsError('mapping-not-found', `no mapping ${id}`)
        const files = mappings.readScan(id) ?? []
        return { mapping: mappings.getView(id), files }
      }
      if (scope === 'artifacts') {
        const type = typeof args.type === 'string' && args.type.trim() !== '' ? args.type.trim() : ''
        return { artifacts: artifacts.list(type ? { type } : {}) }
      }
      throw new AssetsError('invalid-scope', `unknown scope ${String(scope)}`)
    },
  })

  ctx.tools.register({
    name: 'assets_search',
    description:
      'Search creative assets by name, description, handle, or tags. Optional type filter (character/scene/style/prop/knowledge/custom). Missing disk paths are omitted from files.',
    parameters: objectParams({
      query: { type: 'string', required: true, description: 'Case-insensitive substring' },
      type: { type: 'string', description: 'Optional asset type filter' },
    }),
    output: jsonOut,
    async execute(args) {
      const query = typeof args.query === 'string' ? args.query : ''
      const type = typeof args.type === 'string' && args.type.trim() !== '' ? args.type.trim() : ''
      return { assets: library.list({ query, ...(type ? { type } : {}) }) }
    },
  })

  ctx.tools.register({
    name: 'assets_get',
    description:
      'Get one creative asset by id or handle, including description and currently visible file refs.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Asset id (ast_…) or handle' },
    }),
    output: jsonOut,
    async execute(args) {
      const id = typeof args.id === 'string' ? args.id : ''
      const asset = library.getView(id)
      if (!asset) throw new AssetsError('asset-not-found', `no asset ${id}`)
      return { asset }
    },
  })

  ctx.tools.register({
    name: 'assets_create',
    description:
      'Create a new creative asset (character/scene/style/prop/knowledge/custom) in the OmniMux asset library. Materializes files into the managed vault under $DSH_HOME/omnimux/assets/data/files/<id>/ without altering user originals.',
    parameters: objectParams({
      name: { type: 'string', required: true, description: 'Display name of the asset (1-40 characters, no slashes)' },
      type: {
        type: 'string',
        enum: ['character', 'scene', 'style', 'prop', 'knowledge', 'custom'],
        description: 'Asset category type; defaults to custom if omitted',
      },
      description: { type: 'string', description: 'Detailed asset description or prompt notes (max 4000 chars)' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search and classification tags (max 20 tags)',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of local file paths or relative paths to ingest into the managed asset vault',
      },
    }),
    output: jsonOut,
    async execute(args) {
      const name = typeof args.name === 'string' ? args.name : ''
      const type = typeof args.type === 'string' ? args.type : 'custom'
      const description = typeof args.description === 'string' ? args.description : ''
      const tags = Array.isArray(args.tags) ? args.tags : []
      const files = Array.isArray(args.files) ? args.files : []
      const asset = await library.add({ name, type, description, tags, files })
      const hubEvents = ctx.get?.('hubEvents')
      hubEvents?.emit({
        type: 'omnimux:assets:changed',
        payload: {
          lrev: library.revision(),
          arev: artifacts.revision(),
          op: 'create',
          ids: [asset.id],
          assetType: asset.type,
          at: Date.now(),
        },
      })
      return { ok: true, asset }
    },
  })

  ctx.tools.register({
    name: 'assets_update',
    description:
      'Update an existing creative asset in the library (name, type, description, tags, or replace files).',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Asset id (ast_…) or handle' },
      name: { type: 'string', description: 'Updated display name' },
      type: {
        type: 'string',
        enum: ['character', 'scene', 'style', 'prop', 'knowledge', 'custom'],
        description: 'Updated category type',
      },
      description: { type: 'string', description: 'Updated description' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated tags array (replaces existing tags)',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Replacement files array (ingests new paths into vault)',
      },
    }),
    output: jsonOut,
    async execute(args) {
      const id = typeof args.id === 'string' ? args.id : ''
      const existing = library.get(id)
      if (!existing) throw new AssetsError('asset-not-found', `no asset ${id}`)
      const patch = {}
      if (typeof args.name === 'string') patch.name = args.name
      if (typeof args.type === 'string') patch.type = args.type
      if (typeof args.description === 'string') patch.description = args.description
      if (Array.isArray(args.tags)) patch.tags = args.tags
      if (Array.isArray(args.files)) patch.files = args.files
      const asset = await library.update(existing.id, patch)
      const hubEvents = ctx.get?.('hubEvents')
      hubEvents?.emit({
        type: 'omnimux:assets:changed',
        payload: {
          lrev: library.revision(),
          arev: artifacts.revision(),
          op: 'update',
          ids: [asset.id],
          assetType: asset.type,
          at: Date.now(),
        },
      })
      return { ok: true, asset }
    },
  })

  ctx.tools.register({
    name: 'assets_delete',
    description:
      'Delete a creative asset from the library and recycle its managed files copy. User originals are never unlinked. Destructive action requiring confirm=true.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Asset id (ast_…) or handle' },
      confirm: {
        type: 'boolean',
        required: true,
        description: 'Must be true to confirm permanent deletion of the asset record',
      },
    }),
    output: jsonOut,
    async execute(args) {
      if (args.confirm !== true) {
        throw new AssetsError('confirmation-required', 'assets_delete is destructive; confirm must be explicitly true')
      }
      const id = typeof args.id === 'string' ? args.id : ''
      const existing = library.get(id)
      if (!existing) throw new AssetsError('asset-not-found', `no asset ${id}`)
      library.remove(existing.id)
      const hubEvents = ctx.get?.('hubEvents')
      hubEvents?.emit({
        type: 'omnimux:assets:changed',
        payload: {
          lrev: library.revision(),
          arev: artifacts.revision(),
          op: 'delete',
          ids: [existing.id],
          assetType: existing.type,
          at: Date.now(),
        },
      })
      return { ok: true, id: existing.id, deleted: true }
    },
  })

  ctx.tools.register({
    name: 'assets_upload',
    description:
      'Report one produced file as an OmniMux assets artifact: copies it into the plugin-owned store under $DSH_HOME/omnimux/assets/artifacts (sha256 content-addressed, deduplicated). The source file is never modified or moved. agent is required; run_id decides whether the artifact is marked traced. Refuses content that looks like a secret token.',
    parameters: objectParams({
      path: { type: 'string', required: true, description: 'Absolute path of the produced file on this machine' },
      title: { type: 'string', description: 'Display title; defaults to the file name' },
      agent: { type: 'string', required: true, description: 'Name of the agent that produced the file' },
      run_id: { type: 'string', description: 'Run id when known; presence marks the artifact traced' },
      model: { type: 'string', description: 'Model that produced the file' },
      prompt_hash: { type: 'string', description: 'sha256-prefixed prompt digest' },
    }),
    output: jsonOut,
    async execute(args) {
      const diskPath = resolveAssetUri(args.path)
      const artifact = artifacts.report(diskPath, {
        agent: args.agent,
        run_id: args.run_id,
        model: args.model,
        prompt_hash: args.prompt_hash,
      }, args.title)
      const hubEvents = ctx.get?.('hubEvents')
      hubEvents?.emit({
        type: 'omnimux:assets:changed',
        payload: {
          lrev: library.revision(),
          arev: artifacts.revision(),
          op: 'create',
          ids: [artifact.id],
          assetType: 'artifact',
          at: Date.now(),
        },
      })
      return { artifact }
    },
  })
}
