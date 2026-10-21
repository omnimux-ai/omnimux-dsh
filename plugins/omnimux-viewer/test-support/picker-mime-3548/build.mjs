import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const worktree = resolve(here, '../../../..');
const outDir = '/tmp/picker-mime-3548';
const evidence = join(worktree, 'docs/evidence/viewer-picker-mime-3548');
mkdirSync(outDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const result = await build({
  entryPoints: [join(here, 'harness.jsx')], bundle: true, write: false, format: 'iife',
  platform: 'browser', target: ['chrome120'], define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.jsx': 'jsx' }, logLevel: 'silent',
  plugins: [{ name: 'kit-stub', setup(builder) {
    builder.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: 'dsh-ui-kit', namespace: 'kit-stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'kit-stub' }, () => ({
      loader: 'js', resolveDir: here,
      contents: `import React from 'react';
export const GenWaveCard = () => React.createElement('div', { className: 'stub-genwave' });
export const Button = (props) => React.createElement('button', props, props.children);`,
    }));
  } }],
});
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Picker MIME harness</title>
<style>
:root{--dsw-alias-bg-base:#0f1013;--dsw-alias-bg-primary:#0f1013;--dsw-alias-bg-layer-1:#17191d;--dsw-alias-bg-layer-2:#1d2025;--dsw-alias-bg-layer-3:#272a31;--dsw-alias-bg-elevated:#1c1f24;--dsw-alias-border-l1:rgba(255,255,255,.08);--dsw-alias-border-l2:rgba(255,255,255,.12);--dsw-alias-border-l3:rgba(255,255,255,.22);--dsw-alias-border:rgba(255,255,255,.14);--dsw-alias-label-primary:#f5f6f8;--dsw-alias-label-secondary:rgba(255,255,255,.72);--dsw-alias-label-tertiary:rgba(255,255,255,.45);--dsw-alias-interactive-bg-hover:rgba(255,255,255,.08);--dsw-alias-brand-primary:#7961f2;--dsw-alias-bg-mask-1:rgba(0,0,0,.58);--dsw-alias-state-error-primary:#fe6e6e}
html,body{margin:0;height:100%;background:#07080a;color:#f5f6f8;font-family:system-ui,sans-serif}body{display:flex;justify-content:center}#frame{height:760px;overflow:hidden;background:var(--dsw-alias-bg-base)}
</style></head><body><div id="frame"><div id="root" style="height:100%"></div></div><script>${result.outputFiles[0].text}</script></body></html>`;
writeFileSync(join(outDir, 'harness.html'), html);
writeFileSync(join(outDir, 'target.json'), JSON.stringify({
  harness: join(outDir, 'harness.html'), evidence,
  commit: execSync(`git -C ${JSON.stringify(worktree)} rev-parse HEAD`, { encoding: 'utf8' }).trim(),
  dirty: execSync(`git -C ${JSON.stringify(worktree)} status --porcelain -- plugins/omnimux-viewer specs`, { encoding: 'utf8' }).trim().length > 0,
  sources: {
    picker: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/ReferencePickerPopover.jsx'),
    mime: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/picker-asset-mime.js'),
    composer: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/MediaViewerComposer.jsx'),
    slot: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/media-slot.js'),
    harness: join(here, 'harness.jsx'),
    capture: join(here, 'capture.mjs'),
    build: join(here, 'build.mjs'),
  },
}, null, 2));
console.log('built', join(outDir, 'harness.html'));
