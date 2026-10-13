import { build, version } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
if(version!=='0.25.12')throw new Error('Media inspection requires the locked esbuild 0.25.12; install frozen workspace dependencies')
const result=await build({absWorkingDir:root,entryPoints:['src/media/video-inspect.js'],outfile:'lib/video-inspect.js',bundle:true,format:'esm',platform:'node',target:'es2022',write:false})
// Bundler location banners describe resolution paths, not source or legal notices.
const code=result.outputFiles[0].text.replace(/^\/\/ .*node_modules\/[^\n]*\n/gm,'')
mkdirSync(join(root,'lib'),{recursive:true})
writeFileSync(join(root,'lib/video-inspect.js'),'/*! Mediabunny 1.55.3 — Copyright Vanilagy and contributors. Mozilla Public License 2.0; see mediabunny-LICENSE.txt and THIRD-PARTY-NOTICES.md. */\n'+code)
const require=createRequire(import.meta.url)
copyFileSync(join(dirname(require.resolve('mediabunny')),'../../LICENSE'),join(root,'lib/mediabunny-LICENSE.txt'))
