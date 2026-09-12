/**
 * ModelCascadeMenu — 画布节点三级级联浮层选择菜单（品牌 → 型号 → 渠道策略）。
 *
 * 数据真源：`./channelGroups`（与中枢渠道路由表镜像，由 verify:model-contracts 门禁锁定）。
 * 选择结果经 `onSelect` 写回 `node.data.params.model` 与 `params.routing`，由
 * `materialGatewayExecutor` 透传给中枢；中枢按 `strategy` 排序、按 `allowedGroups`
 * 收窄候选池，并在无法满足时 fail-closed。
 *
 * 三种模态（文本/图片/视频）都可选择渠道：文本请求带路由意图时中枢会改走直连
 * chat completions，因为 `llm.stream` 只能解析已声明的模型 ID，无法携带 `model@group`。
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ShieldCheck, Percent, ChevronDown } from 'lucide-react';
import { ModelBrandIcon } from '../../../../ui/ModelBrandIcon';
import type { CapabilityCatalog, CapabilityModelItem } from '../../../../../shared/api';
import {
  formatBillingLabel,
  formatDiscountLabel,
  formatPointsLabel,
  getModelChannelGroups,
  parseModelAndGroup,
  resolveShortModelName,
  type ChannelGroupItem,
} from './channelGroups';

export type RouteStrategy = 'auto' | 'stability_first' | 'cost_first';

export interface ModelCascadeSelectValue {
  modelId: string;
  strategy: RouteStrategy;
  /** Omitted when the node cannot carry channel routing (text nodes). */
  allowedGroups?: string[];
}

export interface ModelCascadeMenuProps {
  modelValue: string;
  routing?: {
    strategy?: RouteStrategy;
    allowedGroups?: string[];
  };
  catalog?: CapabilityCatalog | null;
  materialType?: string;
  execBusy?: boolean;
  onSelect: (value: ModelCascadeSelectValue) => void;
}

interface BrandDef {
  id: string;
  name: string;
  iconModelId: string;
}

/** Catalog rows are projected to the two fields the picker renders. */
interface PickerRow {
  id: string;
  name: string;
  description?: string;
}

const ALL_BRANDS: BrandDef[] = [
  { id: 'all_omni', name: '全能视频 Omni', iconModelId: 'seedance-2-0' },
  { id: 'all_x', name: '全能模型 X', iconModelId: 'gpt-5.5' },
  { id: 'bytedance', name: 'Seedance', iconModelId: 'seedance-2-0' },
  { id: 'minimax', name: 'MiniMax', iconModelId: 'minimax-h3' },
  { id: 'kling', name: 'Kling', iconModelId: 'kling' },
  { id: 'alibaba', name: 'Wan', iconModelId: 'wan-3.0' },
  { id: 'happyhorse', name: 'HappyHorse', iconModelId: 'wan-3.0' },
  { id: 'anthropic', name: 'Claude', iconModelId: 'claude-opus-4-6' },
  { id: 'deepseek', name: 'DeepSeek', iconModelId: 'deepseek-v4-flash-vision-exp' },
  { id: 'google', name: 'Google Gemini', iconModelId: 'gemini-3.8-flash' },
  { id: 'midjourney', name: 'Midjourney', iconModelId: 'midjourney' },
];

const BRAND_MATCHERS: ReadonlyArray<{ brand: string; fragments: readonly string[] }> = [
  { brand: 'bytedance', fragments: ['seed'] },
  { brand: 'minimax', fragments: ['minimax', 'hailuo'] },
  { brand: 'kling', fragments: ['kling'] },
  { brand: 'alibaba', fragments: ['wan'] },
  { brand: 'anthropic', fragments: ['claude', 'opus', 'sonnet'] },
  { brand: 'deepseek', fragments: ['deepseek'] },
  { brand: 'google', fragments: ['gemini', 'banana', 'veo'] },
  { brand: 'midjourney', fragments: ['midjourney'] },
  { brand: 'all_x', fragments: ['gpt', 'o1', 'o3'] },
];

const BRANDS_BY_MATERIAL = {
  text: ['all_x', 'anthropic', 'deepseek', 'google', 'minimax'],
  image: ['all_omni', 'midjourney', 'all_x', 'bytedance', 'kling'],
  video: ['all_omni', 'all_x', 'bytedance', 'minimax', 'kling', 'alibaba', 'happyhorse'],
} as const;

const FALLBACK_MODELS_BY_BRAND: Readonly<Record<string, readonly PickerRow[]>> = {
  bytedance: [
    { id: 'seedance-2-5', name: 'Seedance 2.5', description: '全新 2.5 旗舰全能视频大模型' },
    { id: 'seedance-2-0', name: 'Seedance 2.0', description: '支持文生、首帧、首尾帧、多参考图' },
    { id: 'seedance-2-0-mini', name: 'Seedance 2.0 Mini', description: '轻量视频模型，支持文生与首帧' },
    { id: 'seedance-2-0-fast', name: 'Seedance 2.0 Fast', description: '快速版，极速出片，支持多参考图' },
  ],
};

/** Brand column contents for a modality. */
function allowedBrandsFor(materialType: string): readonly string[] {
  if (materialType === 'text') return BRANDS_BY_MATERIAL.text;
  if (materialType === 'image') return BRANDS_BY_MATERIAL.image;
  return BRANDS_BY_MATERIAL.video;
}

/** Model shown before the user picks one. */
function defaultModelFor(materialType: string): string {
  if (materialType === 'image') return 'gpt-image-2.5';
  if (materialType === 'text') return 'claude-opus-4-6';
  return 'seedance-2-0-fast';
}

/** Catalog rows carry no display name contract, so project them once, defensively. */
function toPickerRows(list: readonly CapabilityModelItem[] | undefined): PickerRow[] {
  return (list ?? []).map((item) => {
    const row = item as unknown as Record<string, unknown>;
    return {
      id: item.id,
      name: typeof row.name === 'string' && row.name ? row.name : item.id,
      ...(typeof row.description === 'string' && row.description ? { description: row.description } : {}),
    };
  });
}

/** 推导模型所属品牌；用于初值与外部同步。 */
function brandForModel(modelId: string, allowed: readonly string[]): string {
  const id = modelId.toLowerCase();
  for (const { brand, fragments } of BRAND_MATCHERS) {
    if (allowed.includes(brand) && fragments.some((fragment) => id.includes(fragment))) return brand;
  }
  return allowed[0] ?? 'bytedance';
}

/** 24h 稳定率点阵指示器（总点数固定，点亮比例跟随稳定率）。 */
const StabilityDotBar: React.FC<{ rate: number }> = ({ rate }) => {
  const totalDots = 20;
  const activeDots = Math.round((Math.max(0, Math.min(100, rate)) / 100) * totalDots);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} aria-hidden="true">
      {Array.from({ length: totalDots }).map((_, idx) => (
        <span
          key={idx}
          style={{
            width: 3.5,
            height: 3.5,
            borderRadius: '50%',
            background: idx < activeDots
              ? 'var(--dsw-alias-brand-primary, var(--dsw-alias-state-success))'
              : 'var(--dsw-alias-border-subtle)',
            display: 'inline-block',
          }}
        />
      ))}
    </div>
  );
};

const Chip: React.FC<{ tone?: 'danger' | 'muted'; children: React.ReactNode }> = ({ tone = 'muted', children }) => (
  <span
    style={{
      fontSize: 10,
      padding: '1px 5px',
      borderRadius: 4,
      background: tone === 'danger' ? 'var(--dsw-alias-state-danger-bg)' : 'var(--dsw-alias-badge-bg)',
      color: tone === 'danger' ? 'var(--dsw-alias-state-danger)' : 'var(--dsw-alias-label-secondary)',
      fontWeight: tone === 'danger' ? 600 : 400,
    }}
  >
    {children}
  </span>
);

const PANEL_STYLE: React.CSSProperties = {
  background: 'var(--dsw-alias-bg-elevated)',
  backdropFilter: 'blur(16px)',
  borderRadius: 14,
  border: '1px solid var(--dsw-alias-border-subtle)',
  boxShadow: '0 16px 36px var(--dsw-alias-shadow-strong, rgba(0, 0, 0, 0.6))',
  height: 480,
  overflowY: 'auto',
};

const ChannelRow: React.FC<{
  group: ChannelGroupItem;
  checked: boolean;
  onToggle: () => void;
}> = ({ group, checked, onToggle }) => {
  const discount = formatDiscountLabel(group.pricing?.discountRate);
  const billing = formatBillingLabel(group.pricing?.billingMode);
  const stability = group.sla?.stability24h ?? 100;
  const waitSec = group.sla?.avgWaitTimeSec;

  return (
    <div
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        background: checked ? 'var(--dsw-alias-control-bg-hover)' : 'transparent',
        border: checked ? '1px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>{group.label}</span>
          <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
            {formatPointsLabel(group.pricing?.pointsEstimate)}
          </span>
          {discount ? <Chip tone="danger">{discount}</Chip> : null}
          {group.badge ? <Chip>{group.badge}</Chip> : null}
          {billing ? <Chip>{billing}</Chip> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }}>
          <StabilityDotBar rate={stability} />
          <span>24h 稳定率 {stability}%</span>
          {typeof waitSec === 'number' && waitSec > 0 ? <span>约{Math.round(waitSec / 60)}min</span> : null}
        </div>
      </div>
      <div style={{ paddingLeft: 10 }}>
        {checked ? <Check size={15} color="var(--dsw-alias-brand-primary)" strokeWidth={2.5} /> : null}
      </div>
    </div>
  );
};

export const ModelCascadeMenu: React.FC<ModelCascadeMenuProps> = ({
  modelValue,
  routing,
  catalog,
  materialType = 'video',
  execBusy,
  onSelect,
}) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const allowedBrands = allowedBrandsFor(materialType);
  const brandList = useMemo(
    () => ALL_BRANDS.filter((brand) => allowedBrands.includes(brand.id)),
    [allowedBrands],
  );

  const { modelId: canonicalModel } = parseModelAndGroup(modelValue);
  const currentModelId = canonicalModel || defaultModelFor(materialType);

  const [activeBrandId, setActiveBrandId] = useState<string>(() => brandForModel(currentModelId, allowedBrands));
  const [activeModelId, setActiveModelId] = useState<string>(currentModelId);
  const [activeStrategy, setActiveStrategy] = useState<RouteStrategy>(routing?.strategy ?? 'stability_first');

  const channelGroups = useMemo(() => getModelChannelGroups(activeModelId), [activeModelId]);
  // 文本节点走会话模型路由，请求无法携带分组；第三栏只做说明，不提供假选项。
  const canRouteChannels = channelGroups.length > 0;

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    () => (routing?.allowedGroups?.length ? routing.allowedGroups : channelGroups.map((group) => group.id)),
  );

  // 外部数据变化（撤销/重做、快照重载、切换节点）后重新对齐品牌与勾选，
  // 否则勾选状态与胶囊计数会停留在上一个节点的记忆里。
  useEffect(() => {
    setActiveModelId(currentModelId);
    setActiveBrandId(brandForModel(currentModelId, allowedBrands));
  }, [currentModelId, allowedBrands]);

  useEffect(() => {
    if (routing?.strategy) setActiveStrategy(routing.strategy);
  }, [routing?.strategy]);

  const persistedGroups = routing?.allowedGroups;
  useEffect(() => {
    const groups = getModelChannelGroups(currentModelId);
    setSelectedGroupIds(persistedGroups?.length ? persistedGroups : groups.map((group) => group.id));
  }, [currentModelId, persistedGroups]);

  const modelListInBrand = useMemo<PickerRow[]>(() => {
    const rawList = materialType === 'video'
      ? catalog?.video
      : materialType === 'image'
        ? catalog?.image
        : materialType === 'text'
          ? catalog?.text
          : catalog?.models;

    const matchers = BRAND_MATCHERS.find((entry) => entry.brand === activeBrandId)?.fragments ?? [];
    const items = toPickerRows(rawList).filter((model) => {
      const id = model.id.toLowerCase();
      if (activeBrandId === 'all_omni') return true;
      return matchers.some((fragment) => id.includes(fragment));
    });
    if (items.length > 0) return items;
    const fallback = FALLBACK_MODELS_BY_BRAND[activeBrandId];
    if (fallback) return [...fallback];
    return [{ id: activeModelId, name: activeModelId, description: '全功能模型' }];
  }, [catalog, materialType, activeBrandId, activeModelId]);

  const emit = useCallback((modelId: string, strategy: RouteStrategy, groupIds: string[]) => {
    onSelect({
      modelId,
      strategy,
      ...(groupIds.length === 0 ? {} : { allowedGroups: groupIds }),
    });
  }, [materialType, onSelect]);

  const handleSelectModel = useCallback((modelId: string) => {
    setActiveModelId(modelId);
    const groupIds = getModelChannelGroups(modelId).map((group) => group.id);
    setSelectedGroupIds(groupIds);
    emit(modelId, activeStrategy, groupIds);
  }, [activeStrategy, emit]);

  const handleStrategyChange = useCallback((strategy: RouteStrategy) => {
    setActiveStrategy(strategy);
    emit(activeModelId, strategy, selectedGroupIds);
  }, [activeModelId, selectedGroupIds, emit]);

  const toggleGroupSelection = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) => {
      // 至少保留一个渠道：清空会让中枢只能 fail-closed。
      if (prev.includes(groupId)) {
        if (prev.length <= 1) return prev;
        const next = prev.filter((id) => id !== groupId);
        emit(activeModelId, activeStrategy, next);
        return next;
      }
      const next = [...prev, groupId];
      emit(activeModelId, activeStrategy, next);
      return next;
    });
  }, [activeModelId, activeStrategy, emit]);

  const applyGroupSelection = useCallback((groupIds: string[]) => {
    setSelectedGroupIds(groupIds);
    emit(activeModelId, activeStrategy, groupIds);
  }, [activeModelId, activeStrategy, emit]);

  const [popoverPos, setPopoverPos] = useState<{ bottom: number; left: number }>({ bottom: 44, left: 16 });
  const panelWidth = channelGroups.length > 0 ? 786 : 406;

  useEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPopoverPos({
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
        left: Math.max(12, Math.min(rect.left, Math.max(12, window.innerWidth - panelWidth - 12))),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen, panelWidth]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const shortName = resolveShortModelName(activeModelId);
  const selectedCount = selectedGroupIds.length;
  const strategyLabel = activeStrategy === 'cost_first' ? '低价优先' : '稳定性优先';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="wf-model-cascade-capsule"
        data-testid="wf-model-cascade-trigger"
        disabled={execBusy}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={canRouteChannels ? `渠道策略：${strategyLabel}` : undefined}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 32,
          padding: '0 10px',
          borderRadius: 8,
          background: isOpen ? 'var(--dsw-alias-control-bg-hover)' : 'var(--dsw-alias-control-bg)',
          border: isOpen ? '1px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-subtle)',
          color: 'var(--dsw-alias-text-primary)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          transition: 'all 0.15s ease',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <ModelBrandIcon modelId={activeModelId} size={15} />
        <span style={{ fontWeight: 600 }}>{shortName}</span>

        {canRouteChannels ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'var(--dsw-alias-badge-bg)',
              color: 'var(--dsw-alias-brand-primary)',
              fontSize: 11,
            }}
          >
            {activeStrategy === 'cost_first'
              ? <Percent size={11} strokeWidth={2.4} />
              : <ShieldCheck size={11} strokeWidth={2.4} />}
            <span>{selectedCount}</span>
          </span>
        ) : null}

        <ChevronDown
          size={12}
          style={{
            opacity: 0.6,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={popoverRef}
            className="wf-model-cascade-popover wf-model-cascade-fade nodrag nopan"
            role="menu"
            aria-label="选择模型与渠道策略"
            style={{
              position: 'fixed',
              bottom: popoverPos.bottom,
              left: popoverPos.left,
              display: 'flex',
              gap: 8,
              zIndex: 10000,
              alignItems: 'flex-start',
              userSelect: 'none',
            }}
          >
            {/* 栏 1：品牌 */}
            <div role="group" aria-label="选择品牌" style={{ ...PANEL_STYLE, width: 160, padding: '10px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--dsw-alias-label-secondary)', fontWeight: 500 }}>
                选择模型
              </div>
              {brandList.map((brand) => {
                const isSelected = activeBrandId === brand.id;
                return (
                  <button
                    key={brand.id}
                    type="button"
                    role="menuitem"
                    aria-current={isSelected}
                    onClick={() => setActiveBrandId(brand.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'var(--dsw-alias-text-primary)' : 'var(--dsw-alias-label-secondary)',
                      background: isSelected ? 'var(--dsw-alias-control-bg-hover)' : 'transparent',
                      border: isSelected ? '1px solid var(--dsw-alias-border-subtle)' : '1px solid transparent',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <ModelBrandIcon modelId={brand.iconModelId} size={16} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</span>
                    {isSelected ? <Check size={14} color="var(--dsw-alias-brand-primary)" /> : null}
                  </button>
                );
              })}
            </div>

            {/* 栏 2：型号 */}
            <div role="group" aria-label="选择模型版本" style={{ ...PANEL_STYLE, width: 230, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {modelListInBrand.map((item) => {
                const isSelected = activeModelId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    aria-current={isSelected}
                    onClick={() => handleSelectModel(item.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: isSelected ? 'var(--dsw-alias-control-bg-hover)' : 'transparent',
                      border: isSelected ? '1px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--dsw-alias-text-primary)' : 'var(--dsw-alias-label-secondary)' }}>
                        {item.name || item.id}
                      </span>
                      {isSelected ? <Check size={14} color="var(--dsw-alias-brand-primary)" /> : null}
                    </div>
                    {item.description ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--dsw-alias-label-secondary)',
                          lineHeight: 1.35,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {item.description}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* 栏 3：渠道策略 */}
            <div
              role="group"
              aria-label="选择渠道策略"
              style={{ ...PANEL_STYLE, width: 380, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>选择渠道策略</div>

              {channelGroups.length === 0 ? (
                <div style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' }}>
                  该模型尚未配置渠道分组，请求将按模型默认通道执行。
                </div>
              ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {([
                        { id: 'stability_first' as const, label: '稳定性优先', icon: <ShieldCheck size={15} /> },
                        { id: 'cost_first' as const, label: '低价优先', icon: <Percent size={14} /> },
                      ]).map((option) => {
                        const isActive = activeStrategy === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            onClick={() => handleStrategyChange(option.id)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              cursor: 'pointer',
                              background: isActive ? 'var(--dsw-alias-badge-bg)' : 'transparent',
                              border: isActive ? '1px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-subtle)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              color: 'var(--dsw-alias-text-primary)',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: isActive ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)', display: 'inline-flex' }}>
                                {option.icon}
                              </span>
                              {option.label}
                            </span>
                            {isActive ? <Check size={13} color="var(--dsw-alias-brand-primary)" /> : null}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
                      {channelGroups.map((group) => (
                        <ChannelRow
                          key={group.id}
                          group={group}
                          checked={selectedGroupIds.includes(group.id)}
                          onToggle={() => toggleGroupSelection(group.id)}
                        />
                      ))}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 8,
                        borderTop: '1px solid var(--dsw-alias-border-subtle)',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                        已选 {selectedCount}/{channelGroups.length} 个
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button
                          type="button"
                          onClick={() => {
                            const firstGroup = channelGroups[0];
                            if (firstGroup) applyGroupSelection([firstGroup.id]);
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, cursor: 'pointer', padding: 0 }}
                        >
                          清空
                        </button>
                        <button
                          type="button"
                          onClick={() => applyGroupSelection(channelGroups.map((group) => group.id))}
                          style={{ background: 'transparent', border: 'none', color: 'var(--dsw-alias-text-primary)', fontSize: 12, cursor: 'pointer', padding: 0 }}
                        >
                          全选
                        </button>
                      </div>
                    </div>
                  </>
                )}
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
};
