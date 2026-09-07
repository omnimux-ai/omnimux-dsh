import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it } from 'node:test'
import ts from 'typescript'

it('checkJs reaches the real dependency closure and rejects illegal status/contracts', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const configFile = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile)
  assert.equal(configFile.error, undefined)
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root)
  assert.deepEqual(config.errors, [])
  assert.equal(config.options.allowJs, true)
  assert.equal(config.options.checkJs, true)
  assert.equal(config.options.strict, true)
  assert.equal(config.options.noEmit, true)
  const path = resolve(root, 'src/__negative-contract.js')
  const source = `
import { aggregateStatus } from './shared/record-status.js'
import { createRecordStore } from './store.js'
import { createSubmitService } from './submit.js'
import { parsePublishConfig } from './config.js'
/** @type {import('./shared/record-status.js').AggregateStatus} */
const badAggregate = 'reviewing'
const illegal = aggregateStatus({}) === 'reviewing'
const view = createRecordStore().getView('missing')
if (view) view.aggregate = 'reviewing'
parsePublishConfig({}).statusMap.bad = 'draft'
/** @type {Parameters<typeof createSubmitService>[0]} */
const dependencies = { store: {} }
`
  const host = ts.createCompilerHost(config.options)
  const readSource = host.getSourceFile.bind(host)
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => file === path
    ? ts.createSourceFile(file, source, languageVersion, true, ts.ScriptKind.JS)
    : readSource(file, languageVersion, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram([...config.fileNames, path], config.options, host)
  for (const relative of ['shared/record-status.js', 'store.js', 'submit.js', 'http-routes.js', 'config.js', 'media.js', 'hubtools.js', 'accounts.js', 'validate.js', 'record-persistence.js', 'publish-dispatcher.js']) {
    assert.ok(program.getSourceFile(resolve(root, 'src', relative)), `${relative} must be checked`)
  }
  const diagnostics = ts.getPreEmitDiagnostics(program)
  const failures = diagnostics.filter((entry) => entry.file?.fileName === path)
  const unrelated = diagnostics.filter((entry) => entry.file?.fileName !== path)
  assert.deepEqual(unrelated.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, '\n')), [])
  assert.equal(failures.length, 5, 'all five invalid boundaries must produce real diagnostics')
  assert.ok(failures.some((entry) => entry.code === 2367), 'aggregate/reviewing comparison must be rejected')
})
