import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startFixture } from './inspiration-shot-copy.fixture.mjs'

test('真实预览：内容解构标题与分镜脚本齐平且无分割线', { timeout: 120000 }, async () => {
  const dir = resolve(import.meta.dirname, '../../.agent-reports/inspiration-deconstruct-heading-issue-2521/e2e', `${Date.now()}-${process.pid}`)
  await mkdir(dir, { recursive: true })
  const fixture = await startFixture()
  try {
    await writeFile(resolve(dir, 'identity.json'), JSON.stringify({ ...fixture.identity, url: fixture.url }, null, 2))
    const script = `
const fs = await import('node:fs/promises');
const assert = (await import('node:assert/strict')).default;
const dir = ${JSON.stringify(dir)};
const task = await taskSpace('2521 内容解构标题栏对齐回归');
const p = task.page('p1');
const report = { spaceId: task.spaceId, pass: false };
const save = () => fs.writeFile(dir + '/result.json', JSON.stringify(report, null, 2));
await fs.writeFile(dir + '/owned-space.json', JSON.stringify({ spaceId: task.spaceId }));
await save();
try {
  await p.goto(${JSON.stringify(fixture.url)});
  await p.waitForSelector('.omnimux-inspiration-deconstruct-heading');
  const metrics = await p.evaluate(() => {
    const center = document.querySelector('.omnimux-inspiration-modal-script-panel .omnimux-inspiration-modal-panel-heading');
    const right = document.querySelector('.omnimux-inspiration-deconstruct-heading');
    const sample = (el) => {
      const box = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        top: box.top,
        height: box.height,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        marginBottom: style.marginBottom,
        borderBottomWidth: style.borderBottomWidth,
        borderBottomStyle: style.borderBottomStyle,
      };
    };
    return {
      center: sample(center),
      right: sample(right),
      deconCopy: [...right.querySelectorAll('button')].some((button) => (button.textContent || '').trim() === '复制'),
    };
  });
  report.metrics = metrics;
  await p.screenshot({ path: dir + '/heading-aligned.png' });
  await save();
  const topDelta = Math.abs(metrics.center.top - metrics.right.top);
  const heightDelta = Math.abs(metrics.center.height - metrics.right.height);
  report.topDelta = topDelta;
  report.heightDelta = heightDelta;
  assert.ok(topDelta <= 2, '两栏标题顶边应对齐');
  assert.ok(heightDelta <= 4, '两栏标题高度应一致');
  assert.equal(metrics.right.borderBottomWidth, '0px');
  assert.equal(metrics.right.marginBottom, '12px');
  assert.equal(metrics.deconCopy, true);
  report.pass = true;
} catch (error) {
  report.error = String(error);
} finally {
  try {
    await task.finish({ keep: [] });
    report.finished = true;
  } catch (error) {
    report.finishError = String(error);
    report.pass = false;
  }
  await save();
}
assert.equal(report.pass, true, report.error || report.finishError);
`
    const result = await new Promise((done, reject) => {
      const child = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, 90000)
      child.stdout.on('data', (data) => { out += data })
      child.stderr.on('data', (data) => { out += data })
      child.on('error', (error) => { clearTimeout(timer); reject(error) })
      child.on('close', (code) => {
        clearTimeout(timer)
        done({ code, out: timedOut ? `Browser process timed out and was killed.\\n${out}` : out })
      })
      child.stdin.end(script)
    })
    await writeFile(resolve(dir, 'ego.log'), result.out)
    assert.equal(result.code, 0, result.out)
    const report = JSON.parse(await readFile(resolve(dir, 'result.json'), 'utf8'))
    assert.equal(report.pass, true)
    assert.equal(report.finished, true)
  } finally {
    await fixture.close()
    let saved
    try { saved = JSON.parse(await readFile(resolve(dir, 'result.json'), 'utf8')) } catch {}
    let owned
    try { owned = JSON.parse(await readFile(resolve(dir, 'owned-space.json'), 'utf8')) } catch {}
    let browserCleanup = saved?.finished ? 'finished-in-task' : 'no-recorded-space'
    if (!saved?.finished && Number.isSafeInteger(owned?.spaceId)) {
      const recoveryScript = `
const fs = await import('node:fs/promises');
const result = { spaceId: ${owned.spaceId} };
try {
  const spaces = await listTaskSpaces();
  const owned = spaces.find(space => space.id === result.spaceId);
  if (!owned) result.absent = true;
  else {
    if (owned.ownership !== 'agent') throw new Error('Recorded space is no longer agent-owned');
    const task = await taskSpace(result.spaceId);
    await task.finish({ keep: [] });
    result.finished = true;
  }
} catch (error) { result.error = String(error); }
await fs.writeFile(${JSON.stringify(resolve(dir, 'browser-cleanup.json'))}, JSON.stringify(result, null, 2));
`
      browserCleanup = await new Promise((done) => {
        const child = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'ignore', 'pipe'] })
        let error = ''
        const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
        child.stderr.on('data', (data) => { error += data })
        child.on('error', (failure) => { clearTimeout(timer); done({ error: String(failure) }) })
        child.on('close', (code) => { clearTimeout(timer); done({ code, error }) })
        child.stdin.end(recoveryScript)
      })
    }
    await writeFile(resolve(dir, 'cleanup.json'), JSON.stringify({ serverClosed: true, url: fixture.url, browserCleanup }))
  }
})
