#!/usr/bin/env node
/**
 * Print the difference between the gateway's catalog view and the hub's own
 * catalog projection. Read-only: no network, no writes to the hub data dir.
 *
 * See `src/catalog/cloud/cli.js` for the implementation and full usage text.
 */

import { fileURLToPath } from 'node:url'

import { runCatalogDiff } from '../src/catalog/cloud/cli.js'

const hubRoot = fileURLToPath(new URL('..', import.meta.url))

const result = await runCatalogDiff({
  argv: process.argv.slice(2),
  hubRoot,
  write: (text) => process.stdout.write(text),
})

process.exitCode = result.exitCode
