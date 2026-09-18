import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TEMPLATE_CATEGORIES, SHELVES_CONFIG } from './templates-data.js';

// 使用 esbuild 即时编译 ExploreTemplatesSection.jsx
const output = await build({
  entryPoints: [new URL('./ExploreTemplatesSection.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom'],
});

const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiledModule,
  compiledModule.exports
);
const { ExploreTemplatesSection, attachTemplateToConversation } = compiledModule.exports;

test('ExploreTemplatesSection: 10 大分类胶囊与多货架流完整渲染', () => {
  const html = renderToStaticMarkup(
    React.createElement(ExploreTemplatesSection, {
      onApplyTemplate: () => {},
    })
  );

  // 1. 验证标题
  assert.ok(html.includes('探索模板'), '必须包含专区主标题');

  // 2. 验证 10 大分类胶囊均已渲染
  for (const cat of TEMPLATE_CATEGORIES) {
    assert.ok(
      html.includes(`data-category-slug="${cat.slug}"`),
      `必须渲染分类胶囊: ${cat.slug}`
    );
  }

  // 3. 验证首屏包含各分类货架
  assert.ok(html.includes('王牌短视频应用'), '必须展示王牌应用货架');
  assert.ok(html.includes('软件应用与 SaaS'), '必须展示软件应用货架');
  assert.ok(html.includes('黄金开场 Hook'), '必须展示黄金开场货架');
});

test('attachTemplateToConversation: 点击复刻自动挂载为会话附件并聚焦输入框', () => {
  const addedAttachments = [];
  const dispatchedEvents = [];
  let currentDraft = '';

  const mockWindow = {
    __omnimuxAttachments: {
      getActiveSessionId: () => 'sess-test-123',
      addAttachment: (sessionId, payload) => {
        addedAttachments.push({ sessionId, payload });
        return { ok: true };
      },
    },
    __omnimuxComposerActions: {
      setDraft: (draft) => {
        currentDraft = draft;
      },
      getDraft: () => currentDraft,
      revealAttachments: () => {},
    },
    document: {
      querySelector: () => ({ focus: () => {} }),
    },
    dispatchEvent: (event) => {
      dispatchedEvents.push(event);
      return true;
    },
  };

  const sampleTemplate = {
    id: 'tpl-creatify-8164bec4-098f-4a20-b3d4-108a5fb0b521',
    title: '3D Billboard',
    categorySlug: 'cinematic-vfx',
    duration: '15s',
    prompt: 'Turn your product into an eye-catching 3D billboard.',
    thumbnailUrl: 'https://cdn.creatify.ai/preview.webp',
  };

  attachTemplateToConversation(sampleTemplate, mockWindow);

  // 1. 验证附件存储调用
  assert.equal(addedAttachments.length, 1, '必须向 AttachmentStore 添加 1 项附件');
  const record = addedAttachments[0];
  assert.equal(record.sessionId, 'sess-test-123');
  assert.equal(record.payload.kind, 'inspiration');
  assert.equal(record.payload.entityId, sampleTemplate.id);
  assert.equal(record.payload.title, '3D Billboard');
  assert.equal(record.payload.extension, 'TPL');
  assert.equal(record.payload.metadata.prompt, sampleTemplate.prompt);

  // 2. 验证附件导轨高亮事件派发
  const revealEvt = dispatchedEvents.find((e) => e.type === 'omnimux:attachments:reveal');
  assert.ok(revealEvt, '必须派发 omnimux:attachments:reveal 事件');

  // 3. 验证输入框引导草稿预填
  assert.ok(currentDraft.includes('3D Billboard'), '输入框应包含该模板名称的引导复刻语');
});
