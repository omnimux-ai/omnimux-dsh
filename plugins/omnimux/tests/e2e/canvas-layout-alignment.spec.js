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
  // 1. Verify the rightbar panel fills its own container when the left rail is visible:
  //    container-relative left:0 equals the left rail's right edge in viewport coordinates,
  //    while a viewport-relative offset shifts the panel by one sidebar width (#1718).
  assert.match(
    CONVERSATION_COLLAPSE_CSS,
    /html\[data-omnimux-conversation-collapsed\]:not\(\[data-omnimux-left-collapsed\]\)\s+\.dshDesktopRightbarSurface\s+\[class\*="_panel"\][^{]*\{[^}]*left:\s*0\s*!important/,
    'Rightbar panel must fill its container instead of double-counting the left rail width'
  );
  assert.doesNotMatch(
    CONVERSATION_COLLAPSE_CSS,
    /:not\(\[data-omnimux-left-collapsed\]\)\s+\.dshDesktopRightbarSurface\s+\[class\*="_panel"\][^{]*\{[^}]*left:\s*var\(--omnimux-sidebar-width/,
    'Viewport-relative left offset must not come back: it left a sidebar-wide blank strip'
  );
  // 1b. The fullscreen panel is position:fixed (viewport coordinates, owned by
  //     sidebar-toggle-topbar); the container-relative fill must not reach it (#1718 review).
  assert.match(
    CONVERSATION_COLLAPSE_CSS,
    /:not\(\[data-omnimux-left-collapsed\]\)\s+\.dshDesktopRightbarSurface\s+\[class\*="_panel"\][^{]*:not\(\[data-sidebar-right-panel="fullscreen"\]\)[^{]*\{/,
    'Container-relative fill must exclude the fixed-position fullscreen panel'
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

  // 5. Verify unimplemented placeholder buttons are purged from source
  import('node:fs').then(({ readFileSync }) => {
    import('node:url').then(({ fileURLToPath }) => {
      const src = readFileSync(fileURLToPath(new URL('../../src/client/media-viewer/MediaViewerTab.jsx', import.meta.url)), 'utf8');
      assert.doesNotMatch(src, /移除背景/);
      assert.doesNotMatch(src, /调整大小/);
    });
  });

  // 7. Verify preview cards and display images have no border
  import('node:fs').then(({ readFileSync }) => {
    import('node:url').then(({ fileURLToPath }) => {
      const stylesSrc = readFileSync(fileURLToPath(new URL('../../src/client/media-viewer/styles.js', import.meta.url)), 'utf8');
      assert.match(stylesSrc, /\.omx-chat-media-tail__card\s*\{[^}]*border:\s*none\s*!important/);
      assert.match(stylesSrc, /\.omx-mv-display\s*\{[^}]*border:\s*none\s*!important/);
      // 8. Verify right thumbnails rail for multi-image switching
      assert.match(stylesSrc, /\.omx-mv-thumbnails-rail\s*\{[^}]*position:\s*absolute/);
      assert.match(stylesSrc, /\.omx-mv-thumbnails-rail__item\.active\s*\{[^}]*border-color:\s*var\(--dsw-alias-brand-primary\)/);

      // 9. Verify native composer projection preserves [data-conversation-scroll] and hides [data-slot="conversation.session"]
      assert.doesNotMatch(
        CONVERSATION_COLLAPSE_CSS,
        /\[data-conversation-scroll\][^{]*\{[^}]*display:\s*none/,
        '[data-conversation-scroll] must not be display:none because composerSeat is inside it'
      );
      assert.match(
        CONVERSATION_COLLAPSE_CSS,
        /\[data-slot="conversation\.session"\][^{]*\{[^}]*display:\s*none\s*!important/,
        '[data-slot="conversation.session"] message transcript must be display:none'
      );
      assert.match(
        CONVERSATION_COLLAPSE_CSS,
        /html\[data-omnimux-conversation-collapsed\]\s+\[data-composer-seat\][^{]*\{[^}]*position:\s*fixed\s*!important;[^}]*bottom:\s*24px\s*!important/,
        'Native composer seat must be fixed at bottom 24px in collapsed conversation state'
      );
    });
  });
});
