/**
 * ComfyUI 工作流节点（Issue #3681 M1；托管状态机 #3701 M2c；卡片内嵌真页面 #3751）。
 *
 * 卡片自己就是宿主：内容区渲染 `ComfyPagePanel`（托管状态机 + 真页面），不需要先点
 * 「打开」再进另一个覆盖层。
 *
 * 三条关键约束（Issue #3751）：
 *  - **单宿主**：整屏只是给同一张卡片加整屏几何（在画布坐标里反向抵消视口平移与缩放），
 *    不移动 DOM、不重建 iframe —— 用户已打开的工作流必须留着。
 *  - **iframe 挂载策略**：只在节点可见或选中、且屏幕上足够大时挂载；同屏挂载数有上限
 *    （名额见 `store/comfyFrameSlots`）；整屏切换不改变挂载状态。
 *  - **只有这个节点类型可缩放**：`NodeResizer` 写回节点宽高，随画布一起持久化。
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { NodeResizer, useViewport } from '@xyflow/react';
import { Globe, Maximize2, MessageSquarePlus } from 'lucide-react';
import CanvasNodeShell from '../../editor/components/CanvasNodeShell';
import { ComfyPagePanel } from '../../editor/components/ComfyPagePanel';
import FloatingTopPill, { type FloatingPillAction } from '../../editor/components/FloatingTopPill';
import NodeHeader from '../../editor/components/MaterialNode/NodeHeader';
import { useT } from '../../i18n';
import { useCanvasStore } from '../../store/canvasStore';
import { useComfyFrameSlots } from '../../store/comfyFrameSlots';
import { useAddToConversation } from '../../hooks/useAddToConversation';
import { buildConversationPayloadFromNode } from '../../editor/utils/nodeToolbarLogic';
import {
  COMFY_CARD_DEFAULT_HEIGHT,
  COMFY_CARD_DEFAULT_WIDTH,
  COMFY_CARD_MIN_HEIGHT,
  COMFY_CARD_MIN_WIDTH,
  clampComfyCardSize,
  comfyFullscreenGeometry,
  comfyWorkflowNameFromData,
  isComfyCardVisible,
  resolveComfyCardSize,
  shouldMountComfyFrame,
  wantsComfyFrame,
} from '../../editor/utils/comfyPageCard';
import { DEFAULT_COMFY_PAGE_URL, comfyPageUrlFromData } from '../../editor/utils/comfyPageUrl';
import type { NodeDefinition } from '../registry';

/** 打开画布既有「使用模板」面板的事件名（面板由工具栏持有，不在这里再挂一份）。 */
export const COMFY_PAGE_TEMPLATE_EVENT = 'omnimux-workflow:comfy-page-use-template';

/** 整屏时抬到画布与画布浮层之上（不透明底由 CSS 负责）。 */
// 整屏时给节点的层级。注意实测值会比这个数字大：React Flow 的 elevateNodesOnSelect
// （默认开）会给**选中**节点再叠 1000，所以选中态下量到的是 2000；未选中量到 1000。
const COMFY_CARD_FULLSCREEN_Z = 1000;

/** 节点卡上显示的三态 + 不可达态；由面板的探测结果写回节点数据。 */
export type ComfyPageStatus = 'idle' | 'probing' | 'connected' | 'unreachable';

function statusKey(status: unknown): string {
  if (status === 'probing' || status === 'connected' || status === 'unreachable') {
    return status;
  }
  return 'idle';
}

/** 视口尺寸（整屏几何按屏幕像素算）；窗口尺寸变化时重算。 */
function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function ComfyPageNode({
  id,
  data,
  selected,
  width,
  height,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps) {
  const t = useT();
  const viewport = useViewport();
  const viewportSize = useViewportSize();
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { addToConversation } = useAddToConversation();
  const claimSlot = useComfyFrameSlots((state) => state.claim);
  const releaseSlot = useComfyFrameSlots((state) => state.release);
  const setFullscreenNode = useComfyFrameSlots((state) => state.setFullscreenNode);
  const hasSlot = useComfyFrameSlots((state) => state.slots.includes(id));

  const nodeData = data as Record<string, unknown>;
  const url = comfyPageUrlFromData(nodeData);
  const status = statusKey(nodeData.status);
  const size = resolveComfyCardSize(width, height);
  const workflowName = comfyWorkflowNameFromData(nodeData);
  const title = workflowName.length > 0 ? workflowName : t('comfyPage.card.unnamedWorkflow');

  const nodeX = typeof positionAbsoluteX === 'number' ? positionAbsoluteX : 0;
  const nodeY = typeof positionAbsoluteY === 'number' ? positionAbsoluteY : 0;
  const viewportRect = {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
    width: viewportSize.width,
    height: viewportSize.height,
  };

  const visible = isComfyCardVisible({
    nodeX,
    nodeY,
    width: size.width,
    height: size.height,
    viewport: viewportRect,
  });

  // 「想挂」不看名额（否则会和名额申请互相等待）：先判断意愿，再申请名额。
  const wantsFrame = wantsComfyFrame({
    ready,
    selected: Boolean(selected),
    visible,
    width: size.width,
    height: size.height,
    zoom: viewport.zoom,
    hasSlot,
    fullscreen,
  });

  // 名额：想挂就申请，不再需要或卸载就释放；满员时先占位（同屏不无限挂载）。
  useEffect(() => {
    if (!wantsFrame) return undefined;
    claimSlot(id);
    return () => releaseSlot(id);
  }, [wantsFrame, id, claimSlot, releaseSlot]);

  const frameMounted = shouldMountComfyFrame({
    ready,
    selected: Boolean(selected),
    visible,
    width: size.width,
    height: size.height,
    zoom: viewport.zoom,
    hasSlot,
    fullscreen,
  });

  // 整屏几何：画布坐标里反向抵消平移与缩放（DOM 不移动，iframe 不重建）。
  const geometry = useMemo(
    () => comfyFullscreenGeometry({ nodeX, nodeY, viewport: viewportRect }),
    [nodeX, nodeY, viewportRect.x, viewportRect.y, viewportRect.zoom, viewportRect.width, viewportRect.height],
  );

  // 整屏时抬层级：React Flow 容器自带 z-index 形成层叠上下文，所以除了给节点抬
  // z-index，还要让画布根节点知道「现在有整屏卡片」（`.react-flow` 被抬到页头之上）。
  useEffect(() => {
    if (!fullscreen) return undefined;
    const store = useCanvasStore.getState();
    const node = store.nodes.find((item) => item.id === id);
    const previous = node ? node.zIndex : undefined;
    store.setNodes((nodes) =>
      nodes.map((item) => (item.id === id ? { ...item, zIndex: COMFY_CARD_FULLSCREEN_Z } : item)),
    );
    setFullscreenNode(id);
    return () => {
      useCanvasStore.getState().setNodes((nodes) =>
        nodes.map((item) => (item.id === id ? { ...item, zIndex: previous } : item)),
      );
      setFullscreenNode(null);
    };
  }, [fullscreen, id, setFullscreenNode]);

  const exitFullscreen = useCallback(() => setFullscreen(false), []);

  const handleAddToConversation = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const payload = buildConversationPayloadFromNode({
        nodeType: 'comfy-page',
        nodeId: id,
        label: workflowName,
      });
      if (payload) addToConversation(payload);
    },
    [addToConversation, id, workflowName],
  );

  const pillActions: FloatingPillAction[] = useMemo(
    () => [
      {
        key: 'fullscreen',
        label: fullscreen ? t('comfyPage.card.exitFullscreen') : t('pill.fullscreen'),
        icon: Maximize2,
        section: 'primary',
        title: fullscreen ? t('comfyPage.card.exitFullscreen') : t('pill.fullscreen'),
        onClick: (event) => {
          event.stopPropagation();
          setFullscreen((value) => !value);
        },
      },
      {
        key: 'add-to-conversation',
        icon: MessageSquarePlus,
        section: 'secondary',
        title: t('pill.addToConversation'),
        onClick: handleAddToConversation,
      },
    ],
    [fullscreen, handleAddToConversation, t],
  );

  const useTemplate = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent(COMFY_PAGE_TEMPLATE_EVENT, { detail: { nodeId: id } }));
    },
    [id],
  );

  const fullscreenStyle = fullscreen
    ? {
        position: 'absolute' as const,
        left: geometry.offsetX,
        top: geometry.offsetY,
        width: geometry.width,
        height: geometry.height,
        zIndex: COMFY_CARD_FULLSCREEN_Z,
        ['--wf-comfy-inverse' as string]: String(geometry.inverseScale),
      }
    : undefined;

  return (
    <CanvasNodeShell
      id={id}
      selected={selected}
      className={`wf-comfy-page-node ${fullscreen ? 'wf-comfy-page-node--fullscreen' : ''}`.trim()}
      cardClassName="wf-comfy-page-node__card"
      style={fullscreenStyle}
      cardStyle={
        fullscreen
          ? {
              // 卡片布局尺寸 = 100%/inverse（= 100% × zoom），再乘自身缩放正好铺满屏幕。
              // 必须走内联：`CanvasNodeShell` 也会给卡片写内联宽度，CSS 规则压不住它。
              width: 'calc(100% / var(--wf-comfy-inverse, 1))',
              height: 'calc(100% / var(--wf-comfy-inverse, 1))',
            }
          : { width: size.width, height: size.height }
      }
      dataNodeType="comfy-page"
      nodeWidth={fullscreen ? geometry.width : size.width}
      nodeHeight={fullscreen ? geometry.height : size.height}
      showLeftHandle={false}
      showRightHandle={false}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      renderFloatingPill={<FloatingTopPill actions={pillActions} visible={Boolean(selected) || hovered} />}
      renderHeader={
        <NodeHeader label={t('comfyPage.card.title')} materialType="comfy-page" customIcon={Globe} />
      }
    >
      {/* 只有这个节点类型可缩放：尺寸写回节点宽高，随画布一起持久化。 */}
      <NodeResizer
        isVisible={Boolean(selected) && !fullscreen}
        minWidth={COMFY_CARD_MIN_WIDTH}
        minHeight={COMFY_CARD_MIN_HEIGHT}
        onResizeEnd={(_event, params) => {
          const next = clampComfyCardSize(params.width, params.height);
          useCanvasStore.getState().setNodes((nodes) =>
            nodes.map((item) =>
              item.id === id ? { ...item, width: next.width, height: next.height } : item,
            ),
          );
        }}
      />

      <div className="wf-comfy-page-node__body">
        <ComfyPagePanel
          nodeId={id}
          url={url}
          fullscreen={fullscreen}
          onExitFullscreen={exitFullscreen}
          frameMounted={frameMounted}
          onReadyChange={setReady}
        />
      </div>

      <footer className="wf-comfy-page-node__footer">
        <span className="wf-comfy-page-node__name" title={title}>
          {title}
        </span>
        <button type="button" className="wf-comfy-page-node__template nodrag nopan" onClick={useTemplate}>
          {t('comfyPage.card.useTemplate')}
        </button>
      </footer>
    </CanvasNodeShell>
  );
}

export const comfyPageNodeDefinition: NodeDefinition = {
  type: 'comfy-page',
  component: memo(ComfyPageNode),
  // 页面节点不参与物料连线：它承载的是一个外部页面，不是素材。
  ports: [],
  defaultData: () => ({
    status: 'idle' satisfies ComfyPageStatus,
    width: COMFY_CARD_DEFAULT_WIDTH,
    height: COMFY_CARD_DEFAULT_HEIGHT,
    url: DEFAULT_COMFY_PAGE_URL,
  }),
  palette: {
    group: 'palette.group.creation',
    label: 'palette.node.comfyPage',
    icon: 'globe',
    keywords: ['palette.keyword.comfyPage'],
  },
};
