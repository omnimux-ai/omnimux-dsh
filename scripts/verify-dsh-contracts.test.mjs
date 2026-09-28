import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { scanPluginCompliance } from './verify-dsh-contracts.mjs'

test('DSH 规范门禁：正常合规插件能够通过校验', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-gate-pass-'))
  try {
    const pluginDir = path.join(tmpDir, 'valid-plugin')
    fs.mkdirSync(path.join(pluginDir, 'src'), { recursive: true })

    fs.writeFileSync(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: 'valid-plugin',
        version: '0.1.0',
        peerDependencies: { '@deepseek-ai/dsh-base': '^0.1.5-rc.2' },
      }),
    )

    fs.writeFileSync(
      path.join(pluginDir, 'src', 'index.js'),
      `
      export const name = 'valid-plugin'
      export const inject = ['tools', 'llm']
      export function apply(ctx) {
        ctx.tools.defineTool({
          name: 'sample_tool',
          description: 'A compliant tool',
          parameters: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id']
          },
          execute: async () => ({ ok: true })
        })
        ctx.llm.stream()
      }
      `,
    )

    const violations = scanPluginCompliance(tmpDir)
    assert.equal(violations.length, 0, '合规插件不应产生任何违规报告')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('DSH 规范门禁（负向反证）：缺少 inject 声明必须被精准拦截', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-gate-fail-inject-'))
  try {
    const pluginDir = path.join(tmpDir, 'bad-plugin')
    fs.mkdirSync(path.join(pluginDir, 'src'), { recursive: true })

    fs.writeFileSync(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: 'bad-plugin',
        version: '0.1.0',
        peerDependencies: { '@deepseek-ai/dsh-base': '^0.1.5-rc.2' },
      }),
    )

    // 调用了 ctx.storage，但 inject 只声明了 tools
    fs.writeFileSync(
      path.join(pluginDir, 'src', 'index.js'),
      `
      export const name = 'bad-plugin'
      export const inject = ['tools']
      export function apply(ctx) {
        ctx.storage.get('item')
      }
      `,
    )

    const violations = scanPluginCompliance(tmpDir)
    assert.ok(violations.length > 0, '必须拦截缺少 inject 的插件')
    const hit = violations.find((v) => v.type === 'CORDIS_INJECT_MISSING' && v.service === 'storage')
    assert.ok(hit, '必须准确指出缺失 storage 依赖')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('DSH 规范门禁（负向反证）：defineTool parameters 缺少 type: "object" 必须被精准拦截', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-gate-fail-schema-'))
  try {
    const pluginDir = path.join(tmpDir, 'bad-tool-plugin')
    fs.mkdirSync(path.join(pluginDir, 'src'), { recursive: true })

    fs.writeFileSync(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: 'bad-tool-plugin',
        version: '0.1.0',
        peerDependencies: { '@deepseek-ai/dsh-base': '^0.1.5-rc.2' },
      }),
    )

    // defineTool parameters 缺少 type: "object"
    fs.writeFileSync(
      path.join(pluginDir, 'src', 'index.js'),
      `
      export const name = 'bad-tool-plugin'
      export const inject = ['tools']
      export function apply(ctx) {
        ctx.tools.defineTool({
          name: 'invalid_tool',
          parameters: {
            properties: { query: { type: 'string' } }
          }
        })
      }
      `,
    )

    const violations = scanPluginCompliance(tmpDir)
    assert.ok(violations.length > 0, '必须拦截 Schema 不合规的工具定义')
    const hit = violations.find((v) => v.type === 'TOOL_SCHEMA_MISSING_OBJECT_TYPE')
    assert.ok(hit, '必须准确指出 parameters 缺少 type: "object"')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
