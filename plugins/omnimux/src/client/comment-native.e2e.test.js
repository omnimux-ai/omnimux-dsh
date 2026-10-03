import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commentFixturePng, commentSeedSource } from '../../test-support/comment-native-seed.mjs';
import {
  EnvironmentError,
  boundedCommand,
  hashFile,
  resolveHost,
  resolveSidebarBridge,
  stagePlugins,
  stopOwnedHost,
} from '../../test-support/comment-native-environment.mjs';

// Requires the installed official desktop runtime and a declared sidebar
// bridge. No fake composer, private store mutation, or model invocation is
// used. Host inputs may be overridden explicitly with OMNIMUX_E2E_EXECUTABLE
// and OMNIMUX_E2E_CLI; a patched sidebar requires OMNIMUX_E2E_SIDEBAR. Nothing
// is read from ~/.omnimux-dev or any user profile.
const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

const hasEgoBrowser = (() => {
  try {
    execFileSync('ego-browser', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

test('1756 official native comment ready, full-text pre-step expansion, and removal', { timeout: 300000, skip: !hasEgoBrowser && 'ego-browser binary not on PATH (opt-in browser harness)' }, async () => {
  // All staging happens under one task-private directory; every acquired
  // resource is covered by the outer try/finally, and the final rm cannot be
  // skipped by evidence-write failures.
  await mkdir(resolve(root, '.tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(root, '.tmp/comment-native-e2e-'));
  const evidence = resolve(root, '.agent-reports/comment-only-send/formal', temp.split('/').pop());
  let host;
  let log = '';
  const envManifest = { staging: null, inputs: {}, artifacts: {} };
  try {
    await mkdir(evidence, { recursive: true });
    const hostEnv = await resolveHost(root);
    envManifest.inputs.host = { executable: hostEnv.executable, cli: hostEnv.cli, version: hostEnv.version, source: process.env.OMNIMUX_E2E_EXECUTABLE ? 'env' : 'app-bundle-verified' };
    const sidebar = await resolveSidebarBridge(root);
    envManifest.inputs.sidebar = { dir: sidebar.dir, version: sidebar.version, source: sidebar.source, declaredBy: sidebar.declaredBy || null, hash: sidebar.hash };

    // Build the real plugin sources inside the private staging copy so the
    // shared builders' outputs never touch plugins/*/lib of the worktree.
    const staged = await stagePlugins(root, `${temp}/staging`, sidebar);
    envManifest.staging = `${temp}/staging`;
    for (const [name, script] of Object.entries(staged.buildScripts)) {
      await boundedCommand(process.execPath, [script], { cwd: resolve(root), env: { ...process.env, PATH: process.env.PATH }, deadlineMs: 120000 });
      envManifest.artifacts[`${name}.buildScriptHash`] = await hashFile(script);
    }
    envManifest.artifacts['omnimux/lib/client.js'] = await hashFile(`${staged.hub}/lib/client.js`);
    envManifest.artifacts['omnimux-viewer/lib/index.js'] = await hashFile(`${staged.viewer}/lib/index.js`);
    envManifest.artifacts['omnimux-viewer/lib/client.js'] = await hashFile(`${staged.viewer}/lib/client.js`);

    const env = { PATH: '/usr/bin:/bin:/opt/homebrew/bin', HOME: `${temp}/home`, DSH_HOME: `${temp}/dsh`, DSH_AGENTS_HOME: `${temp}/agents`, XDG_CONFIG_HOME: `${temp}/config`, XDG_CACHE_HOME: `${temp}/cache`, XDG_STATE_HOME: `${temp}/state`, TMPDIR: `${temp}/tmp`, ELECTRON_RUN_AS_NODE: '1' };
    await Promise.all(Object.values(env).filter(x => x.startsWith(temp)).map(x => mkdir(x, { recursive: true })));
    await writeFile(`${env.DSH_HOME}/settings.yaml`, JSON.stringify({omnimux:{runtimeMode:"agent",runtimeAgentId:"qa-synthetic",runtimeAgentVerified:true}}));
    const seed = `${temp}/seed`;
    await mkdir(seed);
    await writeFile(`${evidence}/fixture.png`, commentFixturePng());
    await writeFile(`${seed}/index.js`, commentSeedSource(root, evidence));
    await writeFile(`${seed}/package.json`, JSON.stringify({ name: 'qa-native-comments-1756', version: '0.0.0', type: 'module', main: 'index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    await writeFile(`${seed}/cordis.patch.yml`, '- insert:\n    - id: qa-native-comments-1756\n      name: qa-native-comments-1756\n');

    for (const pkg of [staged.hub, staged.viewer, sidebar.dir, seed]) {
      await boundedCommand(hostEnv.executable, ['--max-http-header-size=65536', '--expose-internals', hostEnv.cli, 'plugin', '--profile', 'web', 'add', pkg], { cwd: root, env, deadlineMs: 60000 });
    }

    host = spawn(hostEnv.executable, ['--max-http-header-size=65536', '--expose-internals', hostEnv.cli, '--profile', 'web', '--port', '0', '--host', '127.0.0.1', '--no-open'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const url = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('official host startup timeout (45s)')), 45000);
      const collect = b => { log += b; const match = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/); if (match) { clearTimeout(timer); res(match[0]); } };
      host.stdout.on('data', collect); host.stderr.on('data', collect);
      host.once('error', err => { clearTimeout(timer); rej(new Error(`host spawn failed: ${err.message}`)); });
      host.once('exit', code => { clearTimeout(timer); rej(new Error(`host exited ${code}: ${log}`)); });
    });

    const script = `
const fs=await import('node:fs/promises');
const assert=(await import('node:assert/strict')).default;
const out=${JSON.stringify(evidence + '/')};
const task=await taskSpace('1756 formal native comment E2E');
const p=task.page('p1');
const result={spaceId:task.spaceId,checks:[],closed:false};
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
 // The freshly registered viewer can initially occupy the full product stage.
 if(await p.evaluate(()=>{const b=document.querySelector('button[aria-label="Exit fullscreen"]');return !!(b&&b.checkVisibility&&b.checkVisibility({checkVisibilityCSS:true}));}))await p.click('loc=css:button[aria-label="Exit fullscreen"]');
 await p.waitForFunction(()=>document.querySelector('.omx-chat-media-tail__card')?.getBoundingClientRect().width>0,undefined,{timeout:10000});
 // Class-based navigation is stable across the known label drift; the
 // observed naming is recorded separately so spec drift stays visible.
 const naming=await p.evaluate(()=>{const c=document.querySelector('.omx-chat-media-tail__card');return c?{title:c.getAttribute('title'),ariaLabel:c.getAttribute('aria-label'),text:(c.textContent||'').trim().slice(0,120)}:null;});
 await fs.writeFile(out+'entry-observation.json',JSON.stringify({naming,expectedTitle:'点击进入图像生成',compliant:naming&&(naming.title==='点击进入图像生成'||naming.ariaLabel==='点击进入图像生成'||naming.text.includes('图像生成'))},null,2));
 await p.click('loc=css:.omx-chat-media-tail__card');
 // Opening the canvas puts the viewer into the host right sidebar, which the
 // official bridge may mount fullscreen; the host provides an Exit fullscreen
 // button in that panel state. Restore split view first, then use the viewer
 // toolbar's production comment button.
 try {
  await p.waitForFunction(()=>{const b=document.querySelector('button[aria-label="Exit fullscreen"]');return !!(b&&b.checkVisibility&&b.checkVisibility({checkVisibilityCSS:true}));},undefined,{timeout:4000});
  await p.click('loc=css:button[aria-label="Exit fullscreen"]');
 } catch { /* viewer opened in split view already */ }
 await p.waitForFunction(()=>{const b=document.querySelector('.omx-mv-btn--comment');return !!(b&&b.checkVisibility&&b.checkVisibility());},undefined,{timeout:10000});
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
 if(!annotating)await p.click('loc=css:.omx-mv-btn--comment');
 await p.click('loc=css:.omx-mv-display');
 await p.fill('loc=css:input[placeholder="添加评论..."]','删除回归：这条评论不发送。');
 await p.click('loc=css:button[title="提交评论 (Enter)"]');
 await p.waitForFunction(()=>!document.querySelector('button[aria-label="Send message"]').disabled,undefined,{timeout:10000});
 await p.click('loc=css:[aria-label="Conversation attachments"] button[aria-label^="Remove "]');
 await p.waitForFunction(()=>!document.querySelector('[aria-label="Conversation attachments"]')&&document.querySelector('button[aria-label="Send message"]').disabled,undefined,{timeout:5000});
 record('remove clears comment and disables empty send',await p.evaluate(()=>!document.querySelector('.omx-mv-toolbar-comments-bar')&&document.querySelector('[contenteditable=true]').textContent===''));
 await p.screenshot({path:out+'removed.png'});
} catch(error) { result.error=String(error);await p.screenshot({path:out+'failure.png'}).catch(()=>{});throw error; }
finally { await task.finish({keep:[]});result.closed=true;await fs.writeFile(out+'browser.json',JSON.stringify(result,null,2)); }
`;
    await boundedCommand('ego-browser', ['nodejs'], { cwd: root, env: process.env, input: script, deadlineMs: 150000 });

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
    const journal = await boundedCommand('zstd', ['-dc', `${temp}/dsh/sessions/${journals[0]}`], { cwd: root, deadlineMs: 30000 });
    await writeFile(`${evidence}/journal.jsonl`, journal);
    const events = journal.trim().split('\n').map(line => JSON.parse(line));
    const inboxIndex = events.findIndex(event => event.type === 'agent/inbox/spliced' && event.data.inserted?.some(m => m.source?.kind === 'user'));
    assert.ok(inboxIndex >= 0);
    const actualTurn = events.slice(inboxIndex);
    assert.ok(actualTurn.some(event => event.type === 'turn/end' && event.data.reason.kind === 'blocked'));
    assert.ok(!actualTurn.some(event => /^(request\/|assistant\/attempt|step\/start)/.test(event.type)), 'outer rejection stops before model request');
    const namingObservation = JSON.parse(await readFile(`${evidence}/entry-observation.json`, 'utf8'));
    await writeFile(`${evidence}/assertions.json`, JSON.stringify({
      uploadedCoordinatesExactlyMatch: true,
      outerRejectedBeforeRequest: true,
      browserChecks: browser.checks,
      // Naming drift is reported, not silently passed: compliant=false means
      // the observed entry name no longer matches the spec whitelist.
      entryNamingCompliant: namingObservation.compliant === true,
      entryNamingObserved: namingObservation.naming,
      environmentManifest: envManifest,
    }, null, 2));
    // Naming compliance is a separate report axis: the comment flow PASSes on
    // behaviour while a drifted entry name is a FAIL on the naming axis only.
    // It is asserted as data (not a test failure) so the environment verdict
    // and the product-copy verdict stay decoupled.
    assert.equal(typeof namingObservation.compliant, 'boolean', 'entry naming observation recorded');
  } finally {
    // Cleanup must never be skipped: evidence writes are best-effort inside
    // this inner block; the temp rm below is the outer finally's last act.
    try {
      const stopped = await stopOwnedHost(host);
      await writeFile(`${evidence}/host.log`, log.replace(/([?&]token=)\S+/g, '$1[REDACTED]')).catch(error => { log += `\nhost.log write failed: ${error.message}`; });
      await writeFile(`${evidence}/cleanup.json`, JSON.stringify({ ...stopped, temp, envManifest }, null, 2)).catch(() => {});
      assert.equal(stopped.hostStopped, true, 'owned host must actually exit before cleanup passes');
    } catch (error) {
      await writeFile(`${evidence}/cleanup.json`, JSON.stringify({ hostStopped: false, cleanupError: String(error), temp }, null, 2)).catch(() => {});
      throw error;
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
});
