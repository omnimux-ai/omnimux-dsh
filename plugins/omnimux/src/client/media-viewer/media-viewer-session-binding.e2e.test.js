import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { getGlobalMediaViewerStore } from './media-viewer-store.js';
import { bindWorkbenchDeps, resetWorkbenchHostAdapter } from '../workbench/host-adapter.js';

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'MediaViewerTab.jsx');
const rootDir = join(here, '../../../../..');
const workbuddyDir = join(rootDir, '.workbuddy');
mkdirSync(workbuddyDir, { recursive: true });
const tempFile = join(workbuddyDir, `temp-media-viewer-tab-test-${Date.now()}.mjs`);

const ignoreCssPlugin = {
  name: 'ignore-css',
  setup(build) {
    build.onResolve({ filter: /\.css/ }, (args) => ({
      path: args.path,
      namespace: 'ignore-css',
    }));
    build.onLoad({ filter: /.*/, namespace: 'ignore-css' }, () => ({
      contents: 'export default {};',
      loader: 'js',
    }));
  },
};

let MediaViewerTab;

try {
  await esbuild.build({
    entryPoints: [sourcePath],
    bundle: true,
    format: 'esm',
    outfile: tempFile,
    plugins: [ignoreCssPlugin],
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/server'],
  });

  const mod = await import(pathToFileURL(tempFile).href);
  MediaViewerTab = mod.MediaViewerTab;
} finally {
  try {
    unlinkSync(tempFile);
  } catch {
    // ignore
  }
}

describe('MediaViewerTab session binding & isolation', () => {
  it('renders only the active session media items in single and thumbnail rail views', () => {
    resetWorkbenchHostAdapter();
    const sessionA = 'session-extract-video-101';
    const sessionB = 'session-black-theme-202';

    const store = getGlobalMediaViewerStore();
    // In Session A: 2 keyframe images
    store.addMedia({ id: 'a1', url: 'https://example.com/a1.jpg', title: 'A1关键帧', sessionId: sessionA });
    store.addMedia({ id: 'a2', url: 'https://example.com/a2.jpg', title: 'A2关键帧', sessionId: sessionA });

    // In Session B: 1 chart image
    store.addMedia({ id: 'b1', url: 'https://example.com/b1.jpg', title: 'B1黑色图表', sessionId: sessionB });

    // Mock sessions object pointing to session A
    const mockSessionsA = {
      list: {
        subscribe: () => () => {},
        getSnapshot: () => ({ current: sessionA }),
      },
    };
    bindWorkbenchDeps({ sessions: mockSessionsA });

    // Render in Session A
    const htmlA = renderToString(React.createElement(MediaViewerTab, { sessions: mockSessionsA }));
    // Must contain A1 and A2
    assert.ok(htmlA.includes('A1关键帧') || htmlA.includes('https://example.com/a1.jpg'), 'Session A must display A1');
    assert.ok(htmlA.includes('A2关键帧') || htmlA.includes('https://example.com/a2.jpg'), 'Session A must display A2');
    // Must NOT contain B1
    assert.equal(htmlA.includes('B1黑色图表'), false, 'Session A must NOT display Session B media');
    assert.equal(htmlA.includes('https://example.com/b1.jpg'), false, 'Session A must NOT leak Session B URL');

    // Render in Session B
    const mockSessionsB = {
      list: {
        subscribe: () => () => {},
        getSnapshot: () => ({ current: sessionB }),
      },
    };
    bindWorkbenchDeps({ sessions: mockSessionsB });

    const htmlB = renderToString(React.createElement(MediaViewerTab, { sessions: mockSessionsB }));
    // Must contain B1
    assert.ok(htmlB.includes('B1黑色图表') || htmlB.includes('https://example.com/b1.jpg'), 'Session B must display B1');
    // Must NOT contain A1 or A2
    assert.equal(htmlB.includes('A1关键帧'), false, 'Session B must NOT display Session A media');
    assert.equal(htmlB.includes('https://example.com/a1.jpg'), false, 'Session B must NOT leak Session A URL');
    // Since Session B has only 1 image, thumbnails rail must not render (> 1 requirement)
    assert.equal(htmlB.includes('omx-mv-thumbnails-rail'), false, 'Session B with 1 item should not display thumbnails rail');

    // Render in Empty Session C
    const mockSessionsC = {
      list: {
        subscribe: () => () => {},
        getSnapshot: () => ({ current: 'session-empty-303' }),
      },
    };
    bindWorkbenchDeps({ sessions: mockSessionsC });

    const htmlC = renderToString(React.createElement(MediaViewerTab, { sessions: mockSessionsC }));
    // Must display empty state
    assert.ok(htmlC.includes('当前会话暂无生成的图片或视频'), 'Empty session must display empty state guidance');
    assert.equal(htmlC.includes('https://example.com/a1.jpg'), false, 'Empty session must NOT leak other media');
    assert.equal(htmlC.includes('https://example.com/b1.jpg'), false, 'Empty session must NOT leak other media');

    resetWorkbenchHostAdapter();
  });
});
