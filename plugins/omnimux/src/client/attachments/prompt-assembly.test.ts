import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPathReference,
  formatAttachmentLine,
  buildAttachedContextBlock,
  assemblePromptWithAttachments,
} from './prompt-assembly.ts';
import type { ConversationAttachment } from './types.ts';

test('formatPathReference: 规范化路径为 DSH @语法', () => {
  assert.equal(formatPathReference('.hilo/tables/node-01.htable'), '@.hilo/tables/node-01.htable');
  assert.equal(formatPathReference('assets\\videos\\shot 01.mp4'), '@"assets/videos/shot 01.mp4"');
  assert.equal(formatPathReference('/leading/slash/path.png'), '@leading/slash/path.png');
});

test('assemblePromptWithAttachments: 正确组装用户 Prompt 与多模态附件上下文', () => {
  const attachments: ConversationAttachment[] = [
    {
      id: 'att-1',
      fingerprint: 'fp1',
      sessionId: 'sess-1',
      sourcePlugin: 'omnimux-workflow',
      kind: 'video',
      entityId: 'vid-1',
      title: '主角镜头.mp4',
      extension: 'MP4',
      relativePath: 'assets/videos/shot1.mp4',
      duration: '0:31',
      status: 'ready',
      createdAt: 100,
    },
    {
      id: 'att-2',
      fingerprint: 'fp2',
      sessionId: 'sess-1',
      sourcePlugin: 'omnimux-workflow',
      kind: 'table',
      entityId: 'tbl-1',
      title: '未命名表格.htable',
      extension: 'HTABLE',
      relativePath: '.hilo/tables/node-tbl.htable',
      status: 'ready',
      createdAt: 200,
    },
    {
      id: 'att-3',
      fingerprint: 'fp3',
      sessionId: 'sess-1',
      sourcePlugin: 'omnimux-workflow',
      kind: 'document',
      entityId: 'doc-1',
      title: '请创作一个[时长]的[类.md',
      extension: 'MD',
      relativePath: 'prompts/template.md',
      status: 'ready',
      createdAt: 300,
    },
  ];

  const userPrompt = '请帮我分析上述表格和视频的内容，并基于提示词模版输出第 2 幕分镜。';
  const assembled = assemblePromptWithAttachments(userPrompt, attachments);

  assert.match(assembled, /请帮我分析上述表格和视频的内容/);
  assert.match(assembled, /### 会话关联上下文 \(Attached Context\):/);
  assert.match(assembled, /- \[视频\] 主角镜头\.mp4 \(`MP4`, 0:31\): @assets\/videos\/shot1\.mp4/);
  assert.match(assembled, /- \[表格\] 未命名表格\.htable \(`HTABLE`\): @\.hilo\/tables\/node-tbl\.htable/);
  assert.match(assembled, /- \[文档\] 请创作一个\[时长\]的\[类\.md \(`MD`\): @prompts\/template\.md/);
});

test('assemblePromptWithAttachments: 空附件时保持原样返回', () => {
  const userPrompt = '普通用户输入';
  assert.equal(assemblePromptWithAttachments(userPrompt, []), userPrompt);
});

test('formatAttachmentLine: 资产多文件各写一行 @path', () => {
  const line = formatAttachmentLine({
    id: 'att-a',
    fingerprint: 'fp-a',
    sessionId: 'sess-1',
    sourcePlugin: 'omnimux',
    kind: 'asset',
    entityId: 'ast_1',
    title: '林晓',
    extension: 'PNG',
    relativePath: 'assets/imported/ast_1/hero.png',
    status: 'ready',
    createdAt: 1,
    metadata: {
      files: [
        'assets/imported/ast_1/hero.png',
        'assets/imported/ast_1/pose.png',
      ],
    },
  });
  assert.match(line, /\[资产\] 林晓/);
  assert.match(line, /@assets\/imported\/ast_1\/hero\.png/);
  assert.match(line, /@assets\/imported\/ast_1\/pose\.png/);
});

test('formatAttachmentLine: 支持场景上下文注入', () => {
  const att: ConversationAttachment = {
    id: 'att-p',
    fingerprint: 'fp-p',
    sessionId: 'sess-p',
    sourcePlugin: 'omnimux',
    kind: 'product',
    entityId: 'prd-01',
    title: '降噪耳机',
    extension: 'JSON',
    relativePath: '.omnimux/products/prd-01.json',
    status: 'ready',
    createdAt: 100,
    metadata: {
      scene: 'ecommerce_marketing',
      summary: '45dB深度降噪',
    },
  };
  const line = formatAttachmentLine(att);
  assert.match(line, /- \[产品\] 降噪耳机 \(`JSON`\): @\.omnimux\/products\/prd-01\.json/);
  assert.match(line, /\* 场景: ecommerce_marketing/);
  assert.match(line, /\* 简述: 45dB深度降噪/);
});

test('formatAttachmentLine: 无实体路径时使用 previewUrl 作为 fallbackRef', () => {
  const attWithPreview: ConversationAttachment = {
    id: 'att-preview-fallback',
    fingerprint: 'fp-preview',
    sessionId: 'sess-preview',
    sourcePlugin: 'omnimux',
    kind: 'image',
    entityId: 'img-preview-1',
    title: '未落地草图.png',
    extension: 'PNG',
    relativePath: '',
    previewUrl: 'https://cdn.example.com/attachments/preview-thumb.png',
    status: 'ready',
    createdAt: 200,
  };
  const line = formatAttachmentLine(attWithPreview);
  assert.equal(
    line,
    '- [图像] 未落地草图.png (`PNG`): https://cdn.example.com/attachments/preview-thumb.png',
    '无本地相对路径时，应正确降级为 previewUrl'
  );

  const attWithBlob: ConversationAttachment = {
    id: 'att-blob-fallback',
    fingerprint: 'fp-blob',
    sessionId: 'sess-blob',
    sourcePlugin: 'omnimux',
    kind: 'video',
    entityId: 'vid-blob-1',
    title: '临时录制片段.mp4',
    extension: 'MP4',
    relativePath: '',
    previewUrl: 'blob:http://localhost:43120/abc-123',
    status: 'ready',
    createdAt: 201,
  };
  const blobLine = formatAttachmentLine(attWithBlob);
  assert.equal(
    blobLine,
    '- [视频] 临时录制片段.mp4 (`MP4`): blob:http://localhost:43120/abc-123'
  );
});
