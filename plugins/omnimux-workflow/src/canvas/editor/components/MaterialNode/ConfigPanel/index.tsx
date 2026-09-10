/**
 * ConfigPanel — 统一材质创作底栏（Issue 467 / W2；Feed-Slot 阶段二 T03/T04/T05）。
 *
 * Contract-driven:
 *   - model picker = only compatible (acceptsCurrentInputs) rows; Hide, Don't Grey
 *   - text adapts its operation automatically; other outputs show genuine model modes
 *   - writes canonical params.operation only
 *   - zero candidates → empty state + block generate with typed reason
 *   - Whisper / unlisted ASR never enter the DOM
 *
 * Feed-Slot:
 *   - 媒体卡槽由 deriveSlotLayout 的 preset 驱动（SlotWells），slotBindings 是消费真源；
 *   - 不再有节点内常驻静态错误条：禁用原因走 GenerateButton title/disabledReason，
 *     瞬时反馈走画板级通知（canvasNoticeService）。
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Plus,
  Music,
  Play,
  FileText,
  Image as ImageIcon,
  X,
  AlertTriangle,
  AudioLines,
} from 'lucide-react';
import type { MaterialNodeData, MaterialType } from '../../../../types/materialNode';
import { resolveNodeKind } from '../../../../types/materialNode';
import type { CapabilityCatalog, CapabilityModelItem } from '../../../../../shared/api';
import { useT } from '../../../../i18n';
import { CustomSelect, toast } from '../../../../ui';
import { rememberGenerationModel } from '../../../../store/generationPreferencesStore';
import { generationReasonText } from '../../../../i18n/generationReason';
import { resolveGenerationPrompt } from '../../../../../shared/graph/generationPrompt';
import { ModelBrandIcon } from '../../../../ui/ModelBrandIcon';
import { useCanvasStore } from '../../../../store/canvasStore';
import { useUpstreamMedia, toUpstreamSnapshots } from '../../../hooks/useUpstreamMedia';
import { useModelParameterSchema, getCachedCatalog } from '../../../hooks/useModelParameterSchema';
import { resolveNodeLifecycle } from '../../../utils/nodeMaterialLifecycle';
import { canvasNoticeService } from '../../../notices/canvasNoticeService.ts';
import GenerateButton from './GenerateButton';
import SlotWells from './SlotWells/SlotWells';
import type { SlotPickRequest } from './SlotWells/types.ts';
import { VideoTriggerBar } from './videoParams/VideoTriggerBar';
import { VideoParamPopover } from './videoParams/VideoParamPopover';
import { filterWrite } from './videoParams/paramSchemaFilter.ts';
import { ImageTriggerBar } from './imageParams/ImageTriggerBar';
import { ImageParamPopover } from './imageParams/ImageParamPopover';
import { resolveEffectiveImageParams } from './imageParams/imageParamAdapter';
import { resolveEffectiveAudioParams, resolveAudioPromptGate, AUDIO_PROMPT_MAX_CHARS } from './audioParams/audioParamAdapter';
import { resolveVoiceLabel } from './audioParams/voicePickerModel.ts';
import { VoicePickerDialog } from './audioParams/VoicePickerDialog';
import {
  buildVideoParamTransition,
  resolveEffectiveVideoParams,
  validateVideoParamsForUi,
} from './videoParams/videoParamAdapter';
import {
  autoFillSlots,
  deriveSlotLayout,
  swapNamedSlots,
  type FeedAsset,
  type SlotBindings,
  type SlotConflict,
  type SlotLayout,
  type SlotSpec,
} from '../../../../../shared/graph/feedSlot/index.ts';
import {
  bindableSlots,
  buildContractView,
  resolveModelView,
} from '../../../../../shared/validation/compatKernel.ts';
import {
  buildEffectiveOpsUiState,
  buildFilteredModelOptions,
  buildUiUpstreamFingerprint,
  setParamsOperation,
  readPreferredOperationId,
  shouldRenderModeUi,
} from '../../../../../shared/validation/operationUi.ts';
import { OperationSegment } from './videoParams/SegmentControls';
import PromptTokenEditor, { type PromptTokenEditorRef } from '../../PromptTokenEditor';
import { canvasReferenceCandidates, currentReferenceCandidates, referenceMutation } from '../../PromptTokenEditor/referenceCandidates.ts';
import { rejectReasonKey } from '../../../utils/connectionValidator.ts';
import type {
  NodeSlotEngineState,
  SlotBindingItem,
} from '../../../../../shared/graph/slotContractTypes.ts';

export interface ConfigPanelProps {
  nodeId: string;
  nodeData: MaterialNodeData;
  catalog: CapabilityCatalog | null;
  onUpdateNodeData: (updates: Partial<MaterialNodeData>) => void;
  onGenerate: () => void;
  /** 全图/其他节点执行中（禁用执行入口） */
  execBusy: boolean;
  /** 唤起 ResourcePicker；带 SlotPickRequest 时进入卡槽装填会话，或传入 mode/targetSlotIndex。 */
  onOpenResourcePicker?: (requestOrMode?: SlotPickRequest | 'add' | 'replace', targetSlotIndex?: number) => void;
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
    let subtitle = '1080P · 3-10s';
    if (id === 'kling-o3') subtitle = '4K · 3-15s';
    else if (id === 'kling-avatar') subtitle = 'Digital Human';
    else if (id === 'kling-motion-control') subtitle = '1080P';
    return { icon, subtitle };
  }
  if (id.startsWith('wan')) {
    return { icon, subtitle: '720P-1080P · 5-15s' };
  }
  if (id.startsWith('veo')) {
    return { icon, subtitle: '720p-1080p · 8s' };
  }
  return { icon };
}

interface ImportConfigPanelProps {
  nodeData: MaterialNodeData;
  onOpenResourcePicker?: (requestOrMode?: 'add' | 'replace' | SlotPickRequest, targetSlotIndex?: number) => void;
}

const ImportConfigPanel: React.FC<ImportConfigPanelProps> = ({
  nodeData,
  onOpenResourcePicker,
}) => {
  const t = useT();
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
            onClick={() => onOpenResourcePicker('replace')}
          >
            <span>{t('node.replace')}</span>
          </button>
        )}
      </div>
    </div>
  );
};

const GenerationConfigPanel: React.FC<ConfigPanelProps> = ({
  nodeId,
  nodeData,
  catalog,
  onUpdateNodeData,
  onGenerate,
  execBusy,
  onOpenResourcePicker,
}) => {
  const t = useT();
  const { materialType, selectedTool, prompt } = nodeData;
  const params = (nodeData.params && typeof nodeData.params === 'object') ? nodeData.params : {};

  const [isExpanded, setIsExpanded] = useState(false);
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  const videoTriggerRef = useRef<HTMLDivElement | null>(null);
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const imageTriggerRef = useRef<HTMLDivElement | null>(null);
  // T04：音色选择弹窗（schema 提供音色选项时由底栏 VoiceTrigger 唤起）
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const promptEditorRef = useRef<PromptTokenEditorRef | null>(null);

  const slotState = nodeData.slotState as NodeSlotEngineState | undefined;

  const handleInsertToken = useCallback((slotItem: {
    sourceNodeId: string;
    slotIndex: number;
    label: string;
    materialType: MaterialType;
    mediaUrl?: string;
  }) => {
    promptEditorRef.current?.insertToken({
      raw: `@ref[${slotItem.sourceNodeId}:${slotItem.slotIndex}:${slotItem.label}]`,
      nodeId: slotItem.sourceNodeId,
      slotIndex: slotItem.slotIndex,
      label: slotItem.label,
      materialType: slotItem.materialType,
      mediaUrl: slotItem.mediaUrl,
    });
  }, []);

  const handleOpenReplacePicker = useCallback((slotIndex: number) => {
    onOpenResourcePicker?.('replace', slotIndex);
  }, [onOpenResourcePicker]);

  const upstreams = useUpstreamMedia(nodeId);
  const upstreamSnapshots = useMemo(() => toUpstreamSnapshots(upstreams), [upstreams]);
  const activeCatalog = catalog ?? getCachedCatalog();

  const isAsrTool = selectedTool === 'audio-transcription';

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
  const modelValue = typeof params?.model === 'string' ? params.model.trim() : '';

  const {
    schema,
    modelItem,
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
      // T04：视频参数写入经声明式白名单过滤（hidden / 非白名单键被剥离）。
      const patch = materialType === 'video'
        ? filterWrite({ [key]: value }, typeof params.operation === 'string' ? params.operation : undefined)
        : { [key]: value };
      if (Object.keys(patch).length === 0) return;
      onUpdateNodeData({ params: { ...params, ...patch } });
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

  // 图像节点的有效参数（读侧清洗回退，不回写 nodeData）
  const imageEffectiveParams = useMemo(
    () =>
      materialType === 'image'
        ? resolveEffectiveImageParams({
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

  // 音频（非 ASR）节点的有效参数（读侧清洗回退，不回写 nodeData）
  const audioEffectiveParams = useMemo(
    () =>
      materialType === 'audio' && !isAsrTool
        ? resolveEffectiveAudioParams({
            params,
            schema,
            modelItem,
            catalog: activeCatalog,
            upstreams: upstreamSnapshots,
            prompt: localPrompt,
          })
        : null,
    [materialType, isAsrTool, params, schema, modelItem, activeCatalog, upstreamSnapshots, localPrompt],
  );

  // T04：音色目录（schema.voice.options 为真源，含 VoiceOptionMeta）
  const voiceCatalogOptions = useMemo(
    () => (materialType === 'audio' && !isAsrTool
      ? audioEffectiveParams?.schema.voice?.options ?? []
      : []),
    [materialType, isAsrTool, audioEffectiveParams],
  );
  // Issue #763：时长由文本长度决定，底栏不再有音频参数浮层；
  // 只要 schema 提供音色选项，底栏即常驻 VoiceTrigger + VoicePickerDialog。
  const showVoicePicker = voiceCatalogOptions.length > 0;
  const selectedVoiceOption = useMemo(
    () => voiceCatalogOptions.find((option) => option.value === audioEffectiveParams?.voice),
    [voiceCatalogOptions, audioEffectiveParams],
  );

  // T03：朗读正文字数闸门（Unicode code point 计，10000 上限）
  const audioPromptGate = useMemo(
    () => (materialType === 'audio' && !isAsrTool ? resolveAudioPromptGate(prompt) : null),
    [materialType, isAsrTool, prompt],
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

  // ---- Feed-Slot 卡槽（T03）：preset 驱动，slotBindings 为消费真源 ----
  const slotLayout = useMemo(
    () => deriveSlotLayout(
      activeCatalog,
      modelValue || undefined,
      opsState.selectedOperationId || undefined,
      materialType,
    ),
    [activeCatalog, modelValue, opsState.selectedOperationId, materialType],
  );

  const effectiveSlotLayout = useMemo<SlotLayout>(() => {
    if (materialType === 'image' && (slotLayout.preset === 'none' || slotLayout.slots.length === 0)) {
      return {
        operationId: opsState.selectedOperationId || 'text_to_image',
        preset: 'strip',
        slots: [{
          slot: 'reference_image',
          role: 'reference',
          type: 'image',
          min: 0,
          max: 10,
          labelKey: 'panel.slot.reference_image',
        }],
        swap: false,
        addButton: true,
        implementationGaps: [],
      };
    }
    // Issue #763：音频（非 ASR）节点与图片一致，素材卡槽常驻（参考音频 reference_audio）。
    if (materialType === 'audio' && !isAsrTool && (slotLayout.preset === 'none' || slotLayout.slots.length === 0)) {
      return {
        operationId: opsState.selectedOperationId || 'text_to_speech',
        preset: 'strip',
        slots: [{
          slot: 'reference_audio',
          role: 'reference',
          type: 'audio',
          min: 0,
          max: 5,
          labelKey: 'panel.slot.reference_audio',
        }],
        swap: false,
        addButton: true,
        implementationGaps: [],
      };
    }
    if (materialType === 'text') {
      if (slotLayout.preset !== 'none' && slotLayout.slots.length > 0) {
        return slotLayout;
      }
      const contractView = buildContractView(activeCatalog);
      const model = resolveModelView(contractView, modelValue);
      const isMultimodal = model?.operations.some(
        (op) => op.listed && bindableSlots(op).length > 0,
      );
      if (isMultimodal) {
        return {
          operationId: opsState.selectedOperationId || 'vision_chat',
          preset: 'strip',
          slots: [{
            slot: 'reference_images',
            role: 'reference',
            type: 'image',
            min: 0,
            max: 10,
            labelKey: 'panel.slot.reference_images',
          }],
          swap: false,
          addButton: true,
          implementationGaps: [],
        };
      }
      return {
        ...slotLayout,
        preset: 'none',
        slots: [],
        addButton: false,
      };
    }
    return slotLayout;
  }, [materialType, isAsrTool, slotLayout, opsState.selectedOperationId, activeCatalog, modelValue]);

  const feedAssets = useMemo<FeedAsset[]>(
    () => upstreams
      .filter((item) => item.materialType !== 'text')
      .map((item, ordinal) => ({
        edgeId: item.edgeId ?? `feed-${item.nodeId}-${ordinal}`,
        sourceNodeId: item.nodeId,
        ...(item.outputId ? { outputId: item.outputId } : {}),
        type: item.materialType,
        availability: item.availability,
        ...(item.mimeType ? { mimeType: item.mimeType } : {}),
        ordinal,
        ...(item.url ? { url: item.url } : {}),
        ...(item.role ? { role: item.role } : {}),
        ...(item.targetSlot ? { targetSlot: item.targetSlot } : {}),
      })),
    [upstreams],
  );

  const storedSlotBindings = nodeData.slotBindings as SlotBindings | undefined;
  const slotBindings = useMemo<SlotBindings>(() => {
    if (storedSlotBindings) return storedSlotBindings;
    // 展示兜底：尚未经 gateway 重算的旧节点按内核自动装填派生。
    if (effectiveSlotLayout.preset === 'none' || effectiveSlotLayout.slots.length === 0) return {};
    return autoFillSlots(feedAssets, effectiveSlotLayout).bindings;
  }, [storedSlotBindings, effectiveSlotLayout, feedAssets]);
  const slotConflicts = (nodeData.slotConflicts ?? []) as SlotConflict[];

  const patchSlotBindings = useCallback(
    (next: SlotBindings) => {
      useCanvasStore.getState().applyCanvasInputMutation({
        nodePatches: [{ nodeId, data: { slotBindings: next } }],
      });
    },
    [nodeId],
  );

  const handleSwapSlots = useCallback(
    (firstSlot: string, lastSlot: string) => {
      patchSlotBindings(swapNamedSlots(slotBindings, firstSlot, lastSlot));
    },
    [patchSlotBindings, slotBindings],
  );

  // 卸装填：只摘除槽位占用，供给边保留，素材回到 Feed。
  const handleClearOccupant = useCallback(
    (slot: string, edgeId: string) => {
      patchSlotBindings({
        ...slotBindings,
        [slot]: (slotBindings[slot] ?? []).filter((occupant) => occupant.edgeId !== edgeId),
      });
    },
    [patchSlotBindings, slotBindings],
  );

  const handlePickSlot = useCallback(
    (request: SlotPickRequest) => onOpenResourcePicker?.(request),
    [onOpenResourcePicker],
  );

  // 必需槽位缺口：空卡槽自解释，提交按钮 disabledReason 同步提示。
  const slotLabelOf = useCallback(
    (spec: SlotSpec) => {
      const label = t(spec.labelKey);
      return label === spec.labelKey ? spec.slot : label;
    },
    [t],
  );
  const missingRequiredSlots = useMemo(
    () => effectiveSlotLayout.slots.filter((spec: SlotSpec) => (slotBindings[spec.slot]?.length ?? 0) < spec.min),
    [effectiveSlotLayout, slotBindings],
  );
  const slotShortageReason = missingRequiredSlots.length > 0
    ? t('panel.slotMissing').replace('{slots}', missingRequiredSlots.map(slotLabelOf).join('、'))
    : undefined;

  const hasSlots = effectiveSlotLayout.preset !== 'none' && effectiveSlotLayout.slots.length > 0;

  // T05：切换模式/模型导致已有供给不再被消费 → 画板 Banner（5s 自动淡出）。
  const boundEdgeIds = useMemo(
    () => Object.values(slotBindings).flatMap((occupants) => occupants.map((occupant) => occupant.edgeId)).sort(),
    [slotBindings],
  );
  const modeConsumptionRef = useRef<{ key: string; bound: string[] } | null>(null);
  useEffect(() => {
    const key = `${modelValue}::${opsState.selectedOperationId || ''}`;
    const prev = modeConsumptionRef.current;
    if (prev && prev.key !== key && prev.bound.length > 0) {
      const lost = prev.bound.filter((edgeId) => !boundEdgeIds.includes(edgeId));
      if (lost.length > 0) {
        canvasNoticeService.publish({
          kind: 'mode_consumption_changed',
          message: t('notice.modeConsumptionChanged'),
        });
      }
    }
    modeConsumptionRef.current = { key, bound: boundEdgeIds };
  }, [modelValue, opsState.selectedOperationId, boundEdgeIds, t]);

  const placeholder = useMemo(() => {
    if (isAsrTool) return t('panel.promptPlaceholder');
    if (materialType === 'image') return t('panel.imagePromptPlaceholder');
    if (materialType === 'video') return t('panel.videoPromptPlaceholder');
    if (
      materialType !== 'audio' &&
      upstreams.some((item) => (item.materialType === 'text' || (item.materialType as string) === 'table') && item.hasMedia)
    )
      return t('panel.supplementOptional');
    switch (materialType) {
      case 'text':
        return t('panel.textPromptPlaceholder');
      case 'audio':
        return isMusicOperation
          ? t('panel.musicPromptPlaceholder')
          : t('panel.audioPromptPlaceholder');
      default:
        return t('panel.promptPlaceholder');
    }
  }, [materialType, isMusicOperation, isAsrTool, upstreams, t]);

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

  // Generate gate: blocked when zero effective ops / zero candidates / configuration_error /
  // 必需卡槽空缺 / 执行中。
  const nodeCompat = (nodeData as Record<string, unknown>).compat as
    | { status?: string; readyToSubmit?: boolean; reasonCodes?: string[]; adaptation?: { toModelLabel: string; inputTypes: string[] } }
    | undefined;
  const blockGenerate =
    opsState.blockGenerate
    || filteredModels.zeroCandidates
    || nodeCompat?.status === 'configuration_error'
    || videoValidationErrors.length > 0
    || Boolean(audioPromptGate?.exceeded)
    || missingRequiredSlots.length > 0
    || execBusy;
  const reasonCode = opsState.reasonCode || filteredModels.reasonCode
    || (nodeCompat?.status === 'configuration_error' ? nodeCompat.reasonCodes?.[0] || 'no_compatible_model' : undefined);
  const blockReason =
    (audioPromptGate?.exceeded ? `朗读正文不能超过 ${AUDIO_PROMPT_MAX_CHARS} 字符` : undefined)
    || generationReasonText(t, reasonCode, opsState.reason || filteredModels.reason)
    || videoValidationErrors[0]
    || slotShortageReason;
  const adaptation = nodeCompat?.adaptation;
  const adaptationInputs = adaptation?.inputTypes.map((type) => t(`node.type.${type}`)).join('、');
  const adaptationMessage = adaptation
    ? t(adaptationInputs ? 'panel.adaptedModel' : 'panel.adaptedModelGeneric')
      .replace('{model}', adaptation.toModelLabel)
      .replace('{inputs}', adaptationInputs ?? '')
    : undefined;

  const showEmptyModels = filteredModels.zeroCandidates || modelOptions.length === 0;

  // T05：禁用态点击 → 画板 Toast（4s 自动淡出），不再渲染常驻静态错误条。
  const handleDisabledGenerateClick = useCallback(() => {
    canvasNoticeService.publish({
      kind: 'submit_blocked_click',
      message: blockReason || t('notice.submitBlocked'),
    });
  }, [blockReason, t]);

  return (
    <div className="wf-config-panel" data-effective-ops={opsState.count}>
      {adaptationMessage ? (
        <div className="wf-config-panel__input-hint" role="status" data-testid="wf-model-adaptation">
          {adaptationMessage}
        </div>
      ) : null}

      {videoValidationErrors.length > 0 && !opsState.blockGenerate && !showEmptyModels ? (
        <div className="wf-config-panel__validation-list" role="alert" data-testid="wf-video-validation-errors">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{videoValidationErrors.join('；')}</span>
        </div>
      ) : null}

      {/* 2. Prompt 输入区容器 */}
      <div className="wf-config-panel__prompt-container">
        <div className={`wf-config-panel__prompt-header${!hasSlots ? ' wf-config-panel__prompt-header--empty-slots' : ''}`}>
          {/* T03：模式驱动卡槽；图像与音频（非 ASR）节点卡槽始终常驻在线；none 预设不渲染、不占高度。 */}
          {hasSlots && (
            <SlotWells
              layout={effectiveSlotLayout}
              bindings={slotBindings}
              conflicts={slotConflicts}
              upstreams={upstreams}
              onPickSlot={handlePickSlot}
              onSwapSlots={handleSwapSlots}
              onClearOccupant={handleClearOccupant}
              onInsertToken={handleInsertToken}
            />
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

        <PromptTokenEditor
          ref={promptEditorRef}
          className={`wf-config-panel__prompt-input nowheel nodrag${
            isExpanded ? ' wf-config-panel__prompt-input--expanded' : ''
          }`}
          value={prompt ?? ''}
          placeholder={placeholder}
          rows={isExpanded ? 8 : 2}
          isExpanded={isExpanded}
          slotState={slotState}
          currentReferences={currentReferenceCandidates(upstreams, slotBindings)}
          canvasReferences={canvasReferenceCandidates(nodeId, useCanvasStore.getState().nodes ?? [], useCanvasStore.getState().edges)}
          onCommitReference={(token, nextPrompt) => {
            const store = useCanvasStore.getState();
            store.pushHistory();
            const plan = store.applyCanvasInputMutation(referenceMutation(nodeId, token.nodeId, nextPrompt, store.edges));
            if (plan.status !== 'allowed') {
              toast.error(t(rejectReasonKey(plan.reasonCode)));
              return false;
            }
            store.pushHistory(true);
            return true;
          }}
          onHistoryStep={(redo) => {
            const store = useCanvasStore.getState();
            store.pushHistory();
            if (redo) store.redo(); else store.undo();
          }}
          materialType={materialType}
          maxLength={audioPromptGate ? AUDIO_PROMPT_MAX_CHARS : undefined}
          countOverride={audioPromptGate ? audioPromptGate.count : undefined}
          onChange={(newPrompt) => onUpdateNodeData({ prompt: newPrompt })}
        >
          <textarea
            className="wf-config-panel__prompt-textarea-hidden"
            style={{ display: 'none' }}
            rows={isExpanded ? 8 : 2}
            value={prompt ?? ''}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
        </PromptTokenEditor>
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

          {/* T04：音色触发入口（模型下拉右侧），唤起 VoicePickerDialog */}
          {showVoicePicker ? (
            <button
              type="button"
              className="wf-voice-trigger"
              data-testid="wf-voice-trigger"
              disabled={execBusy}
              title={selectedVoiceOption ? `音色：${resolveVoiceLabel(selectedVoiceOption)}` : '选择音色'}
              onClick={() => setVoicePickerOpen(true)}
            >
              <AudioLines size={14} strokeWidth={1.75} aria-hidden="true" />
              <span className="wf-voice-trigger__label">
                {selectedVoiceOption ? resolveVoiceLabel(selectedVoiceOption) : '选择音色'}
              </span>
            </button>
          ) : null}

          {/* 文本 / ASR 保持内联生成方式入口；图像的生成方式进自身浮层（Issue #763：音频时长由文本长度决定，无参数浮层）。 */}
          {showModeUi && (materialType === 'text' || isAsrTool) ? (
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

          {/* 图像专属参数：单行摘要 TriggerBar + Portal 浮层（废除幽灵 Select 与前置 `|`） */}
          {materialType === 'image' && imageEffectiveParams && (
            <div ref={imageTriggerRef} className="wf-cfg-summary-bar__wrap">
              <ImageTriggerBar
                params={imageEffectiveParams}
                isOpen={imagePopoverOpen}
                disabled={execBusy}
                onToggle={() => setImagePopoverOpen((p) => !p)}
              />
            </div>
          )}

          {/* 视频专属参数胶囊：四段式摘要 TriggerBar + Portal 浮层 */}
          {materialType === 'video' && videoEffectiveParams && (
            <div ref={videoTriggerRef} className="wf-video-trigger-bar__wrap">
              <VideoTriggerBar
                params={videoEffectiveParams}
                isOpen={videoPopoverOpen}
                disabled={execBusy}
                onToggle={() => setVideoPopoverOpen((p) => !p)}
              />
            </div>
          )}
        </div>

        {/* 右侧生成按钮 */}
        <div className="wf-config-panel__action-group">
          <GenerateButton
            onClick={onGenerate}
            disabled={blockGenerate}
            disabledReason={blockReason}
            onDisabledClick={handleDisabledGenerateClick}
            isGenerating={
              nodeData.executionStatus === 'running'
              || resolveNodeLifecycle({ type: nodeData.materialType, data: nodeData as any }) === 'loading'
            }
          />
        </div>
      </div>

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

      {/* 图像参数浮层（Portal 挂载，随面板根部渲染） */}
      {materialType === 'image' && imageEffectiveParams && (
        <ImageParamPopover
          triggerRef={imageTriggerRef}
          params={imageEffectiveParams}
          isOpen={imagePopoverOpen}
          onClose={() => setImagePopoverOpen(false)}
          onParamChange={(key, value) => updateParam(key, value)}
        />
      )}

      {/* T04：音色选择弹窗（选中即写回 params.voice 并关闭） */}
      {showVoicePicker ? (
        <VoicePickerDialog
          open={voicePickerOpen}
          options={voiceCatalogOptions}
          {...(audioEffectiveParams?.voice ? { value: audioEffectiveParams.voice } : {})}
          onClose={() => setVoicePickerOpen(false)}
          onSelect={(voiceType) => {
            updateParam('voice', voiceType);
            setVoicePickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

export interface ConfigPanelErrorBoundaryProps {
  children: React.ReactNode;
  nodeId: string;
}

interface ConfigPanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ConfigPanelErrorBoundary extends React.Component<
  ConfigPanelErrorBoundaryProps,
  ConfigPanelErrorBoundaryState
> {
  constructor(props: ConfigPanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ConfigPanelErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[ConfigPanel ErrorBoundary] 节点 ${this.props.nodeId} 配置面板渲染异常:`, error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="wf-config-panel wf-config-panel--error"
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: 'var(--dsw-alias-state-danger)',
          }}
        >
          <span>配置面板局部加载异常</span>
          <button
            type="button"
            className="wf-param-pill wf-param-pill--btn"
            style={{ padding: '2px 8px', height: '24px' }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ConfigPanel: React.FC<ConfigPanelProps> = (props) => {
  const kind = resolveNodeKind(props.nodeData);
  return (
    <ConfigPanelErrorBoundary nodeId={props.nodeId}>
      {kind === 'import' ? (
        <ImportConfigPanel
          nodeData={props.nodeData}
          onOpenResourcePicker={props.onOpenResourcePicker}
        />
      ) : (
        <GenerationConfigPanel {...props} />
      )}
    </ConfigPanelErrorBoundary>
  );
};

export default memo(ConfigPanel);
