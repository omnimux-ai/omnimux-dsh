import React from 'react';
import { createRoot } from 'react-dom/client';
import { MediaViewerTab } from '../../src/media-viewer/MediaViewerTab.jsx';
import { getGlobalMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';

const params = new URLSearchParams(window.location.search);
const width = Math.max(320, Number.parseInt(params.get('w') || '900', 10) || 900);
document.getElementById('frame').style.width = `${width}px`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b5bdb"/><stop offset="100%" stop-color="#14161a"/></linearGradient></defs><rect width="480" height="480" fill="url(#g)"/><text x="50%" y="52%" fill="#fff" font-family="system-ui" font-size="42" text-anchor="middle">v1</text></svg>`;
const cover = `data:image/svg+xml,${encodeURIComponent(svg)}`;

const MODEL_CATALOG = {
  image: [{
    id: 'synthetic-image-3548',
    label: 'Synthetic Image',
    family: 'qa',
    parameters: {
      aspectRatio: { defaultValue: '1:1', options: ['1:1'] },
      resolution: { defaultValue: '1K', options: ['1K'] },
      n: { defaultValue: 1, options: [1] },
    },
    channelGroups: [{ id: 'standard', label: '标准版', default: true, pricing: { pointsEstimate: 0.13, billingMode: 'per_task', discountRate: 1 } }],
    operations: [{ id: 'text_to_image', output: { type: 'image' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 }] }],
  }],
  video: [],
};

window.fetch = async (url) => {
  const path = String(url);
  if (path === '/omnimux/model-catalog') {
    return new Response(JSON.stringify(MODEL_CATALOG), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/omnimux/assets/state') {
    return new Response(JSON.stringify({
      assets: [{
        id: 'ast_3548',
        name: '本地角色',
        handle: 'character-3548',
        type: 'character',
        cover_file_id: 'file_3548',
        cover: { id: 'file_3548', kind: 'image', original_name: 'hero.png', real_path: '/tmp/hero.png', visible: true },
        files: [{ id: 'file_3548', kind: 'image', original_name: 'hero.png', real_path: '/tmp/hero.png', visible: true }],
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path.startsWith('/omnimux/assets/library/preview')) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#2f9e44"/><text x="50%" y="54%" fill="#fff" font-family="system-ui" font-size="28" text-anchor="middle">hero.png</text></svg>`;
    return new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml' } });
  }
  throw new Error(`Unplanned request ${path}`);
};

try { window.localStorage.clear(); } catch (error) { console.warn('localStorage clear failed', error); }

const previewCover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#2f9e44"/><text x="50%" y="54%" fill="#fff" font-family="system-ui" font-size="28" text-anchor="middle">hero.png</text></svg>')}`;
const imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  configurable: true,
  get: imageSrc.get,
  set(value) {
    const next = String(value || '');
    if (next.includes('/omnimux/assets/library/preview') || next.includes('/omnimux/assets/artifacts/preview')) {
      imageSrc.set.call(this, previewCover);
      return;
    }
    imageSrc.set.call(this, value);
  },
});

const store = getGlobalMediaViewerStore();
store.addMedia({ id: 'img-1', sessionId: 's1', type: 'image', status: 'completed', url: cover, title: '基准图', prompt: '基准图', request: { prompt: '基准图' }, aspectRatio: '1:1', timestamp: 1_760_000_000_000 });
store.setActiveId('img-1');

const sessions = { list: { getSnapshot: () => ({ current: 's1' }), subscribe: () => () => {} } };
createRoot(document.getElementById('root')).render(React.createElement(MediaViewerTab, { sessions }));
