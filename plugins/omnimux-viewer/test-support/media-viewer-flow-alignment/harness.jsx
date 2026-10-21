import React from 'react';
import { createRoot } from 'react-dom/client';
import { MediaViewerTab } from '../../src/media-viewer/MediaViewerTab.jsx';
import { getGlobalMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';

const params = new URLSearchParams(window.location.search);
const width = Math.max(320, Number.parseInt(params.get('w') || '1280', 10) || 1280);
const frame = document.getElementById('frame');
frame.style.width = `${width}px`;

function cover(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#14161a"/></linearGradient></defs><rect width="480" height="480" fill="url(#g)"/><text x="50%" y="52%" fill="#ffffff" font-family="system-ui" font-size="42" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const MODEL_CATALOG = {
  image: [{
    id: 'synthetic-image-3533',
    label: 'Synthetic Image',
    family: 'qa',
    parameters: {
      aspectRatio: { defaultValue: '1:1', options: ['1:1', '16:9'] },
      resolution: { defaultValue: '1K', options: ['1K'] },
      n: { defaultValue: 2, options: [1, 2, 4] },
    },
    channelGroups: [{
      id: 'standard',
      label: '标准版',
      default: true,
      pricing: { pointsEstimate: 0.13, billingMode: 'per_task', discountRate: 1 },
    }],
    operations: [{ id: 'text_to_image', output: { type: 'image' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 }] }],
  }],
  video: [{
    id: 'synthetic-video-3533',
    label: 'Synthetic Video',
    family: 'qa',
    parameters: { aspectRatio: { defaultValue: '16:9', options: ['16:9'] }, resolution: { defaultValue: '720P', options: ['720P'] } },
    channelGroups: [{ id: 'standard', label: '标准版', default: true, pricing: { pointsEstimate: 8, billingMode: 'per_second', discountRate: 1 } }],
    operations: [{ id: 'text_to_video', output: { type: 'video' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 }] }],
  }],
};

window.fetch = async (url) => {
  const path = String(url);
  if (path === '/omnimux/model-catalog') {
    return new Response(JSON.stringify(MODEL_CATALOG), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/omnimux/assets/state') {
    return new Response(JSON.stringify({ assets: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unplanned request ${path}`);
};

const store = getGlobalMediaViewerStore();
const base = 1_760_000_000_000;
const items = [
  { id: 'v1', groupId: 'g1', timestamp: base + 60_000, prompt: '白色瓷杯，晨光静物', color: '#3b5bdb' },
  { id: 'v2', groupId: 'g2', timestamp: base + 120_000, prompt: '窗边人像，柔和自然光', color: '#2f9e44' },
  { id: 'v3', groupId: 'g3', timestamp: base + 180_000, prompt: '沙漠里的柴犬，手机拍摄质感', color: '#e8590c' },
  { id: 'v4:0', groupId: 'g4', timestamp: base + 240_000, prompt: '产品图，极简白底，四张批量', color: '#7048e8' },
  { id: 'v4:1', groupId: 'g4', timestamp: base + 240_100, prompt: '产品图，极简白底，四张批量', color: '#ae3ec9' },
  { id: 'v5', groupId: 'g5', timestamp: base + 300_000, prompt: '失败的尝试：夜景霓虹', color: '#c92a2a', status: 'failed', url: '' },
];
for (const entry of items) {
  store.addMedia({
    id: entry.id,
    sessionId: 's1',
    groupId: entry.groupId,
    timestamp: entry.timestamp,
    type: 'image',
    status: entry.status || 'completed',
    url: entry.url === '' ? '' : cover(entry.id, entry.color),
    title: entry.prompt,
    prompt: entry.prompt,
    request: { prompt: entry.prompt, kind: 'image' },
    aspectRatio: '1:1',
    failure: entry.status === 'failed' ? { reason: '本次生成被上游拒绝，未扣点', retryable: true } : undefined,
  });
}
store.setActiveId('v4:0');

const sessions = {
  list: {
    getSnapshot: () => ({ current: 's1' }),
    subscribe: () => () => {},
  },
};

const t = undefined;
createRoot(document.getElementById('root')).render(React.createElement(MediaViewerTab, { sessions, t }));
