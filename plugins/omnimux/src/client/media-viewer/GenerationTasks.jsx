import React, { useEffect, useState } from 'react';

import { InPlaceTaskSlot } from './InPlaceTaskSlot.jsx';

const EMPTY_MEDIA = Object.freeze({});

const MAX_VIDEO_BYTES = 32 * 1024 * 1024;

/** Decode the complete, bounded public workspaceFiles.readAll response. */
function videoBytes(value) {
  const data = value?.data;
  if (value?.offset !== 0 || value?.eof !== true || typeof data !== 'string' || !data.length
    || data.length > Math.ceil(MAX_VIDEO_BYTES / 3) * 4
    || (value.bytes !== undefined && (!Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_VIDEO_BYTES))) {
    throw new Error('Invalid or oversized video response');
  }
  if (data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data)
    || data.indexOf('=') !== -1 && !/^[^=]*={1,2}$/.test(data)) throw new Error('Invalid video encoding');
  const decoded = atob(data);
  if (!decoded.length || decoded.length > MAX_VIDEO_BYTES
    || value.bytes !== undefined && value.bytes !== decoded.length) throw new Error('Invalid video size');
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function GenerationMedia({ item = EMPTY_MEDIA, sessionId, imageUrl, readFile, status, ratio }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let live = true;
    let objectUrl;
    const controller = new AbortController();
    const publish = (value) => { if (live) setPreview({ item, sessionId, ...value }); };
    publish({ url: item.path ? null : item.url, failed: false });
    async function load() {
      if (item.type === 'video' && item.path) {
        if (!readFile) throw new Error('File reader unavailable');
        const result = await readFile(sessionId, item.path, controller.signal);
        if (!live) return;
        if (!result?.ok) throw new Error('Video could not be read');
        const bytes = videoBytes(result.value);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
        publish({ url: objectUrl, failed: false });
      } else if (item.attachment) {
        if (!imageUrl) throw new Error('Image reader unavailable');
        const url = await imageUrl(sessionId, item.attachment);
        if (!url) throw new Error('Image could not be read');
        publish({ url, failed: false });
      } else if (!item.url) throw new Error('Media source unavailable');
    }
    if (item !== EMPTY_MEDIA) load().catch(() => publish({ failed: true }));
    return () => {
      live = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item, sessionId, imageUrl, readFile]);
  const current = preview?.item === item && preview.sessionId === sessionId ? preview : null;
  const url = current?.url || (!item.path && !item.attachment ? item.url : null);
  return <InPlaceTaskSlot status={current?.failed ? 'failure' : status} ratio={ratio} media={url ? { ...item, url } : null} controls />;
}

/** Request identity persists while its media sources resolve. */
export function GenerationTasks({ tasks, imageUrl, readFile }) {
  return (tasks || []).map((task) => (
    <React.Fragment key={JSON.stringify([task.sessionId, task.requestId])}>
      {(task.media?.length ? task.media : [EMPTY_MEDIA]).map((item, index) => (
        <GenerationMedia
          key={index}
          item={item}
          sessionId={task.sessionId}
          status={task.status}
          ratio={task.ratio}
          imageUrl={imageUrl}
          readFile={readFile}
        />
      ))}
    </React.Fragment>
  ));
}

export default GenerationTasks;
