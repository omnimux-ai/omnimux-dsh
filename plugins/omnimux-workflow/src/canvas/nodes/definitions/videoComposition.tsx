/**
 * video_composition — canvas Launcher Card for omnimux-clip.
 *
 * The node itself is a 350×440 proxy. Opening the editor dispatches
 * `omnimux-clip-open`; save/progress/close events write back into node data.
 * Canvas MUST NOT import omnimux-clip source (spec §2).
 *
 * 表现层（T4 拉齐 MaterialNode 规范）：
 * - 外置 NodeHeader + StatusBadge（mapVideoCompositionToBadge）；
 * - 主卡片三分支：launcher / rendering / error
 *   （成片预览由下游素材节点承载；本节点导出后仍保持 launcher）；
 * 功能契约 100% 不变：OMNIMUX_CLIP_* 事件桥、collectUpstreamInputs、
 * ports、executorKey、350×440 尺寸。
 */

import { memo, useCallback, useEffect } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Download, Film, Layers, Pencil, MessageSquarePlus } from 'lucide-react';
import CanvasNodeShell from '../../editor/components/CanvasNodeShell';
import FloatingTopPill, { type FloatingPillAction } from '../../editor/components/FloatingTopPill';
import { useAddToConversation } from '../../hooks/useAddToConversation';
import {
  buildConversationPayloadFromNode,
  hasNodeMaterial,
  pillMaxWidthForNode,
  shouldShowNodeToolbar,
} from '../../editor/utils/nodeToolbarLogic';
import NodeHeader from '../../editor/components/MaterialNode/NodeHeader';
import StatusBadge from '../../editor/components/MaterialNode/StatusBadge';
import GenerationStateContainer from '../../editor/components/GenerationStateContainer';
import NodeLauncherState from '../../editor/components/NodeEmptyState/NodeLauncherState';
import { planClipExportDownstream } from './videoCompositionDownstream';
import { captionSlicesFromText } from '../../editor/utils/srtParser.ts';
import {
  mapVideoCompositionToBadge,
  mapVideoCompositionToView,
  projectFileName,
} from './videoCompositionStatus';
import { useCanvasStore } from '../../store/canvasStore';
import { toast } from '../../ui';
import { useT } from '../../i18n';
import type { NodeDefinition } from '../registry';
import {
  OMNIMUX_CLIP_CLOSE,
  OMNIMUX_CLIP_OPEN,
  OMNIMUX_CLIP_PROGRESS,
  OMNIMUX_CLIP_SAVE,
  isCloseClipEditorPayload,
  isProgressClipEditorPayload,
  isSaveClipEditorPayload,
  type OpenClipEditorPayload,
  type VideoCompositionNodeData,
  type VideoCompositionStatus,
} from '../../bridge/clipEvents';

export const VIDEO_COMPOSITION_NODE_WIDTH = 350;
export const VIDEO_COMPOSITION_NODE_HEIGHT = 440;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mediaPathOf(data: Record<string, unknown>): string | undefined {
  return (
    asString(data.mediaUrl)
    || asString(data.outputVideoUrl)
    || asString(data.path)
    || asString(data.url)
    || asString(data.real_path)
    || asString(data.filePath)
  );
}

function collectUpstreamInputs(nodeId: string): OpenClipEditorPayload['upstreamInputs'] {
  const { nodes, edges } = useCanvasStore.getState();
  const videos: NonNullable<OpenClipEditorPayload['upstreamInputs']>['videos'] = [];
  const audios: NonNullable<OpenClipEditorPayload['upstreamInputs']>['audios'] = [];
  const images: NonNullable<OpenClipEditorPayload['upstreamInputs']>['images'] = [];
  const captions: NonNullable<OpenClipEditorPayload['upstreamInputs']>['captions'] = [];

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = nodes.find((node) => node.id === edge.source);
    if (!source) continue;
    const data = isRecord(source.data) ? source.data : {};
    const materialType = asString(data.materialType)
      || (source.type === 'material' ? undefined : source.type);
    const name = asString(data.label) || asString(data.title) || source.id;
    const path = mediaPathOf(data) || '';
    const durationMs = asNumber(data.duration) ?? asNumber(data.outputDurationMs) ?? asNumber(data.durationMs);

    if (materialType === 'video' || source.type === 'video_composition') {
      const videoPath = path || asString(data.outputVideoUrl) || '';
      if (videoPath) videos.push({ path: videoPath, name, durationMs, url: videoPath });
    } else if (materialType === 'image') {
      if (path) images.push({ path, name, displayDurationMs: durationMs ?? 3000, url: path });
    } else if (materialType === 'audio') {
      if (path) audios.push({ path, name, durationMs, url: path });
    } else if (materialType === 'text') {
      const text = asString(data.content) || asString(data.generatedContent) || asString(data.prompt);
      if (text) {
        // Issue 744 T05：SRT 字幕文本按原音频时间轴精确展开；
        // 普通文本保持原有整段 3 秒切片（起点为既有 captions 时长累加）。
        const slices = captionSlicesFromText({
          content: text,
          contentFormat: asString(data.contentFormat),
          startTimeMs: captions.reduce((sum, item) => sum + item.durationMs, 0),
          sliceDurationMs: 3000,
        });
        for (const slice of slices) {
          captions.push({
            text: slice.text,
            startTimeMs: slice.startTimeMs,
            durationMs: slice.durationMs,
          });
        }
      }
    }
  }

  return { videos, audios, images, captions };
}

function clipPluginPresent(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.querySelector('[data-plugin="omnimux-clip"]')
    || document.querySelector('[data-stage="clip-editor"]')
    || (typeof window !== 'undefined' && (window as { __omnimuxClipReady?: boolean }).__omnimuxClipReady),
  );
}

export function createDefaultVideoCompositionData(): VideoCompositionNodeData {
  return {
    title: '视频合成',
    label: '视频合成',
    status: 'idle',
    schemaVersion: '1.0',
    projectId: `clip_node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

const VideoCompositionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = (isRecord(data) ? data : {}) as VideoCompositionNodeData;
  const setNodes = useCanvasStore((state) => state.setNodes);
  const applyCanvasInputMutation = useCanvasStore((state) => state.applyCanvasInputMutation);
  const t = useT();

  const status: VideoCompositionStatus = nodeData.status ?? 'idle';
  const hasOutput = Boolean(nodeData.outputVideoUrl);
  const title = nodeData.title || nodeData.label || t('node.type.video_composition');

  const view = mapVideoCompositionToView(status, hasOutput);

  const updateNodeData = useCallback(
    (updates: Partial<VideoCompositionNodeData>) => {
      setNodes((nodes) =>
        nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...updates } } : node)),
      );
    },
    [id, setNodes],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onSave = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (!isSaveClipEditorPayload(detail)) return;
      if (detail.nodeId && detail.nodeId !== id) return;
      const output = detail.output;
      updateNodeData({
        schema: detail.schema,
        projectId: detail.projectId || nodeData.projectId,
        outputVideoUrl: output?.videoPath,
        thumbnailUrl: output?.thumbnailPath,
        outputThumbnailUrl: output?.thumbnailPath,
        outputDurationMs: output?.durationMs,
        outputWidth: output?.width,
        outputHeight: output?.height,
        status: output?.videoPath ? 'completed' : 'idle',
        renderProgress: output?.videoPath ? 100 : undefined,
        errorMessage: undefined,
      });

      // ─── 画布模式：自动创建下游视频素材节点并连线 ───
      if (output?.videoPath && detail.createDownstreamNode) {
        const store = useCanvasStore.getState();
        const currentNode = store.nodes.find((n) => n.id === id);
        const plan = planClipExportDownstream({
          sourceNodeId: id,
          sourcePosition: currentNode?.position || { x: 0, y: 0 },
          sourceLabel: nodeData.title || nodeData.label || t('node.type.video_composition'),
          output,
          currentNodes: store.nodes,
          currentEdges: store.edges,
          nodeWidth: VIDEO_COMPOSITION_NODE_WIDTH,
        });
        if (plan) {
          applyCanvasInputMutation({
            addNodes: plan.addNodes.map((node) => ({ ...node, selected: true })),
            addEdges: plan.addEdges,
            removeEdgeIds: plan.removeEdgeIds,
          });
          toast.success(t('clip.exportedToNode') || '已生成视频节点并连接到画布');
        }
      }
    };

    const onProgress = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (!isProgressClipEditorPayload(detail)) return;
      if (detail.nodeId && detail.nodeId !== id) return;
      const nextStatus = (detail.status as VideoCompositionStatus | undefined) ?? 'rendering';
      updateNodeData({
        status: nextStatus,
        renderProgress: detail.renderProgress,
      });
    };

    const onClose = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (!isCloseClipEditorPayload(detail)) return;
      if (detail.nodeId && detail.nodeId !== id) return;
      if (nodeData.status === 'editing') {
        updateNodeData({ status: hasOutput ? 'completed' : 'idle' });
      }
    };

    window.addEventListener(OMNIMUX_CLIP_SAVE, onSave);
    window.addEventListener(OMNIMUX_CLIP_PROGRESS, onProgress);
    window.addEventListener(OMNIMUX_CLIP_CLOSE, onClose);
    return () => {
      window.removeEventListener(OMNIMUX_CLIP_SAVE, onSave);
      window.removeEventListener(OMNIMUX_CLIP_PROGRESS, onProgress);
      window.removeEventListener(OMNIMUX_CLIP_CLOSE, onClose);
    };
  }, [applyCanvasInputMutation, hasOutput, id, nodeData.projectId, nodeData.status, t, updateNodeData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!nodeData.outputVideoUrl) return;
    const store = useCanvasStore.getState();
    const currentNode = store.nodes.find((n) => n.id === id);
    const plan = planClipExportDownstream({
      sourceNodeId: id,
      sourcePosition: currentNode?.position || { x: 0, y: 0 },
      sourceLabel: nodeData.title || nodeData.label || t('node.type.video_composition'),
      output: {
        videoPath: nodeData.outputVideoUrl,
        thumbnailPath: nodeData.thumbnailUrl || nodeData.outputThumbnailUrl,
        durationMs: nodeData.outputDurationMs,
        width: nodeData.outputWidth,
        height: nodeData.outputHeight,
      },
      currentNodes: store.nodes,
      currentEdges: store.edges,
      nodeWidth: VIDEO_COMPOSITION_NODE_WIDTH,
      createIfMissing: false,
    });
    if (!plan) return;
    applyCanvasInputMutation({
      addEdges: plan.addEdges,
      removeEdgeIds: plan.removeEdgeIds,
    });
  }, [
    applyCanvasInputMutation,
    id,
    nodeData.label,
    nodeData.outputDurationMs,
    nodeData.outputHeight,
    nodeData.outputThumbnailUrl,
    nodeData.outputVideoUrl,
    nodeData.outputWidth,
    nodeData.thumbnailUrl,
    nodeData.title,
    t,
  ]);

  const openEditor = useCallback(() => {
    if (typeof window === 'undefined') return;
    const projectId = nodeData.projectId || `clip_${id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)}`;
    const payload: OpenClipEditorPayload = {
      source: 'canvas',
      nodeId: id,
      nodeTitle: title,
      projectId,
      draftSchema: nodeData.schema,
      upstreamInputs: collectUpstreamInputs(id),
    };
    updateNodeData({ status: 'editing', projectId });
    window.dispatchEvent(new CustomEvent(OMNIMUX_CLIP_OPEN, { detail: payload, bubbles: true }));
    window.setTimeout(() => {
      if (!clipPluginPresent()) {
        toast.warning(t('clip.needPlugin'));
      }
    }, 400);
  }, [id, nodeData.projectId, nodeData.schema, t, title, updateNodeData]);

  const { addToConversation } = useAddToConversation();

  const handleAddToConversation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const payload = buildConversationPayloadFromNode({
      nodeType: 'video_composition',
      nodeId: id,
      label: projectFileName(title),
      outputVideoUrl: nodeData.outputVideoUrl,
      duration: (nodeData as { durationText?: string }).durationText || '0:31',
    });
    if (payload) addToConversation(payload);
  }, [addToConversation, id, nodeData.outputVideoUrl, title]);

  const handleDownload = useCallback(() => {
    const url = nodeData.outputVideoUrl;
    if (!url) return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projectFileName(title)}.mp4`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [nodeData.outputVideoUrl, title]);

  return (
    <CanvasNodeShell
      id={id}
      selected={selected}
      nodeWidth={VIDEO_COMPOSITION_NODE_WIDTH}
      nodeHeight={VIDEO_COMPOSITION_NODE_HEIGHT}
      dataNodeType="video_composition"
      showLeftHandle={true}
      showRightHandle={true}
      leftHandleVariant="plain"
      rightHandleVariant="plain"
      onCardDoubleClick={(event) => {
        event.stopPropagation();
        openEditor();
      }}
      renderFloatingPill={({ hovered, selected: isSelected, isMultiSelected }) => {
        const hasMaterial = hasNodeMaterial({
          nodeType: 'video_composition',
          outputVideoUrl: nodeData.outputVideoUrl,
        });
        if (!shouldShowNodeToolbar({
          hasMaterial,
          hovered,
          selected: isSelected,
          isMultiSelected,
        })) return null;
        const pillActions: FloatingPillAction[] = [
          {
            key: 'download_video',
            label: t('pill.download'),
            icon: Download,
            section: 'primary',
            onClick: handleDownload,
            title: t('clip.downloadTitle'),
          },
          {
            key: 'add-to-conversation',
            icon: MessageSquarePlus,
            section: 'secondary',
            onClick: handleAddToConversation,
            title: t('pill.addToConversation'),
          },
        ];
        return (
          <FloatingTopPill
            actions={pillActions}
            maxWidth={pillMaxWidthForNode(VIDEO_COMPOSITION_NODE_WIDTH)}
          />
        );
      }}
      renderHeader={() => (
        <NodeHeader
          label={title}
          materialType="video_composition"
          customIcon={<Film size={14} />}
          onLabelChange={(newLabel) => updateNodeData({ label: newLabel, title: newLabel })}
          trailing={<StatusBadge status={mapVideoCompositionToBadge(status)} />}
        />
      )}
    >
      {view === 'rendering' && (
        <div className="wf-material-node__media">
          <GenerationStateContainer status="generating" loadingAspectRatio="video">
            {null}
          </GenerationStateContainer>
        </div>
      )}

      {view === 'error' && (
        <div className="wf-material-node__media">
          <GenerationStateContainer
            status="failed"
            loadingAspectRatio="video"
            errorMessage={nodeData.errorMessage}
            onRetry={openEditor}
          >
            {null}
          </GenerationStateContainer>
        </div>
      )}

      {view === 'launcher' && (
        <NodeLauncherState
          mainIcon={<Film size={36} strokeWidth={1.5} />}
          secondaryIcon={<Layers size={14} />}
          title={t('clip.launcherTitle')}
          blurb={t('clip.launcherBlurb')}
          actions={[
            {
              key: 'open_clip',
              label: t('clip.openClip'),
              icon: Pencil,
              onClick: () => openEditor(),
            },
          ]}
        />
      )}
    </CanvasNodeShell>
  );
};

export const videoCompositionNodeDefinition: NodeDefinition = {
  type: 'video_composition',
  component: memo(VideoCompositionNode) as unknown as NodeDefinition['component'],
  ports: [
    { side: 'in', acceptedTypes: ['text', 'image', 'video', 'audio'] },
    { side: 'out', acceptedTypes: ['video'] },
  ],
  defaultData: () => createDefaultVideoCompositionData() as unknown as Record<string, unknown>,
  configSpec: {
    promptEnabled: false,
    modelCategory: 'video',
  },
  executorKey: 'video_composition',
  palette: {
    group: 'palette.group.material',
    label: 'palette.node.video_composition',
    icon: 'film',
  },
};

export default VideoCompositionNode;