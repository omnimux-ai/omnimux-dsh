/**
 * ComfyUI 页面节点（Issue #3681 M1）。
 *
 * 只做入口：卡片显示目标地址与连通状态，双击或点按钮把「打开」事件抛给
 * ComfyPageOverlay（与导演台同款 CustomEvent 约定），节点本身不承载 iframe。
 * 真正的全屏层由 `editor/components/ComfyPageOverlay.tsx` 渲染。
 */

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Globe, MonitorPlay } from 'lucide-react';
import CanvasNodeShell from '../../editor/components/CanvasNodeShell';
import NodeHeader from '../../editor/components/MaterialNode/NodeHeader';
import { useT } from '../../i18n';
import type { NodeDefinition } from '../registry';
import { comfyPageUrlFromData } from '../../editor/utils/comfyPageUrl';

/** 打开全屏层的事件名（detail: { nodeId }）。 */
export const COMFY_PAGE_OPEN_EVENT = 'omnimux-workflow:comfy-page-open';

/** 节点卡上显示的三态 + 不可达态；由全屏层的探测结果写回节点数据。 */
export type ComfyPageStatus = 'idle' | 'probing' | 'connected' | 'unreachable';

function statusKey(status: unknown): string {
  if (status === 'probing' || status === 'connected' || status === 'unreachable') {
    return status;
  }
  return 'idle';
}

function ComfyPageNode({ id, data, selected }: NodeProps) {
  const t = useT();
  const url = comfyPageUrlFromData(data as Record<string, unknown>);
  const status = statusKey((data as Record<string, unknown>).status);
  const open = () => {
    window.dispatchEvent(new CustomEvent(COMFY_PAGE_OPEN_EVENT, { detail: { nodeId: id } }));
  };
  return (
    <CanvasNodeShell
      id={id}
      selected={selected}
      nodeWidth={350}
      dataNodeType="comfy-page"
      showLeftHandle={false}
      showRightHandle={false}
      onCardDoubleClick={open}
      renderHeader={<NodeHeader label={t('comfyPage.card.title')} materialType="comfy-page" customIcon={Globe} />}
    >
      <div className="wf-comfy-page-card">
        <span className="wf-comfy-page-card__icon" aria-hidden>
          <MonitorPlay size={36} strokeWidth={1.5} />
        </span>
        <p className="wf-comfy-page-card__url" title={url}>
          {url}
        </p>
        <p className="wf-comfy-page-card__status" data-status={status}>
          {t(`comfyPage.status.${status}`)}
        </p>
        <button type="button" className="wf-comfy-page-card__cta nodrag nopan" onClick={open}>
          {t('comfyPage.card.open')}
        </button>
      </div>
    </CanvasNodeShell>
  );
}

export const comfyPageNodeDefinition: NodeDefinition = {
  type: 'comfy-page',
  component: memo(ComfyPageNode),
  // 页面节点不参与物料连线：它承载的是一个外部页面，不是素材。
  ports: [],
  defaultData: () => ({ status: 'idle' }),
  palette: {
    group: 'palette.group.creation',
    label: 'palette.node.comfyPage',
    icon: 'globe',
    keywords: ['palette.keyword.comfyPage'],
  },
};
