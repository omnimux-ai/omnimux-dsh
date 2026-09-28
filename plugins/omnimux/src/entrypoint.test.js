import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('DSH 插件规范：omnimux 入口必须显式声明 llm 依赖白名单', () => {
  const indexContent = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf-8')
  
  // 提取 inject 声明
  const match = indexContent.match(/export\s+const\s+inject\s*=\s*\[([^\]]*)\]/)
  assert.ok(match, 'index.js 必须导出 inject 数组')

  const declared = match[1].split(',').map(s => s.replace(/["'\s]/g, '')).filter(Boolean)

  assert.ok(declared.includes('tools'), '必须声明 tools 服务')
  assert.ok(declared.includes('systemPrompt'), '必须声明 systemPrompt 服务')
  assert.ok(declared.includes('agents'), '必须声明 agents 服务')
  assert.ok(declared.includes('llm'), '必须显式声明 llm 服务（下游 textComplete 强依赖 ctx.llm）')
})
