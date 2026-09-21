import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startFixture } from './inspiration-shot-copy.fixture.mjs'

test('真实预览：分镜与内容解构卡片左右外边距同为 8', { timeout: 120000 }, async () => {
  const dir = resolve(import.meta.dirname, '../../.agent-reports/inspiration-card-margin-issue-2528/e2e', `${Date.now()}-${process.pid}`)
  await mkdir(dir, { recursive: true })
  const fixture = await startFixture()
  try {
    await writeFile(resolve(dir, 'identity.json'), JSON.stringify({ ...fixture.identity, url: fixture.url }, null, 2))
    const script = `
const fs = await import('node:fs/promises');
const assert = (await import('node:assert/strict')).default;
const dir = ${JSON.stringify(dir)};
const task = await taskSpace('2528 卡片外边距回归');
const p = task.page('p1');
const report = { spaceId: task.spaceId, pass: false };
const save = () => fs.writeFile(dir + '/result.json', JSON.stringify(report, null, 2));
await fs.writeFile(dir + '/owned-space.json', JSON.stringify({ spaceId: task.spaceId }));
await save();
try {
  await p.goto(${JSON.stringify(fixture.url)});
  await p.waitForSelector('.omnimux-inspiration-workbench-right .omnimux-inspiration-doc-section');
  const metrics = await p.evaluate(() => {
    const inset = (panelSel, cardSel) => {
      const panel = document.querySelector(panelSel);
      const card = panel.querySelector(cardSel);
      const panelBox = panel.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      const style = window.getComputedStyle(panel);
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const borderRight = parseFloat(style.borderRightWidth) || 0;
      return {
        left: Math.round(cardBox.left - panelBox.left - borderLeft),
        right: Math.round(panelBox.right - cardBox.right - borderRight),
      };
    };
    const prompt = document.querySelector('.omnimux-inspiration-shot-prompt');
    return {
      center: inset('.omnimux-inspiration-workbench-center', '.omnimux-inspiration-shot-card'),
      right: inset('.omnimux-inspiration-workbench-right', '.omnimux-inspiration-doc-section'),
      promptWrap: window.getComputedStyle(prompt).whiteSpace,
    };
  });
  report.metrics = metrics;
  await p.screenshot({ path: dir + '/card-margin.png' });
  await save();
  for (const side of [metrics.center, metrics.right]) {
    assert.equal(side.left, 8);
    assert.equal(side.right, 8);
  }
  assert.equal(metrics.promptWrap, 'normal');
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
    if (!saved?.finished && Number.isSafeInteger(owned?.spaceId)) {
      const recoveryScript = `
const fs = await import('node:fs/promises');
const result = { spaceId: ${owned.spaceId} };
try {
  const spaces = await listTaskSpaces();
  const ownedSpace = spaces.find(space => space.id === result.spaceId);
  if (!ownedSpace) result.absent = true;
  else {
    if (ownedSpace.ownership !== 'agent') throw new Error('Recorded space is no longer agent-owned');
    const task = await taskSpace(result.spaceId);
    await task.finish({ keep: [] });
    result.finished = true;
  }
} catch (error) { result.error = String(error); }
await fs.writeFile(${JSON.stringify(resolve(dir, 'browser-cleanup.json'))}, JSON.stringify(result, null, 2));
`
      await new Promise((done) => {
        const child = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'ignore', 'pipe'] })
        const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
        child.on('error', () => { clearTimeout(timer); done() })
        child.on('close', () => { clearTimeout(timer); done() })
        child.stdin.end(recoveryScript)
      })
    }
  }
})
