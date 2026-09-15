// Executed inside ego-browser nodejs; options are supplied by the local runner.
const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs/promises');
const path = await import('node:path');
const task = await taskSpace(options.spaceId || 'Clip expression consent regression');
const page = task.page('p1');
const checks = [];
let passed = false;
async function state() {
  return page.evaluate(() => {
    const { frame, marker, project } = window.__clipFixtureReadState();
    const canvas = document.querySelector('canvas[aria-label="Native motion render"]');
    return { frame, marker, projectName: project.name, compositions: project.motionCompositions.length,
      pixel: [...canvas.getContext('2d').getImageData(130, 180, 1, 1).data] };
  });
}
async function expectPosition(x) {
  await page.waitForFunction(value => window.__clipFixtureReadState().frame.x === value, x);
  const current = await state();
  assert.equal(current.frame.status, 'rendered');
  assert.equal(current.frame.propertyValue, x);
  assert.equal(current.frame.error, null);
  return current;
}
async function importSample(name) {
  await page.click('button[aria-label="Project JSON"]');
  await page.click('button[aria-label="Import"]');
  await page.setInputFiles('input[type="file"]', [path.join(options.samples, `${name}.json`)]);
  const markerBeforeImport = await page.evaluate(() => window.__clipSecurityMarker);
  await page.click('button[aria-label="Import Project"]');
  return markerBeforeImport;
}
try {
  await page.goto(options.url);
  await page.waitForSelector('button[aria-label="Project JSON"]');
  // Close only the optional extension toolbar observed during the walkthrough.
  if (await page.evaluate(() => !!document.querySelector('button[aria-label="OmniMux"]'))) {
    await page.click('button[aria-label="OmniMux"]');
  }
  await importSample('imported-code');
  const blocked = await expectPosition(160);
  assert.equal(blocked.marker, 0);
  const geometry = await page.evaluate(() => ['canvas[aria-label="Native motion render"]', 'textarea[aria-label="Expression code"]', 'button[aria-label="允许运行此表达式"]'].map(selector => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { selector, width: rect.width, height: rect.height };
  }));
  assert.ok(geometry.every(rect => rect.width > 0 && rect.height > 0));
  await page.evaluate(() => document.querySelector('button[aria-label="允许运行此表达式"]').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(options.output, 'blocked.png') });
  checks.push({ name: 'native import blocks execution with visible consent', ...blocked, geometry });

  await page.click('button[aria-label="Enabled"]');
  await page.click('button[aria-label="Enabled"]');
  assert.equal((await expectPosition(160)).marker, 0);
  await page.click('button[aria-label="允许运行此表达式"]');
  await page.click('button[aria-label="Render frame"]');
  const approved = await expectPosition(240);
  assert.ok(approved.marker > 0);
  assert.notDeepEqual(approved.pixel, blocked.pixel, 'real native canvas pixels move');
  checks.push({ name: 'explicit local approval moves real native rendering', ...approved });
  await page.screenshot({ path: path.join(options.output, 'approved.png') });

  await page.click('button[aria-label="Edit other composition"]');
  await page.waitForFunction(() => window.__clipFixtureReadState().project.motionCompositions.length === 2);
  await page.click('button[aria-label="Render frame"]');
  checks.push({ name: 'unrelated composition edit preserves consent', ...await expectPosition(240) });
  await page.click('button[aria-label="Undo edit"]');
  await page.waitForFunction(() => window.__clipFixtureReadState().project.motionCompositions.length === 1);
  await page.click('button[aria-label="Render frame"]');
  checks.push({ name: 'undo preserves consent', ...await expectPosition(240) });
  await page.click('button[aria-label="Render export snapshot"]');
  checks.push({ name: 'cloned export frame preserves consent', ...await expectPosition(240) });

  await page.fill('textarea[aria-label="Expression code"]', '(globalThis.__clipSecurityMarker += 1, value + 120)');
  await expectPosition(160);
  const editMarker = (await state()).marker;
  await page.click('button[aria-label="Render frame"]');
  assert.equal((await expectPosition(160)).marker, editMarker);
  checks.push({ name: 'editing exact text pauses execution', ...await state() });
  await page.click('button[aria-label="允许运行此表达式"]');
  await expectPosition(280);
  const beforeImport = await importSample('same-id-changed-code');
  await page.click('button[aria-label="Render frame"]');
  const reopened = await expectPosition(160);
  assert.equal(reopened.marker, beforeImport);
  checks.push({ name: 'reimport of matching ID and approved text clears grant', ...reopened });

  const { verifyDuplicateApproval } = await import(options.duplicateJourney);
  checks.push(await verifyDuplicateApproval(page, options));

  await importSample('built-in-sine');
  await page.click('button[aria-label="Time 0.25"]');
  const sine = await expectPosition(200);
  assert.equal(sine.marker, beforeImport);
  checks.push({ name: 'built-in sine needs no code permission', ...sine });
  await importSample('keyframe');
  await page.click('button[aria-label="Time 0.5"]');
  const keyed = await expectPosition(200);
  assert.equal(keyed.marker, beforeImport);
  checks.push({ name: 'keyframe interpolation remains functional', ...keyed });
  passed = true;
  console.log(JSON.stringify({ passed: true, checks: checks.length, output: options.output }));
} finally {
  await fs.writeFile(path.join(options.output, 'browser-report.json'), JSON.stringify({
    finishedAt: new Date().toISOString(), spaceId: task.spaceId, checks,
  }, null, 2));
  if (passed && !options.deferClosure) {
    const closure = await task.finish({ keep: [] });
    await fs.writeFile(path.join(options.output, 'browser-closure.json'), JSON.stringify({ closed: true, receipt: closure ?? null }, null, 2));
  } else {
    await fs.writeFile(path.join(options.output, 'browser-closure.json'), JSON.stringify({ closed: false, deferred: Boolean(options.deferClosure), passed }, null, 2));
  }
}
