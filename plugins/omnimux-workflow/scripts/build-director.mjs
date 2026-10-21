import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const dependencyRoot = process.env.DIRECTOR_BUILD_DEPENDENCY_ROOT;
// Explicit task-verification override only, never a product runtime fallback.
const require = createRequire(dependencyRoot ? join(dependencyRoot, 'package.json') : import.meta.url);
// Build-time only. No Tailwind reset, source global CSS or theme enters the host.
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const prefix = '.wf-director-root';
const scoped = {
  postcssPlugin: 'director-scope',
  Rule(rule) {
    if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map(selector => selector.startsWith(prefix) ? selector : `${prefix} ${selector}`);
  },
  Declaration(declaration) {
    if (!['color','background-color','border-color','--tw-ring-color','--tw-ring-offset-color'].includes(declaration.prop)) return;
    if (!/rgb\(|#[\da-f]/i.test(declaration.value)) return;
    const semantic = declaration.prop === 'color' ? 'label-primary' : declaration.prop === 'background-color' ? 'bg-layer-2' : declaration.prop === 'border-color' ? 'border' : 'brand-primary';
    declaration.value = `var(--dsw-alias-${semantic})`;
  },
};
const config = {
  content: [join(root, 'src/director/**/*.{ts,tsx}')],
  corePlugins: { preflight: false },
  darkMode: ['class', '[data-theme="dark"]'],
};
const layout = readFileSync(join(root, 'src/director/vendor/director-layout.css'), 'utf8');
const controls = readFileSync(join(root, 'src/director/controls.css'), 'utf8');
const aliases = `${prefix}{--foreground:var(--dsw-alias-label-primary);--background:var(--dsw-alias-bg-base);--border:var(--dsw-alias-border);--surface-hover:var(--dsw-alias-interactive-bg-hover);--status-error:var(--dsw-alias-state-error-primary);--status-warning:var(--dsw-alias-state-warn-primary);--status-success:var(--dsw-alias-label-success);--cn-muted:var(--dsw-alias-label-secondary);--workspace-accent:var(--dsw-alias-brand-primary);--surface-card-hover:var(--dsw-alias-interactive-bg-hover);--control-focus-ring:var(--dsw-alias-brand-primary);--control-selected-bg:var(--dsw-alias-interactive-bg-active);--control-selected-fg:var(--dsw-alias-label-primary);--control-selected-border:var(--dsw-alias-border);--director-dock-surface:var(--dsw-alias-bg-elevated);--director-dock-fg:var(--dsw-alias-label-secondary);--director-dock-fg-strong:var(--dsw-alias-label-primary);--director-dock-active-surface:var(--dsw-alias-interactive-bg-active);--director-control-hover:var(--dsw-alias-interactive-bg-hover);--director-sequencer-border:var(--dsw-alias-border);--director-sequencer-surface:var(--dsw-alias-bg-layer-1);--director-sequencer-surface-raised:var(--dsw-alias-bg-layer-2);--director-sequencer-grid:var(--dsw-alias-border-l1);--director-accent:var(--dsw-alias-brand-primary);--director-swatch-inset:var(--dsw-alias-border);--director-dock-button-size:32px;--director-dock-bottom:12px;--director-color-swatch-size:24px;--director-pose-button-height:32px;--director-sequencer-base-width:920px;--director-sequencer-label-width:220px;--director-sequencer-row-height:32px;--director-sequencer-shot-select-width:160px;--space-half:2px;--space-1:4px;--space-1-half:6px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;--space-8:32px;--space-10:40px;--stroke-1:1px;--stroke-2:2px;--r-xs:4px;--r-sm:8px;--r-md:8px;--r-lg:12px;--r-full:12px;--fs-micro:11px;--fs-tiny:12px;--fs-label:12px;--fs-caption:12px;--z-toolbar:50;--z-toast:1000;--motion-dur-fast:120ms;--motion-dur-fast-calc:120ms;--motion-ease-out:ease-out;--shadow-xl:0 8px 24px var(--dsw-alias-bg-mask-1);}`;
const css = await postcss([tailwind(config), scoped]).process(`@tailwind utilities;\n${layout}\n${aliases}\n${controls}`, { from: undefined });
// Isolation is a deterministic gate, not a convention. Tailwind's internal
// transform defaults are allowed only under this same root.
css.root.walkRules(rule => {
  if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
  if (rule.selectors.some(selector => !selector.startsWith(prefix))) throw new Error(`Unscoped director CSS: ${rule.selector}`);
});
const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/director/index.tsx'],
  outfile: 'director.js', bundle: true, format: 'iife', globalName: '__omnimuxWorkflowDirector', platform: 'browser', target: 'es2020', jsx: 'automatic', minify: true, write: false, legalComments: 'none', metafile: true,
  nodePaths: [...(dependencyRoot ? [join(dependencyRoot, 'node_modules')] : []), join(root, 'node_modules'), join(repo, 'node_modules/.pnpm/node_modules'), join(repo, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'director-style', setup(build) {
    // Every transitive renderer dependency must use this island's React 19.
    const islandRequire = createRequire(join(root, 'package.json'));
    build.onResolve({ filter: /^react(?:-dom)?(?:\/|$)/ }, args => ({ path: islandRequire.resolve(args.path) }));
    build.onResolve({ filter: /^\.\/director\.css$/ }, () => ({ path: 'director.css', namespace: 'director-style' }));
    build.onLoad({ filter: /.*/, namespace: 'director-style' }, () => ({ contents: css.css, loader: 'text' }));
  } }],
});
for (const path of Object.keys(result.metafile.inputs)) {
  if (path.includes('src/director/') && /\.test\.|repro|adapt-vendor/.test(path)) throw new Error(`Nonproduction director input: ${path}`);
  if (/antd|services\/api|use-config-store|use-asset-store|@\//.test(path)) throw new Error(`Forbidden director runtime: ${path}`);
}
if (process.env.DIRECTOR_BUILD_METAFILE) {
  if (!process.argv.includes('--check')) throw new Error('Metafile output is check-only');
  writeFileSync(process.env.DIRECTOR_BUILD_METAFILE, JSON.stringify(result.metafile, null, 2));
}
if (process.argv.includes('--check')) console.log(`director build check passed (${result.outputFiles[0].contents.length} bytes)`);
else { const target = join(root, 'lib/director.js'); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, result.outputFiles[0].contents); console.log(`wrote ${target}`); }
