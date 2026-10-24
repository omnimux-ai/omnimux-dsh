/**
 * tests/e2e/template-rename-3743.e2e.test.mjs
 *
 * 端到端测试（Issue #3743）：画布旧「工作流」概念统一改名为「模板」，
 * 与新增 ComfyUI 工作流入口区分（范围 A+B，用户确认）。
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const zh = (await import(path.join(root, 'plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts'))).default;
const en = (await import(path.join(root, 'plugins/omnimux-workflow/src/canvas/i18n/dict.en.ts'))).default;

describe('E2E: 组容器链路「工作流」→「模板」（zh）', () => {
  it('右键 / 组顶栏动作文案全部使用「模板」', () => {
    assert.equal(zh['menu.createWorkflow'], '创建模板');
    assert.equal(zh['group.createWorkflow'], '创建模板');
    assert.equal(zh['group.createWorkflowTitle'], '导出为可复用模板');
    assert.equal(zh['group.saveWorkflow'], '保存模板');
    assert.equal(zh['group.saveWorkflowTitle'], '导出为可复用模板');
    assert.equal(zh['group.deleteWorkflow'], '删除模板');
    assert.equal(zh['group.deleteWorkflowTitle'], '删除当前模板');
    assert.equal(zh['group.ungroupGroupTitle'], '解体当前模板并释放节点');
    assert.equal(zh['group.publishAppTitle'], '将当前模板发布为独立 AI 应用');
    assert.equal(zh['exec.runAllTitle'], '执行整个模板（按拓扑分层并行）');
  });

  it('组提示语与默认命名改为「模板」', () => {
    assert.equal(zh['group.deleteConfirm'], '确定要删除模板「{name}」吗？组内节点将一并移除。');
    assert.equal(zh['group.toast.emptyWarn'], '当前模板内尚无节点，请先添加节点后再发布');
    assert.equal(zh['group.toast.deleted'], '已删除模板');
  });
});

describe('E2E: 模板库链路「工作流」→「模板」（zh）', () => {
  it('创建可复用模板弹窗文案', () => {
    assert.equal(zh['template.modal.title'], '创建可复用模板');
    assert.equal(zh['template.modal.name'], '模板名称');
    assert.equal(zh['template.modal.namePlaceholder'], '例如：夜景人像精修模板');
    assert.equal(zh['template.modal.defaultName'], '新建模板');
    assert.equal(zh['template.modal.nameRequired'], '请输入模板名称');
    assert.equal(zh['template.modal.saved'], '模板「{name}」已保存到模板库');
    assert.equal(zh['template.modal.failed'], '创建模板失败');
  });

  it('模板面板与插入入口文案', () => {
    assert.equal(zh['template.panel.title'], '模板');
    assert.equal(zh['template.panel.newWorkflow'], '新建模板');
    assert.equal(zh['template.panel.empty'], '还没有模板');
    assert.equal(zh['toolbar.insertTemplate'], '插入模板');
    assert.equal(zh['toolbar.insertTemplateEmpty'], '还没有可插入的模板');
  });
});

describe('E2E: ComfyUI 与文件传输术语保持不变', () => {
  it('ComfyUI 工作流入口 / 面板保留原称', () => {
    assert.equal(zh['comfy.entry.title'], 'ComfyUI 工作流');
    assert.equal(zh['comfy.panel.title'], 'ComfyUI 工作流');
    assert.equal(en['comfy.entry.title'], 'ComfyUI workflow');
  });

  it('导出 / 导入工作流文件与传输错误保留「工作流」', () => {
    assert.equal(zh['toolbar.exportWorkflow'], '导出工作流');
    assert.equal(zh['toolbar.importWorkflow'], '导入工作流');
    assert.equal(zh['transfer.ownTitle'], 'OmniMux 工作流文件');
    assert.match(zh['transfer.error.unsupported-version'], /ComfyUI 工作流版本/);
    assert.equal(en['toolbar.exportWorkflow'], 'Export workflow');
    assert.equal(en['toolbar.importWorkflow'], 'Import workflow');
  });
});

describe('E2E: 英文同步改名为 Template', () => {
  it('组容器与模板链路英文文案', () => {
    assert.equal(en['menu.createWorkflow'], 'Create template');
    assert.equal(en['group.createWorkflow'], 'Create template');
    assert.equal(en['group.saveWorkflow'], 'Save template');
    assert.equal(en['group.deleteWorkflow'], 'Delete template');
    assert.equal(en['template.modal.title'], 'Create reusable template');
    assert.equal(en['template.modal.defaultName'], 'New template');
    assert.equal(en['template.panel.title'], 'Templates');
    assert.equal(en['template.panel.newWorkflow'], 'New template');
  });
});

describe('E2E: 画布源码无旧「工作流」残留（面向用户字符串）', () => {
  const srcFiles = [
    'plugins/omnimux-workflow/src/canvas/editor/CanvasEditor.tsx',
    'plugins/omnimux-workflow/src/canvas/hooks/useCanvasBoot.ts',
    'plugins/omnimux-workflow/src/canvas/hooks/useAddToConversation.ts',
    'plugins/omnimux-workflow/src/projects/ensureProjectBound.ts',
    'plugins/omnimux-workflow/src/workflow/workspace/WorkspaceStore.ts',
    'plugins/omnimux-workflow/src/client/projects/appLibrary.js',
    'plugins/omnimux-workflow/src/client/locales.js',
  ];
  for (const rel of srcFiles) {
    it(`${rel} 不含旧「工作流」用户可见命名`, () => {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.equal(/`工作流-\$|='工作流'|'工作流 \(副本\)'|'未命名工作流'|'工作流';/.test(src), false, '旧命名字面量仍残留');
    });
  }

  it('组自动命名为「模板-N」', () => {
    const src = fs.readFileSync(path.join(root, 'plugins/omnimux-workflow/src/canvas/editor/CanvasEditor.tsx'), 'utf8');
    assert.match(src, /const groupTitle = `模板-\$\{existingGroups\.length \+ 1\}`;/);
  });
});
