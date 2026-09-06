/**
 * ConfigPanel — 统一材质创作底栏（Issue 467 / W2）。
 *
 * Contract-driven:
 *   - model picker = only compatible (acceptsCurrentInputs) rows; Hide, Don't Grey
 *   - text adapts its operation automatically; other outputs show genuine model modes
 *   - writes canonical params.operation only
 *   - zero candidates → empty state + block generate with typed reason
 *   - Whisper / unlisted ASR never enter the DOM
 */

import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Plus,
  SlidersHorizontal,
  Music,
  Play,
  FileText,
  Image as ImageIcon,
  X,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import type { MaterialNodeData } from '../../../../types/materialNode';
import { resolveNodeKind } from '../../../../types/materialNode';
import type { CapabilityCatalog, CapabilityModelItem } from '../../../../../shared/api';
import { useT } from '../../../../i18n';
import { CustomSelect, CustomSlider, toast } from '../../../../ui';
import { rememberGenerationModel } from '../../../../store/generationPreferencesStore';
import { generationReasonText } from '../../../../i18n/generationReason';
import { resolveGenerationPrompt } from '../../../../../shared/graph/generationPrompt';
import { ModelBrandIcon } from '../../../../ui/ModelBrandIcon';
import { useCanvasStore } from '../../../../store/canvasStore';
import { useUpstreamMedia, toUpstreamSnapshots } from '../../../hooks/useUpstreamMedia';
import { useModelParameterSchema, getCachedCatalog } from '../../../hooks/useModelParameterSchema';
import { resolveNodeLifecycle } from '../../../utils/nodeMaterialLifecycle';
import GenerateButton from './GenerateButton';
import { VideoTriggerBar } from './videoParams/VideoTriggerBar';
import { VideoParamPopover } from './videoParams/VideoParamPopover';
import {
  applyPendingVideoParamAdjustment,
  buildVideoParamTransition,
  keepCurrentVideoParamValues,
  readPendingVideoParamAdjustment,
  resolveEffectiveVideoParams,
  validateVideoParamsForUi,
} from './videoParams/videoParamAdapter';
import {
  buildEffectiveOpsUiState,
  buildFilteredModelOptions,
  buildUiUpstreamFingerprint,
  setParamsOperation,
  readPreferredOperationId,
  shouldRenderModeUi,
} from '../../../../../shared/validation/operationUi.ts';
import { OperationSegment } from './videoParams/SegmentControls';

export interface ConfigPanelProps {
  nodeId: string;
  nodeData: MaterialNodeData;
  catalog: CapabilityCatalog | null;
  onUpdateNodeData: (updates: Partial<MaterialNodeData>) => void;
  onGenerate: () => void;
  /** 全图/其他节点执行中（禁用执行入口） */
  execBusy: boolean;
  onOpenResourcePicker?: () => void;
}

function getModelVisuals(id: string) {
  const icon = <ModelBrandIcon modelId={id} size={15} />;

  if (id.startsWith('nanobanana')) {
    return { icon, badge: 'Yearly -20%', subtitle: 'auto-4K' };
  }
  if (id.startsWith('seedream')) {
    const subtitle = id.includes('5.0') || id.includes('5-0') ? '1K-2K' : '2K-4K';
    return { icon, badge: 'Yearly -20%', subtitle };
  }
  if (id.startsWith('midjourney')) {
    const subtitle = id.includes('8.1') || id.includes('8-1') ? '2K' : '1080P';
    return { icon, badge: 'Yearly -20%', subtitle };
  }
  if (id.startsWith('gpt-image') || id.startsWith('openai')) {
    return { icon, badge: 'Yearly -20%', subtitle: '1k-4k' };
  }
  if (id.startsWith('kling')) {
    let subtitle = '1080P · ⏱ 3-10s';
    if (id === 'kling-o3') subtitle = '4K · ⏱ 3-15s · 🔊';
    else if (id === 'kling-avatar') subtitle = 'Digital Human';
    else if (id === 'kling-motion-control') subtitle = '1080P';
    return { icon, subtitle };
  }
  if (id.startsWith('wan')) {
    return { icon, subtitle: '720P-1080P · ⏱ 5-15s · 🔊' };
  }
  if (id.startsWith('veo')) {
    return { icon, subtitle: '720p-1080p · ⏱ 8s' };
  }
  return { icon };
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({
  nodeId,
  nodeData,
  catalog,
  onUpdateNodeData,
  onGenerate,
  execBusy,
  onOpenResourcePicker,
}) => {
  const t = useT();
  const { materialType, selectedTool, params, prompt } = nodeData;
  const kind = resolveNodeKind(nodeData);

  const [isExpanded, setIsExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  const videoTriggerRef = useRef<HTMLDivElement | null>(null);

  const upstreams = useUpstreamMedia(nodeId);
  const upstreamSnapshots = useMemo(() => toUpstreamSnapshots(upstreams), [upstreams]);
  const activeCatalog = catalog ?? getCachedCatalog();

  // 导入类节点：仅资源概览与替换入口
  if (kind === 'import') {
    return (
      <div className="wf-config-panel wf-config-panel--import">
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--dsw-alias-label-secondary, var(--wb-text-secondary))' }}>
              {t('panel.hintImportNode')}
            </span>
            {Boolean(nodeData.realPath) && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--dsw-alias-label-tertiary, var(--wb-text-muted))',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '240px',
                }}
                title={String(nodeData.realPath)}
              >
                {String(nodeData.realPath).split('/').pop()}
              </span>
            )}
          </div>
          {onOpenResourcePicker && (
            <button
              type="button"
              className="wf-param-pill wf-param-pill--btn"
              style={{ padding: '4px 10px', height: '28px' }}
              onClick={onOpenResourcePicker}
            >
              <span>{t('node.replace')}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const isAsrTool = selectedTool === 'audio-transcription';

  const handleUnbind = useCallback(
    (upstreamNodeId: string, edgeId?: string) => {
      const state = useCanvasStore.getState();
      const edgeIdsToRemove = state.edges
        .filter((edge) => edge.target === nodeId && (edgeId ? edge.id === edgeId : edge.source === upstreamNodeId))
        .map((edge) => edge.id);
      if (edgeIdsToRemove.length > 0) {
        state.applyCanvasInputMutation({ removeEdgeIds: edgeIdsToRemove });
      }
    },
    [nodeId],
  );

  const handleMoveUpstream = useCallback((edgeId: string, direction: -1 | 1) => {
    const state = useCanvasStore.getState();
    const inbound = state.edges.filter((edge) => edge.target === nodeId);
    const index = inbound.findIndex((edge) => edge.id === edgeId);
    const other = inbound[index + direction];
    const current = inbound[index];
    if (!current || !other) return;
    const currentIndex = state.edges.findIndex((edge) => edge.id === current.id);
    const otherIndex = state.edges.findIndex((edge) => edge.id === other.id);
    if (currentIndex < 0 || otherIndex < 0) return;
    state.pushHistory();
    state.setEdges((edges) => {
      const next = [...edges];
      [next[currentIndex], next[otherIndex]] = [next[otherIndex]!, next[currentIndex]!];
      return next;
    });
  }, [nodeId]);

  const localPrompt = resolveGenerationPrompt(nodeData);

  // The fingerprint composes source content once, using the same resolver as execution.
  const fingerprint = useMemo(
    () => buildUiUpstreamFingerprint({ materialType, prompt: nodeData.prompt, content: nodeData.content, nodeFields: params, upstreams: upstreamSnapshots }),
    [params, materialType, nodeData.prompt, nodeData.content, upstreamSnapshots],
  );

  // ASR (speech_to_text) uses outputType 'text' even on a text node with audio upstream.
  const outputTypeForCompat = isAsrTool ? 'text' : materialType;

  // ---- Filtered model list (Hide, Don't Grey) ----
  // The shared kernel applies canvas model policy and input compatibility.
  const filteredModels = useMemo(
    () => buildFilteredModelOptions({
      catalog: activeCatalog,
      fingerprint,
      outputType: outputTypeForCompat,
    }),
    [activeCatalog, fingerprint, outputTypeForCompat],
  );

  const modelOptions = useMemo(() => {
    // Only compatible rows enter the DOM. No disabled greys for incompatible /
    // unlisted / Whisper-when-not-listed models.
    return filteredModels.options.map((row) => {
      const visuals = getModelVisuals(row.id);
      const icon = visuals.icon;
      const badge = row.badge ?? visuals.badge;
      const subtitle = row.subtitle ?? visuals.subtitle;
      return {
        value: row.id,
        label: row.label,
        triggerLabel: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {icon ? <span style={{ display: 'inline-flex', opacity: 0.8 }}>{icon}</span> : null}
            <span>{row.label}</span>
          </span>
        ),
        icon,
        badge,
        subtitle,
        // Never mark compatible rows disabled — Hide, Don't Grey.
        disabled: false,
      };
    });
  }, [filteredModels.options]);

  // The picker reflects the exact model the executor receives. Catalog
  // reconciliation owns replacement of stale saved ids; the UI never renders
  // a different default without writing it back to params.
  const modelValue = typeof params.model === 'string' ? params.model.trim() : '';

  const {
    schema,
    modelItem,
    aspectRatioOptions,
    defaultAspectRatio,
    isAspectRatioValid,
    defaultDuration,
    isDurationValid,
  } = useModelParameterSchema(materialType, modelValue, catalog);

  const updateParam = useCallback(
    (key: string, value: unknown) => {
      if (key === 'operation') {
        if (materialType === 'video' && modelItem) {
          const transition = buildVideoParamTransition(
            params as Record<string, unknown>,
            modelItem,
            {
              catalog: activeCatalog,
              upstreams: upstreamSnapshots,
              prompt: localPrompt,
              nextOperationId: typeof value === 'string' ? value : undefined,
            },
          );
          onUpdateNodeData({ params: transition.params });
        } else {
          const next = setParamsOperation(
            params as Record<string, unknown>,
            typeof value === 'string' ? value : undefined,
          );
          onUpdateNodeData({ params: next });
        }
        return;
      }
      onUpdateNodeData({ params: { ...params, [key]: value } });
    },
    [activeCatalog, materialType, modelItem, onUpdateNodeData, params, localPrompt, upstreamSnapshots],
  );

  // Effective ops for the currently selected model (all modalities).
  const preferredOperationId = readPreferredOperationId(params as Record<string, unknown>);
  const opsState = useMemo(
    () => buildEffectiveOpsUiState({
      catalog: activeCatalog,
      modelId: modelValue,
      fingerprint,
      ...(preferredOperationId ? { preferredOperationId } : {}),
      outputType: outputTypeForCompat,
    }),
    [activeCatalog, modelValue, fingerprint, preferredOperationId, outputTypeForCompat],
  );
  const showModeUi = shouldRenderModeUi(opsState);

  // 视频节点的有效参数（contract-driven operation + schema scrubbing）
  const videoEffectiveParams = useMemo(
    () =>
      materialType === 'video'
        ? resolveEffectiveVideoParams({
            params,
            schema,
            modelItem,
            catalog: activeCatalog,
            upstreams: upstreamSnapshots,
            prompt: localPrompt,
          })
        : null,
    [materialType, params, schema, modelItem, activeCatalog, upstreamSnapshots, localPrompt],
  );

  const handleModelChange = useCallback(
    (newModelId: string) => {
      const modelList = (activeCatalog?.[materialType] ?? []) as CapabilityModelItem[];
      const newModelItem = modelList.find((m) => m.id === newModelId);
      if (materialType === 'video' && newModelItem) {
        const transition = buildVideoParamTransition(params as Record<string, unknown>, newModelItem, {
          catalog: activeCatalog,
          upstreams: upstreamSnapshots,
          prompt: localPrompt,
        });
        onUpdateNodeData({ params: transition.params });
      } else {
        const nextOps = buildEffectiveOpsUiState({
          catalog: activeCatalog,
          modelId: newModelId,
          fingerprint,
          outputType: outputTypeForCompat,
        });
        onUpdateNodeData({ params: setParamsOperation(
          { ...params, model: newModelId },
          nextOps.effectiveOps.find((op) => op.id === preferredOperationId && op.ready)?.id
            ?? nextOps.selectedOperationId,
        ) });
      }
      void rememberGenerationModel(materialType, newModelId).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : t('panel.preferenceSaveFailed'));
      });
    },
    [activeCatalog, materialType, onUpdateNodeData, params, upstreamSnapshots, localPrompt, fingerprint, outputTypeForCompat, preferredOperationId, t],
  );

  const isMusicOperation = opsState.selectedOperationId === 'text_to_music';

  const placeholder = useMemo(() => {
    if (isAsrTool) return t('panel.promptPlaceholder');
    if (materialType !== 'audio' && upstreams.some((item) => item.materialType === 'text' && item.hasMedia)) return '补充要求（可选）';
    switch (materialType) {
      case 'text':
        return t('panel.textPromptPlaceholder');
      case 'image':
        return t('panel.imagePromptPlaceholder');
      case 'video':
        return t('panel.videoPromptPlaceholder');
      case 'audio':
        return isMusicOperation
          ? t('panel.musicPromptPlaceholder')
          : t('panel.audioPromptPlaceholder');
      default:
        return t('panel.promptPlaceholder');
    }
  }, [materialType, isMusicOperation, isAsrTool, upstreams, t]);

  const aspectRatioValue =
    typeof params.aspectRatio === 'string' && isAspectRatioValid(params.aspectRatio)
      ? params.aspectRatio
      : defaultAspectRatio;

  const durationValue =
    typeof params.duration === 'number' && isDurationValid(params.duration)
      ? params.duration
      : defaultDuration;

  const pendingVideoParamAdjustment = useMemo(
    () => readPendingVideoParamAdjustment(params as Record<string, unknown>),
    [params],
  );

  const videoValidationErrors = useMemo(
    () => materialType === 'video' && videoEffectiveParams
      ? validateVideoParamsForUi({
          prompt: localPrompt,
          rawParams: params as Record<string, unknown>,
          params: videoEffectiveParams,
          upstreams: upstreamSnapshots,
        })
      : [],
    [materialType, localPrompt, params, upstreamSnapshots, videoEffectiveParams],
  );

  // Generate gate: blocked when zero effective ops / zero candidates / configuration_error.
  const nodeCompat = (nodeData as Record<string, unknown>).compat as
    | { status?: string; readyToSubmit?: boolean; reasonCodes?: string[]; adaptation?: { toModelLabel: string; inputTypes: string[] } }
    | undefined;
  const blockGenerate =
    opsState.blockGenerate
    || filteredModels.zeroCandidates
    || nodeCompat?.status === 'configuration_error'
    || videoValidationErrors.length > 0
    || Boolean(pendingVideoParamAdjustment)
    || execBusy;
  const reasonCode = opsState.reasonCode || filteredModels.reasonCode
    || (nodeCompat?.status === 'configuration_error' ? nodeCompat.reasonCodes?.[0] || 'no_compatible_model' : undefined);
  const blockReason =
    generationReasonText(t, reasonCode, opsState.reason || filteredModels.reason)
    || pendingVideoParamAdjustment?.notices[0]
    || videoValidationErrors[0];
  const quietReason = reasonCode === 'prompt_required' || reasonCode === 'catalog_unavailable';
  const adaptation = nodeCompat?.adaptation;
  const adaptationInputs = adaptation?.inputTypes.map((type) => t(`node.type.${type}`)).join('、');
  const adaptationMessage = adaptation
    ? t(adaptationInputs ? 'panel.adaptedModel' : 'panel.adaptedModelGeneric')
      .replace('{model}', adaptation.toModelLabel)
      .replace('{inputs}', adaptationInputs ?? '')
    : undefined;

  const showEmptyModels = filteredModels.zeroCandidates || modelOptions.length === 0;

  return (
    <div className="wf-config-panel" data-effective-ops={opsState.count}>
      {adaptationMessage ? (
        <div className="wf-config-panel__input-hint" role="status" data-testid="wf-model-adaptation">
          {adaptationMessage}
        </div>
      ) : null}

      {quietReason && blockReason ? (
        <div className="wf-config-panel__input-hint" role="status" data-testid="wf-input-hint">
          {blockReason}
        </div>
      ) : null}

      {/* Configuration / zero-candidate error banner */}
      {!quietReason && (opsState.blockGenerate || showEmptyModels || nodeCompat?.status === 'configuration_error') && blockReason ? (
        <div
          className="wf-config-panel__compat-error"
          role="alert"
          data-testid="wf-compat-error"
          data-reason-code={reasonCode || 'no_compatible_model'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--dsw-alias-label-primary)',
            background: 'var(--dsw-alias-bg-secondary)',
            borderRadius: 8,
            margin: '8px 12px 0',
          }}
        >
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{blockReason}</span>
        </div>
      ) : null}

      {videoValidationErrors.length > 0 && !opsState.blockGenerate && !showEmptyModels ? (
        <div className="wf-config-panel__validation-list" role="alert" data-testid="wf-video-validation-errors">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{videoValidationErrors.join('；')}</span>
        </div>
      ) : null}

      {pendingVideoParamAdjustment ? (
        <div className="wf-config-panel__param-notice" role="alert" data-testid="wf-video-param-notice">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{pendingVideoParamAdjustment.notices.join('；')}</span>
          <div className="wf-config-panel__param-notice-actions">
            <button
              type="button"
              className="wf-config-panel__param-notice-action"
              onClick={() => onUpdateNodeData({
                params: applyPendingVideoParamAdjustment(params as Record<string, unknown>),
              })}
            >
              确认调整
            </button>
            <button
              type="button"
              className="wf-config-panel__param-notice-action wf-config-panel__param-notice-action--secondary"
              onClick={() => onUpdateNodeData({
                params: keepCurrentVideoParamValues(params as Record<string, unknown>),
              })}
            >
              保留原值
            </button>
          </div>
        </div>
      ) : null}

      {/* 2. Prompt 输入区容器 */}
      <div className="wf-config-panel__prompt-container">
        <div className="wf-config-panel__prompt-header">
          {upstreams.length > 0 || onOpenResourcePicker ? (
            <div className="wf-config-panel__ref-slots-group" data-testid="wf-slot-cards">
              {upstreams.map((item, index) => (
                <div
                  key={item.edgeId ?? item.nodeId}
                  className={`wf-config-panel__ref-thumb-slot ${
                    item.hasMedia ? 'wf-config-panel__ref-thumb-slot--ready' : ''
                  }`}
                  title={item.availabilityMessage ?? `${item.label}：${item.textContent?.slice(0, 120) || '使用当前选定结果'}`}
                  data-input-availability={item.availability}
                  data-mime={item.mimeType ?? 'unknown'}
                  data-size-bytes={item.sizeBytes ?? 'unknown'}
                  data-duration-sec={item.durationSec ?? 'unknown'}
                  data-reference-order={index + 1}
                  data-reference-role={item.role ?? 'auto'}
                >
                  {item.url && item.materialType === 'image' ? (
                    <img
                      src={item.url}
                      alt={item.label}
                      className="wf-config-panel__ref-thumb-media"
                    />
                  ) : item.url && item.materialType === 'video' ? (
                    <div className="wf-config-panel__ref-thumb-video-box">
                      <video src={item.url} className="wf-config-panel__ref-thumb-media" muted />
                      <Play size={10} className="wf-config-panel__ref-thumb-overlay-icon" />
                    </div>
                  ) : item.materialType === 'audio' ? (
                    <div className="wf-config-panel__ref-thumb-icon-box wf-config-panel__ref-thumb-icon-box--audio">
                      <Music size={13} />
                    </div>
                  ) : item.materialType === 'text' ? (
                    <div className="wf-config-panel__ref-thumb-icon-box wf-config-panel__ref-thumb-icon-box--text">
                      <FileText size={13} />
                    </div>
                  ) : (
                    <div className="wf-config-panel__ref-thumb-icon-box">
                      <ImageIcon size={13} />
                    </div>
                  )}

                  {item.hasMedia && <span className="wf-config-panel__ref-thumb-dot" />}

                  <span className="wf-config-panel__ref-thumb-order" title={item.role ?? `素材 ${index + 1}`}>
                    {item.role === 'first_frame' ? '首' : item.role === 'last_frame' ? '尾' : index + 1}
                  </span>

                  {item.edgeId && upstreams.length > 1 ? (
                    <span className="wf-config-panel__ref-thumb-sort">
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`将素材 ${index + 1} 前移`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleMoveUpstream(item.edgeId!, -1);
                        }}
                      >
                        <ArrowLeft size={8} />
                      </button>
                      <button
                        type="button"
                        disabled={index === upstreams.length - 1}
                        aria-label={`将素材 ${index + 1} 后移`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleMoveUpstream(item.edgeId!, 1);
                        }}
                      >
                        <ArrowRight size={8} />
                      </button>
                    </span>
                  ) : null}

                  <button
                    type="button"
                    className="wf-config-panel__ref-thumb-unbind nodrag"
                    title={t('edge.disconnect')}
                    aria-label={t('edge.disconnect')}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnbind(item.nodeId, item.edgeId);
                    }}
                  >
                    <X size={8} />
                  </button>
                </div>
              ))}
              {onOpenResourcePicker ? (
                <button
                  type="button"
                  className="wf-config-panel__add-ref-btn"
                  onClick={onOpenResourcePicker}
                  title={t('picker.addRef')}
                >
                  <Plus size={14} />
                </button>
              ) : null}
            </div>
          ) : (
            <span />
          )}

          <div className="wf-config-panel__prompt-header-actions">
            <button
              type="button"
              className="wf-config-panel__expand-btn"
              onClick={() => setIsExpanded((prev) => !prev)}
              title={isExpanded ? t('panel.collapse') : t('panel.expand')}
            >
              {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>
        </div>

        <textarea
          className={`wf-config-panel__prompt-input nowheel nodrag${
            isExpanded ? ' wf-config-panel__prompt-input--expanded' : ''
          }`}
          value={prompt ?? ''}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={isExpanded ? 8 : 2}
          onChange={(e) => onUpdateNodeData({ prompt: e.target.value })}
        />
      </div>

      {/* 3. 底部参数与操作底栏 */}
      <div className="wf-config-panel__bottom-bar">
        <div className="wf-config-panel__params-group">
          {/* 模型下拉：仅兼容模型；零候选显示空态 */}
          {showEmptyModels ? (
            <div
              className="wf-param-pill wf-param-pill--empty-models"
              data-testid="wf-model-empty"
              role="status"
              aria-live="polite"
              style={{
                height: 32,
                borderRadius: 8,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 12,
                color: 'var(--dsw-alias-label-secondary)',
              }}
            >
              {t(reasonCode === 'catalog_unavailable' ? 'panel.reason.catalog_unavailable' : isAsrTool ? 'panel.noTranscriptionModel' : 'panel.noCompatibleModel')}
            </div>
          ) : (
            <CustomSelect
              className="wf-param-bar__select wf-param-bar__select--model"
              value={modelValue}
              options={modelOptions}
              popupMatchSelectWidth={false}
              onChange={(value) => handleModelChange(String(value))}
            />
          )}

          {/* 图片和音频只展示模型实际提供的多种方式；视频在浮层中选择。 */}
          {showModeUi && materialType !== 'video' ? (
            <>
              <span className="wf-param-pill__divider">|</span>
              <div data-testid="wf-operation-mode-inline">
                <OperationSegment
                  value={opsState.selectedOperationId || ''}
                  operations={opsState.effectiveOps}
                  onChange={(operationId) => updateParam('operation', operationId)}
                />
              </div>
            </>
          ) : null}

          {/* 图片专属参数胶囊 */}
          {materialType === 'image' && (
            <>
              <span className="wf-param-pill__divider">|</span>
              <div className="wf-param-pill wf-param-pill--video-summary">
                <CustomSelect
                  className="wf-param-bar__select wf-param-bar__select--ghost"
                  variant="ghost"
                  value={aspectRatioValue}
                  options={aspectRatioOptions}
                  popupMatchSelectWidth={false}
                  onChange={(value) => updateParam('aspectRatio', value)}
                />
              </div>
            </>
          )}

          {/* 视频专属参数胶囊：单行摘要 TriggerBar + Portal 浮层 */}
          {materialType === 'video' && videoEffectiveParams && (
            <>
              <span className="wf-param-pill__divider">|</span>
              <div ref={videoTriggerRef} className="wf-video-trigger-bar__wrap">
                <VideoTriggerBar
                  params={videoEffectiveParams}
                  isOpen={videoPopoverOpen}
                  disabled={execBusy}
                  onToggle={() => setVideoPopoverOpen((p) => !p)}
                />
              </div>
            </>
          )}

          {/* 音频专属设置按钮 */}
          {materialType === 'audio' && !isAsrTool && (
            <>
              <span className="wf-param-pill__divider">|</span>
              <button
                type="button"
                className="wf-param-pill wf-param-pill--btn"
                onClick={() => setShowAdvanced(!showAdvanced)}
                title={t('panel.advanced')}
              >
                <SlidersHorizontal size={13} />
              </button>
            </>
          )}
        </div>

        {/* 右侧生成按钮 */}
        <div className="wf-config-panel__action-group">
          <GenerateButton
            onClick={onGenerate}
            disabled={blockGenerate}
            disabledReason={blockReason}
            isGenerating={
              nodeData.executionStatus === 'running'
              || resolveNodeLifecycle({ type: nodeData.materialType, data: nodeData as any }) === 'loading'
            }
          />
        </div>
      </div>

      {/* 高级参数展开 */}
      {showAdvanced && (
        <div className="wf-config-panel__advanced-drawer">
          <div className="wf-config-panel__advanced-row">
            <span className="wf-config-panel__advanced-label">{t('panel.duration')}</span>
            <CustomSlider
              style={{ flex: 1 }}
              min={1}
              max={materialType === 'video' ? 20 : 60}
              value={durationValue}
              onChange={(v) => updateParam('duration', v)}
            />
          </div>
        </div>
      )}

      {/* 视频参数浮层（Portal 挂载，随面板根部渲染） */}
      {materialType === 'video' && videoEffectiveParams && (
        <VideoParamPopover
          triggerRef={videoTriggerRef as React.RefObject<HTMLElement>}
          params={videoEffectiveParams}
          schema={videoEffectiveParams.schema}
          modelItem={modelItem}
          isOpen={videoPopoverOpen}
          onClose={() => setVideoPopoverOpen(false)}
          onParamChange={(key, value) => updateParam(key as string, value)}
        />
      )}
    </div>
  );
};

export default memo(ConfigPanel);
