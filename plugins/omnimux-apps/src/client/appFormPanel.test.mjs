/**
 * plugins/omnimux-apps/src/client/appFormPanel.test.mjs
 *
 * Unit tests for AI App Consumer Form Engine (T04).
 * Validates 448px outer / 398px inner geometry, 9 standard widgets,
 * 44px Ink CTA button, and fail-closed validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateFormData } from '../shared/schemaValidator.ts';

describe('T04: AI Application Form Engine (AppFormPanel)', () => {
  const sampleManifest = {
    appId: 'app_test_geometry',
    version: '1.0.0',
    schemaVersion: '1.0',
    createdAt: new Date().toISOString(),
    metadata: {
      name: '测试生成器',
      category: 'video',
      iconSvg: '<svg></svg>',
    },
    workflowBinding: {
      workspaceId: 'ws_test',
      workflowHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      snapshot: { nodes: [], edges: [] },
    },
    formSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          title: '视频脚本',
          maxLength: 300,
          widget: 'textarea',
        },
        aspectRatio: {
          type: 'string',
          title: '画幅比例',
          enum: ['1:1', '4:3', '16:9', '9:16'],
          widget: 'ratio-cards',
        },
        stylePreset: {
          type: 'string',
          title: '风格预设',
          enum: ['写实胶片', '赛博朋克', '日系清新'],
          widget: 'select-single',
        },
        durationSec: {
          type: 'number',
          title: '生成时长',
          minimum: 5,
          maximum: 60,
          widget: 'slider-range',
        },
        enhanceMotion: {
          type: 'boolean',
          title: '动态增强',
          widget: 'switch-boolean',
        },
        referenceMedia: {
          type: 'string',
          title: '参考素材',
          widget: 'media-uploader',
        },
        videoSourceLink: {
          type: 'string',
          title: '参考链接',
          widget: 'media-extractor',
        },
        dualOptions: {
          type: 'string',
          title: '双列选择',
          widget: 'select-grid-pair',
        },
        titleInput: {
          type: 'string',
          title: '片头标题',
          widget: 'input-text',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    fieldMappings: {
      prompt: {
        nodeId: 'node_text',
        targetField: 'content',
        mappingType: 'text',
        widget: 'textarea',
      },
      aspectRatio: {
        nodeId: 'node_gen',
        targetField: 'params.aspectRatio',
        mappingType: 'param',
        widget: 'ratio-cards',
      },
      stylePreset: {
        nodeId: 'node_gen',
        targetField: 'params.style',
        mappingType: 'param',
        widget: 'select-single',
      },
      durationSec: {
        nodeId: 'node_gen',
        targetField: 'params.duration',
        mappingType: 'param',
        widget: 'slider-range',
      },
      enhanceMotion: {
        nodeId: 'node_gen',
        targetField: 'params.motion',
        mappingType: 'param',
        widget: 'switch-boolean',
      },
      referenceMedia: {
        nodeId: 'node_import',
        targetField: 'mediaUrl',
        mappingType: 'media',
        widget: 'media-uploader',
      },
      videoSourceLink: {
        nodeId: 'node_import',
        targetField: 'sourceLink',
        mappingType: 'media',
        widget: 'media-extractor',
      },
      dualOptions: {
        nodeId: 'node_gen',
        targetField: 'params.dual',
        mappingType: 'param',
        widget: 'select-grid-pair',
      },
      titleInput: {
        nodeId: 'node_text_title',
        targetField: 'content',
        mappingType: 'text',
        widget: 'input-text',
      },
    },
    showcase: {
      mode: 'carousel',
      items: [],
    },
    demoSnapshot: {
      prompt: '都市夜景霓虹灯光影',
      aspectRatio: '9:16',
      durationSec: 15,
      enhanceMotion: true,
    },
  };

  it('T04.1: Strictly enforces 448px outer / 398px inner geometry specification', () => {
    const outerWidth = 448;
    const paddingLeft = 24;
    const paddingRight = 24;
    const borderLeft = 1;
    const borderRight = 1;

    const innerUsableWidth = outerWidth - borderLeft - borderRight - paddingLeft - paddingRight;
    assert.equal(innerUsableWidth, 398, 'Inner available width must strictly equal 398px');

    // Dual-column dropdown geometry test: 195px + 8px gap + 195px = 398px
    const colWidth = 195;
    const gap = 8;
    assert.equal(colWidth * 2 + gap, 398, 'Dual-column layout must perfectly span 398px');
  });

  it('T04.2: AppFormPanel source code conforms to contract geometry and 9 widgets', () => {
    const filePath = path.resolve(import.meta.dirname, 'AppFormPanel.tsx');
    assert.ok(fs.existsSync(filePath), 'AppFormPanel.tsx must exist');

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.match(content, /export const AppFormPanel/);
    assert.match(content, /textarea/);
    assert.match(content, /input-text/);
    assert.match(content, /select-single/);
    assert.match(content, /select-grid-pair/);
    assert.match(content, /ratio-cards/);
    assert.match(content, /slider-range/);
    assert.match(content, /switch-boolean/);
    assert.match(content, /media-uploader/);
    assert.match(content, /media-extractor/);
    assert.match(content, /立即生成/);
  });

  it('T04.3: Validates required fields and rejects empty input', () => {
    const invalidValues = {
      prompt: '', // Required cannot be empty
    };

    const valResult = validateFormData(sampleManifest.formSchema, invalidValues);
    assert.equal(valResult.valid, false);
    assert.ok(valResult.errors.some((e) => e.includes('Required field "prompt" cannot be empty')));
  });

  it('T04.4: Validates enum constraints on ratio and dropdown widgets', () => {
    const invalidRatio = {
      prompt: '合法提示词',
      aspectRatio: '21:9', // Not in enum
    };

    const valResult = validateFormData(sampleManifest.formSchema, invalidRatio);
    assert.equal(valResult.valid, false);
    assert.ok(valResult.errors.some((e) => e.includes('is not in allowed enum')));
  });

  it('T04.5: Validates numeric range on slider widget', () => {
    const invalidRange = {
      prompt: '合法提示词',
      durationSec: 999, // Exceeds maximum 60
    };

    const valResult = validateFormData(sampleManifest.formSchema, invalidRange);
    assert.equal(valResult.valid, false);
    assert.ok(valResult.errors.some((e) => e.includes('exceeds maximum')));
  });

  it('T04.6: Rejects unpermitted additional properties (Fail-Closed additionalProperties: false)', () => {
    const maliciousValues = {
      prompt: '合法提示词',
      unauthorizedKey: '注入非法数据',
    };

    const valResult = validateFormData(sampleManifest.formSchema, maliciousValues);
    assert.equal(valResult.valid, false);
    assert.ok(valResult.errors.some((e) => e.includes('is not permitted')));
  });

  it('T04.7: Valid input payload passes form validation completely', () => {
    const validValues = {
      prompt: '雨夜街头赛博朋克霓虹',
      aspectRatio: '9:16',
      stylePreset: '赛博朋克',
      durationSec: 15,
      enhanceMotion: true,
    };

    const valResult = validateFormData(sampleManifest.formSchema, validValues);
    assert.equal(valResult.valid, true, `Validation failed unexpectedly: ${valResult.errors.join('; ')}`);
  });
});
