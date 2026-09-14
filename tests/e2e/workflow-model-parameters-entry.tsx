// #1785 non-formal Verify host. All parameter controls are production components.
import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import ConfigPanel from '../../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/index';
import { useCanvasStore } from '../../plugins/omnimux-workflow/src/canvas/store/canvasStore';
import { injectCanvasStyles } from '../../plugins/omnimux-workflow/src/canvas/injectStyles';
import { setCachedCatalog } from '../../plugins/omnimux-workflow/src/canvas/editor/hooks/useModelParameterSchema';
import { fixture } from './workflow-model-parameters-fixtures.mjs';
const catalog = (window as any).__catalog;
injectCanvasStyles();
const theme = getComputedStyle(document.getElementById('root')!);
for (const property of Array.from(theme)) if (property.startsWith('--wb-')) document.body.style.setProperty(property, theme.getPropertyValue(property));
for (const [host, island] of Object.entries({'--dsw-alias-bg-elevated':'--wb-surface-elevated','--dsw-alias-bg-primary':'--wb-surface','--dsw-alias-bg-secondary':'--wb-surface-raised','--dsw-alias-label-primary':'--wb-text-primary','--dsw-alias-label-secondary':'--wb-text-secondary','--dsw-alias-label-tertiary':'--wb-text-muted','--dsw-alias-border-l2':'--wb-border','--dsw-alias-brand-primary':'--wb-accent'})) document.body.style.setProperty(host,theme.getPropertyValue(island));
setCachedCatalog(catalog); useCanvasStore.getState().setCatalogRuntime(catalog);
const clone = (value: any) => JSON.parse(JSON.stringify(value));
let targetId = 'target'; const updates: any[] = [];
const snapshot = () => clone({nodes:useCanvasStore.getState().nodes,edges:useCanvasStore.getState().edges,targetId});
useCanvasStore.getState().hydrateGraph(fixture(new URLSearchParams(location.search).get('fixture')||'clean',location.origin).nodes,fixture(new URLSearchParams(location.search).get('fixture')||'clean',location.origin).edges);
const bridge: any = {snapshot,catalog,updates}; (window as any).__parameters = bridge;
function Panel() {
  const nodes=useCanvasStore(s=>s.nodes), edges=useCanvasStore(s=>s.edges), flow=useReactFlow();
  const [active,setActive]=useState('target'),[mounted,setMounted]=useState(true),[busy,setBusy]=useState(false);
  useLayoutEffect(()=>{flow.setNodes(nodes);flow.setEdges(edges);},[nodes,edges,flow]);
  const hydrate=(graph:any)=>{targetId=graph.targetId||'target';setActive(targetId);useCanvasStore.getState().hydrateGraph(graph.nodes,graph.edges);};
  Object.assign(bridge,{load:(name:string)=>hydrate(fixture(name,location.origin)),selectTarget:(id:string)=>{targetId=id;setActive(id);},mount:setMounted,
    save:async()=>fetch('/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(snapshot())}).then(r=>r.json()),
    reopen:async()=>hydrate(await fetch('/saved').then(r=>r.json())),
    undo:()=>useCanvasStore.getState().undo(),redo:()=>useCanvasStore.getState().redo(),checkpoint:()=>useCanvasStore.getState().pushHistory(true)});
  const generate=async()=>{bridge.started=(bridge.started||0)+1;setBusy(true);try{bridge.lastCapture=await fetch('/capture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(snapshot())}).then(r=>r.json());}finally{setBusy(false);}};
  const target=nodes.find(n=>n.id===active);
  return <main style={{padding:32,paddingTop:430,maxWidth:1000,margin:'auto'}}><h1>模型参数隔离 · 离线验证</h1><p>真实生产面板；不调用模型。</p><section aria-label="生产生成配置" style={{position:'relative',width:800,minHeight:260}}>{mounted&&target&&<ConfigPanel nodeId={target.id} nodeData={target.data as any} catalog={catalog} execBusy={busy} onGenerate={generate} onUpdateNodeData={patch=>{updates.push(clone({nodeId:target.id,before:target.data,patch}));useCanvasStore.getState().setNodes(list=>list.map(n=>n.id===target.id?{...n,data:{...n.data,...patch}}:n));}}/>}</section></main>;
}
createRoot(document.getElementById('root')!).render(<ReactFlowProvider defaultNodes={useCanvasStore.getState().nodes} defaultEdges={useCanvasStore.getState().edges}><Panel/></ReactFlowProvider>);
