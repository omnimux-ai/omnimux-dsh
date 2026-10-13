import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname,join } from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
await build({absWorkingDir:root,entryPoints:['src/media/video-inspect.js'],outfile:'lib/video-inspect.js',bundle:true,format:'esm',platform:'node',target:'es2022'})
const require=createRequire(import.meta.url)
copyFileSync(join(dirname(require.resolve('mediabunny')),'../../LICENSE'),join(root,'lib/mediabunny-LICENSE.txt'))
