/**
 * Build the #3112 QA page: real useRivalFeed + RivalAccountsPanel +
 * RivalFeedGrid + tokens/styles, bundled with the worktree's own react and
 * the workspace dsh-ui-kit (one React copy, real components, no shims).
 * Output: tmp-qa/demo.html + tmp-qa/demo-bundle.js
 */
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const W = resolve(here, '..', '..', '..', '..')  // worktree root
const MAIN = '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh'

await build({
  absWorkingDir: W,
  entryPoints: [resolve(here, 'demo-entry.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  outfile: resolve(here, '..', 'tmp-qa', 'demo-bundle.js'),
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
  logLevel: 'warning',
  alias: {
    'react': resolve(MAIN, 'node_modules/react'),
    'react-dom': resolve(MAIN, 'node_modules/react-dom'),
    'react-dom/client': resolve(MAIN, 'node_modules/react-dom/client.js'),
    'react/jsx-runtime': resolve(MAIN, 'node_modules/react/jsx-runtime.js'),
    'dsh-ui-kit': resolve(W, 'packages/dsh-ui-kit/lib/index.js'),
    '@deepseek-ai/dsh-client-ui-primitives': resolve(MAIN, 'node_modules/.pnpm/@deepseek-ai+dsh-client-ui-primitives@0.1.0-rc.8_@deepseek-ai+cordis@4.0.2_@deepseek-ai_49bc6d3bd4d96390c43f21806df0b0e7/node_modules/@deepseek-ai/dsh-client-ui-primitives'),
  },
})

const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>#3112 QA · 账号监控首采进度承诺</title>
<style>
/* Alias tokens copied verbatim from the v2.1 prototype — the real
   --dsw-specific-media-* / --dsw-specific-velocity-* come from rival-tokens.js. */
:root {
  --dsw-alias-bg-base: #111113;
  --dsw-alias-bg-layer-1: rgba(255,255,255,0.04);
  --dsw-alias-bg-layer-2: rgba(255,255,255,0.07);
  --dsw-alias-bg-layer-3: rgba(255,255,255,0.09);
  --dsw-alias-bg-elevated: #1c1c1f;
  --dsw-alias-bg-mask-1: rgba(0,0,0,0.55);
  --dsw-alias-label-primary: #ffffff;
  --dsw-alias-label-secondary: rgba(255,255,255,0.72);
  --dsw-alias-label-tertiary: rgba(255,255,255,0.40);
  --dsw-alias-label-dimmed: rgba(255,255,255,0.28);
  --dsw-alias-border-l1: rgba(255,255,255,0.06);
  --dsw-alias-border-l2: rgba(255,255,255,0.12);
  --dsw-alias-border-l3: rgba(255,255,255,0.22);
  --dsw-alias-border-l4: rgba(255,255,255,0.32);
  --dsw-alias-interactive-bg-hover: rgba(255,255,255,0.08);
  --dsw-alias-interactive-bg-active: rgba(255,255,255,0.12);
  --dsw-alias-brand-primary: #7961f2;
  --dsw-alias-state-business-tertiary: rgba(121,97,242,0.22);
  --dsw-alias-state-error-primary: #f87171;
  --dsw-alias-state-warn-primary: #fbbf24;
  --dsw-alias-state-warn-bg: rgba(245,158,11,0.20);
  --dsw-alias-label-primary-foreground: #111113;
  --dsw-alias-bg-tertiary: rgba(255,255,255,0.07);
  --dsw-alias-state-error-text: #f87171;
  --dsw-alias-bg-module-platform: #1a1a1d;
  --dsw-alias-button-primary-fill: #ffffff;
  --dsw-alias-button-primary-hover: rgba(255,255,255,0.88);
  --dsw-alias-button-ghost-active-fill: rgba(121,97,242,0.18);
  --dsw-alias-button-ghost-active-border: rgba(121,97,242,0.5);
  --dsw-alias-button-ghost-active-hover: rgba(121,97,242,0.24);
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}
html[data-theme="light"] {
  --dsw-alias-bg-base: #ffffff;
  --dsw-alias-bg-layer-1: #f7f7f8;
  --dsw-alias-bg-layer-2: #f0f1f3;
  --dsw-alias-bg-layer-3: #e5e7eb;
  --dsw-alias-bg-elevated: #ffffff;
  --dsw-alias-bg-mask-1: rgba(0,0,0,0.35);
  --dsw-alias-label-primary: #111827;
  --dsw-alias-label-secondary: #4b5563;
  --dsw-alias-label-tertiary: #9ca3af;
  --dsw-alias-label-dimmed: #cbd5e1;
  --dsw-alias-border-l1: rgba(0,0,0,0.06);
  --dsw-alias-border-l2: #e5e7eb;
  --dsw-alias-border-l3: #d1d5db;
  --dsw-alias-border-l4: #9ca3af;
  --dsw-alias-interactive-bg-hover: rgba(0,0,0,0.05);
  --dsw-alias-interactive-bg-active: rgba(0,0,0,0.09);
  --dsw-alias-brand-primary: #6757e7;
  --dsw-alias-state-business-tertiary: rgba(103,87,231,0.20);
  --dsw-alias-state-error-primary: #dc2626;
  --dsw-alias-state-warn-primary: #d97706;
  --dsw-alias-state-warn-bg: rgba(217,119,6,0.16);
  --dsw-alias-label-primary-foreground: #ffffff;
  --dsw-alias-bg-tertiary: #f0f1f3;
  --dsw-alias-state-error-text: #dc2626;
  --dsw-alias-bg-module-platform: #e8eaed;
  --dsw-alias-button-primary-fill: #111827;
  --dsw-alias-button-primary-hover: rgba(17,24,39,0.88);
  --dsw-alias-button-ghost-active-fill: rgba(103,87,231,0.14);
  --dsw-alias-button-ghost-active-border: rgba(103,87,231,0.5);
  --dsw-alias-button-ghost-active-hover: rgba(103,87,231,0.2);
}
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
body {
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--font-family);
  min-height: 100vh;
  padding: 24px 28px 64px;
}
.qa-stage { max-width: 1400px; margin: 0 auto; }
.qa-note {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  background: var(--dsw-alias-bg-elevated); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
  padding: 8px 16px; font-size: 12px; z-index: 50;
  box-shadow: 0 10px 28px var(--dsw-alias-bg-mask-1);
}
</style>
</head>
<body>
<link rel="stylesheet" href="./demo-bundle.css" />
<div id="app"></div>
<script type="module" src="./demo-bundle.js"></script>
</body>
</html>
`

mkdirSync(resolve(here, '..', 'tmp-qa'), { recursive: true })
writeFileSync(resolve(here, '..', 'tmp-qa', 'demo.html'), html)
console.log('built tmp-qa/demo.html + demo-bundle.js')
