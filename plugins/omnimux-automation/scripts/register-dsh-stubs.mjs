/**
 * 让 `node --test` 能在没有官方包的离线环境里解析宿主依赖。
 * 覆写范围只限 Host 侧运行时包；luxon / zod 走真实实现。
 */

import { registerHooks } from 'node:module'

const runtimeStub = new URL('./dsh-runtime-stub.mjs', import.meta.url).href
const runtimePackages = new Set([
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-user-approval',
  '@deepseek-ai/dsh-workspace',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-permission-presets',
  '@deepseek-ai/schemastery',
])

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (runtimePackages.has(specifier)) return { url: runtimeStub, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
