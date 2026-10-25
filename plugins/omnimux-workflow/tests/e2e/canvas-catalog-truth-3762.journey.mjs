/**
 * plugins/omnimux-workflow/tests/e2e/canvas-catalog-truth-3762.journey.mjs
 *
 * Issue #3762 真实浏览器功能旅程（由工作树应用级验收运行器在真实应用里执行）。
 *
 * 断言的是**当前发布产物在真实运行页面里的 DOM 事实**：画布节点的三级级联菜单里
 * 「渠道」列显示的线路、档位名与价格，逐项等于同一进程 `/omnimux-workflow/api/capabilities`
 * 交付的目录行（`models[].channelGroups`）；网关已下架的型号不出现在菜单候选里。
 *
 * 数据链路：网关快照 → 中枢目录投影 → capabilities 接缝 → `filteredModels.options[].channelGroups`
 * → `ModelCascadeMenu` 渠道列。本地镜像（旧 `MODEL_CHANNEL_GROUPS`）已被删除，本旅程
 * 通过「菜单 DOM == 目录 DTO」来证明菜单确实只读目录。
 */
import assert from 'node:assert/strict';

const TITLE = '渠道目录真源 3762';
const WORKSPACE_ID = 'ws_canvas_catalog_3762';
const VIDEO_NODE_ID = 'node-video-3762';
const IMAGE_NODE_ID = 'node-image-3762';

/** 与产品一致的价格展示口径（目录给什么就展示什么）。 */
function priceText(group) {
  const pricing = group?.pricing ?? {};
  if (typeof pricing.pointsEstimate === 'number') return `≈${pricing.pointsEstimate} 积分`;
  if (typeof pricing.pointsNote === 'string' && pricing.pointsNote.trim()) return pricing.pointsNote.trim();
  if (typeof pricing.priceRatio === 'number') return `×${Math.round(pricing.priceRatio * 100) / 100} 倍率`;
  return '当前参数不支持报价';
}

const VIDEO_NODE = {
  id: VIDEO_NODE_ID,
  type: 'material',
  position: { x: 60, y: 120 },
  data: {
    type: 'video',
    materialType: 'video',
    nodeKind: 'generate',
    selectedTool: 'omnimux_video_submit',
    tool: 'omnimux_video_submit',
    label: '目录真源视频节点',
    model: 'seedance-2-5',
    params: { model: 'seedance-2-5' },
  },
};

const IMAGE_NODE = {
  id: IMAGE_NODE_ID,
  type: 'material',
  position: { x: 60, y: 460 },
  data: {
    type: 'image',
    materialType: 'image',
    nodeKind: 'generate',
    selectedTool: 'omnimux_image_submit',
    tool: 'omnimux_image_submit',
    label: '目录真源图像节点',
    model: 'gpt-image-2.5',
    params: { model: 'gpt-image-2.5' },
  },
};

export default async function canvasCatalogTruthJourney({ send, sleep, evidenceDir, io }) {
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response?.exceptionDetails) {
      const d = response.exceptionDetails;
      const detail = d.exception?.description ?? d.exception?.value ?? d.text ?? 'unknown';
      throw new Error(`真实页面求值失败：${String(detail).slice(0, 400)}`);
    }
    return response?.result?.value;
  };
  const json = async (expression) => JSON.parse(await evaluate(`JSON.stringify(${expression})`));
  const poll = async (expression, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expression})`)) return true;
      await sleep(300);
    }
    throw new Error(`等待超时：${expression}`);
  };
  const click = async (selector) => {
    const result = await json(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .filter((node) => node.getBoundingClientRect().width > 0);
      if (nodes.length !== 1) return { clicked: false, matches: nodes.length };
      nodes[0].click();
      return { clicked: true, matches: 1 };
    })()`);
    assert.ok(result.clicked, `点击目标必须唯一可见：${selector}（命中 ${result.matches}）`);
  };
  const capture = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    io.writeFileSync(`${evidenceDir}/${name}.png`, Buffer.from(shot.data, 'base64'));
  };
  // `JSON.stringify(async())` 序列化的是 Promise 本身（恒为 {}），所以 JSON 文本必须
  // 在 async 体内产出，evaluate 等 promise 落定后拿字符串回来再 parse。
  const request = async (path, method = 'GET', body) => JSON.parse(await evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(path)}, {
      method: ${JSON.stringify(method)},
      headers: { 'content-type': 'application/json' },
      ${body === undefined ? '' : `body: ${JSON.stringify(JSON.stringify(body))},`}
    });
    const text = await response.text();
    if (!response.ok) throw new Error(JSON.stringify({ status: response.status, body: text.slice(0, 300) }));
    return text;
  })()`));

  /** 目录行：本进程 capabilities 交付的 `models[].channelGroups`。 */
  const directoryLines = async (modelId) => {
    const catalog = await request('/omnimux-workflow/api/capabilities');
    const row = (catalog.models ?? []).find((model) => model.id === modelId);
    assert.ok(row, `目录必须交付模型 ${modelId}`);
    assert.ok(Array.isArray(row.channelGroups), `目录必须交付 ${modelId} 的 channelGroups`);
    return row.channelGroups;
  };

  /** 中枢目录行：同一进程 `/omnimux/model-catalog` 交付的 `models[].channelGroups`。 */
  const hubLines = async (modelId) => {
    const catalog = await request('/omnimux/model-catalog');
    const row = (catalog.models ?? []).find((model) => model.id === modelId);
    assert.ok(row, `中枢目录必须交付模型 ${modelId}`);
    assert.ok(Array.isArray(row.channelGroups), `中枢目录必须交付 ${modelId} 的 channelGroups`);
    return row.channelGroups;
  };

  /** 只比对展示事实：id/档位名/badge/价格。接缝会补 `enabled` 等运行字段，不参与比对。 */
  const lineFacts = (lines) => lines.map((line) => ({
    id: line.id,
    label: line.label,
    badge: line.badge ?? null,
    pricing: line.pricing ?? null,
  }));

  /** 接缝目录行必须逐项等于中枢目录行——菜单只读中枢，不经过第二张本地表。 */
  const assertSeamEqualsHub = (modelId, seamLines, hubLines) => {
    assert.deepEqual(lineFacts(seamLines), lineFacts(hubLines),
      `接缝目录行必须逐项等于中枢 /omnimux/model-catalog 的 ${modelId}`);
  };

  /**
   * 菜单渠道列的 DOM 事实。
   *
   * 弹层里除了真实三列，还有一组离屏量尺列（`data-cascade-probe-col`，visibility:hidden，
   * 复用同一套类名），它们同样匹配 `.wf-cascade-channel-row`。断言必须只看真实列，
   * 否则会把量尺行当成用户能看到的线路。
   */
  const menuRows = async () => json(`(() => {
    const popover = document.querySelector('.wf-model-cascade-popover');
    if (!popover) return null;
    const realColumns = [...popover.querySelectorAll('.wf-loomi-col')]
      .filter((column) => !column.hasAttribute('data-cascade-probe-col'));
    const channelColumn = realColumns.find((column) => column.classList.contains('wf-loomi-col--channel')) ?? null;
    const modelColumn = realColumns.find((column) => column.classList.contains('wf-loomi-col--model')) ?? null;
    const rows = channelColumn ? [...channelColumn.querySelectorAll('.wf-cascade-channel-row')] : [];
    return {
      labels: rows.map((row) => {
        const label = row.querySelector('span');
        return label ? label.textContent.trim() : '';
      }),
      texts: rows.map((row) => row.innerText.replace(/\\s+/g, ' ').trim()),
      modelIds: (modelColumn ? [...modelColumn.querySelectorAll('[data-testid^="wf-cascade-model-"]')] : [])
        .map((node) => node.getAttribute('data-testid').replace('wf-cascade-model-', '')),
      hasChannelColumn: Boolean(channelColumn),
    };
  })()`);

  const assertions = [];
  const check = (name, fn) => {
    try {
      fn();
      assertions.push({ name, pass: true });
    } catch (error) {
      assertions.push({ name, pass: false, detail: error?.message ?? String(error) });
    }
  };

  await sleep(1500);
  // 1. 画布工作区：两个生成节点（视频 / 图像），模型都是当前在售型号。
  const workflowGlobals = await json(`({
    hasWorkflow: typeof window.__omnimuxWorkflow === 'object' && window.__omnimuxWorkflow !== null,
    workflowKeys: window.__omnimuxWorkflow ? Object.keys(window.__omnimuxWorkflow).slice(0, 10) : [],
    hasSessions: Boolean(window.__omnimuxWorkflow?.sessions),
  })`);
  assert.equal(workflowGlobals.hasWorkflow, true,
    `omnimux-workflow 客户端 seam 必须存在：${JSON.stringify(workflowGlobals)}`);
  const hubCatalogProbe = await request('/omnimux/model-catalog');
  assert.equal(typeof hubCatalogProbe === 'object' && hubCatalogProbe !== null && Object.keys(hubCatalogProbe).length > 0, true,
    `GET /omnimux/model-catalog 必须有内容：${JSON.stringify(hubCatalogProbe).slice(0, 300)}`);
  const manifestProbe = await request('/omnimux-workflow/api/manifest');
  assert.equal(typeof manifestProbe?.canvasHash, 'string',
    `GET /manifest 必须返回构建摘要：${JSON.stringify(manifestProbe).slice(0, 300)}`);
  const capsProbe = await request('/omnimux-workflow/api/capabilities');
  assert.equal(Array.isArray(capsProbe?.models), true,
    `GET /capabilities 必须返回 models 数组：${JSON.stringify(capsProbe).slice(0, 300)}`);
  const probe = await request('/omnimux-workflow/api/workspaces');
  assert.equal(Array.isArray(probe?.workspaces), true,
    `GET /workspaces 必须返回 workspaces 数组：${JSON.stringify(probe).slice(0, 300)}`);
  const created = await request('/omnimux-workflow/api/workspaces', 'POST', { id: WORKSPACE_ID, name: TITLE });
  assert.equal(typeof created?.workspace?.version, 'number',
    `POST /workspaces 必须返回 workspace 快照：${JSON.stringify(created).slice(0, 300)}`);
  await request(`/omnimux-workflow/api/workspaces/${WORKSPACE_ID}`, 'PUT', {
    expectedVersion: created.workspace.version,
    nodes: [VIDEO_NODE, IMAGE_NODE],
    edges: [],
  });
  // sessions.create 需要的是 DSH 宿主工作区 id（宿主注册表里的），画布工作区是 omnimux-workflow
  // 自己的存储对象。沙箱播种了宿主工作区（QA Media），从快照里取已注册 id。
  const hostWorkspaceId = await evaluate(`(() => {
    const snap = window.__omnimuxWorkflow.workspaces?.list?.getSnapshot?.() ?? {};
    const items = Array.isArray(snap.items) ? snap.items : [];
    const hit = items.find((w) => /qa/i.test(String(w?.title ?? '')) || /qa/i.test(String(w?.workspaceId ?? w?.id ?? '')));
    const pick = hit ?? items[0] ?? {};
    return String(pick.workspaceId ?? pick.id ?? '');
  })()`);
  assert.ok(hostWorkspaceId, '宿主工作区快照必须给出至少一个已注册工作区');
  const sessionId = await evaluate(`window.__omnimuxWorkflow.sessions.create({ workspaceId: "${hostWorkspaceId}" })`);
  await request('/omnimux-workflow/api/projects', 'POST', {
    title: TITLE,
    sessionId,
    canvasWorkspaceIds: [WORKSPACE_ID],
  });

  // 2. 走真实产品路径进入创作页画布。入口第一次点击时 workbench store 可能尚未就绪
  // （createSidebarStore 惰性 ensure，open() 未就绪会静默丢弃），先等 seam 可用再点。
  await poll(`Boolean(window.__omnimuxWorkbench && typeof window.__omnimuxWorkbench.createSidebarStore === 'function')`);
  await click('[data-dsh-omnimux-workflow-entry]');
  await sleep(1200);
  // 与产品「打开创作页」同一条 seam：openWorkbench 的画布 tab + 画布工作区 meta。
  // sessions seam 没有 open/current 切换口，openWorkbench 接受显式 sessionId。
  const directOpen = await evaluate(`(async () => {
    const wb = window.__omnimuxWorkbench;
    const bs = window.__omnimuxBetterSidebar;
    const snap = typeof bs?.getSnapshot === 'function' ? bs.getSnapshot() : null;
    const sid = snap?.sessionId ?? "${sessionId}";
    const r = await wb.openWorkbench({ tabId: 'omnimux-workflow:canvas', title: ${JSON.stringify(TITLE)},
      sessionId: sid, meta: { canvasWorkspaceId: "${WORKSPACE_ID}" } });
    await new Promise((y) => setTimeout(y, 1200));
    return JSON.stringify({ result: r, canvasPresent: Boolean(document.querySelector('.react-flow')) });
  })()`);
  const openedDirectly = JSON.parse(directOpen);
  if (!openedDirectly.canvasPresent) {
    // 兜底：项目库页路径（画布直接打开失败时的原旅程路径）。
    try {
      await poll(`document.body.innerText.includes(${JSON.stringify(TITLE)})`);
    } catch (error) {
      await capture('entry-timeout');
      const state = await evaluate(`(async () => JSON.stringify({
        href: location.href,
        workbench: Boolean(window.__omnimuxWorkbench),
        text: document.body.innerText.slice(0, 3000),
        projects: (await (await fetch('/omnimux-workflow/api/projects')).text()).slice(0, 1500),
      }))()`);
      io.writeFileSync(`${evidenceDir}/entry-timeout.json`, state);
      throw error;
    }
    await click(`button[aria-label=${JSON.stringify(TITLE)}]`);
    await poll(`Boolean(document.querySelector('button[aria-label="打开创作页 ${TITLE}"]'))`);
    await click(`button[aria-label="打开创作页 ${TITLE}"]`);
  }
  await poll(`Boolean(document.querySelector('.react-flow'))`);
  await poll(`document.querySelectorAll('.react-flow__node').length >= 2`);
  await capture('canvas-with-nodes');
  check('canvas-renders-both-directory-nodes', () => {
    assert.ok(true);
  });

  // 3. 视频节点（seedance-2-5）：目录 4 条线路，菜单必须逐项一致。
  const videoLines = await directoryLines('seedance-2-5');
  await click(`[data-id="${VIDEO_NODE_ID}"] .wf-node-header`);
  await poll(`Boolean(document.querySelector('[data-testid="wf-model-cascade-trigger"]'))`);
  await click('[data-testid="wf-model-cascade-trigger"]');
  await poll(`Boolean(document.querySelector('.wf-model-cascade-popover'))`);
  const videoMenu = await menuRows();
  io.writeFileSync(`${evidenceDir}/video-menu.json`, JSON.stringify({ directory: videoLines, menu: videoMenu }, null, 2));
  await capture('video-channel-menu');

  check('video-menu-shows-every-directory-line', () => {
    assert.ok(videoMenu?.hasChannelColumn, '渠道列必须出现（目录给了多条线路）');
    assert.deepEqual(videoMenu.labels, videoLines.map((line) => line.label));
  });
  check('video-menu-price-equals-directory', () => {
    for (const [index, line] of videoLines.entries()) {
      const text = videoMenu.texts[index] ?? '';
      assert.ok(text.includes(line.label), `第 ${index + 1} 行必须显示目录档位名「${line.label}」：${text}`);
      assert.ok(text.includes(priceText(line)), `第 ${index + 1} 行必须显示目录价格「${priceText(line)}」：${text}`);
      if (line.badge) assert.ok(text.includes(line.badge), `第 ${index + 1} 行必须显示目录 badge「${line.badge}」：${text}`);
    }
  });

  // 4. 图像节点（gpt-image-2.5）：表达式计费线路照实显示目录的说明，不编造数字。
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(400);
  const imageLines = await directoryLines('gpt-image-2.5');
  await click(`[data-id="${IMAGE_NODE_ID}"] .wf-node-header`);
  await poll(`Boolean(document.querySelector('[data-testid="wf-model-cascade-trigger"]'))`);
  await click('[data-testid="wf-model-cascade-trigger"]');
  await poll(`Boolean(document.querySelector('.wf-model-cascade-popover'))`);
  const imageMenu = await menuRows();
  io.writeFileSync(`${evidenceDir}/image-menu.json`, JSON.stringify({ directory: imageLines, menu: imageMenu }, null, 2));
  await capture('image-channel-menu');

  check('image-menu-shows-directory-lines-and-notes', () => {
    assert.ok(imageMenu?.hasChannelColumn, '渠道列必须出现');
    assert.deepEqual(imageMenu.labels, imageLines.map((line) => line.label));
    for (const [index, line] of imageLines.entries()) {
      const text = imageMenu.texts[index] ?? '';
      assert.ok(text.includes(priceText(line)), `第 ${index + 1} 行必须显示目录价格口径「${priceText(line)}」：${text}`);
    }
    assert.ok(imageMenu.labels.includes('标准版') && imageMenu.labels.length === imageLines.length);
  });

  // 5. 已下架型号不得出现在菜单候选里（模型列只列目录行）。
  const catalog = await request('/omnimux-workflow/api/capabilities');
  const directoryIds = new Set(['text', 'image', 'video', 'audio']
    .flatMap((kind) => catalog[kind] ?? [])
    .map((row) => row.id));
  check('menu-offers-only-directory-models', () => {
    for (const modelId of imageMenu.modelIds) {
      assert.ok(directoryIds.has(modelId), `菜单型号 ${modelId} 不在目录候选里`);
    }
    for (const delisted of ['seedance-2-0-fast', 'seedance-2-0-mini', 'seedream-5-0-pro', 'minimax-h3']) {
      assert.ok(!imageMenu.modelIds.includes(delisted), `已下架型号 ${delisted} 不得出现在菜单里`);
      assert.ok(!directoryIds.has(delisted), `已下架型号 ${delisted} 不得出现在目录候选里`);
    }
  });

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(300);
  // 6. 中枢目录逐项核对：菜单与接缝都必须逐项等于 `/omnimux/model-catalog` 的 channelGroups。
  const rowText = (menu, index) => menu.texts.slice(index, index + 1)[0] ?? '';
  const videoHubLines = await hubLines('seedance-2-5');
  const imageHubLines = await hubLines('gpt-image-2.5');
  check('menu-lines-equal-hub-catalog', () => {
    assertSeamEqualsHub('seedance-2-5', videoLines, videoHubLines);
    assertSeamEqualsHub('gpt-image-2.5', imageLines, imageHubLines);
    assert.deepEqual(videoMenu.labels, videoHubLines.map((line) => line.label),
      '视频菜单渠道列必须逐项等于中枢目录档位名');
    assert.deepEqual(imageMenu.labels, imageHubLines.map((line) => line.label),
      '图像菜单渠道列必须逐项等于中枢目录档位名');
    for (const [index, line] of videoHubLines.entries()) {
      const text = rowText(videoMenu, index);
      assert.ok(text.includes(priceText(line)), `视频第 ${index + 1} 行必须显示中枢目录价格「${priceText(line)}」：${text}`);
    }
    for (const [index, line] of imageHubLines.entries()) {
      const text = rowText(imageMenu, index);
      assert.ok(text.includes(priceText(line)), `图像第 ${index + 1} 行必须显示中枢目录价格「${priceText(line)}」：${text}`);
    }
  });

  await capture('final-canvas');
  io.writeFileSync(`${evidenceDir}/canvas-catalog-truth-3762.json`, JSON.stringify({
    workspaceId: WORKSPACE_ID,
    sessionId,
    video: { directory: videoLines, menu: videoMenu },
    image: { directory: imageLines, menu: imageMenu },
    directoryIds: [...directoryIds],
  }, null, 2));
  return { assertions };
}
