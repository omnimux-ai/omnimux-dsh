import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Box, Pencil } from 'lucide-react';
import CanvasNodeShell from '../../editor/components/CanvasNodeShell';
import NodeHeader from '../../editor/components/MaterialNode/NodeHeader';
import { useCanvasStore } from '../../store/canvasStore';
import type { NodeDefinition } from '../registry';

export const DIRECTOR_OPEN_EVENT = 'omnimux-workflow:director-open';
function DirectorNode({ id, data, selected }: NodeProps) {
  const title = typeof data.title === 'string' ? data.title : '3D 导演台';
  const description = typeof data.description === 'string' ? data.description : '';
  const cover = typeof data.coverUrl === 'string' && data.coverUrl.startsWith('/omnimux-workflow/') ? data.coverUrl : undefined;
  const update = useCanvasStore(state => state.setNodes);
  const open = () => window.dispatchEvent(new CustomEvent(DIRECTOR_OPEN_EVENT, { detail: { nodeId: id } }));
  return <CanvasNodeShell id={id} selected={selected} nodeWidth={350} dataNodeType="director" showLeftHandle showRightHandle={false}
    onCardDoubleClick={open}
    renderHeader={<NodeHeader label={title} materialType="director" customIcon={Box} onLabelChange={label => update(nodes => nodes.map(node => node.id === id ? { ...node, data: { ...node.data, title: label, label } } : node))} />}>
    <div className="wf-director-card">
      {cover ? <img className="wf-director-card__cover" src={cover} alt={`${title}场景封面`} /> : <div className="wf-director-card__empty"><Box size={32} aria-hidden /><span>搭建镜头与人物动作</span></div>}
      <button type="button" className="wf-modal-btn-primary nodrag nopan" onClick={open}><Pencil size={14} aria-hidden />打开导演台</button>
      <textarea className="wf-director-card__description nodrag nopan" aria-label="场景描述" placeholder="描述场景与镜头意图" value={description}
        onKeyDown={event => event.stopPropagation()} onChange={event => update(nodes => nodes.map(node => node.id === id ? { ...node, data: { ...node.data, description: event.target.value, directorDescriptionEdit: crypto.randomUUID(), directorDescriptionSourceRevision: node.data.directorRevision, directorDescriptionSceneId: node.data.directorSceneId, directorDescriptionShotId: node.data.directorActiveShotId } } : node))} />
    </div>
  </CanvasNodeShell>;
}
export const directorNodeDefinition: NodeDefinition = {
  type: 'director', component: memo(DirectorNode),
  ports: [{ side: 'in', acceptedTypes: ['text', 'image'] }],
  defaultData: () => ({ title: '3D 导演台', label: '3D 导演台', description: '', directorRevision: 0, status: 'idle' }),
  palette: { group: '创作', label: '3D 导演台', icon: 'box' }, executorKey: 'director',
};
