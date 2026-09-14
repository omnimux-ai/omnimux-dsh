import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  CONVERSATION_COLLAPSED_ATTR,
  CONVERSATION_COLLAPSE_CSS,
  setConversationCollapsed,
  getConversationCollapsed,
} from '../../src/client/conversation-collapse.js';
import { getGlobalMediaViewerStore } from '../../src/client/media-viewer/media-viewer-store.js';

test('e2e: full canvas mode layout alignment and conversation collapse contracts', () => {
  // 1. Verify CSS rules enforce left: 280px when left sidebar is expanded (not collapsed)
  assert.match(
    CONVERSATION_COLLAPSE_CSS,
    /html\[data-omnimux-conversation-collapsed\]:not\(\[data-omnimux-left-collapsed\]\)\s+\.dshDesktopRightbarSurface\s+\[class\*="_panel"\][^{]*\{[^}]*left:\s*var\(--omnimux-sidebar-width,\s*280px\)\s*!important/,
    'Rightbar panel must dock precisely to left sidebar right edge (280px) and never overlap'
  );

  // 2. Verify CSS rules enforce left: 0 when left sidebar is collapsed
  assert.match(
    CONVERSATION_COLLAPSE_CSS,
    /html\[data-omnimux-conversation-collapsed\]\[data-omnimux-left-collapsed\]\s+\.dshDesktopRightbarSurface\s+\[class\*="_panel"\][^{]*\{[^}]*left:\s*0\s*!important/,
    'Rightbar panel must take full 100vw when left sidebar is collapsed'
  );

  // 3. Verify media-viewer-store defaults to single subViewMode (Canvas view)
  const store = getGlobalMediaViewerStore();
  assert.equal(store.getSnapshot().subViewMode, 'single', 'Default view sub-mode must be single canvas');

  // 4. Verify conversation collapse toggling
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const doc = dom.window.document;
  globalThis.document = doc;
  globalThis.window = dom.window;

  setConversationCollapsed(true, { persist: false, doc, sessionId: 'e2e-session' });
  assert.equal(doc.documentElement.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true);
  assert.equal(getConversationCollapsed({ sessionId: 'e2e-session', doc }), true);

  setConversationCollapsed(false, { persist: false, doc, sessionId: 'e2e-session' });
  assert.equal(doc.documentElement.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false);
  assert.equal(getConversationCollapsed({ sessionId: 'e2e-session', doc }), false);

  // 5. Verify unimplemented buttons are purged from source
  import('node:fs').then(({ readFileSync }) => {
    import('node:url').then(({ fileURLToPath }) => {
      const src = readFileSync(fileURLToPath(new URL('../../src/client/media-viewer/MediaViewerTab.jsx', import.meta.url)), 'utf8');
      assert.doesNotMatch(src, /添加评论/);
      assert.doesNotMatch(src, /移除背景/);
      assert.doesNotMatch(src, /调整大小/);
    });
  });
});
