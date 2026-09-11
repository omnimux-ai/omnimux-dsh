/**
 * MaterialNode — 统一素材节点（Unified Material Node）。
 *
 * 核心交互：
 * 1. 顶部操作胶囊（FloatingTopPill）：仅在节点已有素材时显示；空态引导留在卡片内
 * 2. 空态引导模板（NodeEmptyState）：四类素材各具特色的空态与快捷 Prompt 预设；导入空态整卡可点导入
 * 3. 拖拽即导入：仅导入节点接受本地媒体文件
 * 4. 底部配置底栏（ConfigPanel）：仅生成节点展开 Prompt、模型、参数与生成；导入节点不展开
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSaveRemoteAudio } from '../../hooks/useSaveRemoteAudio.ts';
import { AudioLines, Check, Clapperboard, Copy, FileEdit, FileSpreadsheet, Film, Layers, MessageSquarePlus, Music, RefreshCw, Upload } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import type { MaterialNodeData, MaterialType, MaterialTool } from '../../../types/materialNode';
import { resolveNodeKind } from '../../../types/materialNode';
import { readCurrentText } from '../../../../shared/graph/nodeInputSource';
import GenerationStateContainer from '../GenerationStateContainer';
import NodeHeader from './NodeHeader';
import StatusBadge from './StatusBadge';
import MediaPreview, { resolveMediaPreviewUrl, type MediaAssetLike } from './MediaPreview';
import NodeEmptyState from './NodeEmptyState';
import FloatingTopPill, { type FloatingPillAction } from '../FloatingTopPill';
import ConfigPanelShell from './ConfigPanel/ConfigPanelShell';
import ConfigPanel from './ConfigPanel';
import ResourcePickerModal from '../ResourcePickerModal';
import { useResourcePicker } from '../../hooks/useResourcePicker';
import { useUpstreamMedia } from '../../hooks/useUpstreamMedia';
import { useAddToConversation } from '../../../hooks/useAddToConversation';
import {
  getDefaultNodeWidth,
  getNodeSizeCategory,
  calculateNodeHeight,
} from '../../utils/nodeSizeConfig';
import { isConfigPanelVisible, mapNodeToGenerationStatus } from '../../utils/nodeVisualMath';
import {
  buildConversationPayloadFromNode,
  canExtractVideoFromTextNode,
  canRunSpeechToText,
  canRunVideoDeconstruct,
  canRunVideoStoryboard,
  EMPTY_AUDIO_PILL_ACTION_ID,
  EMPTY_IMAGE_PILL_ACTION_ID,
  EMPTY_VIDEO_PILL_ACTION_ID,
  hasNodeMaterial,
  isEmptyImageGenerateNode,
  isEmptyMediaGenerateNode,
  pillMaxWidthForNode,
  resolveVideoAudioExtractPath,
  shouldShowNodeToolbar,
} from '../../utils/nodeToolbarLogic';
import { extractSocialVideoUrl } from '../../utils/socialMediaVideoUrl.ts';
import { planVideoExtractionDownstream } from '../../utils/planVideoExtractionDownstream.ts';
import {
  planAudioExtractProvisioning,
  planAudioExtractSettlement,
} from '../../utils/planAudioExtractDownstream.ts';
import { extractAudioFromVideo, extractVideoFromUrl } from '../../../bridge/apiClient.ts';
import { planSelectAndPatchNode } from '../../utils/planSelectAndPatchNode';
import { useExecutionStore } from '../../../store/executionStore';
import { useCanvasStore, useIsMultiSelected } from '../../../store/canvasStore';
import { useTextStageStore } from '../../../store/textStageStore';
import { useT } from '../../../i18n';
import { toast } from '../../../ui';
import type { CapabilityCatalog, NodeExecutionApiStatus } from '../../../../shared/api';
import { draftFromRealPath, nativePathOf } from '../../utils/localFileDraft.ts';
import { planImportNodeFill } from '../../utils/resourcePickerPolicy.ts';
import { resolveModelInputCapability } from '../../../../shared/validation/modelCompatibilityEvaluator.ts';
import type { NodeSlotEngineState } from '../../../../shared/graph/slotContractTypes.ts';
import type { SlotPickRequest } from './ConfigPanel/SlotWells/types.ts';
import { MediaCardBody } from './CardBody/MediaCardBody';
import { NodeCornerMarkers } from './StatusMask/NodeCornerMarkers';
import { MaterialNodeHandles } from './NodeHandles/MaterialNodeHandles';
import {
  executeDeconstructVideo,
  executeSpeechToText,
  executeStoryboardVideo,
} from './nodeMediaOperations';

const DEFAULT_GEN_TOOLS: Record<MaterialType, MaterialTool> = {
  text: 'text-to-text',
  image: 'text-to-image',
  video: 'video-generation',
  audio: 'text-to-audio',
};

function selectTargetNode(
  nodeId: string,
  setNodes: (updater: (nodes: any[]) => any[]) => void,
): void {
  setNodes((nodes) => nodes.map((n) => ({ ...n, selected: n.id === nodeId })));
  useCanvasStore.getState().setSelectedElement('node', nodeId);
}

function patchNodeData(nodes: any[], targetId: string, updates: Partial<MaterialNodeData>) {
  return nodes.map((n) => (n.id === targetId ? { ...n, data: { ...n.data, ...updates } } : n));
}

function extractDraftsFromFiles(files: File[]) {
  const drafts = [];
  for (const file of files) {
    const path = nativePathOf(file);
    if (!path) continue;
    const draft = draftFromRealPath(path, { name: file.name, mime: file.type, size: file.size });
    if (draft) drafts.push(draft);
  }
  return drafts;
}

function attachVideoSourceToNodes(items: any[], videoPath: string, workspaceId: string) {
  return items.map((item) => ({
    ...item,
    data: {
      ...item.data,
      sourceVideoPath: videoPath,
      __workspaceId: workspaceId,
    },
  }));
}

// ==================== 主组件 ====================

const MaterialNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as MaterialNodeData;
  const {
    materialType,
    status,
    label,
    content,
    mediaUrl,
    generatedContent,
    errorMessage,
  } = nodeData;

  const executionStatus = nodeData.executionStatus as NodeExecutionApiStatus | undefined;
  const executionError = nodeData.executionError as string | undefined;
  const simulated = nodeData.simulated === true;
  const mediaAssets = nodeData.mediaAssets as MediaAssetLike[] | undefined;
  const catalog = (data as { __catalog?: CapabilityCatalog }).__catalog ?? null;

  const [isHovered, setIsHovered] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [textEditing, setTextEditing] = useState(false);
  const [mediaAspectHeight, setMediaAspectHeight] = useState<number | null>(null);
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);

  const { setNodes } = useReactFlow();

  const execBusy = useExecutionStore((state) => state.status === 'pending' || state.status === 'running');
  const isMultiSelected = useIsMultiSelected();

  const nodeWidth = nodeData.nodeWidth ?? getDefaultNodeWidth(materialType);
  const sizeCategory = getNodeSizeCategory(materialType);
  const defaultCalculatedHeight = calculateNodeHeight(nodeWidth, sizeCategory);
  const nodeHeight = materialType === 'audio'
    ? Math.max(126, nodeData.nodeHeight ?? defaultCalculatedHeight)
    : mediaAspectHeight ?? nodeData.nodeHeight ?? defaultCalculatedHeight;

  const updateNodeData = useCallback(
    (updates: Partial<MaterialNodeData>) => {
      setNodes((nodes) => patchNodeData(nodes, id, updates));
    },
    [id, setNodes],
  );

  // 媒体素材宽高自适应计算
  const handleMediaSizeChange = useCallback(
    (naturalWidth: number, naturalHeight: number) => {
      if (naturalWidth <= 0 || naturalHeight <= 0) return;
      const aspect = naturalWidth / naturalHeight;
      const targetHeight = Math.max(80, Math.min(800, Math.round(nodeWidth / aspect)));
      setMediaAspectHeight(targetHeight);
      if (nodeData.nodeHeight !== targetHeight) {
        updateNodeData({ nodeHeight: targetHeight });
      }
    },
    [nodeData.nodeHeight, nodeWidth, updateNodeData],
  );

  // 媒体素材时长自愈回填（修复视频节点 durationSec 恒为 null 导致下游模型校验拦截）
  const handleDurationChange = useCallback(
    (duration: number) => {
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (nodeData.durationSec !== duration || nodeData.duration !== duration) {
        updateNodeData({ durationSec: duration, duration });
      }
    },
    [nodeData.duration, nodeData.durationSec, updateNodeData],
  );

  const handleGenerate = useCallback(() => {
    const nodeKind = resolveNodeKind(nodeData);
    const needDefaultTool = nodeKind === 'generate' && (!nodeData.selectedTool || nodeData.selectedTool === 'text-editor');
    if (needDefaultTool) {
      updateNodeData({ selectedTool: DEFAULT_GEN_TOOLS[materialType] });
    }

    const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined;
    if (!quota || typeof quota.ensureQuota !== 'function') {
      useExecutionStore.getState().startNodeExecution?.(id);
      return;
    }
    void Promise.resolve(quota.ensureQuota({ capability: 'canvas', correlationId: id })).then((gate: { ok?: boolean } | undefined) => {
      if (gate && gate.ok === false) return;
      useExecutionStore.getState().startNodeExecution?.(id);
    });
  }, [id, materialType, nodeData, updateNodeData]);

  const t = useT();
  const applyCanvasInputMutation = useCanvasStore((state) => state.applyCanvasInputMutation);
  const resourcePicker = useResourcePicker(id, typeof nodeData.__workspaceId === 'string' ? nodeData.__workspaceId : null);
  const kind = resolveNodeKind(nodeData);

  const effectiveTextContent = readCurrentText(data as Record<string, unknown>);
  const isOffline = status === 'offline' || nodeData.isMissing === true;
  const previewUrl = resolveMediaPreviewUrl(materialType, mediaAssets, mediaUrl);
  const audioWorkspaceId = typeof nodeData.__workspaceId === 'string' ? nodeData.__workspaceId : undefined;
  const handleSaveAudio = useSaveRemoteAudio(id, audioWorkspaceId, previewUrl);
  // SRT 字幕文本节点（Issue 744）：不展开配置底栏，双击仍可进 TextStage 浏览编辑
  const contentFormat = typeof nodeData.contentFormat === 'string' ? nodeData.contentFormat : undefined;
  const isSrtSubtitle = contentFormat === 'srt';
  // 文本节点用正文是否存在判定 hasResult；媒体节点用 previewUrl。
  // 否则文本生成中/完成后 generationStatus 永远落不到 GSC，彩色动效不会出现。
  const hasResult =
    materialType === 'text'
      ? Boolean(effectiveTextContent.trim())
      : Boolean(previewUrl);
  const generationStatus = isOffline
    ? null
    : mapNodeToGenerationStatus(executionStatus, status, hasResult);
  const isGenerating =
    generationStatus === 'generating' ||
    generationStatus === 'pending' ||
    executionStatus === 'running' ||
    executionStatus === 'pending' ||
    status === 'generating';
  const isEmptyMediaNode = isEmptyMediaGenerateNode({
    materialType,
    nodeKind: kind,
    previewUrl,
    mediaUrl,
    generationStatus,
  });
  const isEmptyImageNode = isEmptyImageGenerateNode({
    materialType,
    nodeKind: kind,
    previewUrl,
    generationStatus,
  });

  // 预设注入：写 prompt + 单选当前节点（空态按钮 nodrag 拦掉了 RF 选中手势）
  const handleApplyPreset = useCallback(
    (presetKey: string) => {
      if (materialType !== 'text') return;
      let injected = '';
      if (presetKey === 'script') {
        injected = '请创作一个[时长]的[类型]剧本。\n\n主题：[一句话描述]\n\n情绪基调：[温暖/悬疑/搞笑/热血]\n\n特殊要求：[如有]';
      } else if (presetKey === 'planning') {
        injected = '请撰写一份[项目类型]策划案。\n\n项目背景：[简述]\n\n核心目标：[希望达成什么]\n\n目标受众：[人群描述]';
      } else if (presetKey === 'prompt') {
        injected = '根据以下创意需求，生成一组适用于[目标工具]的高质量提示词。\n\n创意需求：[描述你想要的画面/音乐/视频]\n\n风格偏好：[写实/插画/3D/动漫/其他]';
      } else if (presetKey === 'storyboard') {
        injected = '镜头1：全景，城市天际线鸟瞰（缓慢下推 3s）\n镜头2：中景，主角推门走进咖啡馆（特写手部 2s）\n镜头3：特写，桌上的老式黑白照片（静止 2s）';
      }
      const updates: Record<string, unknown> = {
        prompt: injected,
        selectedTool: 'text-to-text',
        nodeKind: 'generate',
        content: undefined,
        generatedContent: undefined,
      };
      setNodes((nodes) => planSelectAndPatchNode(nodes, id, updates));
      useCanvasStore.getState().setSelectedElement('node', id);
    },
    [id, materialType, setNodes],
  );

  // 本地文件导入：只接受带绝对路径的 File（Electron）或 native picker。
  const handleImportFile = useCallback(
    (file: File) => {
      const path = nativePathOf(file);
      if (!path) {
        toast.warning(t('picker.needPath'));
        return;
      }
      const draft = draftFromRealPath(path, {
        name: file.name,
        mime: file.type,
        size: file.size,
      });
      if (!draft) {
        toast.warning(t('picker.unsupported'));
        return;
      }
      const state = useCanvasStore.getState();
      const plan = planImportNodeFill({
        nodes: state.nodes,
        targetNodeId: id,
        files: [draft],
        edges: state.edges,
      });
      if (!plan.hasWork) {
        toast.warning(t('picker.unsupported'));
        return;
      }
      const applied = applyCanvasInputMutation({
        addNodes: plan.addNodes,
        nodePatches: plan.nodePatches,
        removeEdgeIds: plan.removeEdgeIds,
      });
      if (applied.status !== 'allowed') {
        toast.error(t('picker.commitFailed'));
      }
    },
    [applyCanvasInputMutation, id, t],
  );

  // 拖拽文件进入：导入素材节点与空状态生图节点均接受本地文件（兼容多模态媒体空态）
  const canAcceptDrop = kind === 'import' || isEmptyImageNode || isEmptyMediaNode;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, [canAcceptDrop]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, [canAcceptDrop]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptDrop) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 1 && files[0]) {
        handleImportFile(files[0]);
        return;
      }
      const drafts = extractDraftsFromFiles(files);
      if (drafts.length === 0) {
        if (files.length > 0) toast.warning(t('picker.needPath'));
        return;
      }
      const state = useCanvasStore.getState();
      const plan = planImportNodeFill({
        nodes: state.nodes,
        targetNodeId: id,
        files: drafts,
        edges: state.edges,
      });
      if (!plan.hasWork) {
        toast.warning(t('picker.unsupported'));
        return;
      }
      const applied = applyCanvasInputMutation({
        addNodes: plan.addNodes,
        nodePatches: plan.nodePatches,
        removeEdgeIds: plan.removeEdgeIds,
      });
      if (applied.status !== 'allowed') {
        toast.error(t('picker.commitFailed'));
      }
    },
    [applyCanvasInputMutation, canAcceptDrop, handleImportFile, id, t],
  );

  // 文本快捷操作与全屏 Stage 打开
  const handleOpenTextStage = useCallback(() => {
    useTextStageStore.getState().openStage(id, {
      title: label || '',
      content: effectiveTextContent || '',
      versions: nodeData.versions || [],
    });
  }, [effectiveTextContent, id, label, nodeData.versions]);

  const [copied, setCopied] = useState(false);

  const handleCopyText = useCallback(() => {
    if (!effectiveTextContent) return;
    navigator.clipboard.writeText(effectiveTextContent).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [effectiveTextContent]);

  const handleSplitText = useCallback(() => {
    if (!effectiveTextContent) return;
    const lines = effectiveTextContent.split('\n\n').filter((l) => l.trim().length > 0);
    if (lines.length > 1) {
      updateNodeData({ content: lines.join('\n---\n') });
    }
  }, [effectiveTextContent, updateNodeData]);

  useEffect(() => {
    if (!selected) {
      setTextEditing(false);
    }
  }, [selected]);

  // 文本节点业务逻辑（模型生成与手动编辑模式互斥）：
  // 用户在空状态下选择了自己编辑，只要填写的内容非空，就不会再显示模型的生成面板。
  // 执行时作为一个文本文件输入（import），不再支持模型生成。
  const isTextManualEdit =
    materialType === 'text' &&
    Boolean(effectiveTextContent.trim()) &&
    !nodeData.generatedContent &&
    (!nodeData.prompt || !String(nodeData.prompt).trim());

  const effectiveKind = isTextManualEdit ? 'import' : kind;

  const panelVisible = isConfigPanelVisible(
    selected,
    executionStatus,
    effectiveKind,
    isMultiSelected,
    contentFormat,
    status,
  );

  const loadingAspectRatio =
    materialType === 'video'
      ? 'video'
      : materialType === 'audio'
        ? 'audio'
        : materialType === 'text'
          ? 'auto'
          : 'square';

  const hasMaterial = hasNodeMaterial({
    nodeType: 'material',
    materialType,
    nodeKind: kind,
    content: content as string | undefined,
    generatedContent: generatedContent as string | undefined,
    previewUrl,
    isOffline,
  });
  const canExtractVideo = useMemo(
    () =>
      canExtractVideoFromTextNode({
        materialType,
        content: content as string | undefined,
        generatedContent: generatedContent as string | undefined,
        isOffline,
        executionStatus,
      }),
    [content, executionStatus, generatedContent, isOffline, materialType],
  );

  const showFloatingPill = shouldShowNodeToolbar({
    hasMaterial,
    hovered: isHovered,
    selected,
    isMultiSelected,
    allowEmpty: isEmptyImageNode || canExtractVideo || isEmptyMediaNode,
  });

  const { addToConversation } = useAddToConversation();

  // 文本节点提取视频：从社媒链接提取无水印视频并下载保存为下游视频节点
  const handleExtractVideo = useCallback(async () => {
    const workspaceId = typeof nodeData.__workspaceId === 'string' ? nodeData.__workspaceId : '';
    if (!workspaceId) {
      toast.error(t('extractVideo.noWorkspace'));
      return;
    }
    const detected = extractSocialVideoUrl(effectiveTextContent);
    if (!detected || !detected.url) {
      toast.error(t('extractVideo.noUrl'));
      return;
    }
    updateNodeData({ executionStatus: 'running', executionError: undefined, videoExtractActive: true });
    try {
      const result = await extractVideoFromUrl(workspaceId, {
        nodeId: id,
        url: detected.url,
      });
      if (!result.ok || !result.body?.data?.mediaUrl) {
        const message = result.body?.message || result.body?.error || t('extractVideo.toast.failed');
        updateNodeData({ executionStatus: 'error', executionError: message, videoExtractActive: undefined });
        toast.error(message);
        return;
      }
      const extracted = result.body.data;
      const store = useCanvasStore.getState();
      const textNode = store.nodes.find((n) => n.id === id);
      const plan = planVideoExtractionDownstream({
        textNodeId: id,
        textPosition: textNode?.position ?? { x: 0, y: 0 },
        textNodeWidth: nodeWidth,
        videoResult: {
          videoPath: extracted.videoPath,
          mediaUrl: extracted.mediaUrl,
          previewUrl: extracted.previewUrl,
          title: extracted.title,
          duration: extracted.duration,
          coverUrl: extracted.coverUrl,
        },
        label: extracted.title || t('extractVideo.nodeLabel'),
        currentNodes: store.nodes,
        currentEdges: store.edges,
      });
      updateNodeData({ executionStatus: 'completed', executionError: undefined, videoExtractActive: undefined });
      if (!plan) {
        toast.error(t('extractVideo.toast.failed'));
        return;
      }
      applyCanvasInputMutation({
        addNodes: plan.addNodes,
        addEdges: plan.addEdges,
        nodePatches: plan.nodePatches,
      });
      setNodes((nodes) => nodes.map((n) => ({ ...n, selected: n.id === plan.targetNodeId })));
      useCanvasStore.getState().setSelectedElement('node', plan.targetNodeId);
      toast.success(t('extractVideo.toast.success'));
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t('extractVideo.toast.failed');
      updateNodeData({ executionStatus: 'error', executionError: message, videoExtractActive: undefined });
      toast.error(message);
    }
  }, [applyCanvasInputMutation, effectiveTextContent, id, nodeData.__workspaceId, nodeWidth, setNodes, t, updateNodeData]);

  // 语音识别（Issue 744 T04 / Issue 1176）：音频节点转写并派生下游 SRT 字幕节点。
  const handleSpeechToText = useCallback(() => {
    const wsId =
      (typeof nodeData.__workspaceId === 'string' && nodeData.__workspaceId.trim()) ||
      (typeof nodeData.workspaceId === 'string' && nodeData.workspaceId.trim()) ||
      (useCanvasStore.getState().nodes.find((n) => n.id === id)?.data as any)?.__workspaceId ||
      '';
    void executeSpeechToText({
      workspaceId: wsId,
      id,
      nodeData,
      mediaUrl,
      previewUrl,
      nodeWidth,
      t,
      updateNodeData,
      applyCanvasInputMutation,
      setNodes,
    });
  }, [applyCanvasInputMutation, id, mediaUrl, nodeData, nodeWidth, previewUrl, setNodes, t, updateNodeData]);

  // 视频内容拆解：视频节点拆解并派生下游表格节点。
  const handleDeconstructVideo = useCallback(() => {
    void executeDeconstructVideo({
      workspaceId: typeof nodeData.__workspaceId === 'string' ? nodeData.__workspaceId : '',
      id,
      label,
      nodeData,
      mediaUrl,
      previewUrl,
      nodeWidth,
      t,
      updateNodeData,
      applyCanvasInputMutation,
      setNodes,
    });
  }, [applyCanvasInputMutation, id, label, mediaUrl, nodeData, nodeWidth, previewUrl, setNodes, t, updateNodeData]);

  // 视频做分镜表：提取逐镜头分镜图与脚本，派生下游表格节点 (.htable，含多模态图片附件)
  const handleStoryboardVideo = useCallback(() => {
    void executeStoryboardVideo({
      workspaceId: typeof nodeData.__workspaceId === 'string' ? nodeData.__workspaceId : '',
      id,
      label,
      nodeData,
      mediaUrl,
      previewUrl,
      t,
      updateNodeData,
      setNodes,
    });
  }, [id, label, mediaUrl, nodeData, previewUrl, setNodes, t, updateNodeData]);

  // 音频节点自身重试提取音频（就地在下游音频节点执行，源视频完全零侵入）
  const handleRetryAudioExtract = useCallback(async () => {
    const workspaceId = typeof nodeData.__workspaceId === 'string' ? nodeData.__workspaceId : '';
    if (!workspaceId) {
      toast.error(t('extractAudio.noWorkspace'));
      return;
    }
    let videoPath = typeof (nodeData as any).sourceVideoPath === 'string' ? (nodeData as any).sourceVideoPath : '';
    if (!videoPath && (nodeData as any).sourceVideoNodeId) {
      const store = useCanvasStore.getState();
      const sourceNode = store.nodes.find((n) => n.id === (nodeData as any).sourceVideoNodeId);
      if (sourceNode?.data) {
        videoPath = resolveVideoAudioExtractPath(
          {
            realPath: (sourceNode.data as any).realPath,
            relativePath: (sourceNode.data as any).relativePath,
            mediaUrl: (sourceNode.data as any).mediaUrl,
            previewUrl: (sourceNode.data as any).previewUrl,
            workspaceId,
          },
          { baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined },
        ) || '';
      }
    }
    if (!videoPath) {
      toast.error(t('extractAudio.noVideo'));
      return;
    }
    updateNodeData({ executionStatus: 'running', executionError: undefined, status: 'generating' });
    try {
      const result = await extractAudioFromVideo(workspaceId, {
        nodeId: id,
        videoPath,
        title: label || t('extractAudio.nodeLabel'),
      });
      if (!result.ok || !result.body?.data) {
        const message = result.body?.message || result.body?.error || t('extractAudio.toast.failed');
        updateNodeData({ executionStatus: 'error', executionError: message, status: 'failed', audioExtractActive: true });
        toast.error(message);
        return;
      }
      if (result.body.data.noAudioStream) {
        const message = t('extractAudio.toast.noAudioStream');
        updateNodeData({ executionStatus: 'error', executionError: message, status: 'failed', audioExtractActive: true });
        toast.info(message);
        return;
      }
      updateNodeData({
        executionStatus: 'completed',
        executionError: undefined,
        audioExtractActive: undefined,
        status: 'ready',
        realPath: result.body.data.audioPath,
        mediaUrl: result.body.data.mediaUrl,
        previewUrl: result.body.data.previewUrl,
        duration: result.body.data.duration,
        format: result.body.data.format,
        title: result.body.data.title,
      });
      toast.success(t('extractAudio.toast.success'));
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('extractAudio.toast.failed');
      updateNodeData({ executionStatus: 'error', executionError: message, status: 'failed', audioExtractActive: true });
      toast.error(message);
    }
  }, [id, label, nodeData, t, updateNodeData]);

  // 视频提取音频：激活后立即在右侧创建下游音频节点（Running 态），在音频节点中执行与收敛，源视频节点零侵入
  const handleExtractAudio = useCallback(async () => {
    if (isExtractingAudio) return;
    const workspaceId = typeof nodeData.__workspaceId === 'string' ? nodeData.__workspaceId : '';
    if (!workspaceId) {
      toast.error(t('extractAudio.noWorkspace'));
      return;
    }
    const videoPath = resolveVideoAudioExtractPath(
      {
        realPath: nodeData.realPath,
        relativePath: nodeData.relativePath,
        mediaUrl,
        previewUrl,
        workspaceId,
      },
      { baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined },
    );
    if (!videoPath) {
      toast.error(t('extractAudio.noVideo'));
      return;
    }

    // 1. 乐观预建/激活下游音频节点（置为 running 态），源视频节点绝不写 running / error！
    const store = useCanvasStore.getState();
    const videoNode = store.nodes.find((n) => n.id === id);
    const audioLabel = label ? `${label} 原声` : t('extractAudio.nodeLabel');
    const provision = planAudioExtractProvisioning({
      videoNodeId: id,
      videoPosition: videoNode?.position ?? { x: 0, y: 0 },
      videoNodeWidth: nodeWidth,
      label: audioLabel,
      currentNodes: store.nodes as any,
      currentEdges: store.edges as any,
    });

    if (provision.mode === 'noop') {
      return;
    }

    const targetNodeId = provision.targetNodeId;
    const nodesToAdd = attachVideoSourceToNodes(provision.addNodes, videoPath, workspaceId);
    const patchesToApply = attachVideoSourceToNodes(provision.nodePatches, videoPath, workspaceId);

    applyCanvasInputMutation({
      addNodes: nodesToAdd as any,
      addEdges: provision.addEdges as any,
      nodePatches: patchesToApply as any,
    });

    selectTargetNode(targetNodeId, setNodes);

    setIsExtractingAudio(true);
    try {
      const result = await extractAudioFromVideo(workspaceId, {
        nodeId: id,
        videoPath,
        title: audioLabel,
      });

      if (!result.ok || !result.body?.data) {
        const message = result.body?.message || result.body?.error || t('extractAudio.toast.failed');
        const settlement = planAudioExtractSettlement({
          targetNodeId,
          error: message,
        });
        applyCanvasInputMutation({
          nodePatches: settlement.nodePatches as any,
        });
        toast.error(message);
        return;
      }

      if (result.body.data.noAudioStream) {
        const message = t('extractAudio.toast.noAudioStream');
        const settlement = planAudioExtractSettlement({
          targetNodeId,
          noAudioStream: true,
          error: message,
        });
        applyCanvasInputMutation({
          nodePatches: settlement.nodePatches as any,
        });
        toast.info(message);
        return;
      }

      const settlement = planAudioExtractSettlement({
        targetNodeId,
        label: result.body.data.title || audioLabel,
        extractResult: {
          audioPath: result.body.data.audioPath,
          mediaUrl: result.body.data.mediaUrl,
          previewUrl: result.body.data.previewUrl,
          duration: result.body.data.duration,
          format: result.body.data.format,
          title: result.body.data.title,
        },
      });

      applyCanvasInputMutation({
        nodePatches: settlement.nodePatches as any,
      });

      toast.success(t('extractAudio.toast.success'));
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t('extractAudio.toast.failed');
      const settlement = planAudioExtractSettlement({
        targetNodeId,
        error: message,
      });
      applyCanvasInputMutation({
        nodePatches: settlement.nodePatches as any,
      });
      toast.error(message);
    } finally {
      setIsExtractingAudio(false);
    }
  }, [applyCanvasInputMutation, id, isExtractingAudio, label, mediaUrl, nodeData.__workspaceId, nodeData.realPath, nodeData.relativePath, nodeWidth, previewUrl, setNodes, t]);

  const handleAddToConversation = useCallback(() => {
    const payload = buildConversationPayloadFromNode({
      nodeType: 'material',
      nodeId: id,
      materialType,
      label,
      previewUrl,
      relativePath:
        (data as { filePath?: string; previewUrl?: string }).filePath
        || (data as { previewUrl?: string }).previewUrl,
    });
    if (payload) addToConversation(payload);
  }, [addToConversation, data, id, label, materialType, previewUrl]);

  const pillActions: FloatingPillAction[] = useMemo(() => {
    if (isEmptyImageNode) {
      return [
        {
          key: 'import-image',
          label: t('pill.importImage'),
          icon: Upload,
          section: 'primary',
          title: t('pill.importImage'),
          onClick: (event) => {
            event.stopPropagation();
            resourcePicker.fillImportNode();
          },
        },
      ];
    }

    if (isEmptyMediaNode) {
      const actionKey = materialType === 'video'
        ? EMPTY_VIDEO_PILL_ACTION_ID
        : EMPTY_AUDIO_PILL_ACTION_ID;
      const labelText = materialType === 'video'
        ? t('pill.importVideo')
        : t('pill.importAudio');
      return [
        {
          key: actionKey,
          label: labelText,
          icon: Upload,
          section: 'primary',
          title: labelText,
          onClick: (event) => {
            event.stopPropagation();
            void resourcePicker.fillImportNode();
          },
        },
      ];
    }

    const chat: FloatingPillAction = {
      key: 'add-to-conversation',
      icon: MessageSquarePlus,
      section: 'secondary',
      title: t('pill.addToConversation'),
      onClick: (event) => {
        event.stopPropagation();
        handleAddToConversation();
      },
    };

    if (materialType === 'text' && canExtractVideo) {
      return [
        {
          key: 'extract-video',
          label: t('pill.extractVideo'),
          icon: Film,
          section: 'primary',
          title: t('pill.extractVideo'),
          onClick: (event) => {
            event.stopPropagation();
            void handleExtractVideo();
          },
        },
        chat,
      ];
    }

    if (materialType === 'text') {
      return [
        {
          key: 'edit',
          label: t('pill.edit'),
          icon: FileEdit,
          section: 'primary',
          title: t('pill.edit'),
          onClick: (event) => {
            event.stopPropagation();
            handleOpenTextStage();
          },
        },
        {
          key: 'copy',
          label: copied ? t('pill.copied') : t('pill.copy'),
          icon: copied ? Check : Copy,
          section: 'secondary',
          title: t('pill.copy'),
          onClick: (event) => {
            event.stopPropagation();
            handleCopyText();
          },
        },
        {
          key: 'split',
          label: t('pill.split'),
          icon: Layers,
          section: 'secondary',
          title: t('pill.split'),
          onClick: (event) => {
            event.stopPropagation();
            handleSplitText();
          },
        },
        chat,
      ];
    }

    if (materialType === 'audio') {
      const actions: FloatingPillAction[] = [];
      const allowSpeechToText = canRunSpeechToText({
        materialType,
        executionStatus,
        isOffline,
        realPath: nodeData.realPath,
        relativePath: nodeData.relativePath,
        mediaUrl,
        previewUrl,
        audioPath: typeof nodeData.audioPath === 'string' ? nodeData.audioPath : undefined,
        filePath: typeof nodeData.filePath === 'string' ? nodeData.filePath : undefined,
        url: typeof (nodeData as any).url === 'string' ? (nodeData as any).url : undefined,
        mediaAssetsUrl: mediaAssets?.[0]?.url,
      });
      if (allowSpeechToText) {
        actions.push({
          key: 'speech-to-text',
          label: t('pill.speechToText'),
          icon: AudioLines,
          section: 'primary',
          title: t('pill.speechToText'),
          onClick: (event) => {
            event.stopPropagation();
            void handleSpeechToText();
          },
        });
      }
      actions.push(chat);
      return actions;
    }

    if (materialType === 'video') {
      const actions: FloatingPillAction[] = [];
      const allowVideoTools = canRunVideoDeconstruct({
        materialType,
        executionStatus,
        isOffline,
        realPath: nodeData.realPath,
        relativePath: nodeData.relativePath,
        mediaUrl,
        previewUrl,
      });
      if (allowVideoTools) {
        actions.push({
          key: 'deconstruct-video',
          label: t('pill.deconstructVideo'),
          icon: FileSpreadsheet,
          section: 'primary',
          title: t('pill.deconstructVideo'),
          onClick: (event) => {
            event.stopPropagation();
            void handleDeconstructVideo();
          },
        });
        actions.push({
          key: 'storyboard-video',
          label: t('pill.storyboardVideo'),
          icon: Clapperboard,
          section: 'primary',
          title: t('pill.storyboardVideo'),
          onClick: (event) => {
            event.stopPropagation();
            void handleStoryboardVideo();
          },
        });
        actions.push({
          key: 'extract-audio',
          label: t('pill.extractAudio'),
          icon: Music,
          section: 'primary',
          disabled: isExtractingAudio,
          title: isExtractingAudio ? '正在提取音频...' : t('pill.extractAudio'),
          onClick: (event) => {
            event.stopPropagation();
            if (isExtractingAudio) return;
            void handleExtractAudio();
          },
        });
      }
      actions.push(chat);
      return actions;
    }

    const importManagementActions: FloatingPillAction[] = [];
    if (kind === 'import' && materialType === 'image' && !isGenerating) {
      importManagementActions.push({
        key: 'replace-media',
        label: t('pill.replace'),
        icon: RefreshCw,
        section: 'primary',
        title: t('pill.replace'),
        onClick: (event) => {
          event.stopPropagation();
          void resourcePicker.fillImportNode();
        },
      });
    }

    if (importManagementActions.length > 0) {
      return [...importManagementActions, chat];
    }

    return [chat];
  }, [
    canExtractVideo,
    copied,
    executionStatus,
    handleAddToConversation,
    handleCopyText,
    handleDeconstructVideo,
    handleExtractAudio,
    handleExtractVideo,
    handleOpenTextStage,
    handleSpeechToText,
    handleSplitText,
    handleStoryboardVideo,
    isEmptyMediaNode,
    isGenerating,
    isOffline,
    isExtractingAudio,
    kind,
    materialType,
    mediaAssets,
    mediaUrl,
    nodeData.audioPath,
    nodeData.filePath,
    nodeData.realPath,
    nodeData.relativePath,
    previewUrl,
    resourcePicker,
    t,
  ]);

  const showReplaceButton =
    !isGenerating &&
    materialType !== 'text' &&
    !isOffline &&
    Boolean(previewUrl) &&
    (isHovered || selected) &&
    !isMultiSelected;

  // 多模态容量与降级判定（生成型节点 + 上游图片超过当前模型 max）
  const upstreams = useUpstreamMedia(id);
  const isDegraded = useMemo(() => {
    if (kind !== 'generate') return false;
    const modelId = (typeof nodeData.params?.model === 'string' && nodeData.params.model.trim())
      ? nodeData.params.model.trim()
      : (catalog?.defaults?.[materialType] ?? '');
    const modelCap = resolveModelInputCapability(modelId, catalog);
    const max = modelCap?.referenceImages?.max;
    if (typeof max !== 'number') return false;
    const imageCount = upstreams.filter(
      (u) => u.materialType === 'image' || (!u.materialType && u.hasMedia),
    ).length;
    return imageCount > max;
  }, [catalog, kind, materialType, nodeData.params?.model, upstreams]);

  const degradedWarning = useMemo(() => {
    if (!isDegraded) return undefined;
    const modelId = (typeof nodeData.params?.model === 'string' && nodeData.params.model.trim())
      ? nodeData.params.model.trim()
      : (catalog?.defaults?.[materialType] ?? '');
    const modelCap = resolveModelInputCapability(modelId, catalog);
    const max = modelCap?.referenceImages?.max;
    return t('model.compatibility.degradedWarning').replace('{max}', String(max ?? ''));
  }, [catalog, isDegraded, materialType, nodeData.params?.model, t]);

  const textBusy =
    generationStatus === 'pending' ||
    generationStatus === 'generating' ||
    generationStatus === 'failed';

  // 检查是否有上游表格或文本连线输入
  const upstreamTableOrText = useMemo(() => {
    return upstreams.find(
      (u) => ((u.materialType as string) === 'table' || u.materialType === 'text') && (u.hasMedia || Boolean(u.textContent)),
    );
  }, [upstreams]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      const trimmed = val.trim();
      if (trimmed) {
        updateNodeData({
          content: val,
          status: 'ready',
          nodeKind: 'import',
          selectedTool: 'text-editor',
          prompt: undefined,
          generatedContent: undefined,
        });
        return;
      }
      updateNodeData({
        content: '',
        status: 'empty',
        nodeKind: 'generate',
        generatedContent: undefined,
      });
    },
    [updateNodeData],
  );

  const handleTextPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (textEditing) return;
      const pasted = e.clipboardData?.getData('text');
      if (!pasted) return;

      const trimmed = pasted.trim();
      if (trimmed) {
        updateNodeData({
          content: pasted,
          status: 'ready',
          nodeKind: 'import',
          selectedTool: 'text-editor',
          prompt: undefined,
          generatedContent: undefined,
        });
      } else {
        updateNodeData({
          content: '',
          status: 'empty',
          nodeKind: 'generate',
          generatedContent: undefined,
        });
      }
      setTextEditing(true);
    },
    [textEditing, updateNodeData],
  );

  const textBody =
    effectiveTextContent || textEditing ? (
      <textarea
        className={`wf-material-node__text-editor nowheel${textEditing ? ' nodrag' : ''}`}
        readOnly={!textEditing}
        value={effectiveTextContent}
        placeholder={t('node.textPlaceholder')}
        autoFocus={textEditing}
        onMouseDown={(e) => {
          if (!textEditing) e.preventDefault();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          handleOpenTextStage();
        }}
        onFocus={() => setTextEditing(true)}
        onBlur={() => setTextEditing(false)}
        onChange={handleTextChange}
      />
    ) : upstreamTableOrText ? (
      <div className="wf-node-empty wf-node-empty--text nodrag" style={{ padding: '20px 16px', boxSizing: 'border-box' }}>
        <div className="wf-node-empty__icon-box">
          <FileSpreadsheet size={32} strokeWidth={1.75} className="wf-node-empty__icon" style={{ color: 'var(--dsw-alias-brand-primary, #C8F135)' }} />
        </div>
        <div className="wf-node-empty__try-label" style={{ color: 'var(--dsw-alias-brand-primary, #C8F135)', fontWeight: 600, fontSize: '12px' }}>
          {(upstreamTableOrText.materialType as string) === 'table'
            ? `已关联表格输入: ${upstreamTableOrText.label || '表格'}`
            : `已关联文本输入: ${upstreamTableOrText.label || '文本'}`}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--wb-text-muted)', textAlign: 'center', marginTop: 4, lineHeight: 1.4 }}>
          在下方底栏输入生成要求（可选），或直接点击生成执行
        </div>
        <div
          className="wf-node-empty__actions"
          style={{ marginTop: 12 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="wf-node-empty__pill-btn"
            onClick={() => setTextEditing(true)}
          >
            <span>手动改写内容</span>
          </button>
        </div>
      </div>
    ) : (
      <NodeEmptyState
        materialType="text"
        onStartEdit={() => setTextEditing(true)}
        onApplyPreset={handleApplyPreset}
      />
    );

  const handleMediaRetry = useCallback(() => {
    const isAudioExtract = materialType === 'audio' && (nodeData.origin === 'audio_extract' || nodeData.audioExtractActive === true);
    if (isAudioExtract) {
      void handleRetryAudioExtract();
      return;
    }
    if (materialType === 'audio' && nodeData.sttActive === true) {
      handleSpeechToText();
      return;
    }
    if (materialType === 'video' && nodeData.videoDeconstructActive === true) {
      handleDeconstructVideo();
      return;
    }
    if (materialType === 'video' && nodeData.videoStoryboardActive === true) {
      handleStoryboardVideo();
      return;
    }
    handleGenerate();
  }, [handleDeconstructVideo, handleGenerate, handleRetryAudioExtract, handleSpeechToText, handleStoryboardVideo, materialType, nodeData]);

  const handleOpenResourcePicker = useCallback(
    (requestOrMode?: SlotPickRequest | 'add' | 'replace', targetSlotIndex?: number) => {
      if (kind === 'import') {
        void resourcePicker.fillImportNode();
        return;
      }
      if (typeof requestOrMode === 'object' && requestOrMode !== null) {
        resourcePicker.openPicker('canvas', {
          slot: requestOrMode.targetSlot,
          acceptedTypes: requestOrMode.acceptedTypes,
          max: requestOrMode.max,
          replaceEdgeId: requestOrMode.replaceEdgeId,
        });
        return;
      }
      const pickerMode = typeof requestOrMode === 'string' ? requestOrMode : 'add';
      if (pickerMode === 'add' && targetSlotIndex === undefined) {
        resourcePicker.openPicker('canvas');
        return;
      }
      resourcePicker.openPicker('canvas', pickerMode, targetSlotIndex);
    },
    [kind, resourcePicker],
  );

  return (
    <div
      className={`wf-material-node ${materialType === 'audio' ? 'wf-material-node--audio' : ''} ${selected ? 'wf-material-node--selected' : ''}`}
      style={{ width: nodeWidth }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 顶部悬浮胶囊栏 */}
      {showFloatingPill && (
        <FloatingTopPill
          actions={pillActions}
          maxWidth={pillMaxWidthForNode(nodeWidth)}
        />
      )}

      {/* 左右两端连线桩与连线输出菜单 */}
      <MaterialNodeHandles
        nodeId={id}
        materialType={materialType}
        nodeHovered={isHovered}
      />

      {/* 节点标题：导入节点统一显示「导入素材」（非文本节点，音频优先展示专属音乐图标） */}
      <NodeHeader
        label={label}
        materialType={kind === 'import' && materialType !== 'text' ? 'import_asset' : materialType}
        customIcon={materialType === 'audio' ? Music : undefined}
        onLabelChange={(newLabel) => updateNodeData({ label: newLabel })}
        isDegraded={isDegraded}
        degradedWarning={degradedWarning}
        trailing={
          <StatusBadge
            executionStatus={executionStatus}
            status={status}
            isDegraded={isDegraded}
            degradedWarning={degradedWarning}
            simulated={simulated}
          />
        }
      />

      {/* 主内容卡片 */}
      <div
        className={`wf-material-node__card ${
          isDraggingOver ? 'wf-material-node__card--dragover' : ''
        }`}
        style={{
          width: nodeWidth,
          height: nodeHeight,
          position: 'relative',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 四角缩放定位点 */}
        <NodeCornerMarkers selected={Boolean(selected)} />

        {/* 媒体节点卡片内侧右上角「替换」按钮 */}
        {showReplaceButton && materialType !== 'audio' && (
          <button
            type="button"
            className="wf-material-node__replace-btn nodrag"
            onClick={(e) => {
              e.stopPropagation();
              void resourcePicker.fillImportNode();
            }}
            title={t('node.replace')}
            aria-label={t('node.replace')}
          >
            <RefreshCw size={12} className="wf-material-node__replace-icon" />
            <span>{t('node.replace')}</span>
          </button>
        )}

        {/* 1. 文本节点渲染（生成中走 GSC + OrganicShimmer，与图/视频/音频同款） */}
        {materialType === 'text' && (
          <div
            className={`wf-material-node__text-shell${textBusy ? ' wf-material-node__text-shell--gsc' : ''}`}
            style={textBusy ? { padding: 0 } : { padding: '12px 14px' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleOpenTextStage();
            }}
            onPaste={handleTextPaste}
          >
            {generationStatus ? (
              <GenerationStateContainer
                status={generationStatus}
                loadingAspectRatio="auto"
                errorMessage={executionError ?? errorMessage}
                taskId={nodeData.taskId}
                onRetry={handleGenerate}
              >
                {textBody}
              </GenerationStateContainer>
            ) : (
              textBody
            )}
          </div>
        )}

        {/* 2. 媒体节点渲染 */}
        {materialType !== 'text' && (
          <MediaCardBody
            materialType={materialType}
            nodeData={nodeData}
            isOffline={isOffline}
            generationStatus={generationStatus}
            loadingAspectRatio={loadingAspectRatio}
            executionError={executionError}
            errorMessage={errorMessage}
            previewUrl={previewUrl}
            mediaAssets={mediaAssets}
            mediaUrl={mediaUrl}
            label={label}
            status={status}
            audioWorkspaceId={audioWorkspaceId}
            isMultiSelected={isMultiSelected}
            isGenerating={isGenerating}
            kind={kind}
            onMediaSizeChange={handleMediaSizeChange}
            onDurationChange={handleDurationChange}
            onSaveAudio={audioWorkspaceId ? handleSaveAudio : undefined}
            onRetry={handleMediaRetry}
            onApplyPreset={handleApplyPreset}
            onReplaceAudio={!isMultiSelected && !isGenerating ? () => { void resourcePicker.fillImportNode(); } : undefined}
            onImport={kind === 'import' ? () => { void resourcePicker.fillImportNode(); } : undefined}
            onRelink={(mType) => void resourcePicker.relinkLocalFile(mType)}
          />
        )}

        {/* 文本节点错误提示：GSC failed 分支已自带错误 UI，仅兜底未进 GSC 的残差 */}
        {materialType === 'text' &&
          !generationStatus &&
          (errorMessage || executionError) && (
          <div className="wf-material-node__error">{executionError ?? errorMessage}</div>
        )}
      </div>

      {/* 配置面板（SRT 字幕节点防御性不渲染，闸门见 isConfigPanelVisible） */}
      {panelVisible && !isSrtSubtitle && (
        <ConfigPanelShell>
          <ConfigPanel
            nodeId={id}
            nodeData={nodeData}
            catalog={catalog}
            onUpdateNodeData={updateNodeData}
            onGenerate={handleGenerate}
            execBusy={execBusy}
            onOpenResourcePicker={handleOpenResourcePicker}
          />
        </ConfigPanelShell>
      )}

      <ResourcePickerModal
        key={JSON.stringify([nodeData.__workspaceId, id, resourcePicker.sessionId])}
        open={resourcePicker.open}
        nodeId={id}
        initialTab={resourcePicker.initialTab}
        slotTarget={resourcePicker.slotTarget}
        mode={resourcePicker.mode}
        targetSlotIndex={resourcePicker.targetSlotIndex}
        slotState={nodeData.slotState as NodeSlotEngineState | undefined}
        onCancel={resourcePicker.closePicker}
        onCommit={resourcePicker.commit}
      />
    </div>
  );
};

export default memo(MaterialNode);
