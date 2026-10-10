import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** Explicit synthetic graphs; no current supplier qualification or generated output is asserted. */
const mediaGraph = {
  nodes: [
    { id: 'roles', type: 'material', position: { x: 40, y: 60 }, data: { nodeKind: 'media', label: '角色参考 · 合成测试', mediaType: 'image', params: { operation: 'image-to-image', untouched: false }, mediaAssets: [
      { type: 'image', pathOrUrl: 'https://assets.example.invalid/role-a.png', role: 'first_frame', targetSlot: 'first', mime: 'IMAGE/unknown', sizeBytes: 0, durationSec: null, sourceNodeId: 'roles', edgeId: 'reference-link', outputId: 'original-output-a', outputVersion: 'original-v1', originalName: '原图 A.PNG', dimensions: { width: 512, height: 768 } },
      { type: 'image', pathOrUrl: 'https://assets.example.invalid/role-b.png', role: 'last_frame', targetSlot: 'last', mimeType: 'image/png', sizeBytes: 81, outputId: 'original-output-b', outputVersion: 'original-v2', originalName: '原图 B.png' },
    ] } },
    { id: 'motion', type: 'material', position: { x: 40, y: 370 }, data: { nodeKind: 'media', label: '动作视频 · 合成测试', mediaType: 'video', mediaAssets: [
      { type: 'video', pathOrUrl: 'https://assets.example.invalid/motion.mp4', role: 'reference', mime: 'video/mp4', sizeBytes: 100, durationSec: 5, outputId: 'original-motion-output', outputVersion: 'original-motion-v1' },
    ] } },
    { id: 'description', type: 'material', position: { x: 480, y: 60 }, data: { nodeKind: 'text', label: '说明 · 合成测试', text: '同一角色保留原始素材信息', params: { untouched: 0 } } },
  ],
  edges: [{ id: 'reference-link', source: 'roles', target: 'description', targetHandle: 'input' }, { id: 'motion-link', source: 'motion', target: 'description', targetHandle: 'input' }],
};
const digest = value => createHash('sha256').update(value).digest('hex');

export async function consumerJourney({ page, evidenceDir, processProof, record }) {
  const observations = [];
  const observe = (name, detail) => { const item = { name, pass: true, detail }; observations.push(item); record?.(name, detail); };
  async function jsonRequest(url, options) {
    const response = await page.fetch(url, { ...options, headers: { 'content-type': 'application/json' } });
    assert.equal(response.status, 200, 'Synthetic fixture setup must use the normal application route');
    return typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  }
  // Probe only already-observed normal application's labels; no foreign mounting or DOM layout patches.
  async function choose(trigger, option) {
    await page.click(`loc=role:button[name="${trigger}"]`);
    await page.waitForSelector('.wf-custom-select-dropdown', { state: 'visible', timeout: 10000 });
    const snapshot = await page.snapshot();
    fs.appendFileSync(join(evidenceDir, 'functional-snapshots.txt'), snapshot + '\n');
    await page.click(`.wf-custom-select-dropdown button[title="${option}"]`);
    await page.waitForFunction(() => !document.querySelector('.wf-custom-select-dropdown'), undefined, { timeout: 10000 });
  }
  await page.waitForFunction(() => document.querySelector('[aria-label="Choose workspace"]') || document.querySelector('[data-dsh-omnimux-workflow-entry]') || [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Continue'), undefined, { timeout: 30000 });
  let snapshot = await page.snapshot();
  fs.writeFileSync(join(evidenceDir, 'onboarding-snapshot.txt'), snapshot);
  if (await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Continue'))) await page.click('loc=role:button[name="Continue"]');
  if (await page.evaluate(() => Boolean(document.querySelector('[aria-label="Choose workspace"]')))) {
    await page.click('[aria-label="Choose workspace"]');
    fs.appendFileSync(join(evidenceDir, 'functional-snapshots.txt'), await page.snapshot() + '\n');
    await page.click('loc=role:menuitem[name="生成输入检查 · 合成验收"]');
  }
  await page.waitForSelector('[data-dsh-omnimux-workflow-entry]', { state: 'visible', timeout: 30000 });
  const connectedGraph = structuredClone(mediaGraph);
  for (const node of connectedGraph.nodes) {
    node.data.nodeKind = 'import'; node.data.materialType = node.data.mediaType || 'text';
    for (const asset of node.data.mediaAssets || []) {
      asset.pathOrUrl = asset.type === 'video' ? '/omnimux-workflow/api/workspaces/ws_generation_connected/file?rel=assets%2Ffixture-video.mp4' : processProof.fixtureOrigin + '/qa-media/' + asset.outputId + '.png';
      asset.url = asset.pathOrUrl;
    }
  }
  const workspaceIds = ['ws_generation_empty', 'ws_generation_connected', 'ws_generation_old'];
  const cases = [{ name: '空白创作页 · 合成验收', graph: { nodes: [], edges: [] } }, { name: '完整素材 · 合成验收', graph: connectedGraph }, { name: '旧用途 · 合成验收', graph: { nodes: processProof.legacy.nodes, edges: [] } }];
  for (let index = 0; index < cases.length; index++) {
    const id = workspaceIds[index];
    const created = await jsonRequest('/omnimux-workflow/api/workspaces', { method: 'POST', body: JSON.stringify({ id, name: cases[index].name }) });
    await jsonRequest('/omnimux-workflow/api/workspaces/' + id, { method: 'PUT', body: JSON.stringify({ expectedVersion: created.workspace.version, ...cases[index].graph }) });
  }
  const sessionId = await page.evaluate(async workspaceId => {
    const sessions = window.__omnimuxWorkflow?.sessions;
    if (!sessions || typeof sessions.create !== 'function') throw new Error('Normal application session service missing');
    const created = await sessions.create({ workspaceId });
    if (typeof created !== 'string' || !created) throw new Error('Normal application session identity missing');
    return created;
  }, processProof.workspaceId);
  const project = await jsonRequest('/omnimux-workflow/api/projects', { method: 'POST', body: JSON.stringify({ title: '生成预检 · 合成验收', projectRoot: processProof.workspacePath, sessionId, canvasWorkspaceIds: [workspaceIds[0]] }) });
  for (let index = 1; index < cases.length; index++) await jsonRequest(`/omnimux-workflow/api/projects/${project.project.id}/pages`, { method: 'POST', body: JSON.stringify({ title: cases[index].name, canvasWorkspaceId: workspaceIds[index] }) });
  observe('formal-fixtures-created', { workspaceIds, projectId: project.project.id, sessionId, synthetic: true });

  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.__generationQaRequests = [];
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method || (typeof input !== 'string' ? input.method : '') || 'GET';
      const path = new URL(url, location.href).pathname;
      const entry = { path, method };
      if (path.startsWith('/omnimux/generation-products') && typeof init?.body === 'string') entry.body = JSON.parse(init.body);
      window.__generationQaRequests.push(entry);
      return original(input, init);
    };
  });
  await page.click('[data-dsh-omnimux-workflow-entry]');
  await page.waitForFunction(() => document.body.textContent.includes('生成预检 · 合成验收'), undefined, { timeout: 30000 });
  fs.appendFileSync(join(evidenceDir, 'functional-snapshots.txt'), await page.snapshot() + '\n');
  await page.click('text="生成预检 · 合成验收"');
  fs.appendFileSync(join(evidenceDir, 'functional-snapshots.txt'), await page.snapshot() + '\n');
  await page.waitForSelector('loc=role:button[name="打开创作页 生成预检 · 合成验收"]', { state: 'visible', timeout: 15000 });
  await page.click('loc=role:button[name="打开创作页 生成预检 · 合成验收"]');
  await page.waitForSelector('button:text-is("检查生成输入")', { state: 'visible', timeout: 30000 });
  const entryGeometry = await page.evaluate(() => { const element = document.querySelector('.wf-generation-draft-entry'); const rect = element.getBoundingClientRect(); return { width: rect.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, label: element.textContent, styleWidth: getComputedStyle(element).width }; });
  fs.writeFileSync(join(evidenceDir, 'entry-geometry.json'), JSON.stringify(entryGeometry, null, 2) + '\n');
  await page.screenshot({ path: join(evidenceDir, 'entry-geometry.png') });
  assert.ok(entryGeometry.clientWidth >= entryGeometry.scrollWidth, 'New input-check label must not be clipped by the existing icon button width');
  await page.click('loc=role:button[name="检查生成输入"]');
  await page.waitForFunction(() => !document.body.textContent.includes('正在读取生成条件'), undefined, { timeout: 15000 });
  snapshot = await page.snapshot(); fs.appendFileSync(join(evidenceDir, 'functional-snapshots.txt'), snapshot + '\n');
  await page.screenshot({ path: join(evidenceDir, 'empty-input-check.png') });
  const status = await page.evaluate(() => document.querySelector('.wf-generation-draft')?.textContent);
  assert.ok(status?.includes('仅检查输入，不会生成或修改原任务。'));
  if (status.includes('生成条件暂不可用')) throw new Error('Real authoritative product directory unavailable in full application');
  await choose('产品', '生图');
  const directory = await jsonRequest('/omnimux/generation-products', {});
  const imageIntent = directory.products.find(product => product.productId === 'generation.image').intents[0];
  await choose('用途', imageIntent.label);
  await page.fill('textarea[aria-label="说明"]', '  保留原始说明\n');
  await page.click('loc=role:button[name="检查输入"]');
  await page.waitForFunction(() => !document.body.textContent.includes('正在检查'), undefined, { timeout: 15000 });
  const requests = await page.evaluate(() => window.__generationQaRequests);
  const post = requests.filter(item => item.path === '/omnimux/generation-products/preview' && item.method === 'POST').at(-1);
  assert.ok(post); assert.deepEqual(post.body.assets, []); assert.equal(post.body.prompt, '  保留原始说明\n');
  assert.deepEqual(Object.keys(post.body).sort(), ['assets', 'currentFingerprint', 'intent', 'parameters', 'productId', 'prompt', 'schemaVersion'].sort());
  await page.screenshot({ path: join(evidenceDir, 'empty-authoritative-result.png') });
  observe('empty-authoritative-post', { body: post.body, executable: false });
  await page.click('loc=role:button[name="丢弃草稿"]');
  await page.waitForFunction(() => !document.querySelector('.wf-generation-draft'), undefined, { timeout: 10000 });
  const afterEmpty = await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[0], {});
  assert.deepEqual(afterEmpty.workspace.nodes, []); assert.deepEqual(afterEmpty.workspace.edges, []);
  await page.click('.wf-page-header-capsule');
  fs.appendFileSync(join(evidenceDir, 'functional-snapshots.txt'), await page.snapshot() + '\n');
  await page.click('.wf-page-dropdown-item-title:text-is("完整素材 · 合成验收")');
  await page.waitForFunction(() => document.querySelector('.wf-page-header-title')?.textContent === '完整素材 · 合成验收' && document.querySelectorAll('.react-flow__node').length === 3, undefined, { timeout: 20000 });
  await page.screenshot({ path: join(evidenceDir, 'connected-canvas.png') });
  const beforeConnected = await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[1], {});
  await page.click('loc=role:button[name="检查生成输入"]');
  await page.waitForFunction(() => !document.body.textContent.includes('正在读取生成条件'), undefined, { timeout: 15000 });
  await choose('产品', '生视频');
  const videoDirectory = await jsonRequest('/omnimux/generation-products', {});
  fs.writeFileSync(join(evidenceDir, 'actual-public-directory.json'), JSON.stringify(videoDirectory, null, 2) + '\n');
  const videoIntent = videoDirectory.products.find(item => item.productId === 'generation.video').intents.find(item => item.intent === 'first_last_frame');
  assert.ok(videoIntent);
  await choose('用途', videoIntent.label);
  fs.appendFileSync(join(evidenceDir, 'functional-snapshots.txt'), await page.snapshot() + '\n');
  for (const label of ['roles [0] / reference-link', 'roles [1] / reference-link', 'roles [0] / reference-link', 'motion [0] / motion-link']) {
    const selector = 'button:text-is("添加 ' + label + '")';
    await page.focus(selector);
    await page.press(selector, 'Enter');
  }
  await page.fill('textarea[aria-label="说明"]', ' 同一角色完整素材检查 ');
  await page.click('loc=role:button[name="检查输入"]');
  await page.waitForFunction(() => !document.body.textContent.includes('正在检查'), undefined, { timeout: 15000 });
  const connectedPost = (await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview' && item.method === 'POST').at(-1);
  assert.ok(connectedPost);
  const expected = [connectedGraph.nodes[0].data.mediaAssets[0], connectedGraph.nodes[0].data.mediaAssets[1], connectedGraph.nodes[0].data.mediaAssets[0], connectedGraph.nodes[1].data.mediaAssets[0]].map((asset, index) => {
    const { url, mimeType, ...rest } = asset;
    return { ...rest, ...(mimeType ? { mime: mimeType } : {}), sourceNodeId: asset.sourceNodeId || (index === 3 ? 'motion' : 'roles'), edgeId: asset.edgeId || (index === 3 ? 'motion-link' : 'reference-link') };
  });
  assert.deepEqual(connectedPost.body.assets, expected);
  await page.screenshot({ path: join(evidenceDir, 'connected-complete-inputs.png') });
  for (const [index, role] of [[0, 'first_frame'], [2, 'last_frame']]) {
    const row = `[data-selected-asset="${index}"]`;
    await page.click(row + ' .wf-custom-select-trigger >> nth=0');
    await page.click('.wf-custom-select-dropdown button[title="方案 1"]');
    await page.click(row + ' .wf-custom-select-trigger >> nth=1');
    await page.click(`.wf-custom-select-dropdown button[title="${role}"]`);
    await page.click(row + ' .wf-custom-select-trigger >> nth=2');
    await page.click(`.wf-custom-select-dropdown button[title="${role}"]`);
  }
  for (const [field, mode, value] of [['seed', '数值', '0'], ['watermark', '开关', 'false'], ['duration', '空值', null], ['prompt', '文字', '']]) {
    await page.click(`[data-parameter="${field}"] .wf-custom-select-trigger`);
    await page.click(`.wf-custom-select-dropdown button[title="${mode}"]`);
    if (value !== null) await page.fill(`input[aria-label="${field}"]`, value);
  }
  await page.fill('textarea[aria-label="说明"]', '');
  await page.click('[data-selected-asset="3"] button[aria-label="上移"]');
  await page.click('loc=role:button[name="检查输入"]');
  await page.waitForFunction(() => !document.body.textContent.includes('正在检查'), undefined, { timeout: 15000 });
  const explicitPost = (await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview' && item.method === 'POST').at(-1);
  assert.deepEqual(explicitPost.body.parameters, { seed: 0, watermark: false, duration: null, prompt: '' }); assert.equal(explicitPost.body.prompt, '');
  assert.deepEqual(explicitPost.body.assets, [{ ...expected[0], role: 'first_frame', targetSlot: 'first_frame' }, expected[1], expected[3], { ...expected[2], role: 'last_frame', targetSlot: 'last_frame' }]);
  await page.screenshot({ path: join(evidenceDir, 'connected-explicit-roles-and-values.png') });
  observe('connected-explicit-role-order-values', { body: explicitPost.body, sameImageDistinctRoles: true, zeroFalseNullEmptyRetained: true });
  const selectedVersion = await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[1], {});
  const changedNodes = structuredClone(selectedVersion.workspace.nodes);
  changedNodes.find(node => node.id === 'roles').data.mediaAssets[0].outputVersion = 'original-v3';
  await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[1], { method: 'PUT', body: JSON.stringify({ expectedVersion: selectedVersion.workspace.version, nodes: changedNodes, edges: selectedVersion.workspace.edges }) });
  await page.waitForFunction(() => document.body.textContent.includes('来源已变化或连接已断开'), undefined, { timeout: 15000 });
  const postCountBefore = (await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview').length;
  await page.click('loc=role:button[name="检查输入"]');
  assert.equal((await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview').length, postCountBefore);
  for (const index of [0, 3]) await page.click(`[data-selected-asset="${index}"] button:text-is("重新确认")`);
  await page.click('loc=role:button[name="检查输入"]');
  await page.waitForFunction(() => !document.body.textContent.includes('正在检查'), undefined, { timeout: 15000 });
  const reconfirmedPost = (await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview').at(-1);
  assert.equal(reconfirmedPost.body.assets[0].outputVersion, 'original-v3'); assert.equal(reconfirmedPost.body.assets[3].outputVersion, 'original-v3');
  assert.equal(reconfirmedPost.body.assets[0].role, 'first_frame'); assert.equal(reconfirmedPost.body.assets[3].role, 'last_frame');
  const newVersion = await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[1], {});
  await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[1], { method: 'PUT', body: JSON.stringify({ expectedVersion: newVersion.workspace.version, nodes: newVersion.workspace.nodes, edges: newVersion.workspace.edges.filter(edge => edge.id !== 'reference-link') }) });
  await page.waitForFunction(() => document.body.textContent.includes('来源已变化或连接已断开'), undefined, { timeout: 15000 });
  const beforeDisconnectedCheck = (await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview').length;
  await page.click('loc=role:button[name="检查输入"]'); assert.equal((await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview').length, beforeDisconnectedCheck);
  await page.screenshot({ path: join(evidenceDir, 'connected-source-disconnected.png') });
  observe('source-version-and-edge-invalidation', { version: 'original-v3', selectedRowsPreserved: 4, sourceChoicePreserved: true, postBeforeReconfirm: 0, postDisconnected: 0 });
  await page.click('loc=role:button[name="丢弃草稿"]');
  const afterConnected = await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[1], {});
  assert.deepEqual(afterConnected.workspace.nodes, newVersion.workspace.nodes); assert.deepEqual(afterConnected.workspace.edges, newVersion.workspace.edges.filter(edge => edge.id !== 'reference-link'));
  observe('connected-complete-original-assets', { body: connectedPost.body, graphUnchanged: true, sourceItems: 3, selectedItems: 4, repetitionsRetained: true });
  await page.click('.wf-page-header-capsule');
  fs.appendFileSync(join(evidenceDir, 'functional-snapshots.txt'), await page.snapshot() + '\n');
  await page.click('.wf-page-dropdown-item-title:text-is("旧用途 · 合成验收")');
  await page.waitForFunction(() => document.querySelector('.wf-page-header-title')?.textContent === '旧用途 · 合成验收' && document.body.textContent.includes('已暂停'), undefined, { timeout: 20000 });
  await page.waitForFunction(async path => { const response = await fetch(path); const value = await response.json(); return value.workspace?.nodes.every(node => node.data.compat && node.data.executionStatus === 'pending'); }, '/omnimux-workflow/api/workspaces/' + workspaceIds[2], { timeout: 15000 });
  const oldWorkspace = await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[2], {});
  const oldExecutionPath = '/omnimux-workflow/api/workspaces/' + workspaceIds[2] + '/executions/' + processProof.legacy.executionId;
  const oldSnapshot = await jsonRequest(oldExecutionPath, {});
  assert.equal(oldSnapshot.execution.status, 'paused');
  for (const node of processProof.legacy.nodes) assert.equal(oldSnapshot.execution.nodeStates[node.id].upstreamTask.taskId, 'original-' + node.data.params.operation);
  const previewCount = (await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview').length;
  await page.click('loc=role:button[name="检查生成输入"]');
  await page.waitForFunction(() => !document.body.textContent.includes('正在读取生成条件'), undefined, { timeout: 15000 });
  await page.screenshot({ path: join(evidenceDir, 'legacy-input-check.png') });
  await page.click('loc=role:button[name="丢弃草稿"]');
  const afterLegacyDraft = await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[2], {});
  assert.deepEqual(afterLegacyDraft.workspace.nodes, oldWorkspace.workspace.nodes); assert.deepEqual(afterLegacyDraft.workspace.edges, oldWorkspace.workspace.edges);
  assert.equal((await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview').length, previewCount);
  await page.click('button[title="恢复执行"]');
  await page.waitForFunction(async path => { const response = await fetch(path); return (await response.json()).execution?.status === 'completed'; }, oldExecutionPath, { timeout: 30000 });
  const collected = await jsonRequest(oldExecutionPath, {});
  assert.equal(collected.execution.completedNodes, 3);
  for (const node of processProof.legacy.nodes) {
    assert.equal(collected.execution.nodeStates[node.id].status, 'completed');
    const assets = collected.execution.nodeOutputs[node.id].mediaAssets;
    assert.equal(assets.length, 1); assert.equal(assets[0].type, 'video');
    const localVideo = join(processProof.workspacePath, assets[0].relativePath);
    assert.equal(digest(fs.readFileSync(localVideo)), processProof.legacy.videoSha256);
  }
  const finalOld = await jsonRequest('/omnimux-workflow/api/workspaces/' + workspaceIds[2], {});
  for (const node of finalOld.workspace.nodes) assert.deepEqual(node.data.params, processProof.legacy.nodes.find(item => item.id === node.id).data.params);
  const currentRecords = processProof.legacy.records.map(record => JSON.parse(fs.readFileSync(join(processProof.legacy.mediaDirectory, record.taskRef + '.json'), 'utf8')));
  for (let index = 0; index < currentRecords.length; index++) {
    const current = currentRecords[index], original = processProof.legacy.records[index];
    assert.equal(current.status, 'ready');
    for (const key of ['taskRef', 'upstreamTaskId', 'operation', 'model', 'wireModel', 'group', 'providerId', 'protocol', 'taskPath', 'submittedAt']) assert.deepEqual(current[key], original[key]);
  }
  const upstreamRequests = fs.readFileSync(join(evidenceDir, 'legacy-upstream-requests.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(upstreamRequests.filter(item => item.method !== 'GET').length, 0);
  for (const record of processProof.legacy.records) assert.ok(upstreamRequests.some(item => item.path === '/v1/video/generations/' + record.upstreamTaskId && item.group === record.group));
  const sseResources = await page.evaluate(() => performance.getEntriesByType('resource').map(item => item.name).filter(url => /\/executions\/.+\/events/.test(url)));
  assert.equal(sseResources.some(resource => new URL(resource).pathname === oldExecutionPath + '/events'), true);
  await page.screenshot({ path: join(evidenceDir, 'legacy-collected-canvas.png') });
  observe('legacy-original-task-collection', { id: collected.execution.id, originalTasks: currentRecords.map(item => ({ taskRef: item.taskRef, taskId: item.upstreamTaskId, operation: item.operation, group: item.group, status: item.status })), upstreamRequests, sseResources, artifactSha256: processProof.legacy.videoSha256, draftGraphUnchanged: true, oldParametersUnchanged: true, syntheticCollectionOnly: true });
  await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await page.waitForFunction(() => !document.body.hasAttribute('data-ds-dark-theme'), undefined, { timeout: 10000 });
  await page.click('.wf-page-header-capsule');
  await page.click('.wf-page-dropdown-item-title:text-is("生成预检 · 合成验收")');
  await page.waitForFunction(() => document.querySelector('.wf-page-header-title')?.textContent === '生成预检 · 合成验收' && document.querySelectorAll('.react-flow__node').length === 0, undefined, { timeout: 20000 });
  await page.click('loc=role:button[name="检查生成输入"]');
  await page.waitForFunction(() => !document.body.textContent.includes('正在读取生成条件'), undefined, { timeout: 15000 });
  await page.screenshot({ path: join(evidenceDir, 'light-empty-input-check.png') });
  await page.click('.wf-generation-draft__choices .wf-custom-select-trigger >> nth=0');
  await page.waitForSelector('.wf-custom-select-dropdown', { state: 'visible', timeout: 10000 });
  await page.screenshot({ path: join(evidenceDir, 'light-product-dropdown.png') });
  const lightStyles = await page.evaluate(() => {
    const rows = ['.wf-generation-draft', '.wf-modal-title', '.wf-generation-draft p', '.wf-custom-select-dropdown', '.wf-custom-select-option', '.wf-modal-btn-primary'].map(selector => { const node = document.querySelector(selector); const style = getComputedStyle(node); const bounds = node.getBoundingClientRect(); return { selector, color: style.color, background: style.backgroundColor, width: bounds.width, height: bounds.height }; });
    return { dark: document.body.hasAttribute('data-ds-dark-theme'), scheme: getComputedStyle(document.documentElement).colorScheme, rows };
  });
  fs.writeFileSync(join(evidenceDir, 'light-theme-styles.json'), JSON.stringify(lightStyles, null, 2) + '\n');
  assert.equal(lightStyles.dark, false);
  await page.click('.wf-custom-select-dropdown button[title="生图"]');
  const previewBeforeLight = (await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview').length;
  await page.click('loc=role:button[name="丢弃草稿"]');
  assert.equal((await page.evaluate(() => window.__generationQaRequests)).filter(item => item.path === '/omnimux/generation-products/preview').length, previewBeforeLight);
  observe('light-theme-dialog-and-dropdown', { styles: lightStyles, extraPreviewPost: 0, tokensFromOfficialSystemPreference: true });
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /canvas\.js|omnimux.*client/.test(name)));
  const canvasResource = resources.find(url => new URL(url).pathname === '/omnimux-workflow/canvas.js');
  assert.ok(canvasResource, 'Only the naturally loaded creation-page canvas counts');
  const loaded = await page.fetch(canvasResource);
  assert.equal(loaded.status, 200);
  const localCanvas = fs.readFileSync(join(processProof.root, 'plugins/omnimux-workflow/lib/canvas.js'), 'utf8');
  assert.ok(typeof loaded.body === 'string' && loaded.body.includes(localCanvas));
  observe('naturally-loaded-canvas-identity', { url: canvasResource, bundleHash: digest(localCanvas), exactBundleContained: true });
  const allRequests = await page.evaluate(() => window.__generationQaRequests);
  fs.writeFileSync(join(evidenceDir, 'requests.json'), JSON.stringify(allRequests, null, 2) + '\n');
  assert.equal(allRequests.filter(item => item.method === 'POST' && (/\/executions$/.test(item.path) || /\/direct\//.test(item.path))).length, 0);
  const oldControlPosts = allRequests.filter(item => item.method === 'POST' && /\/executions\//.test(item.path));
  assert.deepEqual(oldControlPosts.map(item => item.path), [oldExecutionPath + '/resume']);
  observe('zero-new-execution', { newExecutionPosts: 0, oldResumePosts: 1, supplierSubmitPosts: 0, collectionGets: allRequests.filter(item => item.method === 'GET' && /\/executions(?:\/|$)/.test(item.path)).length });
  return { assertions: observations, furtherJourneysRequired: [], functionalBaseJourneys: true, fullAcceptance: true };
}

export default async function journey(options) {
  if (!options.page) throw new Error('This full-application journey requires the admitted ego page adapter, not another headless or stand-alone canvas');
  return consumerJourney(options);
}
