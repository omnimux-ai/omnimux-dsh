import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createWorkspaceStore } from './workspace/WorkspaceStore.ts';
import { createProjectStore } from '../projects/ProjectStore.ts';
import { createWorkflowListTool } from './agent/agentReadTools.ts';
import { createWorkflowNodeAddTool } from './agent/agentWriteTools.ts';
import { createCanvasWriteTableNodeTool } from './agent/tableTools.ts';

describe('工作区硬隔离与 Boundary Guard 契约', () => {
  it('workflow_list 严格只返回当前会话物理工作区下的创作页画布', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'omnimux-bg-test-'));
    const workspacesDir = join(tmp, 'workspaces');
    const store = createWorkspaceStore({ workspacesDir });
    const projectStore = createProjectStore({ libraryRoot: join(tmp, 'lib') });

    // 1. 创建工作区 A 及项目 A，关联画布 ws_a1 与 ws_a2
    const wsA = store.create('画布 A1');
    const wsA2 = store.create('画布 A2');
    const projectDirA = join(tmp, 'project-a');
    mkdirSync(projectDirA, { recursive: true });
    projectStore.create('项目 A', {
      projectRoot: projectDirA,
      canvasWorkspaceIds: [wsA.id, wsA2.id],
    });

    // 2. 创建工作区 B 及项目 B，关联画布 ws_b
    const wsB = store.create('画布 B');
    const projectDirB = join(tmp, 'project-b');
    mkdirSync(projectDirB, { recursive: true });
    projectStore.create('项目 B', {
      projectRoot: projectDirB,
      canvasWorkspaceIds: [wsB.id],
    });

    const listTool = createWorkflowListTool({
      store,
      projectStore,
      executionManager: { listExecutions: () => [] },
      mediaDir: join(tmp, 'media'),
    });

    // 在项目 A 的会话上下文中执行 workflow_list
    const execContextA = {
      session: {
        id: 'sess-a',
        header: { cwd: projectDirA },
      },
    };
    const resA = await listTool.execute({}, execContextA);
    assert.ok(Array.isArray(resA.workspaces));
    assert.equal(resA.workspaces.length, 2, '在项目 A 中只能列出项目 A 的 2 张画布');
    const returnedIdsA = new Set(resA.workspaces.map((w) => w.id));
    assert.ok(returnedIdsA.has(wsA.id));
    assert.ok(returnedIdsA.has(wsA2.id));
    assert.equal(returnedIdsA.has(wsB.id), false, '绝不能泄露项目 B 的画布 ws_b');

    // 在项目 B 的会话上下文中执行 workflow_list
    const execContextB = {
      session: {
        id: 'sess-b',
        header: { cwd: projectDirB },
      },
    };
    const resB = await listTool.execute({}, execContextB);
    assert.ok(Array.isArray(resB.workspaces));
    assert.equal(resB.workspaces.length, 1, '在项目 B 中只能列出项目 B 的 1 张画布');
    assert.equal(resB.workspaces[0].id, wsB.id);

    rmSync(tmp, { recursive: true, force: true });
  });

  it('Boundary Guard: 写入工具在试图越权写入外部工作区画布时硬拦截', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'omnimux-bg-guard-'));
    const workspacesDir = join(tmp, 'workspaces');
    const store = createWorkspaceStore({ workspacesDir });
    const projectStore = createProjectStore({ libraryRoot: join(tmp, 'lib') });

    // 创建项目 A (ws_a) 与项目 B (ws_b)
    const wsA = store.create('画布 A');
    const projectDirA = join(tmp, 'project-a');
    mkdirSync(projectDirA, { recursive: true });
    projectStore.create('项目 A', {
      projectRoot: projectDirA,
      canvasWorkspaceIds: [wsA.id],
    });

    const wsB = store.create('画布 B');
    const projectDirB = join(tmp, 'project-b');
    mkdirSync(projectDirB, { recursive: true });
    projectStore.create('项目 B', {
      projectRoot: projectDirB,
      canvasWorkspaceIds: [wsB.id],
    });

    const deps = {
      store,
      projectStore,
      executionManager: { listExecutions: () => [] },
      mediaDir: join(tmp, 'media'),
    };

    const addNodeTool = createWorkflowNodeAddTool(deps);
    const writeTableTool = createCanvasWriteTableNodeTool(deps);

    const execA = {
      session: {
        id: 'sess-a',
        header: { cwd: projectDirA },
      },
    };

    // 试图在项目 A 的会话中向项目 B 的画布 wsB.id 添加节点
    const addRes = await addNodeTool.execute({
      workspace_id: wsB.id,
      material_type: 'text',
      content: 'hello',
    }, execA);

    assert.equal(addRes.error, 'outside-project-boundary');
    assert.match(addRes.message, /does not belong to current project/);

    // 试图在项目 A 的会话中向项目 B 的画布 wsB.id 写入表格
    const tableRes = await writeTableTool.execute({
      workspace_id: wsB.id,
      title: '越权表格',
      columns: [{ title: 'Col1' }],
      rows: [{ cells: ['Val1'] }],
    }, execA);

    assert.equal(tableRes.error, 'outside-project-boundary');
    assert.match(tableRes.message, /does not belong to current project/);

    // 正常写入当前工作区画布 wsA.id
    const normalRes = await addNodeTool.execute({
      workspace_id: wsA.id,
      material_type: 'text',
      content: '正常文本',
    }, execA);

    assert.ok(normalRes.workspace, '正常本工作区写入必须成功');
    assert.equal(normalRes.workspace.id, wsA.id);

    rmSync(tmp, { recursive: true, force: true });
  });
});
