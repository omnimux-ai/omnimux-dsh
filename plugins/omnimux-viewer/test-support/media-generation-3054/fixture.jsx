import React from 'react';
import { createRoot } from 'react-dom/client';
import { MediaViewerTab } from '../../src/media-viewer/MediaViewerTab.jsx';
import { getGlobalMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';

const listeners = new Set();
const session = { current: 'media-generation-3054' };
const sessions = { list: { getSnapshot: () => session, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } } };
const store = getGlobalMediaViewerStore();
function Mounted() {
  React.useEffect(() => {
    window.qaBoot.mounted = true;
    const unsubscribe = store.subscribe(() => record('store-update'));
    const beforeUnload = () => record('beforeunload');
    const pageHide = () => record('pagehide');
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', pageHide);
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', pageHide);
    };
  }, []);
  return <MediaViewerTab sessions={sessions} scope={{ sessionId: session.current }} />;
}
const trace = [];
const record = (event) => {
  trace.push({ event, at: Date.now(), state: store.getSnapshot().mediaList.map(({ id, status, taskRef, failure, requestKey }) => ({ id, status, taskRef, failure, requestKey })), stack: new Error().stack });
  sessionStorage.setItem('qa3054-trace', JSON.stringify(trace));
};
const previousTrace = JSON.parse(sessionStorage.getItem('qa3054-trace') || '[]');
window.qa = { getState: () => store.getSnapshot(), getTrace: () => ({ previousTrace, trace }) };
createRoot(document.getElementById('root')).render(<Mounted />);
