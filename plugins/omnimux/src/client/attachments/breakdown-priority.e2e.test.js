import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enhanceTurnMedia,
  isBreakdownOrAnalysisTurn,
  resetAutoOpenedForTests,
} from './assistantMessageMediaEnhancer.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('E2E: Video breakdown priority and exclusivity gate', async (t) => {
  await t.test('AC-1: Video breakdown scene suppresses media viewer auto-open', () => {
    resetAutoOpenedForTests();
    let autoOpenedTabId = null;

    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div class="flowItem" data-chat-turn="breakdown-turn" data-chat-flow-kind="tool">
            <video src="http://example.com/tiktok-ref.mp4" title="参考视频"></video>
          </div>
          <div class="flowItem" data-chat-turn="breakdown-turn" data-chat-flow-kind="assistant-step">
            <div class="bubble">
              <h3>四、爆款短视频复刻与落地建议</h3>
              <p>结构复用公式：Hook -> Pain -> Tool</p>
              <p>(注：您可以在右侧工作台查看各分镜关键帧截图及详细标签属性)</p>
              <p>分镜数据已保存至 video-analysis-001.vbreakdown</p>
            </div>
          </div>
        </body>
      </html>
    `);
    const doc = dom.window.document;
    const win = dom.window;
    win.__omnimuxWorkbench = {
      openWorkbench: ({ tabId }) => {
        autoOpenedTabId = tabId;
        return true;
      },
    };

    const turnNodes = Array.from(doc.querySelectorAll('[data-chat-turn="breakdown-turn"]'));
    assert.equal(isBreakdownOrAnalysisTurn(turnNodes), true, 'Must identify turn as breakdown scene');

    const enhanced = enhanceTurnMedia('breakdown-turn', turnNodes, doc);
    assert.equal(enhanced, true, 'Media should still be recorded in background store');
    assert.equal(
      autoOpenedTabId,
      null,
      'Exclusivity gate must block media viewer auto-open to preserve breakdown workbench precedence'
    );
  });

  await t.test('AC-2: Normal media generation outside breakdown still triggers auto-open', () => {
    resetAutoOpenedForTests();
    let autoOpenedTabId = null;

    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div class="flowItem" data-chat-turn="normal-gen-turn" data-chat-flow-kind="tool">
            <img src="http://example.com/artwork.png" alt="赛博朋克城市" />
          </div>
          <div class="flowItem" data-chat-turn="normal-gen-turn" data-chat-flow-kind="assistant-step">
            <div class="bubble">
              <p>已为您生成赛博朋克城市壁纸。</p>
            </div>
          </div>
        </body>
      </html>
    `);
    const doc = dom.window.document;
    const win = dom.window;
    win.__omnimuxWorkbench = {
      openWorkbench: ({ tabId }) => {
        autoOpenedTabId = tabId;
        return true;
      },
    };

    const turnNodes = Array.from(doc.querySelectorAll('[data-chat-turn="normal-gen-turn"]'));
    assert.equal(isBreakdownOrAnalysisTurn(turnNodes), false, 'Normal generation is not breakdown');

    const enhanced = enhanceTurnMedia('normal-gen-turn', turnNodes, doc);
    assert.equal(enhanced, true);
    assert.equal(
      autoOpenedTabId,
      'omnimux:media-viewer',
      'Normal generation must still trigger media viewer auto-open'
    );
  });

  await t.test('AC-3: MediaViewerTab video element does not autoPlay', () => {
    const tabSource = readFileSync(
      resolve(__dirname, '../media-viewer/MediaViewerTab.jsx'),
      'utf8'
    );
    const videoSnippet = tabSource.match(/activeItem\?\.type === 'video'[\s\S]*?<video[^>]+>/);
    assert.ok(videoSnippet, 'Video render block must exist in MediaViewerTab');
    assert.equal(
      videoSnippet[0].includes('autoPlay'),
      false,
      'Video tag must strictly omit autoPlay attribute'
    );
  });
});
