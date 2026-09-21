import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startFixture } from './inspiration-shot-copy.fixture.mjs'

test('真实预览：分镜标题为人话且单条复制按钮缺席', { timeout: 120000 }, async () => {
  const dir = resolve(import.meta.dirname, '../../.agent-reports/inspiration-modal-shot-copy-issue-2514/e2e', `${Date.now()}-${process.pid}`)
  await mkdir(dir, { recursive: true })
  const fixture = await startFixture()
  try {
    await writeFile(resolve(dir, 'identity.json'), JSON.stringify({ ...fixture.identity, url: fixture.url }, null, 2))
    const script = `
const fs = await import('node:fs/promises');
const assert = (await import('node:assert/strict')).default;
const dir = ${JSON.stringify(dir)};
const task = await taskSpace('2514 分镜标题与单条复制回归');
const p = task.page('p1');
const report = { spaceId: task.spaceId, pass: false };
const save = () => fs.writeFile(dir + '/result.json', JSON.stringify(report, null, 2));
await fs.writeFile(dir + '/owned-space.json', JSON.stringify({ spaceId: task.spaceId }));
await save();
try {
  await p.goto(${JSON.stringify(fixture.url)});
  await p.waitForSelector('.omnimux-inspiration-modal-script-panel h3');
  const metrics = await p.evaluate(() => {
    const heading = document.querySelector('.omnimux-inspiration-modal-script-panel h3');
    const cards = [...document.querySelectorAll('.omnimux-inspiration-shot-card')];
    const actionButtons = [...document.querySelectorAll('.omnimux-inspiration-modal-script-panel .omnimux-inspiration-modal-panel-actions button')];
    const panelCopy = actionButtons.find((button) => (button.textContent || '').trim() === '复制');
    const deconCopy = [...document.querySelectorAll('.omnimux-inspiration-modal-deconstruction-panel .omnimux-inspiration-deconstruct-heading button')].find((button) => (button.textContent || '').trim() === '复制');
    const style = heading ? window.getComputedStyle(heading) : null;
    return {
      heading: heading?.textContent?.trim() || '',
      headingBox: heading?.getBoundingClientRect()?.toJSON() || null,
      whiteSpace: style?.whiteSpace || '',
      cards: cards.length,
      leaked: document.body.innerText.includes('modal.deconstruction'),
      copyPrompt: document.body.innerText.includes('copyPrompt'),
      shotCopyButtons: cards.flatMap((card) => [...card.querySelectorAll('button')].filter((button) => /复制|Prompt|copyPrompt/i.test(button.textContent || button.getAttribute('aria-label') || ''))).length,
      shotCopyBtnClasses: document.querySelectorAll('.omnimux-inspiration-shot-copy-btn').length,
      panelCopy: Boolean(panelCopy),
      deconCopy: Boolean(deconCopy),
    };
  });
  report.metrics = metrics;
  await p.screenshot({ path: dir + '/shots-panel.png' });
  await save();
  assert.equal(metrics.heading, '逐镜头分镜脚本 (4)');
  assert.ok(metrics.headingBox.width > 0 && metrics.headingBox.height > 0);
  assert.equal(metrics.whiteSpace, 'nowrap');
  assert.equal(metrics.cards, 4);
  assert.equal(metrics.leaked, false);
  assert.equal(metrics.copyPrompt, false);
  assert.equal(metrics.shotCopyButtons, 0);
  assert.equal(metrics.shotCopyBtnClasses, 0);
  assert.equal(metrics.panelCopy, true);
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
        done({ code, out: timedOut ? `Browser process timed out and was killed.\n${out}` : out })
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
