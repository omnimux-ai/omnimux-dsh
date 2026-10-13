import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
await build({ absWorkingDir: root, entryPoints: ['../../packages/generation-capabilities/src/index.js'], outfile: 'lib/capability-core.js', bundle: true, format: 'esm', platform: 'node' })
