// Run with: node plugins/omnimux-browser/extension/tests/e2e/twitter-reply-live.mjs <X-status-url>
// Requires Ego's existing authenticated user context. Never posts or generates.
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root = fileURLToPath(new URL('../../../../../', import.meta.url))
const url = process.argv[2]
if (!url || !/^https:\/\/x\.com\/[^/]+\/status\/\d+$/.test(url)) throw new Error('Supply an X status URL')
const dir = resolve(root, '.workbuddy/evidence/twitter-reply-textarea-1766/e2e', String(Date.now()))
await mkdir(dir, { recursive: true })
await build({ stdin: { contents: `import {initTwitterCopilot} from './plugins/omnimux-browser/extension/src/content/twitter-copilot/index.ts'; initTwitterCopilot();`, resolveDir: root, loader: 'ts' }, bundle: true, format: 'iife', outfile: resolve(dir, 'copilot.js') })
const script = `
const fs = await import('node:fs/promises');
const dir = ${JSON.stringify(dir)};
const t = await taskSpace('1766 reply regression');
const p = t.page('p1');
const results = [];
try {
  for (let round = 0; round < 2; round++) {
    if (round === 0) await p.goto(${JSON.stringify(url)});
    else await p.reload();
    await p.waitForSelector('[data-testid="tweetButtonInline"]');
    await p.evaluate(css => { const s=document.createElement('style'); s.textContent=css; document.head.append(s) }, await fs.readFile(dir+'/copilot.css','utf8'));
    await p.evaluate(await fs.readFile(dir+'/copilot.js','utf8'));
    await p.evaluate(() => document.querySelector('.omnimux-copilot-anchor-btn').scrollIntoView({block:'center'}));
    await p.screenshot({path:dir+'/'+round+'-inactive.png'});
    await p.waitForSelector('.omnimux-copilot-anchor-btn');
    const point = await p.evaluate(() => { const b=document.querySelector('.omnimux-copilot-anchor-btn'); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))} });
    if (!point.hit) throw new Error('Inactive icon obscured');
    await p.mouse.click(point.x, point.y);
    const inactive = await p.evaluate(() => ({menu:!!document.querySelector('.omnimux-copilot-dropdown'), toolbar:document.querySelectorAll('[data-testid="toolBar"]').length, focus:document.activeElement?.getAttribute('data-testid'), count:document.querySelectorAll('.omnimux-copilot-anchor-btn').length}));
    if (!inactive.menu || inactive.toolbar !== 0 || inactive.focus === 'tweetTextarea_0' || inactive.count !== 1) throw new Error('Inactive click failed '+JSON.stringify(inactive));
    await p.screenshot({path:dir+'/'+round+'-menu.png'});
    await p.click('[data-testid="tweetTextarea_0"]');
    await p.waitForSelector('[data-testid="toolBar"] .omnimux-copilot-anchor-btn');
    const expanded = await p.evaluate(() => {const icons=[...document.querySelectorAll('.omnimux-copilot-anchor-btn')];return {count:icons.length, toolbar:!!icons[0]?.closest('[data-testid="toolBar"]'), rect:icons[0]?.getBoundingClientRect().toJSON()}});
    if (expanded.count !== 1 || !expanded.toolbar || !(expanded.rect.width > 0 && expanded.rect.height > 0)) throw new Error('Expanded placement failed '+JSON.stringify(expanded));
    await p.screenshot({path:dir+'/'+round+'-expanded.png'});
    results.push({round,inactive,expanded});
  }
} finally {
  let closed = false;
  try {
    await t.finish({keep:[]});
    closed = true;
  } finally {
    await fs.writeFile(dir+'/report.json',JSON.stringify({mode:'real X; worktree production module injection, not installed extension acceptance',spaceId:t.spaceId,closed,passed:results.length===2 && closed,results},null,2));
  }
}
console.log({dir,passed:results.length===2});
`
await writeFile(resolve(dir, 'ego-script.mjs'), script)
const result = spawnSync('ego-browser', ['nodejs'], { input: script, encoding: 'utf8', timeout: 120000 })
await writeFile(resolve(dir, 'run.log'), (result.stdout || '') + (result.stderr || ''))
process.stdout.write(result.stdout || '')
process.stderr.write(result.stderr || '')
if (result.error) throw result.error
process.exitCode = result.status ?? 1
