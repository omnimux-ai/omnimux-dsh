import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Box } from 'lucide-react';
import CanvasNodeShell from '../../editor/components/CanvasNodeShell';
import NodeHeader from '../../editor/components/MaterialNode/NodeHeader';
import { useCanvasStore } from '../../store/canvasStore';
import type { NodeDefinition } from '../registry';

/** 画布导演节点只做入口：双击卡片或点按钮打开导演台，节点本身不承载截图。 */
export const DIRECTOR_OPEN_EVENT = 'omnimux-workflow:director-open';

function DirectorNode({ id, data, selected }: NodeProps) {
  const title = typeof data.title === 'string' ? data.title : '3D 导演台';
  const update = useCanvasStore(state => state.setNodes);
  const open = () => window.dispatchEvent(new CustomEvent(DIRECTOR_OPEN_EVENT, { detail: { nodeId: id } }));
  return (
    <CanvasNodeShell
      id={id}
      selected={selected}
      nodeWidth={350}
      dataNodeType="director"
      showLeftHandle
      showRightHandle
      rightHandleVariant="plain"
      onCardDoubleClick={open}
      renderHeader={
        <NodeHeader
          label={title}
          materialType="director"
          customIcon={Box}
          onLabelChange={label => update(nodes => nodes.map(node => node.id === id ? { ...node, data: { ...node.data, title: label, label } } : node))}
        />
      }
    >
      <div className="wf-director-card">
        <span className="wf-director-card__icon" aria-hidden>
          <Box size={40} strokeWidth={1.5} />
        </span>
        <p className="wf-director-card__title">3D 导演台</p>
        <p className="wf-director-card__caption">在 3D 空间中搭建场景并进行多视角截图。</p>
        <button type="button" className="wf-director-card__cta nodrag nopan" onClick={open}>打开导演台</button>
      </div>
    </CanvasNodeShell>
  );
}

export const directorNodeDefinition: NodeDefinition = {
  type: 'director',
  component: memo(DirectorNode),
  ports: [
    { side: 'in', acceptedTypes: ['text', 'image'] },
    { side: 'out', acceptedTypes: ['image'] },
  ],
  defaultData: () => ({ title: '3D 导演台', label: '3D 导演台', directorRevision: 0, status: 'idle' }),
  palette: { group: '创作', label: '3D 导演台', icon: 'box' },
  executorKey: 'director',
};
