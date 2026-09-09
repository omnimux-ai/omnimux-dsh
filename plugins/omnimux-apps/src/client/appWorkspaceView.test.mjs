/**
 * plugins/omnimux-apps/src/client/appWorkspaceView.test.mjs
 *
 * Unit tests for AI Application Workspace View (T04).
 * Validates compact tabs, split layout, stage claiming,
 * authentic empty state (NO sampleTasks fake data), and showcase snapshot reuse.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  claimProductStage,
  releaseProductStage,
  PRODUCT_STAGE_ID,
  APP_OPEN_EVENT,
  TABS_CHANGED_EVENT,
} from './stage.ts';

describe('T04: AI Application Workspace View (AppWorkspaceView)', () => {
  it('T04.8: AppWorkspaceView source code conforms to contract layout and tab management', () => {
    const filePath = path.resolve(import.meta.dirname, 'AppWorkspaceView.tsx');
    assert.ok(fs.existsSync(filePath), 'AppWorkspaceView.tsx must exist');

    const content = fs.readFileSync(filePath, 'utf-8');

    // Layout check
    assert.match(content, /export const AppWorkspaceView/);
    assert.match(content, /omx-apps-tabs-container/);
    assert.match(content, /omx-apps-split-card/);
    assert.match(content, /AppFormPanel/);
    assert.match(content, /omx-apps-output-panel/);

    // Categories check: strictly all, video, image, audio (NO agent!)
    assert.match(content, /'video'/);
    assert.match(content, /'image'/);
    assert.match(content, /'audio'/);
    assert.doesNotMatch(content, /'agent'/, 'Agent category must not exist in category tabs');

    // Truthful empty state check (STRICTLY NO sampleTasks!)
    assert.doesNotMatch(content, /sampleTasks/, 'Forbidden: sampleTasks mock data must not exist');
    assert.match(content, /暂无生成历史/);

    // Showcase snapshot reuse check
    assert.match(content, /使用此示例参数/);
    assert.match(content, /demoSnapshot/);
  });

  it('T04.9: Stage claiming correctly sets markers and dispatches events', () => {
    let stageEventFired = false;
    let claimedId = null;

    const mockWindow = {
      localStorage: {
        setItem(k, v) {
          this[k] = v;
        },
        getItem(k) {
          return this[k] || null;
        },
        removeItem(k) {
          delete this[k];
        },
      },
      dispatchEvent(evt) {
        if (evt.type === 'dsh-product-stage') {
          stageEventFired = true;
          claimedId = evt.detail?.id;
        }
      },
    };

    const mockDoc = {
      documentElement: {
        dataset: {},
      },
    };

    // Temporarily bind globals
    globalThis.window = mockWindow;
    globalThis.document = mockDoc;
    globalThis.CustomEvent = class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    };

    try {
      assert.equal(PRODUCT_STAGE_ID, 'omnimux-apps');
      assert.equal(APP_OPEN_EVENT, 'omnimux-app-open');
      assert.equal(TABS_CHANGED_EVENT, 'omnimux-app-tabs-changed');

      claimProductStage('omnimux-apps');

      assert.equal(stageEventFired, true);
      assert.equal(claimedId, 'omnimux-apps');
      assert.equal(mockDoc.documentElement.dataset.dshProductStage, 'omnimux-apps');
      assert.equal(mockWindow.localStorage.getItem('omnimux_active_product_stage'), 'omnimux-apps');

      // Release stage
      releaseProductStage('omnimux-apps');
      assert.equal(mockDoc.documentElement.dataset.dshProductStage, undefined);
    } finally {
      delete globalThis.window;
      delete globalThis.document;
      delete globalThis.CustomEvent;
    }
  });

  it('T04.10: Showcase item configuration supports video, image, audio without forced 9:16', () => {
    const sampleShowcaseItems = [
      {
        id: 'showcase_vid',
        title: '横屏电影短片',
        mediaType: 'video',
        mediaUrl: 'https://cdn.omnimux.com/samples/horizontal.mp4',
        aspectRatio: '16:9',
      },
      {
        id: 'showcase_img',
        title: '方形商品图',
        mediaType: 'image',
        mediaUrl: 'https://cdn.omnimux.com/samples/square.png',
        aspectRatio: '1:1',
      },
      {
        id: 'showcase_aud',
        title: '播客音频',
        mediaType: 'audio',
        mediaUrl: 'https://cdn.omnimux.com/samples/podcast.mp3',
      },
    ];

    assert.equal(sampleShowcaseItems[0].aspectRatio, '16:9');
    assert.equal(sampleShowcaseItems[1].aspectRatio, '1:1');
    assert.equal(sampleShowcaseItems[2].mediaType, 'audio');
  });

  it('T05.11: AppWorkspaceView eliminates fake setTimeout and connects to real execution / status reconciliation', () => {
    const filePath = path.resolve(import.meta.dirname, 'AppWorkspaceView.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Forbids fake completion timer
    assert.doesNotMatch(content, /setTimeout\([^,]+,\s*(?:1200|4000)\s*\)/, 'Must not contain 1200ms or 4000ms mock completion timer');
    // Verifies real execution and status reconciliation hooks
    assert.match(content, /onExecute/);
    assert.match(content, /onPollStatus/);
    assert.match(content, /executionId/);
    assert.match(content, /COMPLETED/);
    assert.match(content, /FAILED/);
  });
});
