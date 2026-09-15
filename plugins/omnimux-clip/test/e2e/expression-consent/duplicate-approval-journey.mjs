import assert from 'node:assert/strict';
import { join } from 'node:path';

// Reuses the native import, consent and rendering controls from the verified journey.
// The caller owns navigation, TaskSpace and cleanup.
export async function verifyDuplicateApproval(page, { samples, output }) {
  await page.click('button[aria-label="Project JSON"]');
  await page.click('button[aria-label="Import"]');
  await page.setInputFiles('input[type="file"]', [join(samples, 'duplicate-id-hidden-code.json')]);
  const markerBefore = await page.evaluate(() => window.__clipSecurityMarker);
  await page.click('button[aria-label="Import Project"]');
  await page.waitForFunction(() => window.__clipFixtureReadState().project.name === '重复编号仅允许可见代码'
    && window.__clipFixtureReadState().frame.x === 160);
  assert.equal(await page.evaluate(() => document.querySelector('textarea[aria-label="Expression code"]').value), 'value + 80');
  await page.click('button[aria-label="允许运行此表达式"]');
  await page.click('button[aria-label="Render frame"]');
  await page.waitForFunction(() => window.__clipFixtureReadState().frame.x === 240);
  const read = () => page.evaluate(() => {
    const { frame, marker, project } = window.__clipFixtureReadState();
    return { frame, marker, expressions: project.motionCompositions[0].layers[0].expressions };
  });
  const preview = await read();
  const verify = (state) => {
    assert.equal(state.frame.status, 'rendered');
    assert.equal(state.frame.error, null);
    assert.equal(state.frame.x, 240);
    assert.equal(state.frame.y, 180);
    assert.equal(state.marker, markerBefore, 'hidden duplicate-ID code must not execute');
    assert.equal(state.expressions.length, 2);
    assert.equal(state.expressions[0].id, state.expressions[1].id);
    assert.equal(state.expressions[0].code, 'value + 80');
    assert.equal(state.expressions[1].code, '(globalThis.__clipSecurityMarker += 1, value + 90)');
  };
  verify(preview);
  await page.click('button[aria-label="Render export snapshot"]');
  await page.waitForFunction(previous => window.__clipFixtureReadState().frame.renderedRequest > previous, preview.frame.renderedRequest);
  const exported = await read();
  verify(exported);
  await page.screenshot({ path: join(output, 'duplicate-id-approved-visible-only.png') });
  return { name: 'duplicate ID approval grants only displayed code', markerBefore, preview, exported };
}
