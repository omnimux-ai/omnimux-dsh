/**
 * OmniMux Device - 移动真机矩阵与设备智能体中枢
 * 
 * 连接与管理物理 iPhone 集群，将硬件能力转化为标准 Agent Tools，
 * 并结合 TypeSafe Jev 决策引擎实现高频、毫秒级抗风控 UI 操作闭环。
 */

export const name = 'omnimux-device'
export const inject = ['tools']

const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

export function apply(ctx) {
  // 注入跨插件共享服务通道
  if (typeof ctx.provide === 'function') {
    ctx.provide('device', {
      listDevices: async () => [],
      getDevice: async (udid) => null,
      executeAction: async (udid, action) => ({ success: true }),
    })
  }

  // 注册一级智能体工具
  if (ctx.tools?.register) {
    ctx.tools.register({
      name: 'device_list',
      description: '列出当前连接的所有物理 iPhone 及其在线状态、电量与绑定账号',
      parameters: { type: 'object', properties: {} },
      output: jsonOut,
      async execute() {
        return { count: 0, devices: [] }
      }
    })

    ctx.tools.register({
      name: 'device_get_screen',
      description: '获取指定手机当前的界面语义树（AXe）与 OCR 文本列表',
      parameters: {
        type: 'object',
        properties: {
          udid: { type: 'string', description: '设备唯一标识符' }
        },
        required: ['udid']
      },
      output: jsonOut,
      async execute(args) {
        return { udid: args.udid, elements: [], textList: [] }
      }
    })

    ctx.tools.register({
      name: 'device_execute_action',
      description: '在指定手机上执行原子操作（点击元素/找字点击/划动/输入文案）',
      parameters: {
        type: 'object',
        properties: {
          udid: { type: 'string', description: '设备唯一标识符' },
          action: { type: 'string', enum: ['tap', 'type', 'scroll', 'home'] },
          target: { type: 'string', description: '操作的目标控件名称或文字' },
          value: { type: 'string', description: '输入的文本内容' }
        },
        required: ['udid', 'action']
      },
      output: jsonOut,
      async execute(args) {
        return { success: true, udid: args.udid, action: args.action }
      }
    })
  }
}
