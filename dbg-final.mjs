import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const m = await import('./scripts/test-authoring-inspection.mjs')
const wt = '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/canvas-catalog-truth/'
for (const f of [
  'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/comfyui-ops-filter.test.mjs',
  'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs',
]) {
  const base = execFileSync('git', ['show', 'origin/main:' + f], { encoding: 'utf8' })
  const head = readFileSync(wt + f, 'utf8')
  const r = m.inspectTestStandardChange(base, head, { resolveImport: () => true })
  console.log(f.split('/').pop(), '=>', JSON.stringify(r))
}
