// Executed by ego-browser nodejs; `out` and `url` are prepended by the test runner.
// #3034: each slot definition renders at most one empty well, placeholder and append merged.
const fs = await import('node:fs/promises');
const assert = (await import('node:assert/strict')).default;
const task = await taskSpace('3034 single empty well ' + out);
console.log('SPACE_ID=' + task.spaceId);
const p = task.page('p1'), results = [];
try {
  await p.goto(url + '/?scene=empty');
  await p.waitForFunction(() => window.__panel && document.querySelector('button[aria-label="生成"]'));
  for (const legacy of [false, true]) {
    await p.evaluate((legacy) => {
      const c = window.__panel.catalog, id = 'qa-gate-image';
      if (!c.models.some(m => m.id === id)) {
        const m = { id, label: '离线组合正文图片夹具', listed: true, parameterSchema: {}, operations: [{ id: 'text_to_image', listed: true, output: { type: 'image' },
          inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' }, min: 1, max: 1 }] }] };
        c.image.push(m); c.models.push(m);
      }
      window.__panel.hydrate({ targetId: 'target', edges: [], nodes: [{ id: 'target', type: 'material', position: { x: 400, y: 100 },
        data: { materialType: 'image', nodeKind: 'generate', kind: 'generate', label: '生成目标', prompt: '', ...(legacy ? {} : { inputBindingVersion: 1 }), slotBindings: {}, params: { model: id, operation: 'text_to_image' } } }] });
    }, legacy);
    await p.waitForFunction(() => document.querySelector('button[aria-label="生成"]'));
    await p.waitForTimeout(400);
    const count = await p.evaluate(() => document.querySelectorAll('.wf-slot-well--empty,.wf-slot-well--append').length);
    const tag = legacy ? 'legacy-unbound' : 'new-unbound';
    assert.equal(count, 1, `${tag} expects exactly 1 empty well, got ${count}`);
    results.push({ tag, emptyWells: count });
    await p.screenshot({ path: `${out}/${tag}.png` });
  }
  assert.equal(results.length, 2);
  await fs.writeFile(out + '/browser-result.json', JSON.stringify({ status: 'passed', results }, null, 2));
} finally { await task.finish({ keep: [] }); await fs.writeFile(out + '/browser-cleanup.json', JSON.stringify({ spaceId: task.spaceId, closed: true })); }
