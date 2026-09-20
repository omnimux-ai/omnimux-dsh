export const name = 'omnimux-device'
export const inject = []

const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

export function apply(ctx) {
  if (typeof ctx.provide === 'function') {
    ctx.provide('device', {
      listDevices: async () => [],
      getDevice: async () => null,
      executeAction: async () => ({ success: true }),
    })
  }

  const registerTools = (tools) => {
    if (!tools || typeof tools.register !== 'function') return
    tools.register({
      name: 'device_list',
      description: '列出当前连接的所有物理 iPhone 及其在线状态与电量',
      parameters: { type: 'object', properties: {} },
      output: jsonOut,
      async execute() {
        return { count: 0, devices: [] }
      }
    })
  }

  const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
  if (tools) {
    registerTools(tools)
  } else if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], (inner) => {
      registerTools(inner?.tools ?? inner?.get?.('tools'))
    })
  }
}

export default {
  name,
  inject,
  apply,
}
