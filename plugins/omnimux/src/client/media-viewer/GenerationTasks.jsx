import React, { useEffect, useState } from 'react';
import { Button } from 'dsh-ui-kit';
import { GeneratingStateCard } from './GeneratingStateCard.jsx';

const labels = {
  pending: '已提交，等待生成工具启动',
  running: '正在处理生成请求',
  unresolved: '请在对话中查看结果',
  failure: '未能生成',
  cancelled: '已取消生成',
  success: '生成完成',
};

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

function GenerationMedia({ item, sessionId, imageUrl, readFile }) {
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
    load().catch(() => publish({ failed: true }));
    return () => {
      live = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item, sessionId, imageUrl, readFile]);
  const current = preview?.item === item && preview.sessionId === sessionId ? preview : null;
  if (current?.failed) return <div role="alert">结果预览未能加载，文件可能不可读取或超过预览大小限制，请在对话中查看</div>;
  if (!current?.url) return <div>正在读取生成结果</div>;
  const fail = () => setPreview({ item, sessionId, failed: true });
  return item.type === 'video' ? <video src={current.url} controls playsInline onError={fail} /> : <img src={current.url} alt="生成结果" onError={fail} />;
}

/** @param {{ tasks: Array<{ requestId: string, status: string, message?: string, media?: Array<{ url: string, type: string }> }> }} props */
export function GenerationTasks({ tasks, imageUrl, readFile }) {
  const [copyStatus, setCopyStatus] = useState('');
  async function copyPrompt(task) {
    try { await navigator.clipboard.writeText(task.prompt); setCopyStatus('已复制，请检查参考素材后粘贴发送'); }
    catch { setCopyStatus('未能复制，请从对话中复制原请求'); }
  }
  return <div className="omx-mv-generation-tasks" aria-live="polite">
    {tasks.map((task) => <section key={JSON.stringify([task.sessionId, task.requestId])} className="omx-mv-generation-task" data-generation-request={task.requestId} data-generation-status={task.status}>
      <div className="omx-mv-generation-task__label" role="status">{task.message || labels[task.status]}</div>
      {task.status === 'pending' || task.status === 'running'
        ? <GeneratingStateCard statusText={task.message || labels[task.status]} status={task.status} />
        : task.media?.map((item) => <GenerationMedia key={item.attachment?.attachmentId || item.url || item.path} item={item} sessionId={task.sessionId} imageUrl={imageUrl} readFile={readFile} />)}
      {task.prompt && ['failure', 'cancelled', 'unresolved'].includes(task.status) && <Button onClick={() => copyPrompt(task)}>复制原请求</Button>}
    </section>)}
    {copyStatus && <div role="status">{copyStatus}</div>}
  </div>;
}
