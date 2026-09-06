#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const lifecyclePath = resolve(here, '../plugins/omnimux/src/plugin-lifecycle.json')

function readLifecycle() {
  const value = JSON.parse(readFileSync(lifecyclePath, 'utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('plugin lifecycle registry must be an object')
  }
  if (Object.keys(value).length === 0) {
    throw new Error('plugin lifecycle registry must contain at least one entry')
  }
  for (const [pluginId, entry] of Object.entries(value)) {
    if (!pluginId || !entry || entry.stage !== 'alpha' || !Array.isArray(entry.toolPrefixes)) {
      throw new Error(`invalid lifecycle entry: ${pluginId || '(empty)'}`)
    }
    if (entry.toolPrefixes.some(prefix => typeof prefix !== 'string' || prefix.length === 0)) {
      throw new Error(`invalid lifecycle tool prefix: ${pluginId}`)
    }
  }
  return value
}

export const pluginLifecycle = Object.freeze(readLifecycle())
export const alphaPluginIds = Object.freeze(Object.keys(pluginLifecycle))
export const alphaToolPrefixes = Object.freeze(Object.values(pluginLifecycle).flatMap(entry => entry.toolPrefixes))

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const command = process.argv[2]
  if (command === 'list-alpha-plugins') {
    process.stdout.write(`${alphaPluginIds.join('\n')}\n`)
  } else if (command === 'list-alpha-tool-prefixes') {
    process.stdout.write(`${alphaToolPrefixes.join('\n')}\n`)
  } else {
    process.stderr.write('usage: plugin-lifecycle.mjs list-alpha-plugins|list-alpha-tool-prefixes\n')
    process.exitCode = 1
  }
}
