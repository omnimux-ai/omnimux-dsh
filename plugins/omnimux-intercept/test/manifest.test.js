import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('DSH 插件规范：omnimux-intercept package.json 必须包含 peerDependencies 声明', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

  assert.ok(pkg.peerDependencies, '必须包含 peerDependencies')
  assert.ok(pkg.peerDependencies['@deepseek-ai/dsh-base'], '必须声明 @deepseek-ai/dsh-base 为 peerDependencies')
})
