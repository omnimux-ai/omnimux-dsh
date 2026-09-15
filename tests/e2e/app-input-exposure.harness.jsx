/**
 * tests/e2e/app-input-exposure.harness.jsx
 *
 * Task-scoped browser harness for Issue #1994: mounts the real publishing wizard
 * step 2 and the real consumer form panel, then drives the journey in a real
 * browser and reports structured assertions.
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PublishWizardModal } from '../../plugins/omnimux-workflow/src/canvas/editor/components/publish/PublishWizardModal.tsx';
import { AppFormPanel } from '../../plugins/omnimux-apps/src/client/AppFormPanel.tsx';

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

const EMPTY_MANIFEST = {
  appId: 'app_empty_qa',
  version: '1.0.0',
  schemaVersion: '1.0',
  createdAt: new Date().toISOString(),
  metadata: { name: '空表单应用', category: 'video', iconSvg: '<svg></svg>', description: '发布者没有放开任何字段' },
  workflowBinding: { workspaceId: 'ws_qa', workflowHash: '0'.repeat(64), snapshot: { nodes: [], edges: [] } },
  formSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  fieldMappings: {},
  showcase: { mode: 'carousel', items: [] },
  demoSnapshot: {},
  fixedFields: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, label, timeout = 8000) {
  const started = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`timeout waiting for ${label}`);
    await sleep(50);
  }
}

function textOf(selector, root = document) {
  return root.querySelector(selector)?.textContent || '';
}

function Harness() {
  const [manifest, setManifest] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const assertions = [];
      let currentStep = 'start';
      const check = (name, pass, detail) => assertions.push({ name, pass: Boolean(pass), detail });
      // The wizard renders through a document-level overlay, so wizard queries stay document-scoped
      const wizard = () => document;
      const summaryText = () => textOf('[data-qa="summary"]', wizard());
      const switchFor = (label) =>
        wizard().querySelector(`[role="switch"][aria-label="展示给用户：${label}"]`);

      try {
        // 1. Open step 2 from the step pills
        const stepPill = await waitFor(
          () => [...wizard().querySelectorAll('button')].find((b) => b.textContent.includes('2. 输入项与配置项')),
          'step 2 pill',
        );
        stepPill.click();
        await waitFor(() => wizard().querySelectorAll('[role="switch"]').length > 0, 'candidate rows');

        currentStep = '2-groups';
        // 2. Grouping and default summary
        const wizardText = wizard().documentElement.textContent || '';
        check('分组渲染：素材输入 / 文本输入 / 生成配置', ['素材输入', '文本输入', '生成配置'].every((g) => wizardText.includes(g)));
        check(
          '默认概览句：3 项交给用户，其中 1 项必填，5 项固定',
          summaryText().includes('用户将填写 3 项') && summaryText().includes('其中 1 项必填') && summaryText().includes('另有 5 项'),
          summaryText().trim(),
        );
        check('推荐徽标可见', wizardText.includes('推荐'));
        check('固定值行内可见（2K / Hailuo H3）', wizardText.includes('固定：2K') && wizardText.includes('固定：Hailuo H3'));

        const rows = wizard().querySelectorAll('[role="switch"]');
        check('候选项逐行可开关（8 行：2 输入 + 4 参数 + 2 未接槽位）', rows.length === 8, `rows=${rows.length}`);

        currentStep = '3-toggle-model';
        // 3. Open a fixed cost parameter → counts update
        const modelSwitch = switchFor('视频生成 - Model');
        check('固定项存在开关', Boolean(modelSwitch));
        modelSwitch.click();
        await sleep(80);
        check('放开模型后：4 项交给用户', summaryText().includes('用户将填写 4 项'), summaryText().trim());

        currentStep = '4-reset';
        // 4. Restore recommended set
        const resetBtn = [...wizard().querySelectorAll('button')].find((b) => b.textContent.includes('恢复推荐设置'));
        resetBtn.click();
        await sleep(80);
        check('恢复推荐设置后回到 3 项', summaryText().includes('用户将填写 3 项'), summaryText().trim());

        currentStep = '5-close-prompt';
        // 5. Close the prompt → warning-free decrement, then restore
        switchFor('视频描述').click();
        await sleep(80);
        check('关闭描述后：2 项交给用户且无必填', summaryText().includes('用户将填写 2 项') && !summaryText().includes('必填'), summaryText().trim());
        switchFor('视频描述').click();
        await sleep(80);

        currentStep = '6-close-all';
        // 6. Close everything → warning copy
        const exposedSwitches = [...wizard().querySelectorAll('[role="switch"][aria-checked="true"]')];
        for (const sw of exposedSwitches) {
          sw.click();
          await sleep(60);
        }
        check('全部关闭后出现告警文案', summaryText().includes('当前没有任何一项展示给用户'), summaryText().trim());
        check('空清单挂载渲染空态', Boolean(document.querySelector('#empty-host .omx-apps-form-empty')));

        currentStep = '7-publish';
        // 7. Restore and publish through the real wizard
        [...wizard().querySelectorAll('button')].find((b) => b.textContent.includes('恢复推荐设置')).click();
        await sleep(80);
        [...wizard().querySelectorAll('button')].find((b) => b.textContent.trim() === '下一步').click();
        const publishBtn = await waitFor(
          () => [...wizard().querySelectorAll('button')].find((b) => b.textContent.includes('确定发布并开启 Tab')),
          'publish button',
        );
        publishBtn.click();

        const fields = await waitFor(() => {
          const list = document.querySelectorAll('#consumer-host .omx-apps-field');
          return list.length ? list : null;
        }, 'consumer fields');

        check('发布后用户端渲染 3 个字段', fields.length === 3, `fields=${fields.length}`);
        const consumerText = document.getElementById('consumer-host').textContent;
        check('用户端字段来自画布节点标题', ['视频描述', '视频生成 - Aspect Ratio', '视频生成 - Duration'].every((f) => consumerText.includes(f)), consumerText.replace(/\s+/g, ' ').slice(0, 220));
        check('用户端出现「以下由作者设定」汇总行', consumerText.includes('以下由作者设定，无需填写'));
        const chips = document.querySelectorAll('#consumer-host .omx-apps-fixed-chip');
        check('固定项汇总为 3 个标签', chips.length === 3, `chips=${chips.length}`);
        check('固定项含 2K 与 Hailuo H3', consumerText.includes('2K') && consumerText.includes('Hailuo H3'));
        const fieldLabels = [...document.querySelectorAll('#consumer-host .omx-apps-field-label')].map((el) => el.textContent).join('|');
        check('固定项不作为表单字段出现', !fieldLabels.includes('Quality') && !fieldLabels.includes('Model') && !fieldLabels.includes('GenerationCount'), fieldLabels);

        currentStep = '8-empty';
        // 8. Empty manifest keeps a readable empty state with a disabled CTA
        const emptyHost = document.getElementById('empty-host');
        check('空表单应用显示空态文案', emptyHost.textContent.includes('这个应用暂时没有可填写的内容'));
        const emptyCta = emptyHost.querySelector('.omx-apps-cta-btn');
        check('空表单应用主按钮禁用', Boolean(emptyCta) && emptyCta.disabled === true);
      } catch (error) {
        assertions.push({
          name: 'journey-error',
          pass: false,
          detail: `${String(error && error.message ? error.message : error)} | step=${currentStep} | stack=${String(error && error.stack ? error.stack : '').slice(0, 700)}`,
        });
      }

      if (cancelled) return;
      const failed = assertions.filter((a) => !a.pass);
      const report = {
        task: 'Issue #1994 发布为 AI 应用的输入项与配置项可选化',
        url: location.href,
        userAgent: navigator.userAgent,
        total: assertions.length,
        passed: assertions.length - failed.length,
        failed: failed.length,
        assertions,
      };
      const pre = document.createElement('pre');
      pre.id = 'qa-report';
      pre.style.display = 'none';
      pre.textContent = JSON.stringify(report, null, 2);
      document.body.appendChild(pre);
      document.title = failed.length === 0 ? `QA-PASS ${assertions.length}/${assertions.length}` : `QA-FAIL ${failed.length}`;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: 'flex', gap: 20, padding: 16, alignItems: 'flex-start', minHeight: '100vh' }}>
      <div id="wizard-host" style={{ flex: '0 0 700px' }}>
        <PublishWizardModal
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          nodes={NODES}
          edges={EDGES}
          workspaceId="ws_qa"
          workflowName="视频生成"
          onPublished={(m) => setManifest(m)}
        />
      </div>
      <div id="consumer-host" style={{ flex: '1 1 auto', maxWidth: 520 }}>
        {manifest ? <AppFormPanel manifest={manifest} onSubmit={() => {}} /> : <div id="consumer-pending">等待发布</div>}
      </div>
      <div id="empty-host" style={{ flex: '0 0 460px' }}>
        <AppFormPanel manifest={EMPTY_MANIFEST} onSubmit={() => {}} />
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
createRoot(rootEl).render(<Harness />);
