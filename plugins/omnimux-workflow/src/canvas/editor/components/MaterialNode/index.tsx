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
import { Check, Copy, FileEdit, Layers, MessageSquarePlus, RefreshCw, Unlink, Upload } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import type { MaterialNodeData, MaterialType, MaterialTool } from '../../../types/materialNode';
import { resolveNodeKind } from '../../../types/materialNode';
import { readCurrentText } from '../../../../shared/graph/nodeInputSource';
import CanvasNodeHandle, { type CanvasNodeHandleSelectMeta } from '../CanvasNodeHandle';
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
  hasNodeMaterial,
  isEmptyImageGenerateNode,
  pillMaxWidthForNode,
  shouldShowNodeToolbar,
} from '../../utils/nodeToolbarLogic';
import { getOutputOptionSpecs, parseOutputOptionKey } from '../../utils/connectionMenuOptions';
import { createMaterialNode } from '../../utils/nodeFactory';
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

  const { setNodes } = useReactFlow();

  const execBusy = useExecutionStore((state) => state.status === 'pending' || state.status === 'running');
  const isMultiSelected = useIsMultiSelected();

  const nodeWidth = nodeData.nodeWidth ?? getDefaultNodeWidth(materialType);
  const sizeCategory = getNodeSizeCategory(materialType);
  const defaultCalculatedHeight = calculateNodeHeight(nodeWidth, sizeCategory);
  const nodeHeight = mediaAspectHeight ?? nodeData.nodeHeight ?? defaultCalculatedHeight;

  const updateNodeData = useCallback(
    (updates: Partial<MaterialNodeData>) => {
      setNodes((nodes) =>
        nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...updates } } : n)),
      );
    },
    [id, setNodes],
  );

  // 媒体素材宽高自适应计算
  const handleMediaSizeChange = useCallback(
    (naturalWidth: number, naturalHeight: number) => {
      if (naturalWidth > 0 && naturalHeight > 0) {
        const aspect = naturalWidth / naturalHeight;
        const targetHeight = Math.max(80, Math.min(800, Math.round(nodeWidth / aspect)));
        setMediaAspectHeight(targetHeight);
        if (nodeData.nodeHeight !== targetHeight) {
          updateNodeData({ nodeHeight: targetHeight });
        }
      }
    },
    [nodeData.nodeHeight, nodeWidth, updateNodeData],
  );

  const handleGenerate = useCallback(() => {
    const kind = resolveNodeKind(nodeData);
    if (kind === 'generate') {
      const currentTool = nodeData.selectedTool;
      const defaultGenTools: Record<MaterialType, MaterialTool> = {
        text: 'text-to-text',
        image: 'text-to-image',
        video: 'video-generation',
        audio: 'text-to-audio',
      };
      if (!currentTool || currentTool === 'text-editor') {
        updateNodeData({
          selectedTool: defaultGenTools[materialType],
        });
      }
    }
    const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined;
    if (quota && typeof quota.ensureQuota === 'function') {
      void Promise.resolve(quota.ensureQuota({ capability: 'canvas', correlationId: id })).then((gate: { ok?: boolean } | undefined) => {
        if (gate && gate.ok === false) return;
        useExecutionStore.getState().startNodeExecution?.(id);
      });
      return;
    }
    useExecutionStore.getState().startNodeExecution?.(id);
  }, [id, materialType, nodeData, updateNodeData]);

  const t = useT();
  const applyCanvasInputMutation = useCanvasStore((state) => state.applyCanvasInputMutation);
  const resourcePicker = useResourcePicker(id, typeof nodeData.__workspaceId === 'string' ? nodeData.__workspaceId : null);
  const kind = resolveNodeKind(nodeData);

  const outputMenuOptions = useMemo(
    () =>
      getOutputOptionSpecs(materialType).map((spec) => ({
        key: spec.key,
        label: t(spec.labelKey),
        description: t(spec.descKey),
        icon: spec.icon,
      })),
    [materialType, t],
  );

  const handleOutputMenuSelect = useCallback(
    (key: string, meta?: CanvasNodeHandleSelectMeta) => {
      const parsed = parseOutputOptionKey(key);
      const position = meta?.flowPosition;
      if (!parsed || !position) return;
      const result = createMaterialNode(parsed.targetMaterialType, position);
      const newNode = result.nodes[0];
      if (!newNode) return;
      applyCanvasInputMutation({
        addNodes: result.nodes,
        addEdges: [
          { source: id, sourceHandle: 'out', target: newNode.id, targetHandle: 'in' },
        ],
      });
    },
    [applyCanvasInputMutation, id],
  );

  const effectiveTextContent = readCurrentText(data as Record<string, unknown>);
  const isOffline = status === 'offline' || nodeData.isMissing === true;
  const previewUrl = resolveMediaPreviewUrl(materialType, mediaAssets, mediaUrl);
  // 文本节点用正文是否存在判定 hasResult；媒体节点用 previewUrl。
  // 否则文本生成中/完成后 generationStatus 永远落不到 GSC，彩色动效不会出现。
  const hasResult =
    materialType === 'text'
      ? Boolean(effectiveTextContent.trim())
      : Boolean(previewUrl);
  const generationStatus = isOffline
    ? null
    : mapNodeToGenerationStatus(executionStatus, status, hasResult);
  const isEmptyImageNode = isEmptyImageGenerateNode({
    materialType,
    nodeKind: kind,
    previewUrl,
    generationStatus,
  });

  // 预设注入：写 prompt + 单选当前节点（空态按钮 nodrag 拦掉了 RF 选中手势）
  const handleApplyPreset = useCallback(
    (presetKey: string) => {
      if (materialType === 'text') {
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
        };
        setNodes((nodes) => planSelectAndPatchNode(nodes, id, updates));
        useCanvasStore.getState().setSelectedElement('node', id);
      }
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

  // 拖拽文件进入：导入素材节点与空状态生图节点均接受本地文件
  const canAcceptDrop = kind === 'import' || isEmptyImageNode;

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
      const drafts = files
        .map((file) => {
          const path = nativePathOf(file);
          return path
            ? draftFromRealPath(path, { name: file.name, mime: file.type, size: file.size })
            : null;
        })
        .filter((draft): draft is NonNullable<typeof draft> => Boolean(draft));
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
    if (effectiveTextContent) {
      navigator.clipboard.writeText(effectiveTextContent).catch(() => {});
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
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

  const panelVisible = isConfigPanelVisible(
    selected,
    executionStatus,
    kind,
    isMultiSelected,
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
  const showFloatingPill = shouldShowNodeToolbar({
    hasMaterial,
    hovered: isHovered,
    selected,
    isMultiSelected,
    allowEmpty: isEmptyImageNode,
  });

  const { addToConversation } = useAddToConversation();

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
          variant: 'primary',
          title: t('pill.importImage'),
          onClick: (event) => {
            event.stopPropagation();
            resourcePicker.fillImportNode();
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

    return [chat];
  }, [
    copied,
    handleAddToConversation,
    handleCopyText,
    handleOpenTextStage,
    handleSplitText,
    isEmptyImageNode,
    kind,
    materialType,
    resourcePicker,
    t,
  ]);

  const showReplaceButton =
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
        onChange={(e) =>
          updateNodeData({
            content: e.target.value,
            status: e.target.value.trim() ? 'ready' : 'empty',
            generatedContent: undefined,
          })
        }
      />
    ) : (
      <NodeEmptyState
        materialType="text"
        onStartEdit={handleOpenTextStage}
        onApplyPreset={handleApplyPreset}
      />
    );

  return (
    <div
      className={`wf-material-node ${selected ? 'wf-material-node--selected' : ''}`}
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

      {/* 输入 Handle */}
      <CanvasNodeHandle side="left" nodeHovered={isHovered} />

      {/* 节点标题：导入节点统一显示「导入素材」 */}
      <NodeHeader
        label={label}
        materialType={kind === 'import' ? 'import_asset' : materialType}
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
        {selected && (
          <>
            <span className="wf-node-corner wf-node-corner--tl" />
            <span className="wf-node-corner wf-node-corner--tr" />
            <span className="wf-node-corner wf-node-corner--bl" />
            <span className="wf-node-corner wf-node-corner--br" />
          </>
        )}

        {/* 媒体节点卡片内侧右上角「替换」按钮 */}
        {showReplaceButton && (
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
        {materialType !== 'text' && isOffline && (
          <div className="wf-material-node__media wf-media-offline">
            <Unlink size={22} className="wf-media-offline__icon" />
            <div className="wf-media-offline__title">{t('node.offline')}</div>
            <div className="wf-media-offline__hint">{t('node.offlineHint')}</div>
            <button
              type="button"
              className="wf-media-offline__relink nodrag"
              onClick={() => void resourcePicker.relinkLocalFile(materialType)}
            >
              {t('node.relink')}
            </button>
          </div>
        )}
        {materialType !== 'text' && !isOffline &&
          (generationStatus ? (
            <div className="wf-material-node__media">
              <GenerationStateContainer
                status={generationStatus}
                loadingAspectRatio={loadingAspectRatio}
                errorMessage={executionError ?? errorMessage}
                taskId={nodeData.taskId}
                onRetry={handleGenerate}
              >
                {previewUrl ? (
                  <MediaPreview
                    materialType={materialType}
                    mediaAssets={mediaAssets}
                    mediaUrl={mediaUrl}
                    label={label}
                    status={status}
                    isMissing={nodeData.isMissing === true}
                    onMediaSizeChange={handleMediaSizeChange}
                  />
                ) : (
                  <NodeEmptyState
                    materialType={materialType}
                    nodeKind={nodeData.nodeKind ?? (nodeData.selectedTool === 'import' ? 'import' : 'generate')}
                    onApplyPreset={handleApplyPreset}
                    onImport={kind === 'import' ? () => { void resourcePicker.fillImportNode(); } : undefined}
                  />
                )}
              </GenerationStateContainer>
            </div>
          ) : (
            <div className="wf-material-node__media">
              <NodeEmptyState
                materialType={materialType}
                nodeKind={nodeData.nodeKind ?? (nodeData.selectedTool === 'import' ? 'import' : 'generate')}
                onApplyPreset={handleApplyPreset}
                onImport={kind === 'import' ? () => { void resourcePicker.fillImportNode(); } : undefined}
              />
            </div>
          ))}

        {/* 文本节点错误提示：GSC failed 分支已自带错误 UI，仅兜底未进 GSC 的残差 */}
        {materialType === 'text' &&
          !generationStatus &&
          (errorMessage || executionError) && (
          <div className="wf-material-node__error">{executionError ?? errorMessage}</div>
        )}
      </div>

      {/* 配置面板 */}
      {panelVisible && (
        <ConfigPanelShell>
          <ConfigPanel
            nodeId={id}
            nodeData={nodeData}
            catalog={catalog}
            onUpdateNodeData={updateNodeData}
            onGenerate={handleGenerate}
            execBusy={execBusy}
            onOpenResourcePicker={(requestOrMode, targetSlotIndex) => {
              if (kind === 'import') {
                void resourcePicker.fillImportNode();
                return;
              }
              if (typeof requestOrMode === 'object' && requestOrMode !== null) {
                resourcePicker.openPicker('canvas', {
                  slot: requestOrMode.targetSlot,
                  acceptedTypes: requestOrMode.acceptedTypes,
                  max: requestOrMode.max,
                });
                return;
              }
              const pickerMode = typeof requestOrMode === 'string' ? requestOrMode : 'add';
              if (pickerMode === 'add' && targetSlotIndex === undefined) {
                resourcePicker.openPicker('canvas');
                return;
              }
              resourcePicker.openPicker('canvas', pickerMode, targetSlotIndex);
            }}
          />
        </ConfigPanelShell>
      )}

      {/* 输出 Handle */}
      <CanvasNodeHandle
        side="right"
        nodeHovered={isHovered}
        options={outputMenuOptions}
        onSelect={handleOutputMenuSelect}
      />

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
