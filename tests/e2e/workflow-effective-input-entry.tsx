import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import ConfigPanel from '../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/index';
import { useCanvasStore } from '../../plugins/omnimux-workflow/src/canvas/store/canvasStore';
import { injectCanvasStyles } from '../../plugins/omnimux-workflow/src/canvas/injectStyles';
import { setCachedCatalog } from '../../plugins/omnimux-workflow/src/canvas/editor/hooks/useModelParameterSchema';
import { catalog, fixture } from './workflow-effective-input-fixtures.mjs';

injectCanvasStyles();
// Standalone host seam: body portals cannot inherit the island's scoped tokens.
// Resolve production fallback values, rather than inventing fixture-only colors.
const islandTheme = getComputedStyle(document.getElementById('root')!);
for (const property of Array.from(islandTheme)) {
  if (property.startsWith('--wb-')) document.body.style.setProperty(property, islandTheme.getPropertyValue(property));
}
for (const [hostToken, islandToken] of Object.entries({
  '--dsw-alias-bg-elevated': '--wb-surface-elevated',
  '--dsw-alias-bg-primary': '--wb-surface',
  '--dsw-alias-bg-secondary': '--wb-surface-raised',
  '--dsw-alias-label-primary': '--wb-text-primary',
  '--dsw-alias-label-secondary': '--wb-text-secondary',
  '--dsw-alias-label-tertiary': '--wb-text-muted',
  '--dsw-alias-border-l2': '--wb-border',
  '--dsw-alias-brand-primary': '--wb-accent',
})) document.body.style.setProperty(hostToken, islandTheme.getPropertyValue(islandToken));
document.body.style.fontFamily = islandTheme.getPropertyValue('--wb-font-family');
document.body.style.color = islandTheme.getPropertyValue('--wb-text-primary');
setCachedCatalog(catalog);
useCanvasStore.getState().setCatalogRuntime(catalog);
let targetId = 'target';
const detached = (value: unknown) => JSON.parse(JSON.stringify(value));
function load(name: string) {
  const graph = fixture(name, location.origin);
  targetId = graph.targetId;
  useCanvasStore.getState().hydrateGraph(graph.nodes, graph.edges);
  return snapshot();
}
function snapshot() {
  const { nodes, edges } = useCanvasStore.getState();
  return detached({ nodes, edges, targetId });
}
load(new URLSearchParams(location.search).get('scene') || 'text');
function Panel() {
  const nodes = useCanvasStore(s => s.nodes);
  const edges = useCanvasStore(s => s.edges);
  const flow = useReactFlow();
  const [capture, setCapture] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => { flow.setNodes(nodes); flow.setEdges(edges); }, [nodes, edges, flow]);
  const generate = async () => {
    const graph = snapshot();
    const bridge = (window as any).__panel;
    bridge.captureStarted = (bridge.captureStarted || 0) + 1;
    bridge.capturePending = (bridge.capturePending || 0) + 1;
    setBusy(true);
    try {
      const result = await fetch('/capture', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(graph)}).then(r=>r.json());
      setCapture(result); (window as any).__panel.lastCapture = result;
      return result;
    } finally { bridge.capturePending -= 1; setBusy(false); }
  };
  Object.assign((window as any).__panel, { capture: generate });
  const target = nodes.find(n=>n.id===targetId);
  return <main style={{padding:32,maxWidth:1000,margin:'auto'}}>
    <h1>上游输入离线验证</h1>
    <p>真实生产面板；仅截获请求，不调用模型。</p>
    <nav style={{display:'flex',gap:10,marginBottom:24}}>{['empty','text','image','video','audio','music','ordered','mixed','frames'].map(name=><button key={name} onClick={()=>{load(name);setCapture(null);}}>{name}</button>)}</nav>
    <section aria-label="生产生成配置" style={{position:'relative',width:800,minHeight:260}}>
      {target && <ConfigPanel nodeId={target.id} nodeData={target.data as any} catalog={catalog as any} execBusy={busy}
        onUpdateNodeData={updates=>useCanvasStore.getState().setNodes(list=>list.map(n=>n.id===target.id?{...n,data:{...n.data,...updates}}:n))}
        onGenerate={generate} />}
    </section>
    <details><summary>实际提交捕获</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(capture,null,2)}</pre></details>
  </main>;
}
(window as any).__panel = {
  load, snapshot, catalog,
  hydrate(graph: any) { targetId=graph.targetId || 'target'; useCanvasStore.getState().hydrateGraph(graph.nodes,graph.edges); },
  patch(id: string, updates: any) { useCanvasStore.getState().setNodes(nodes=>nodes.map(n=>n.id===id?{...n,data:{...n.data,...updates}}:n)); },
  setEdges(edges: any[]) { useCanvasStore.getState().setEdges(edges); },
  mutate(mutation: any) { return useCanvasStore.getState().applyCanvasInputMutation(mutation); },
};
createRoot(document.getElementById('root')!).render(<ReactFlowProvider defaultNodes={useCanvasStore.getState().nodes} defaultEdges={useCanvasStore.getState().edges}><Panel /></ReactFlowProvider>);
