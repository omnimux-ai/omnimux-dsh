import { createProductsDispatcher, registerProductsRoutes } from './http-routes.js'
import { createLibraryStore, listViewOf, ProductsError } from './library.js'
import { resolveProductsPaths } from './paths.js'

export const name = 'omnimux-products'
export const inject = ['tools', 'systemPrompt']

const PRODUCTS_PROMPT = `This workspace may use the OmniMux product library (omnimux-products).
Prefer products_search / products_list before inventing a sellable item. Cite as @产品/{name} (example: @产品/某防晒). Include selling_points when you mention a product.
Each product is a named sellable object (name + selling copy + optional path-referenced cover). Default context is the cover image plus copy — call products_read_media only when you need the full gallery. Do not dump every product image into context.
products_create requires a legal name. Physical goods also need selling_points or description. Digital goods (kind=digital) need link or brand_strategy or selling_points or description — do not fill SKU/price/promotion for digital; those are physical fields. Page forms can import a landing page into the form (the dialog link bar); Agent/skills may also fill link and strategy. source values other than manual (url-import, brand-analysis, …) are still stored as manual.
products_update may patch fields; rename uses the same handle rule and 409s on duplicates. Omit brand_strategy to keep the stored strategy; send null to clear it.
There is no products_delete tool. People remove records from the product-library page; that never unlinks real_path files.
Never modify, move, or delete a file under a product real_path. Do not treat the library as a workspace cwd. After creating or updating, tell the user they can see the row on the 产品库 page.`

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

const COPY_FIELDS = {
  kind: {
    type: 'string',
    enum: ['physical', 'digital'],
    description: 'Product kind. Omit on create to default to physical.',
  },
  description: { type: 'string', description: 'Longer product description' },
  selling_points: { type: 'string', description: 'How to sell this product' },
  target_audience: { type: 'string', description: 'Who this is for' },
  brand: { type: 'string', description: 'Brand name' },
  features: { type: 'string', description: 'Feature copy' },
  price: { type: 'string', description: 'Free-text price (no currency enum)' },
  sku: { type: 'string', description: 'SKU / item code' },
  promotion: { type: 'string', description: 'Promo copy' },
  categories: {
    type: 'array',
    items: { type: 'string' },
    description: 'Up to 5 free tags',
  },
  language: { type: 'string', description: 'Language hint; default auto' },
  link: { type: 'string', description: 'Store URL; stored, never fetched in P0' },
  media: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        real_path: { type: 'string' },
        path: { type: 'string' },
        original_name: { type: 'string' },
      },
      additionalProperties: true,
    },
    description: 'Local file path refs. Missing paths are skipped. Never copies files.',
  },
  cover_media_id: { type: 'string', description: 'Visible media id to use as cover' },
  brand_strategy: {
    type: ['object', 'null'],
    additionalProperties: true,
    description: 'Optional brand strategy object. Null clears. Unknown keys are dropped. Empty object stores null.',
  },
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
  const paths = resolveProductsPaths()
  const library = createLibraryStore({ paths })
  const dispatcher = createProductsDispatcher({ library })

  const mountHttp = (httpCtx) => {
    const webServer = httpCtx.webServer ?? httpCtx.get?.('webServer')
    if (!webServer || typeof webServer.register !== 'function') return
    const mount = () => registerProductsRoutes(webServer, dispatcher)
    if (typeof httpCtx.effect === 'function') httpCtx.effect(mount, 'omnimux-products: http routes')
    else mount()
  }
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mountHttp)
  else mountHttp(ctx)

  if (ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
    const registerPrompt = () => ctx.systemPrompt.section({
      name: 'products:ops',
      order: 70,
      text: PRODUCTS_PROMPT,
    })
    if (typeof ctx.effect === 'function') ctx.effect(registerPrompt, 'products.ops')
    else registerPrompt()
  }

  ctx.tools.register({
    name: 'products_list',
    description:
      'List OmniMux products. Optional search over name/handle/brand/selling_points/sku. Returns cover path + media_count, not the full gallery. Read-only. Data lives under $DSH_HOME/omnimux/products.',
    parameters: objectParams({
      query: { type: 'string', description: 'Optional case-insensitive substring' },
    }),
    output: jsonOut,
    async execute(args) {
      const query = typeof args.query === 'string' && args.query.trim() !== '' ? args.query.trim() : ''
      return { products: library.list(query ? { query } : {}).map(listViewOf) }
    },
  })

  ctx.tools.register({
    name: 'products_search',
    description:
      'Search products by name, handle, brand, selling_points, target_audience, sku, or categories. Missing disk paths are omitted from cover/media.',
    parameters: objectParams({
      query: { type: 'string', required: true, description: 'Case-insensitive substring' },
    }),
    output: jsonOut,
    async execute(args) {
      const query = typeof args.query === 'string' ? args.query : ''
      return { products: library.list({ query }).map(listViewOf) }
    },
  })

  ctx.tools.register({
    name: 'products_get',
    description:
      'Get one product by id (prd_…) or handle, including copy fields, currently visible media, kind, and brand_strategy when persisted.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Product id (prd_…) or handle' },
    }),
    output: jsonOut,
    async execute(args) {
      const id = typeof args.id === 'string' ? args.id : ''
      const product = library.getView(id)
      if (!product) throw new ProductsError('product-not-found', `no product ${id}`)
      return { product }
    },
  })

  ctx.tools.register({
    name: 'products_read_media',
    description:
      'Return the full visible media set for one product (id or handle). Fails wholly if the product is missing — never returns a half package.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Product id (prd_…) or handle' },
    }),
    output: jsonOut,
    async execute(args) {
      const id = typeof args.id === 'string' ? args.id : ''
      const product = library.getView(id)
      if (!product) throw new ProductsError('product-not-found', `no product ${id}`)
      return { product, media: product.media }
    },
  })

  ctx.tools.register({
    name: 'products_create',
    description:
      'Create a product in the same library.json the UI writes. Physical: name plus selling_points or description. Digital (kind=digital): name plus link or brand_strategy or selling_points or description. Do not send SKU/price/promotion for digital goods. source is always stored as manual. Duplicate handle → name-conflict. Does not copy media files.',
    parameters: objectParams({
      name: { type: 'string', required: true, description: 'Display name, 1–40 characters, no slash' },
      ...COPY_FIELDS,
    }),
    output: jsonOut,
    async execute(args) {
      const product = library.add({ ...args, requireContent: true })
      return { product }
    },
  })

  ctx.tools.register({
    name: 'products_update',
    description:
      'Partial-update a product by id or handle. Rename uses the same handle rule (409 on conflict). Does not require selling copy. Never deletes disk files.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Product id (prd_…) or handle' },
      name: { type: 'string', description: 'New display name' },
      ...COPY_FIELDS,
    }),
    output: jsonOut,
    async execute(args) {
      const id = typeof args.id === 'string' ? args.id : ''
      /** @type {Record<string, unknown>} */
      const patch = {}
      for (const [key, value] of Object.entries(args ?? {})) {
        if (key === 'id' || value === undefined) continue
        patch[key] = value
      }
      const product = library.update(id, patch)
      return { product }
    },
  })

  ctx.tools.register({
    name: 'products_delete',
    description:
      'Delete a product from the library. Does not delete disk media files. Destructive action requiring confirm=true.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Product id (prd_…) or handle' },
      confirm: {
        type: 'boolean',
        required: true,
        description: 'Must be true to confirm permanent deletion of the product record',
      },
    }),
    output: jsonOut,
    async execute(args) {
      if (args.confirm !== true) {
        throw new ProductsError('confirmation-required', 'products_delete is destructive; confirm must be explicitly true')
      }
      const id = typeof args.id === 'string' ? args.id : ''
      const existing = library.get(id)
      if (!existing) throw new ProductsError('product-not-found', `no product ${id}`)
      library.remove(existing.id)
      return { ok: true, id: existing.id, deleted: true }
    },
  })
}

/** Test helper: the seven live tool names, in register order. */
export const PRODUCT_TOOL_NAMES = Object.freeze([
  'products_list',
  'products_search',
  'products_get',
  'products_read_media',
  'products_create',
  'products_update',
  'products_delete',
])
