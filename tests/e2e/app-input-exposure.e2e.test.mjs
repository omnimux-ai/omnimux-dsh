/**
 * tests/e2e/app-input-exposure.e2e.test.mjs
 *
 * 发布为 AI 应用的「输入项与配置项可选化」端到端契约（Issue #1994）：
 *  1. 拓扑规则产出的默认分组 / 推荐暴露 / 推荐必填符合已确认标准；
 *  2. 发布向导把全部候选交给表单生成器，作者固定项因此进入清单摘要（防止再退回「只传已暴露子集」）；
 *  3. 用户端表单渲染固定项摘要与空态，且固定项不作为输入控件出现；
 *  4. 清单校验拒绝「既是表单字段又是固定项」的冲突；
 *  5. 新增样式引用的宿主主题 Token 必须真实存在（宿主升级后需重新抽取快照）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const { analyzeWorkflowInputs, generateFormConfig } = await import(
  path.join(root, 'plugins/omnimux-workflow/src/canvas/editor/components/publish/topologyAnalyzer.ts')
);
const { validateApplicationManifest } = await import(
  path.join(root, 'plugins/omnimux-apps/src/shared/schemaValidator.ts')
);

const NODES = [
  {
    id: 'n_text',
    type: 'material',
    data: { materialType: 'text', selectedTool: 'text-editor', label: '视频描述', content: '' },
  },
  {
    id: 'n_gen',
    type: 'material',
    data: {
      materialType: 'video',
      selectedTool: 'video-generation',
      label: '视频生成',
      params: { aspectRatio: '16:9', duration: '5 秒', quality: '2K', model: 'Hailuo H3', generationCount: 1 },
    },
  },
];
const EDGES = [{ id: 'e1', source: 'n_text', target: 'n_gen', targetHandle: 'prompt' }];

function manifestWith(formConfig, extra = {}) {
  // 必填文本的默认值为空时，演示快照按校验规则不可用；此处补一份示例值以聚焦本次契约。
  const demoSnapshot = { ...formConfig.demoSnapshot };
  for (const key of formConfig.formSchema.required) {
    if (demoSnapshot[key] === '') demoSnapshot[key] = '示例描述';
  }
  return {
    appId: 'app_input_exposure',
    version: '1.0.0',
    schemaVersion: '1.0',
    createdAt: new Date().toISOString(),
    metadata: {
      name: '视频生成',
      category: 'video',
      iconSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z"/></svg>',
    },
    workflowBinding: { workspaceId: 'ws_e2e', workflowHash: 'a'.repeat(64), snapshot: { nodes: NODES, edges: EDGES } },
    formSchema: formConfig.formSchema,
    fieldMappings: formConfig.fieldMappings,
    showcase: { mode: 'carousel', items: [] },
    demoSnapshot,
    fixedFields: formConfig.fixedFields,
    ...extra,
  };
}

test('E2E: 默认分组与推荐暴露符合标准（描述必填、比例与时长放开、成本参数固定）', () => {
  const analysis = analyzeWorkflowInputs(NODES, EDGES);
  const byKey = (suffix) => analysis.inputs.find((i) => i.key.endsWith(suffix));

  const prompt = byKey('_content');
  assert.equal(prompt.group, 'text');
  assert.equal(prompt.isExposed, true);
  assert.equal(prompt.isRequired, true);

  const ratio = byKey('_aspectRatio');
  assert.equal(ratio.group, 'config');
  assert.equal(ratio.isExposed, true);
  assert.equal(ratio.isRequired, false);

  const duration = byKey('_param_duration');
  assert.equal(duration.isExposed, true);
  assert.equal(duration.isRequired, false);

  for (const suffix of ['_param_quality', '_param_model', '_param_generationCount']) {
    const param = byKey(suffix);
    assert.equal(param.isRecommended, false, `${suffix} 默认应由作者固定`);
    assert.equal(param.isExposed, false);
  }

  const exposed = analysis.inputs.filter((i) => i.isExposed && !i.isInternal);
  assert.equal(exposed.length, 3, '默认应放开描述、画面比例、时长三项');
});

test('E2E: 发布向导把全部候选交给生成器，固定项进入清单摘要', () => {
  const wizardSrc = fs.readFileSync(
    path.join(root, 'plugins/omnimux-workflow/src/canvas/editor/components/publish/PublishWizardModal.tsx'),
    'utf-8',
  );
  assert.match(wizardSrc, /generateFormConfig\(inputs\)/, '必须传入全部候选');
  assert.doesNotMatch(wizardSrc, /generateFormConfig\(exposedInputs\)/, '只传已暴露子集会丢失固定项摘要');
  assert.match(wizardSrc, /fixedFields: generatedConfig\.fixedFields/);

  const analysis = analyzeWorkflowInputs(NODES, EDGES);
  const config = generateFormConfig(analysis.inputs);
  assert.deepEqual(
    Object.keys(config.formSchema.properties).sort(),
    ['n_gen_aspectRatio', 'n_gen_param_duration', 'n_text_content'],
  );
  const fixedKeys = config.fixedFields.map((f) => f.key).sort();
  assert.deepEqual(fixedKeys, ['n_gen_param_generationCount', 'n_gen_param_model', 'n_gen_param_quality']);
  assert.equal(config.fixedFields.find((f) => f.key === 'n_gen_param_quality').value, '2K');
});

test('E2E: 用户端表单渲染固定项摘要与空态，固定项不作为输入控件', () => {
  const panelSrc = fs.readFileSync(path.join(root, 'plugins/omnimux-apps/src/client/AppFormPanel.tsx'), 'utf-8');
  assert.match(panelSrc, /omx-apps-fixed-summary/);
  assert.match(panelSrc, /omx-apps-fixed-chip/);
  assert.match(panelSrc, /以下由作者设定，无需填写/);
  assert.match(panelSrc, /omx-apps-form-empty/);
  assert.match(panelSrc, /disabled=\{isSubmitting \|\| fieldEntries\.length === 0\}/);

  const css = fs.readFileSync(path.join(root, 'plugins/omnimux-apps/src/client/apps.css'), 'utf-8');
  assert.match(css, /\.omx-apps-fixed-summary\s*\{/);
  assert.match(css, /\.omx-apps-fixed-chip\s*\{/);
  assert.match(css, /\.omx-apps-form-empty\s*\{/);

  const analysis = analyzeWorkflowInputs(NODES, EDGES);
  const config = generateFormConfig(analysis.inputs);
  for (const field of config.fixedFields) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(config.formSchema.properties, field.key),
      `固定项 ${field.key} 不得同时成为表单字段`,
    );
  }
});

test('E2E: 清单校验接受固定摘要，并拒绝「既暴露又固定」的冲突', () => {
  const analysis = analyzeWorkflowInputs(NODES, EDGES);
  const config = generateFormConfig(analysis.inputs);

  const ok = validateApplicationManifest(manifestWith(config));
  assert.equal(ok.valid, true, `合法清单应通过：${ok.errors.join('; ')}`);

  const legacy = validateApplicationManifest(manifestWith(config, { fixedFields: undefined }));
  assert.equal(legacy.valid, true, '旧清单（无固定摘要）必须继续可用');

  const colliding = validateApplicationManifest(
    manifestWith(config, {
      fixedFields: [{ key: 'n_text_content', nodeId: 'n_text', label: '视频描述', value: '固定文案', group: 'text' }],
    }),
  );
  assert.equal(colliding.valid, false);
  assert.ok(colliding.errors.some((e) => e.includes('is also an exposed form property')));

  const malformed = validateApplicationManifest(
    manifestWith(config, { fixedFields: [{ key: 'x', label: '', value: '' }] }),
  );
  assert.equal(malformed.valid, false);
  assert.ok(malformed.errors.some((e) => e.includes('fixedFields[0].label')));
});

test('E2E: 新增样式引用的宿主主题 Token 全部真实存在', () => {
  const tokens = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dsh-theme-tokens.json'), 'utf-8')).tokens);
  const css = fs.readFileSync(path.join(root, 'plugins/omnimux-apps/src/client/apps.css'), 'utf-8');
  const section = css.slice(css.indexOf('.omx-apps-fixed-summary'), css.indexOf('.omx-apps-cta-btn'));
  const used = [...section.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1]);
  assert.ok(used.length > 0, '固定摘要样式段必须可定位');
  const missing = [...new Set(used)].filter((t) => !tokens.has(t)).sort();
  assert.deepEqual(missing, [], `固定摘要引用了宿主不存在的 Token：${missing.join(', ')}`);
});
