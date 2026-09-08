#!/usr/bin/env node
/**
 * Pack src/client/*.js fragments into one ModuleLoader blob.
 * Official client loaders only accept a single factory file.
 * dsh-ui-kit is bundled; react / react-dom / primitives stay external.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'src', 'client')
const outFile = join(root, 'lib', 'client.js')

/**
 * Order is load order inside the factory. Do not sort alphabetically.
 * skill-picker-logic.js is NOT a fragment: it is an ESM module that esbuild
 * inlines into the factory via boot.js `require("./skill-picker-logic.js")`.
 */
const FRAGMENTS = [
  'boot.js',
  'css.js',
  'portal.js',
  'format.js',
  'i18n.js',
  'constants.js',
  'api.js',
  'keepalive.js',
  'session-create.js',
  'skills-ui.js',
  'tool-views.js',
  'list-view.js',
  'settings.js',
  'marketplace.js',
  'skill-plaza.js',
  'skill-picker.js',
  'composer.js',
  'experts.js',
  'connectors.js',
  'plaza-shell.js',
  'apply.js',
]

const inner = FRAGMENTS.map((name) => {
  const text = readFileSync(join(dir, name), 'utf8').replace(/\s+$/, '')
  if (!text) throw new Error(`empty fragment ${name}`)
  return text
}).join('\n\n').replace(
  /\n\s*return \{ inject, apply \};\s*$/,
  '\nmodule.exports = { inject, apply };\n',
)

const result = await esbuild.build({
  absWorkingDir: root,
  stdin: {
    contents: inner,
    // Relative requires (e.g. "./skill-picker-logic.js" in boot.js) resolve
    // against src/client so esbuild inlines them into the single factory.
    resolveDir: dir,
    sourcefile: 'client-factory.js',
    loader: 'js',
  },
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  charset: 'utf8',
  write: false,
  logLevel: 'info',
  external: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
})

const code = result.outputFiles[0]?.text
if (!code) throw new Error('esbuild produced no output')

const wrapped = `window.__ModuleLoader__.load({
  id: "omnimux-market",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  },
});
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, wrapped)
console.log(`wrote ${outFile} (${Buffer.byteLength(wrapped)} bytes, ${FRAGMENTS.length} fragments)`)
