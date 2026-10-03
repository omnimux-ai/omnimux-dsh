import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
// Only task-owned child processes are stopped; no shared desktop lifecycle calls.
const assertNativeHostStopped = (stopped) => assert.equal(stopped.hostStopped, true);
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commentFixturePng, commentSeedSource } from '../../test-support/comment-native-seed.mjs';

// Requires the installed official desktop runtime and the established sidebar bridge.
// No fake composer, private store mutation, or model invocation is used.
const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
import { resolveHost, resolveSidebarBridge, stagePlugins, boundedCommand, hashFile, stopOwnedHost } from '../../test-support/comment-native-environment.mjs';
assert.equal(typeof stagePlugins, 'function', 'private staging assembler is available');
function command(binary, args, options = {}) {
  assert.equal(typeof binary, 'string');
  return boundedCommand(binary, args, options);
}

const hasEgoBrowser = (() => {
  try {
    execFileSync('ego-browser', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

test('1756 official native comment ready, full-text pre-step expansion, and removal', { timeout: 300000 }, async () => {
  assert.equal(hasEgoBrowser, true, 'ego-browser is required; unavailable capabilities must fail');
  await mkdir(resolve(root, '.tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(root, '.tmp/comment-native-e2e-'));
  const evidence = resolve(root, '.agent-reports/comment-only-send/formal', temp.split('/').pop());
  let host;
  let log = '';
  const environment = { root, sourceHashes: {}, artifactHashes: {} };
  try {
    await mkdir(evidence, { recursive: true });
    const env = { PATH: '/usr/bin:/bin:/opt/homebrew/bin', HOME: `${temp}/home`, DSH_HOME: `${temp}/dsh`, DSH_AGENTS_HOME: `${temp}/agents`, XDG_CONFIG_HOME: `${temp}/config`, XDG_CACHE_HOME: `${temp}/cache`, XDG_STATE_HOME: `${temp}/state`, TMPDIR: `${temp}/tmp`, ELECTRON_RUN_AS_NODE: '1' };
    await Promise.all(Object.values(env).filter(x => x.startsWith(temp)).map(x => mkdir(x, { recursive: true })));
    const seed = `${temp}/seed`;
    await mkdir(seed);
    await writeFile(`${evidence}/fixture.png`, commentFixturePng());
    await writeFile(`${seed}/index.js`, commentSeedSource(root, evidence));
    await writeFile(`${seed}/package.json`, JSON.stringify({ name: 'qa-native-comments-1756', version: '0.0.0', type: 'module', main: 'index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    await writeFile(`${seed}/cordis.patch.yml`, '- insert:\n    - id: qa-native-comments-1756\n      name: qa-native-comments-1756\n');
    assert.equal(env.DSH_HOME.startsWith(temp), true, 'all host state is task-private');
    const { executable, cli } = await resolveHost(root);
    const sidebar = await resolveSidebarBridge(root, process.env, `${temp}/sidebar`);
    assert.equal(sidebar.name, 'dsh-better-sidebar');
    const staged = await stagePlugins(root, `${temp}/staging`, sidebar);
    environment.sidebar = sidebar;
    for (const [name, script] of Object.entries(staged.buildScripts)) {
      await boundedCommand(process.execPath, [script], { cwd: root });
      environment.artifactHashes[`${name}.builder`] = await hashFile(script);
    }
    for (const path of ['plugins/omnimux/tests/e2e/comment-native.e2e.test.js', 'plugins/omnimux/test-support/comment-native-seed.mjs', 'plugins/omnimux/src/client/attachments/assistantMessageMediaEnhancer.ts', 'plugins/omnimux-viewer/src/media-viewer/MediaViewerTab.jsx', 'plugins/omnimux/test-support/comment-native-environment.mjs']) environment.sourceHashes[path] = await hashFile(resolve(root, path));
    environment.artifactHashes.hubClient = await hashFile(`${staged.hub}/lib/client.js`);
    environment.artifactHashes.viewerClient = await hashFile(`${staged.viewer}/lib/client.js`);
    await writeFile(`${env.DSH_HOME}/settings.yaml`, JSON.stringify({ omnimux: { runtimeMode: 'agent', runtimeAgentId: 'qa-synthetic', runtimeAgentVerified: true } }));
    assert.equal(environment.sidebar.name, 'dsh-better-sidebar', 'public sidebar package identity is installed');
    for (const pkg of [staged.hub, staged.viewer, sidebar.dir, seed]) await boundedCommand(executable, ['--max-http-header-size=65536', '--expose-internals', cli, 'plugin', '--profile', 'web', 'add', pkg], { cwd: root, env });
    host = spawn(executable, ['--max-http-header-size=65536', '--expose-internals', cli, '--profile', 'web', '--port', '0', '--host', '127.0.0.1', '--no-open'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const url = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('official host startup timeout')), 30000);
      const collect = b => { log += b; const match = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/); if (match) { clearTimeout(timer); res(match[0]); } };
      host.stdout.on('data', collect); host.stderr.on('data', collect);
      host.once('exit', code => { clearTimeout(timer); rej(new Error(`host exited ${code}: ${log}`)); });
    });
    const script = `
const fs=await import('node:fs/promises');
const assert=(await import('node:assert/strict')).default;
const out=${JSON.stringify(evidence + '/')};
const task=await taskSpace('1756 formal native comment E2E');
const p=task.page('p1');
const result={spaceId:task.spaceId,checks:[],closed:false};
assert.equal(result.closed,false);
console.log({spaceId:task.spaceId});
const record=(name,value)=>{assert.ok(value,name);result.checks.push(name)};
try {
 await p.goto(${JSON.stringify(url)});
 await p.waitForFunction(()=>document.body.textContent.includes('Internal Testing Notice'),undefined,{timeout:10000});
 await p.click('text="Continue"');
 await p.waitForFunction(()=>document.body.textContent.includes('Configure later'),undefined,{timeout:10000});
 await p.click('text="Configure later"');
 await p.click('text="Ungrouped"');
 // Fresh profile contains only the seed history under Ungrouped.
 await p.click('loc=css:[role=treeitem] >> nth=1');
 await p.waitForFunction(()=>document.querySelector('.omx-chat-media-tail__card'),undefined,{timeout:10000});
 const initialFullscreen=await p.evaluate(()=>document.querySelector('button[aria-label="Exit fullscreen"]')?.checkVisibility({checkVisibilityCSS:true})===true);
 assert.equal(typeof initialFullscreen,'boolean');
 if(initialFullscreen)await p.click('loc=css:button[aria-label="Exit fullscreen"]');
 await p.waitForFunction(()=>{const r=document.querySelector('.omx-chat-media-tail__card')?.getBoundingClientRect();return r&&r.width>0&&r.height>0;},undefined,{timeout:10000});
 result.entrySnapshot=await p.snapshot();
 const entry=await p.evaluate(()=>{const node=document.querySelector('.omx-chat-media-tail__card');const rect=node.getBoundingClientRect();return {title:node.title,width:rect.width,height:rect.height};});
 assert.equal(entry.title,'点击进入画布','current production media entry name');
 assert.equal(entry.width>0&&entry.height>0,true,'media entry has positive geometry');
 // The compatible public bridge may auto-open its registered viewer on first mount.
 assert.equal(typeof initialFullscreen,'boolean');
 await p.click('loc=css:.omx-chat-media-tail__card');
 await p.waitForFunction(()=>document.querySelector('.omx-mv-btn--comment')?.checkVisibility({checkVisibilityCSS:true}),undefined,{timeout:10000});
 result.viewerSnapshot=await p.snapshot();
 const fullscreen=await p.evaluate(()=>{const node=document.querySelector('button[aria-label="Exit fullscreen"]');return !!node&&node.checkVisibility({checkVisibilityCSS:true});});
 assert.equal(typeof fullscreen,'boolean');
 if(fullscreen)await p.click('loc=css:button[aria-label="Exit fullscreen"]');
 await p.click('loc=css:.omx-mv-btn--comment');
 // Canvas has no accessible identifier in the frozen implementation: observed selector.
 await p.click('loc=css:.omx-mv-display');
 await p.fill('loc=css:input[placeholder="添加评论..."]','1756原生评论验收：请把标题改成深蓝色，保留原图布局。');
 record('draft cannot send',await p.evaluate(()=>document.querySelector('button[aria-label="Send message"]').disabled));
 await p.click('loc=css:button[title="提交评论 (Enter)"]');
 await p.waitForFunction(()=>!document.querySelector('button[aria-label="Send message"]').disabled,undefined,{timeout:10000});
 record('ready with empty body',await p.evaluate(()=>document.querySelector('[contenteditable=true]').textContent===''&&document.querySelector('[aria-label="Conversation attachments"]').getBoundingClientRect().height>0));
 await p.screenshot({path:out+'ready.png'});
 const marker=JSON.parse(await fs.readFile(out+'seed-observer-ready.json','utf8'));
 record('exact-session outer reject registered',marker.sessionId==='session-qa-agent-comments-1756'&&marker.prepend&&marker.afterProductionModelCatalog);
 await p.click('loc=css:button[aria-label="Send message"]');
 await p.waitForFunction(()=>!document.querySelector('[aria-label="Conversation attachments"]'),undefined,{timeout:10000});
 await p.click('loc=css:button[title="清空当前所有评论"]');
 const annotating=await p.evaluate(()=>document.querySelector('.omx-mv-display').classList.contains('is-annotating'));
 assert.equal(typeof annotating,'boolean');
 if(!annotating)await p.click('loc=css:.omx-mv-btn--comment');
 await p.click('loc=css:.omx-mv-display');
 await p.fill('loc=css:input[placeholder="添加评论..."]','删除回归：这条评论不发送。');
 await p.click('loc=css:button[title="提交评论 (Enter)"]');
 await p.waitForFunction(()=>!document.querySelector('button[aria-label="Send message"]').disabled,undefined,{timeout:10000});
 await p.click('loc=css:[aria-label="Conversation attachments"] button[aria-label^="Remove "]');
 await p.waitForFunction(()=>!document.querySelector('[aria-label="Conversation attachments"]')&&document.querySelector('button[aria-label="Send message"]').disabled,undefined,{timeout:5000});
 record('remove clears comment and disables empty send',await p.evaluate(()=>!document.querySelector('.omx-mv-toolbar-comments-bar')&&document.querySelector('[contenteditable=true]').textContent===''));
 await p.screenshot({path:out+'removed.png'});
} catch(error) { result.error=String(error);result.snapshot=await p.snapshot().catch(()=>null);await p.screenshot({path:out+'failure.png'}).catch(()=>{});assert.equal(result.closed,false);throw error; }
finally { await task.finish({keep:[]});result.closed=true;await fs.writeFile(out+'browser.json',JSON.stringify(result,null,2)); }
`;
    const { NODE_TEST_CONTEXT: _testContext, ...browserEnv } = process.env;
    const browserOutput = await boundedCommand('ego-browser', ['nodejs'], { cwd: root, env: browserEnv, input: script, deadlineMs: 150000 });
    await writeFile(`${evidence}/ego-output.txt`, browserOutput);
    assert.equal(typeof browserOutput, 'string');
    const decision = JSON.parse(await readFile(`${evidence}/comment-pre-step-decision.json`, 'utf8'));
    const user = decision.messages.find(m => m.source?.kind === 'user');
    assert.ok(user.content.some(c => c.type === 'file'));
    const expanded = user.content.find(c => c.type === 'text').text;
    assert.match(expanded, /图片评论：qa-native-comments\.png/);
    assert.match(expanded, /编号 1.*1756原生评论验收：请把标题改成深蓝色，保留原图布局。/);
    const coordinates = expanded.match(/水平 ([\d.]+)%, 垂直 ([\d.]+)%/);
    assert.ok(coordinates && coordinates.slice(1).every(n => Math.abs(Number(n) - 50) < 2), 'real center click coordinates within pixel rounding tolerance');
    const uploaded = JSON.parse(await readFile(`${evidence}/uploaded-comment.json`, 'utf8'));
    assert.equal(uploaded.sessionId, 'session-qa-agent-comments-1756');
    assert.equal(uploaded.media.length, 1);
    const media = uploaded.media[0];
    assert.equal(media.comments.length, 1);
    const comment = media.comments[0];
    assert.equal(expanded, `图片评论：${media.title}\n图片标识：${media.id}\n编号 ${comment.index} [水平 ${comment.xPercent.toFixed(1)}%, 垂直 ${comment.yPercent.toFixed(1)}%]：${comment.text}`);
    const browser = JSON.parse(await readFile(`${evidence}/browser.json`, 'utf8'));
    assert.equal(browser.closed, true);
    assert.equal(browser.checks.length, 4);
    const journals = (await readdir(`${temp}/dsh/sessions`, { recursive: true })).filter(path => path.endsWith('/session-qa-agent-comments-1756/session.v3.jsonl.zstd'));
    assert.equal(journals.length, 1);
    const journal = await command('zstd', ['-dc', `${temp}/dsh/sessions/${journals[0]}`]);
    await writeFile(`${evidence}/journal.jsonl`, journal);
    const events = journal.trim().split('\n').map(line => JSON.parse(line));
    const inboxIndex = events.findIndex(event => event.type === 'agent/inbox/spliced' && event.data.inserted?.some(m => m.source?.kind === 'user'));
    assert.ok(inboxIndex >= 0);
    const actualTurn = events.slice(inboxIndex);
    assert.ok(actualTurn.some(event => event.type === 'turn/end' && event.data.reason.kind === 'blocked'));
    assert.ok(!actualTurn.some(event => /^(request\/|assistant\/attempt|step\/start)/.test(event.type)), 'outer rejection stops before model request');
    await writeFile(`${evidence}/assertions.json`, JSON.stringify({ uploadedCoordinatesExactlyMatch: true, outerRejectedBeforeRequest: true, browserChecks: browser.checks }, null, 2));
  } finally {
    try {
      const stopped = await stopOwnedHost(host);
      const changedSources = [];
      for (const [path, digest] of Object.entries(environment.sourceHashes)) if (await hashFile(resolve(root, path)) !== digest) changedSources.push(path);
      await writeFile(`${evidence}/host.log`, log.replace(/([?&]token=)\S+/g, '$1[REDACTED]'));
      await writeFile(`${evidence}/cleanup.json`, JSON.stringify({ ...stopped, temp, environment, changedSources }, null, 2));
      assertNativeHostStopped(stopped);
      assert.equal(changedSources.length, 0, 'staged source identity stays unchanged');
      assert.deepEqual(changedSources, []);
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
});
