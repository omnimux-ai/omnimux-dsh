#!/usr/bin/env node
/**
 * Build the Flow-alignment browser harness (real MediaViewerTab + real store)
 * and write a target manifest the ego capture script reads. Task-local evidence
 * tooling only; nothing here ships in the plugin bundle.
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const worktree = resolve(here, '../../../..');
const outDir = '/tmp/flow-alignment-3533';
const evidence = join(worktree, 'docs/evidence/media-viewer-flow-alignment');
mkdirSync(outDir, { recursive: true });
mkdirSync(evidence, { recursive: true });

const result = await build({
  entryPoints: [join(here, 'harness.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.jsx': 'jsx' },
  logLevel: 'silent',
  plugins: [{
    name: 'kit-stub',
    setup(builder) {
      builder.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: 'dsh-ui-kit', namespace: 'kit-stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'kit-stub' }, () => ({
        loader: 'js',
        resolveDir: here,
        contents: `import React from 'react';
export const GenWaveCard = () => React.createElement('div', { className: 'stub-genwave' });
export const Button = (props) => React.createElement('button', props, props.children);
export default { GenWaveCard, Button };`,
      }));
    },
  }],
});

const bundle = result.outputFiles[0].text;
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Flow alignment harness</title>
<style>
  :root {
    --dsw-alias-bg-base: #0f1013;
    --dsw-alias-bg-primary: #0f1013;
    --dsw-alias-bg-layer-1: #17191d;
    --dsw-alias-bg-layer-2: #1d2025;
    --dsw-alias-bg-layer-3: #272a31;
    --dsw-alias-bg-elevated: #1c1f24;
    --dsw-alias-border-l1: rgba(255,255,255,0.08);
    --dsw-alias-border-l2: rgba(255,255,255,0.12);
    --dsw-alias-border-l3: rgba(255,255,255,0.22);
    --dsw-alias-border: rgba(255,255,255,0.14);
    --dsw-alias-label-primary: #f5f6f8;
    --dsw-alias-label-secondary: rgba(255,255,255,0.72);
    --dsw-alias-label-tertiary: rgba(255,255,255,0.45);
    --dsw-alias-interactive-bg-hover: rgba(255,255,255,0.08);
    --dsw-alias-interactive-bg-active: rgba(255,255,255,0.14);
    --dsw-alias-brand-primary: #7961f2;
    --dsw-alias-bg-mask-1: rgba(0,0,0,0.58);
    --dsw-alias-state-error-primary: #fe6e6e;
  }
  html, body { margin: 0; height: 100%; background: #07080a; color: #f5f6f8; font-family: system-ui, sans-serif; }
  body { display: flex; align-items: flex-start; justify-content: center; padding: 0; }
  #frame { height: 800px; max-width: 100%; overflow: hidden; background: var(--dsw-alias-bg-base); box-shadow: 0 0 0 1px rgba(255,255,255,0.08); }
</style>
</head>
<body>
<div id="frame"><div id="root" style="height:100%"></div></div>
<script>${bundle}</script>
</body>
</html>`;

const harnessPath = join(outDir, 'harness.html');
writeFileSync(harnessPath, html);
const commit = execSync(`git -C ${JSON.stringify(worktree)} rev-parse HEAD`, { encoding: 'utf8' }).trim();
const dirty = execSync(`git -C ${JSON.stringify(worktree)} status --porcelain -- plugins/omnimux-viewer specs`, { encoding: 'utf8' }).trim().length > 0;
writeFileSync(join(outDir, 'target.json'), JSON.stringify({
  harness: harnessPath,
  evidence,
  worktree,
  commit,
  dirty,
  sources: {
    tab: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/MediaViewerTab.jsx'),
    panel: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/HistoryPanel.jsx'),
    styles: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/flow-alignment-styles.js'),
    history: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/generation-history.js'),
    cost: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/media-cost.js'),
    composer: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/MediaViewerComposer.jsx'),
    composerData: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/MediaViewerComposerData.js'),
    configControls: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/MediaConfigControls.jsx'),
    mount: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/mount.js'),
    locales: join(worktree, 'plugins/omnimux-viewer/src/client/locales.ts'),
    copy: join(worktree, 'plugins/omnimux-viewer/src/media-viewer/flow-alignment-copy.js'),
    harness: join(worktree, 'plugins/omnimux-viewer/test-support/media-viewer-flow-alignment/harness.jsx'),
    capture: join(worktree, 'plugins/omnimux-viewer/test-support/media-viewer-flow-alignment/capture.mjs'),
    buildHarness: join(worktree, 'plugins/omnimux-viewer/test-support/media-viewer-flow-alignment/build-harness.mjs'),
  },
}, null, 2));
console.log(JSON.stringify({ harness: harnessPath, evidence, commit }, null, 2));
