/**
 * ModelCascadeMenu — 画布节点三级级联浮层选择菜单（品牌 → 型号 → 渠道策略）。
 *
 * 数据真源：`./channelGroups`（与中枢渠道路由表镜像，由 verify:model-contracts 门禁锁定）。
 * 选择结果经 `onSelect` 写回 `node.data.params.model` 与 `params.routing`，由
 * `materialGatewayExecutor` 透传给中枢。
 *
 * 交互约定（Issue #1402）：
 * 1. 品牌列只显示产品真名（OpenAI / Google / Claude …），不出现「全能模型 X」这类聚合名；
 *    品牌由当前模态的目录推导，只列真有型号的品牌。
 * 2. 悬停即切换子菜单与高亮，不需要点击；**点击才写入节点**（悬停只预览，鼠标扫过不会改配置）。
 * 3. 渐进展开：当前选中链默认显示三级；悬停到非选中品牌时只显示二级（型号），
 *    悬停到某个型号后才显示三级（渠道）——即「选中激活显示三级，悬停激活只显示下级」。
 * 4. 预览态（悬停到非选中型号）的渠道列只读：勾选属于已提交型号，预览时不给假交互。
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ShieldCheck, Percent, ChevronDown } from 'lucide-react';
import { ModelBrandIcon } from '../../../../ui/ModelBrandIcon';
import type { CapabilityCatalog, CapabilityModelItem } from '../../../../../shared/api';
import {
  formatBillingLabel,
  formatPriceChip,
  formatPriceLabel,
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

/** 品牌列：只写产品真名，不做「全能模型 X」这类聚合命名。 */
const ALL_BRANDS: BrandDef[] = [
  { id: 'openai', name: 'OpenAI', iconModelId: 'gpt-5.5' },
  { id: 'bytedance', name: 'Seedance', iconModelId: 'seedance-2-0' },
  { id: 'minimax', name: 'MiniMax', iconModelId: 'minimax-h3' },
  { id: 'kling', name: 'Kling', iconModelId: 'kling' },
  { id: 'alibaba', name: 'Wan', iconModelId: 'wan-3.0' },
  { id: 'happyhorse', name: 'HappyHorse', iconModelId: 'wan-3.0' },
  { id: 'anthropic', name: 'Claude', iconModelId: 'claude-opus-4-6' },
  { id: 'deepseek', name: 'DeepSeek', iconModelId: 'deepseek-v4-flash-vision-exp' },
  { id: 'google', name: 'Google', iconModelId: 'gemini-3.8-flash' },
  { id: 'midjourney', name: 'Midjourney', iconModelId: 'midjourney' },
];

const BRAND_MATCHERS: ReadonlyArray<{ brand: string; fragments: readonly string[] }> = [
  { brand: 'openai', fragments: ['gpt', 'o1', 'o3', 'o4'] },
  { brand: 'bytedance', fragments: ['seed'] },
  { brand: 'minimax', fragments: ['minimax', 'hailuo'] },
  { brand: 'kling', fragments: ['kling'] },
  { brand: 'alibaba', fragments: ['wan'] },
  { brand: 'happyhorse', fragments: ['horse'] },
  { brand: 'anthropic', fragments: ['claude', 'opus', 'sonnet'] },
  { brand: 'deepseek', fragments: ['deepseek'] },
  { brand: 'google', fragments: ['gemini', 'banana', 'imagen', 'veo'] },
  { brand: 'midjourney', fragments: ['midjourney', 'mj'] },
];

const BRANDS_BY_MATERIAL = {
  text: ['openai', 'anthropic', 'google', 'deepseek', 'minimax'],
  image: ['openai', 'google', 'bytedance', 'kling', 'midjourney'],
  video: ['bytedance', 'openai', 'minimax', 'kling', 'alibaba', 'happyhorse', 'google'],
} as const;

/** 目录不可用（尚未加载）时的兜底，避免品牌列整列空白。 */
const FALLBACK_MODELS_BY_BRAND: Readonly<Record<string, readonly PickerRow[]>> = {
  bytedance: [
    { id: 'seedance-2-5', name: 'Seedance 2.5', description: '全新 2.5 旗舰视频大模型' },
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

/** 目录行的显示契约是 `label` / `subtitle`；缺失时退回 id，避免出现空白行。 */
function toPickerRows(list: readonly CapabilityModelItem[] | undefined): PickerRow[] {
  return (list ?? []).map((item) => {
    const row = item as unknown as Record<string, unknown>;
    return {
      id: item.id,
      name: typeof row.label === 'string' && row.label ? row.label : item.id,
      ...(typeof row.subtitle === 'string' && row.subtitle ? { description: row.subtitle } : {}),
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

/**
 * 读取浮层要用的不透明表面色。
 *
 * 浮层必须 portal 到 `document.body`：画布所在的宿主面板带 `contain: layout`，
 * 它会让该面板成为 `position: fixed` 后代的包含块，portal 进画布内会让
 * `left/bottom`（相对视口计算）整体错位。
 *
 * 代价是拿不到画布主题 token（`.wf-canvas-root` 作用域的 `--wb-*`），
 * 所以这里在打开时把画布的真实表面色解析出来内联使用。
 */
function resolvePopoverSurface(anchor: HTMLElement | null): string {
  const root = anchor?.closest('.wf-canvas-root');
  if (root) {
    const token = getComputedStyle(root).getPropertyValue('--wb-surface-elevated').trim();
    if (token) return token;
  }
  const panel = anchor?.closest('.wf-config-panel');
  if (panel) {
    const painted = getComputedStyle(panel).backgroundColor;
    if (painted && painted !== 'rgba(0, 0, 0, 0)') return painted;
  }
  return 'var(--dsw-alias-bg-elevated)';
}

/** 三列全开时的最大宽度；定位锚点固定按它钳制，避免列数变化导致浮层横移。 */
const POPOVER_MAX_WIDTH = 786;

const PANEL_STYLE: React.CSSProperties = {
  // 底色由调用处按画布真实表面色覆盖（见 resolvePopoverSurface）；
  // 这里的宿主 token 只是兜底，它是配 backdrop-blur 用的半透明层。
  background: 'var(--dsw-alias-bg-elevated)',
  borderRadius: 14,
  border: '1px solid var(--dsw-alias-border-subtle)',
  boxShadow: '0 16px 36px var(--dsw-alias-shadow-strong, rgba(0, 0, 0, 0.6))',
  height: 480,
  overflowY: 'auto',
};

const ChannelRow: React.FC<{
  group: ChannelGroupItem;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ group, checked, disabled = false, onToggle }) => {
  const priceChip = formatPriceChip(group.pricing?.priceRatio ?? group.pricing?.discountRate);
  const chipIsMarkup = typeof group.pricing?.priceRatio === 'number'
    ? group.pricing.priceRatio > 1
    : typeof group.pricing?.discountRate === 'number' && group.pricing.discountRate > 1;
  const billing = formatBillingLabel(group.pricing?.billingMode);
  // 网关不公布 SLA 的分组照实显示「暂无数据」，不用默认 100% 冒充。
  const stability = group.sla?.stability24h;
  const waitSec = group.sla?.avgWaitTimeSec;

  return (
    <div
      role="menuitemcheckbox"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      className={`wf-cascade-row wf-cascade-channel-row ${checked && !disabled ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>{group.label}</span>
          <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
            {formatPriceLabel(group.pricing)}
          </span>
          {priceChip ? <Chip tone={chipIsMarkup ? 'muted' : 'danger'}>{priceChip}</Chip> : null}
          {group.badge ? <Chip>{group.badge}</Chip> : null}
          {billing ? <Chip>{billing}</Chip> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }}>
          {typeof stability === 'number' ? (
            <>
              <StabilityDotBar rate={stability} />
              <span>24h 稳定率 {stability}%</span>
            </>
          ) : (
            <span>稳定性暂无数据</span>
          )}
          {typeof waitSec === 'number' && waitSec > 0 ? <span>约{Math.round(waitSec / 60)}min</span> : null}
        </div>
      </div>
      <div style={{ paddingLeft: 10 }}>
        {checked && !disabled ? <Check size={15} color="var(--dsw-alias-brand-primary)" strokeWidth={2.5} /> : null}
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
  const { modelId: canonicalModel } = parseModelAndGroup(modelValue);
  const currentModelId = canonicalModel || defaultModelFor(materialType);

  const [activeBrandId, setActiveBrandId] = useState<string>(() => brandForModel(currentModelId, allowedBrands));
  const [activeModelId, setActiveModelId] = useState<string>(currentModelId);
  const [activeStrategy, setActiveStrategy] = useState<RouteStrategy>(routing?.strategy ?? 'stability_first');
  const [hoverBrandId, setHoverBrandId] = useState<string | null>(null);
  const [hoverModelId, setHoverModelId] = useState<string | null>(null);

  const catalogRows = useMemo<PickerRow[]>(() => {
    const rawList = materialType === 'video'
      ? catalog?.video
      : materialType === 'image'
        ? catalog?.image
        : materialType === 'text'
          ? catalog?.text
          : catalog?.models;
    return toPickerRows(rawList);
  }, [catalog, materialType]);

  const modelsForBrand = useCallback((brandId: string): PickerRow[] => {
    const fragments = BRAND_MATCHERS.find((entry) => entry.brand === brandId)?.fragments ?? [];
    const rows = catalogRows.filter((row) => fragments.some((fragment) => row.id.toLowerCase().includes(fragment)));
    if (rows.length > 0) return rows;
    const fallback = FALLBACK_MODELS_BY_BRAND[brandId];
    return fallback ? [...fallback] : [];
  }, [catalogRows]);

  // 品牌列由目录推导：只列真有型号的品牌，避免点进去没有型号的死项。
  const brandList = useMemo(() => {
    const ordered = ALL_BRANDS.filter((brand) => allowedBrands.includes(brand.id));
    const withModels = ordered.filter((brand) => modelsForBrand(brand.id).length > 0);
    const usable = withModels.length > 0
      ? withModels
      : ordered.filter((brand) => FALLBACK_MODELS_BY_BRAND[brand.id]);
    // 当前选中型号所属品牌必须可见，否则当前选择会被藏起来。
    const activeBrand = brandForModel(currentModelId, allowedBrands);
    const activeDef = ordered.find((brand) => brand.id === activeBrand);
    if (activeDef && !usable.some((brand) => brand.id === activeBrand)) return [activeDef, ...usable];
    return usable;
  }, [allowedBrands, modelsForBrand, currentModelId]);

  const shownBrandId = hoverBrandId ?? activeBrandId;
  const shownModels = useMemo(() => {
    const rows = modelsForBrand(shownBrandId);
    // 已提交的型号即使不在目录里也要显示，避免出现「已选中但列表里没有」。
    const needsActive = shownBrandId === activeBrandId
      && activeModelId
      && !rows.some((row) => row.id === activeModelId);
    return needsActive ? [{ id: activeModelId, name: activeModelId }, ...rows] : rows;
  }, [modelsForBrand, shownBrandId, activeBrandId, activeModelId]);

  // 悬停到非选中品牌时只显示二级；悬停到型号（或没有任何悬停）时才显示三级。
  const hoveringOtherBrand = hoverBrandId !== null && hoverBrandId !== activeBrandId;
  const showChannelColumn = hoveringOtherBrand ? hoverModelId !== null : true;

  const channelModelId = hoverModelId ?? activeModelId;
  const channelGroups = useMemo(() => getModelChannelGroups(channelModelId), [channelModelId]);
  const isChannelPreview = hoverModelId !== null && hoverModelId !== activeModelId;

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    () => (routing?.allowedGroups?.length ? routing.allowedGroups : getModelChannelGroups(currentModelId).map((group) => group.id)),
  );

  // 外部数据变化（撤销/重做、快照重载、切换节点）后重新对齐品牌与勾选。
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

  const emit = useCallback((modelId: string, strategy: RouteStrategy, groupIds: string[]) => {
    onSelect({
      modelId,
      strategy,
      ...(groupIds.length === 0 ? {} : { allowedGroups: groupIds }),
    });
  }, [onSelect]);

  /** 悬停只切换预览；写入节点只发生在点击与渠道勾选。 */
  const handleBrandHover = useCallback((brandId: string) => {
    setHoverBrandId(brandId);
    setHoverModelId(null);
  }, []);

  const handleModelHover = useCallback((modelId: string) => {
    setHoverModelId(modelId);
  }, []);

  const handlePopoverLeave = useCallback(() => {
    setHoverBrandId(null);
    setHoverModelId(null);
  }, []);

  const handleBrandClick = useCallback((brandId: string) => {
    setActiveBrandId(brandId);
    setHoverBrandId(brandId);
  }, []);

  const handleSelectModel = useCallback((modelId: string) => {
    setActiveModelId(modelId);
    setActiveBrandId(brandForModel(modelId, allowedBrands));
    const groupIds = getModelChannelGroups(modelId).map((group) => group.id);
    setSelectedGroupIds(groupIds);
    setHoverBrandId(null);
    setHoverModelId(null);
    emit(modelId, activeStrategy, groupIds);
  }, [activeStrategy, allowedBrands, emit]);

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
  const [popoverSurface, setPopoverSurface] = useState<string>('var(--dsw-alias-bg-elevated)');

  useEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPopoverSurface(resolvePopoverSurface(triggerRef.current));
      setPopoverPos({
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
        // 锚点按最大宽度钳制：三列出现/隐藏时浮层不得横向跳动，
        // 否则悬停展开第三列的瞬间菜单会从光标下移走。
        left: Math.max(12, Math.min(rect.left, Math.max(12, window.innerWidth - POPOVER_MAX_WIDTH - 12))),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen]);

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

  // 关闭时丢弃悬停态，下次打开回到「选中链三级全显」的默认视图。
  useEffect(() => {
    if (isOpen) return;
    setHoverBrandId(null);
    setHoverModelId(null);
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
        title={channelGroups.length > 0 ? `渠道策略：${strategyLabel}` : undefined}
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

        {channelGroups.length > 0 ? (
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
            onMouseLeave={handlePopoverLeave}
            style={{
              position: 'fixed',
              background: 'var(--wb-surface-elevated, var(--dsw-alias-bg-elevated))',
              bottom: popoverPos.bottom,
              left: popoverPos.left,
              display: 'flex',
              gap: 8,
              zIndex: 10000,
              alignItems: 'flex-start',
              userSelect: 'none',
            }}
          >
            {/* 栏 1：品牌（悬停即切换二级，点击固定当前列） */}
            <div role="group" aria-label="选择品牌" style={{ ...PANEL_STYLE, width: 160, padding: '10px 6px', display: 'flex', flexDirection: 'column', gap: 4, background: popoverSurface }}>
              <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--dsw-alias-label-secondary)', fontWeight: 500 }}>
                选择模型
              </div>
              {brandList.map((brand) => {
                const isSelected = activeBrandId === brand.id;
                const isHovered = shownBrandId === brand.id && hoverBrandId !== null;
                return (
                  <button
                    key={brand.id}
                    type="button"
                    role="menuitem"
                    aria-current={isSelected}
                    data-testid={`wf-cascade-brand-${brand.id}`}
                    onMouseEnter={() => handleBrandHover(brand.id)}
                    onClick={() => handleBrandClick(brand.id)}
                    className={`wf-cascade-row wf-cascade-brand-item ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
                    style={{
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    <ModelBrandIcon modelId={brand.iconModelId} size={16} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</span>
                    {isSelected ? <Check size={14} color="var(--dsw-alias-brand-primary)" /> : null}
                  </button>
                );
              })}
            </div>

            {/* 栏 2：型号（悬停即预览三级） */}
            <div role="group" aria-label="选择模型版本" style={{ ...PANEL_STYLE, width: 230, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 8, background: popoverSurface }}>
              {shownModels.map((item) => {
                const isSelected = activeModelId === item.id;
                const isHovered = hoverModelId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    aria-current={isSelected}
                    data-testid={`wf-cascade-model-${item.id}`}
                    onMouseEnter={() => handleModelHover(item.id)}
                    onClick={() => handleSelectModel(item.id)}
                    className={`wf-cascade-row wf-cascade-model-item ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span className="wf-cascade-model-item__title">
                        {item.name || item.id}
                      </span>
                      {isSelected ? <Check size={14} color="var(--dsw-alias-brand-primary)" /> : null}
                    </div>
                    {item.description ? (
                      <div className="wf-cascade-model-item__desc">
                        {item.description}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* 栏 3：渠道策略（选中链可见可交互；悬停其他品牌时隐藏，悬停其型号时只读预览） */}
            {showChannelColumn ? (
              <div
                role="group"
                aria-label="选择渠道策略"
                style={{ ...PANEL_STYLE, width: 380, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: popoverSurface }}
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
                            aria-disabled={isChannelPreview}
                            disabled={isChannelPreview}
                            onClick={() => handleStrategyChange(option.id)}
                            className={`wf-cascade-strategy-btn ${isActive ? 'is-active' : ''}`}
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
                          checked={isChannelPreview ? true : selectedGroupIds.includes(group.id)}
                          disabled={isChannelPreview}
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
                      {isChannelPreview ? (
                        <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                          预览中 · 点击该型号后即可调整渠道
                        </div>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>,
          document.body,
        )
        : null}
    </>
  );
};
