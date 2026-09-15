import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { ToolcraftButton } from '@openreel/ui';
import { ScriptViewDialog } from '@/components/editor/ScriptViewDialog';
import { GraphEditorPanel } from '@/motion/components/GraphEditorPanel';
import { useProjectStore } from '@/stores/project-store';
import { useMotionStore } from '@/motion/stores/motion-store';
import { getMotionTransformAtTime, MotionRenderer } from '@openreel/core/motion/motion-renderer';
import { getMotionLayerPropertyValueAtTime } from '@openreel/core/motion/motion-keyframes';
import type { MotionComposition } from '@openreel/core/motion/types';

declare global { interface Window { __clipSecurityMarker: number; __clipFixtureReadState: () => unknown; } }
window.__clipSecurityMarker = 0;
const renderer = new MotionRenderer();
type FrameState = { renderedRequest?: number; status: string; x: number | null; y: number | null; propertyValue: number | null; marker: number; error: string | null; };

function Fixture() {
  const project = useProjectStore(state => state.project);
  const composition = project.motionCompositions?.[0];
  const playhead = useMotionStore(state => state.playhead);
  const [isOpen, setOpen] = useState(false);
  const [frame, setFrame] = useState<FrameState>({ status: 'waiting-import', x: null, y: null, propertyValue: null, marker: 0, error: null });
  const [requestId, setRequestId] = useState(0);
  const [cloneForExport, setCloneForExport] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layer = composition?.layers[0];
  useEffect(() => {
    if (!composition || !layer) return;
    const state = useMotionStore.getState();
    if (state.activeCompositionId !== composition.id || state.selectedLayerId !== layer.id) {
      state.setActiveCompositionId(composition.id);
      state.selectLayer(layer.id);
      state.setSelectedProperty('transform.position.x');
    }
  }, [composition?.id, layer?.id]);
  useEffect(() => {
    if (!composition || !layer) return;
    let canceled = false;
    const render = async () => {
      try {
        const renderedComposition = cloneForExport ? structuredClone(composition) : composition;
        const renderedLayer = renderedComposition.layers[0];
        const context = { composition: renderedComposition, layer: renderedLayer };
        const transform = getMotionTransformAtTime(renderedLayer.transform, renderedLayer.keyframes, playhead, renderedLayer.expressions, renderedLayer.duration, false, context);
        const value = getMotionLayerPropertyValueAtTime(renderedLayer, 'transform.position.x', playhead, renderedComposition);
        const bitmap = await renderer.renderComposition(renderedComposition, playhead, { compositionLibrary: project.motionCompositions, supersample: 1 });
        if (!canceled) {
          const canvas = canvasRef.current!;
          canvas.width = composition.width;
          canvas.height = composition.height;
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          setFrame({ renderedRequest: requestId, status: 'rendered', x: transform.position.x, y: transform.position.y, propertyValue: value, marker: window.__clipSecurityMarker, error: null });
        }
        bitmap.close();
      } catch (error) {
        if (!canceled) setFrame({ status: 'error', x: null, y: null, propertyValue: null, marker: window.__clipSecurityMarker, error: String(error) });
      }
    };
    void render();
    return () => { canceled = true; };
  }, [composition, layer, playhead, requestId, cloneForExport]);
  window.__clipFixtureReadState = () => ({ project: useProjectStore.getState().project, selectedLayerId: useMotionStore.getState().selectedLayerId, frame, marker: window.__clipSecurityMarker });
  return <main style={{ color: 'var(--fg)', background: 'var(--bg)', minHeight: '100vh', padding: 24 }}>
    <header style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>剪辑：原生导入与表达式验证</h1>
      <ToolcraftButton label="Project JSON" onClick={() => setOpen(true)} />
      <ToolcraftButton label="Render frame" onClick={() => setRequestId(n => n + 1)} />
      <ToolcraftButton label="Time 0.25" onClick={() => useMotionStore.getState().setPlayhead(0.25)} />
      <ToolcraftButton label="Time 0.5" onClick={() => useMotionStore.getState().setPlayhead(0.5)} />
      <ToolcraftButton label="Edit other composition" onClick={() => composition && useProjectStore.getState().upsertMotionComposition({ ...structuredClone(composition), id: 'other-composition', name: 'Other' })} />
      <ToolcraftButton label="Undo edit" onClick={() => useProjectStore.getState().undo()} />
      <ToolcraftButton label="Render export snapshot" onClick={() => { setCloneForExport(true); setRequestId(n => n + 1); }} />
    </header>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(450px,1fr) 460px', gap: 24, alignItems: 'start' }}>
      <section style={{ display: 'grid', gap: 18 }}>
        <p>本页只挂载原生项目导入窗口、曲线编辑和渲染结果。请先导入任务样本。</p>
        <canvas ref={canvasRef} aria-label="Native motion render" width={640} height={360} style={{ width: '100%', aspectRatio: '16 / 9', border: '1px solid var(--border)', background: 'var(--bg-2)' }} />
        <dl id="native-results" style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, fontSize: 14 }}>
          <dt>项目</dt><dd data-testid="project-name">{project.name}</dd>
          <dt>原生渲染状态</dt><dd data-testid="render-status">{frame.status}</dd>
          <dt>当前时间</dt><dd data-testid="playhead">{playhead}</dd>
          <dt>原生位置计算</dt><dd data-testid="native-position-x">{frame.x ?? '—'}</dd>
          <dt>原生属性计算</dt><dd data-testid="native-property-value">{frame.propertyValue ?? '—'}</dd>
          <dt>代码执行计数</dt><dd data-testid="code-marker">{frame.marker}</dd>
          <dt>渲染错误</dt><dd data-testid="render-error">{frame.error ?? '无'}</dd>
        </dl>
      </section>
      <section aria-label="Native graph editor" style={{ height: 'calc(100vh - 120px)', minHeight: 680, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8 }}>
        {composition ? <GraphEditorPanel composition={composition as MotionComposition} /> : <p style={{ padding: 24 }}>等待从原生窗口导入项目。</p>}
      </section>
    </div>
    <ScriptViewDialog isOpen={isOpen} onClose={() => setOpen(false)} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
