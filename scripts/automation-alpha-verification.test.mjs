import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alphaPluginIds, alphaToolPrefixes, pluginLifecycle } from './plugin-lifecycle.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

test('omnimux-automation is registered as an Alpha plugin with correct tool prefixes', () => {
  assert.equal(pluginLifecycle['omnimux-automation']?.stage, 'alpha')
  assert.deepEqual(pluginLifecycle['omnimux-automation']?.toolPrefixes, ['automation_'])
  assert.ok(alphaPluginIds.includes('omnimux-automation'))
  assert.ok(alphaToolPrefixes.includes('automation_'))
})

test('alpha-release contract document documents omnimux-automation', () => {
  const doc = readFileSync(resolve(root, 'docs/contracts/alpha-release.md'), 'utf8')
  assert.match(doc, /自动化/)
})

test('all 6 automation tools match the alpha tool prefix', () => {
  const automationTools = [
    'automation_create',
    'automation_list',
    'automation_update',
    'automation_run_now',
    'automation_runs',
    'automation_delete',
  ]
  for (const tool of automationTools) {
    const isMatched = alphaToolPrefixes.some(prefix => tool.startsWith(prefix))
    assert.equal(isMatched, true, `Tool ${tool} must match alpha tool prefix`)
  }
})
