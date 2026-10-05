// Agent 工具：与 HTTP 路由共享同一套 store / generation / librarySync。
// 这里用原始 ctx.tools.register（不走 defineTool），所以 parameters 必须是完整的 JSON Schema。
import { AvatarError, latestTaskOf } from './store.js'

/**
 * 把扁平字段表编译成 JSON Schema object。
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

const SHEET_FIELD = {
  type: 'object',
  additionalProperties: true,
  description: '设定对象：{ tier, selection, brief, seed, image_url }，可只传部分字段',
}

/** 注册的九个工具名，顺序与注册顺序一致。 */
export const AVATAR_TOOL_NAMES = Object.freeze([
  'avatar_create',
  'avatar_list',
  'avatar_get',
  'avatar_update',
  'avatar_delete',
  'avatar_generate',
  'avatar_multiview',
  'avatar_tasks',
  'avatar_library_sync',
])

/**
 * 注册形象工具。
 * @param {{ tools: { register: (tool: object) => unknown } }} ctx
 * @param {{ store: object, generation: object, librarySync: object }} deps
 */
export function registerAvatarTools(ctx, deps = {}) {
  const { store, generation, librarySync } = deps

  const withLatest = (avatar) => ({ ...avatar, latestTask: latestTaskOf(avatar) })

  ctx.tools.register({
    name: 'avatar_create',
    description:
      '新建一个虚拟形象：名称必填且为 1-40 个字符（不含斜杠），可同时写入档位与选项设定；名称重复时返回冲突，不静默改名。',
    parameters: objectParams({
      name: { type: 'string', required: true, description: '形象名称，1-40 个字符，不含斜杠' },
      sheet: SHEET_FIELD,
    }),
    output: jsonOut,
    async execute(args) {
      const avatar = store.create({ name: args?.name, sheet: args?.sheet })
      return { avatar }
    },
  })

  ctx.tools.register({
    name: 'avatar_list',
    description:
      '列出全部虚拟形象及其最新任务状态，只读；生成前应先用它确认已有形象，避免重复创建角色。',
    parameters: objectParams({}),
    output: jsonOut,
    async execute() {
      return { revision: store.revision(), avatars: store.list().map(withLatest) }
    },
  })

  ctx.tools.register({
    name: 'avatar_get',
    description: '读取单个虚拟形象的完整设定与任务历史（含未完成任务），只读；id 不存在时报错而不返回空对象。',
    parameters: objectParams({
      id: { type: 'string', required: true, description: '形象 id（avt_…）' },
    }),
    output: jsonOut,
    async execute(args) {
      return { avatar: store.get(args?.id) }
    },
  })

  ctx.tools.register({
    name: 'avatar_update',
    description: '更新虚拟形象的名称或设定参数，只改传入的字段；名称与其它形象重复时返回冲突。',
    parameters: objectParams({
      id: { type: 'string', required: true, description: '形象 id（avt_…）' },
      name: { type: 'string', description: '新的形象名称' },
      sheet: SHEET_FIELD,
    }),
    output: jsonOut,
    async execute(args) {
      const avatar = store.update(args?.id, { name: args?.name, sheet: args?.sheet })
      return { avatar }
    },
  })

  ctx.tools.register({
    name: 'avatar_delete',
    description:
      '删除虚拟形象并回收其托管数据目录（主图与多视角一并删除），破坏性操作，必须显式传 confirm: true 才会执行。',
    parameters: objectParams({
      id: { type: 'string', required: true, description: '形象 id（avt_…）' },
      confirm: { type: 'boolean', required: true, description: '必须为 true 才确认永久删除' },
    }),
    output: jsonOut,
    async execute(args) {
      if (args?.confirm !== true) {
        throw new AvatarError('confirmation-required', 'avatar_delete 是破坏性操作，必须显式传 confirm: true', 400)
      }
      const removed = store.remove(args?.id)
      return { deleted: true, id: removed.id }
    },
  })

  ctx.tools.register({
    name: 'avatar_generate',
    description:
      '按形象设定提交一次角色设定图生成，档位与选项先过规则校验；中枢未配置图像渠道时返回 needs-provider，不产生假任务。',
    parameters: objectParams({
      avatarId: { type: 'string', required: true, description: '形象 id（avt_…）' },
      model: { type: 'string', required: true, description: '模型 id（取自中枢模型目录）' },
      group: { type: 'string', description: '渠道组名称，可选' },
      tier: { type: 'string', required: true, description: '档位 id（normal / freak / total）' },
      selection: {
        type: 'object',
        required: true,
        additionalProperties: true,
        description: '分类 id → 选项 id 数组，例如 { "gender": ["female"] }',
      },
      brief: { type: 'string', description: '方向说明，最多 4000 字' },
      seed: { type: 'number', description: '随机种子，大于 0 时生效' },
      image_url: { type: 'string', description: '参考图地址，给出时按图生图提交' },
    }),
    output: jsonOut,
    async execute(args) {
      return generation.submitSheet(args ?? {})
    },
  })

  ctx.tools.register({
    name: 'avatar_multiview',
    description:
      '由该形象已完成的主图派生多视角设定板，参考图固定为该形象自己的成图；尚无已完成主图时拒绝提交。',
    parameters: objectParams({
      avatarId: { type: 'string', required: true, description: '形象 id（avt_…）' },
      model: { type: 'string', required: true, description: '模型 id（取自中枢模型目录）' },
      group: { type: 'string', description: '渠道组名称，可选' },
    }),
    output: jsonOut,
    async execute(args) {
      return generation.submitMultiView(args ?? {})
    },
  })

  ctx.tools.register({
    name: 'avatar_tasks',
    description:
      '查询形象的任务列表；传 taskId 时查单条任务，refresh: true 会先向中枢续取未完成任务的终态，绝不编造进度。',
    parameters: objectParams({
      avatarId: { type: 'string', required: true, description: '形象 id（avt_…）' },
      taskId: { type: 'string', description: '任务 id（avt_task_…），给出时只查这一条' },
      refresh: { type: 'boolean', description: '为 true 时先续取该任务的终态再返回' },
    }),
    output: jsonOut,
    async execute(args) {
      const { avatarId, taskId, refresh } = args ?? {}
      if (typeof taskId === 'string' && taskId !== '') {
        const task =
          refresh === true ? await generation.refreshTask({ avatarId, taskId }) : store.findTask(avatarId, taskId)
        if (!task) throw new AvatarError('task-not-found', 'task not found', 404)
        return { task }
      }
      return { tasks: store.listTasks(avatarId) }
    },
  })

  ctx.tools.register({
    name: 'avatar_library_sync',
    description:
      '把形象主图与多视角同步到资产库「角色」分类：一个形象一条资产，多视角存进该形象自己的「多视角」文件夹，重复同步不重复建档。',
    parameters: objectParams({
      avatarId: { type: 'string', required: true, description: '形象 id（avt_…）' },
      kind: {
        type: 'string',
        enum: ['sheet', 'multiview', 'both'],
        description: '同步范围，缺省 both（主图 + 多视角）',
      },
    }),
    output: jsonOut,
    async execute(args) {
      const avatarId = args?.avatarId
      const kind = args?.kind === 'sheet' || args?.kind === 'multiview' ? args.kind : 'both'
      if (kind === 'sheet') return { sheet: await librarySync.syncSheet(avatarId) }
      if (kind === 'multiview') return { multiview: await librarySync.syncMultiView(avatarId) }
      const sheet = await librarySync.syncSheet(avatarId)
      return { sheet, multiview: await librarySync.syncMultiView(avatarId) }
    },
  })
}
