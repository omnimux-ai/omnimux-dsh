import React, { useState } from 'react'
import { Button } from './Button.jsx'
import { MEDIA } from '../fixtures.js'
import { useStudioApi } from '../use-studio-store.js'

export function SampleMedia({ result, onPreview }) {
  const [state, setState] = useState('idle')
  const [metadata, setMetadata] = useState('样例实际规格：待加载')
  const fixture = MEDIA[result.fixtureId]
  if (result.kind === 'text') return <p>Mock 样例分析：{result.actualMetadata.text}</p>
  if (!fixture) return <p role="alert">样例媒体不可用</p>
  return <div className="studio-media">
    <span>Mock 样例 · 非请求生成产物</span>
    {result.kind === 'image' ? <img src={fixture.url} alt="Mock 静物样例" loading="lazy" onError={() => setState('error')} onLoad={event => { setState('ready'); setMetadata(`样例实际尺寸：${event.currentTarget.naturalWidth}×${event.currentTarget.naturalHeight}`) }} /> : <video src={fixture.url} controls playsInline preload="metadata" onError={() => setState('error')} onLoadedData={event => { setState('ready'); setMetadata(`样例实际规格：${event.currentTarget.videoWidth}×${event.currentTarget.videoHeight} · ${event.currentTarget.duration.toFixed(1)}s`) }} />}
    <p>{state === 'error' ? '样例媒体不可用' : metadata}</p>
    <div className="studio-toolbar"><Button disabled={state !== 'ready'} onClick={() => onPreview(result)}>查看样例</Button>
      {state === 'ready' ? <a href={fixture.url} download={`mock-sample-${result.id}`} target="_blank" rel="noreferrer">下载样例（Mock）</a> : <Button disabled>下载样例（未就绪）</Button>}
    </div>
  </div>
}
export function GenerationStatusCard({ task, onPreview, onConfirm }) {
  const store = useStudioApi()
  const { request } = task
  const spec = request.draft.spec
  const status = { pending: '模拟处理中', completed: '模拟完成', failed: '模拟失败', cancelled: '已取消' }[task.status]
  return <article className="studio-task" data-status={task.status}>
    <p>Mock · {status} · {request.modelLabel ?? '样例分析'} · {request.totalCost} 演示点</p>
    <p>请求规格：{spec ? `${spec.resolution} · ${spec.aspect} · ${spec.durationMode === 'fixed' ? spec.durationSeconds + 's' : spec.durationMode} · ${spec.batchCount}份` : '分析，无模型/规格'}</p>
    <p>{request.prompt}</p>
    {request.draft.references.length > 0 && <p>引用槽：{request.draft.references.map(ref => `${ref.slot}: ${ref.name}`).join('；')}</p>}
    {task.error && <p role="alert">模拟失败，演示点数已返还</p>}
    {task.results.map(result => <SampleMedia key={result.id} result={result} onPreview={onPreview} />)}
    <div className="studio-toolbar">
      {task.status === 'pending' && <Button onClick={() => store.cancelTask(task.id)}>取消模拟</Button>}
      <Button onClick={() => onConfirm('用此任务完整参数覆盖当前草稿？不会提交或扣点。', () => store.restoreDraft(task.id))}>回填完整草稿</Button>
      <Button onClick={() => onConfirm('删除此记录？待处理模拟会先取消并返还演示点数。', () => store.deleteTask(task.id))}>删除记录</Button>
      {['超分', '去水印', '重绘', '裁剪', '收藏入库'].map(label => <Button key={label} disabled title="演示未实现">{label}（演示未实现）</Button>)}
    </div>
  </article>
}
