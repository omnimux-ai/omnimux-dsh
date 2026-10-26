/**
 * comfyui-ops-filter.test.mjs 的夹具装载：把被测 TS 源一次性打成 ESM bundle 再导入。
 * 打包与动态装载是 setup 工作，不是用例本体，因此放在夹具里；用例文件只做静态导入。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

export const here = fileURLToPath(new URL('.', import.meta.url));
export const repoRoot = resolve(here, '../../../../../../../..');

const bundlePath = join(mkdtempSync(join(tmpdir(), 'omnimux-u06ops-')), 'runtime.mjs');
buildSync({
  stdin: {
    contents: [
      "export { resolveLineConstraints, resolveModelChannelGroups, directoryChannelGroups } from './channelGroups.ts';",
      "export { buildChannelContract } from './channelContractReconciler.ts';",
      "export { buildU06Prompt, U06_ASPECT_RATIO_MAP } from '../../../../../../../omnimux/src/media/comfyui-instance.js';",
      "export { narrowModelByLineConstraints } from '../../../../../shared/validation/lineConstraints.ts';",
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'runtime.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
});

const runtime = await import(pathToFileURL(bundlePath).href);

export const {
  resolveLineConstraints,
  resolveModelChannelGroups,
  directoryChannelGroups,
  buildChannelContract,
  buildU06Prompt,
  U06_ASPECT_RATIO_MAP,
  narrowModelByLineConstraints,
} = runtime;
