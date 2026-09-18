import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  queryCreativeTemplates,
  getCreativeTemplateDetail,
  mountTemplatesTools,
} from './tools.js';

test('queryCreativeTemplates: 模糊检索与分类平台过滤', () => {
  // 1. 无参数返回列表
  const allRes = queryCreativeTemplates({ limit: 5 });
  assert.ok(allRes.total >= 400, '总模板数应不少于 400 套');
  assert.equal(allRes.items.length, 5);

  // 2. 按分类过滤 (hook-intro)
  const hookRes = queryCreativeTemplates({ category: 'hook-intro', limit: 20 });
  assert.ok(hookRes.items.length > 0);
  for (const item of hookRes.items) {
    assert.ok(
      item.categorySlug === 'hook-intro' || String(item.categorySlug).includes('hook'),
      `分类必须匹配 hook-intro: ${item.categorySlug}`
    );
    assert.ok(item.title, '必须包含标题');
    assert.ok(item.promptSummary !== undefined, '必须包含 promptSummary');
  }

  // 3. 按平台过滤 (creatify)
  const creatifyRes = queryCreativeTemplates({ platform: 'creatify', limit: 10 });
  assert.ok(creatifyRes.items.length > 0);
  for (const item of creatifyRes.items) {
    assert.equal(item.sourcePlatform, 'creatify');
  }

  // 4. 按关键词模糊检索 (3D)
  const queryRes = queryCreativeTemplates({ query: '3D', limit: 10 });
  assert.ok(queryRes.items.length > 0);
});

test('getCreativeTemplateDetail: 调阅模板完整分镜提示词与工作流元数据', () => {
  // 检索包含工作流的 Creatify 模板
  const searchRes = queryCreativeTemplates({ platform: 'creatify', limit: 5 });
  const targetId = searchRes.items[0].id;

  const detail = getCreativeTemplateDetail(targetId);
  assert.ok(detail, `必须能找到模板: ${targetId}`);
  assert.equal(detail.id, targetId);
  assert.ok(detail.prompt, '必须包含分镜提示词 Prompt');
  assert.ok(typeof detail.prompt === 'string');

  // 若为包含 workflow 的模板，验证结构完整性
  if (detail.workflow) {
    assert.ok(typeof detail.workflow === 'object');
    assert.ok(detail.workflow.nodeCount > 0);
  }

  // 验证未匹配时返回 null
  assert.equal(getCreativeTemplateDetail('non_existent_id'), null);
});

test('mountTemplatesTools: 注册工具契约与 execute 回调', async () => {
  const registered = [];
  const fakeCtx = {
    tools: {
      register: (toolSpec) => registered.push(toolSpec),
    },
  };

  mountTemplatesTools(fakeCtx);
  assert.equal(registered.length, 2, '必须注册 2 个智能体工具');

  const searchTool = registered.find((t) => t.name === 'omnimux_creative_templates_search');
  const getTool = registered.find((t) => t.name === 'omnimux_creative_template_get');
  assert.ok(searchTool);
  assert.ok(getTool);

  // 验证 searchTool.execute
  const searchOut = await searchTool.execute('call_1', { query: 'app', limit: 3 });
  assert.equal(searchOut.ok, true);
  assert.ok(searchOut.items.length > 0);

  // 验证 getTool.execute 成功与缺失参数
  const getOut = await getTool.execute('call_2', { id: searchOut.items[0].id });
  assert.equal(getOut.ok, true);
  assert.ok(getOut.template);

  const missingOut = await getTool.execute('call_3', {});
  assert.equal(missingOut.ok, false);
});
