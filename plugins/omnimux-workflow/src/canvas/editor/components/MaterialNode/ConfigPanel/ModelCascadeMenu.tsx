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

import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { ModelBrandIcon } from '../../../../ui/ModelBrandIcon';
import {
  groupPickerCandidates,
  isPickerCandidate,
  type PickerCandidate,
  type PickerCandidateGroup,
} from './modelPickerCandidates';
import {
  formatBillingLabel,
  formatPriceChip,
  formatPriceLabel,
  getModelChannelGroups,
  resolveModelChannelGroups,
  parseModelAndGroup,
  resolveShortModelName,
  isByokGroup,
  buildChannelSelectionPayload,
  type ChannelGroupItem,
  type RuntimeByokChannelSettings,
} from './channelGroups';
import type { ChannelFallbackState } from './channelContractReconciler';

export type RouteStrategy = 'auto' | 'stability_first' | 'cost_first';

export interface ModelCascadeSelectValue {
  modelId: string;
  strategy: RouteStrategy;
  /** Omitted when the node cannot carry channel routing (text nodes). */
  allowedGroups?: string[];
  channelGroupId?: string;
  sourceType?: 'official' | 'byok';
}

export interface ModelCascadeMenuProps {
  modelValue: string;
  routing?: {
    strategy?: RouteStrategy;
    allowedGroups?: string[];
    channelGroupId?: string;
    sourceType?: 'official' | 'byok';
    [key: string]: unknown;
  };
  options: readonly PickerCandidate[];
  execBusy?: boolean;
  runtimeSettings?: RuntimeByokChannelSettings | null;
  fallbackState?: ChannelFallbackState | null;
  onSelect: (value: ModelCascadeSelectValue) => void;
}

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
const POPOVER_MAX_WIDTH = 814;
/** 面板三列默认最小高度与最高弹性封顶高度（Issue #2191 UI 规格：最小 160px 自适应包裹，最高 400px 封顶防溢出）。 */
export const POPOVER_MIN_HEIGHT = 160;
export const POPOVER_MAX_HEIGHT = 400;
/** 向后兼容常量 */
export const POPOVER_HEIGHT = POPOVER_MAX_HEIGHT;

const PANEL_STYLE: React.CSSProperties = {
  // 底色由调用处按画布真实表面色覆盖（见 resolvePopoverSurface）；
  // 这里的宿主 token 只是兜底，它是配 backdrop-blur 用的半透明层。
  background: 'var(--dsw-alias-bg-elevated)',
  borderRadius: 14,
  border: '1px solid var(--dsw-alias-border-subtle)',
  boxShadow: '0 16px 36px var(--dsw-alias-shadow-strong, rgba(0, 0, 0, 0.6))',
  minHeight: POPOVER_MIN_HEIGHT,
  maxHeight: POPOVER_MAX_HEIGHT,
  overflowY: 'auto',
};

/**
 * 量尺宿主：离屏、不可见、不可交互。
 *
 * 里面的列与真实列共用同一批类名与子组件，只是不挂事件，量到的自然高度因此与
 * 真实渲染逐像素一致（换行、图标、间距全同）。
 */
const PROBE_HOST_STYLE: React.CSSProperties = {
  position: 'fixed',
  left: -99999,
  top: 0,
  visibility: 'hidden',
  pointerEvents: 'none',
};

/** 量尺不参与选中，用同一个空数组避免每次渲染换新引用。 */
const NO_GROUP_IDS: readonly string[] = [];

const ChannelRow: React.FC<{
  group: ChannelGroupItem;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}> = ({ group, checked, disabled = false, onSelect }) => {
  const isAvailable = group.isAvailable !== false && group.enabled !== false;
  const isRowDisabled = disabled || !isAvailable;
  const isByok = isByokGroup(group);
  const priceChip = !isByok ? formatPriceChip(group.pricing?.priceRatio ?? group.pricing?.discountRate) : '';
  const chipIsMarkup = typeof group.pricing?.priceRatio === 'number'
    ? group.pricing.priceRatio > 1
    : typeof group.pricing?.discountRate === 'number' && group.pricing.discountRate > 1;
  const billing = !isByok ? formatBillingLabel(group.pricing?.billingMode) : '';
  const priceLabel = !isByok ? formatPriceLabel(group.pricing) : '';

  return (
    <div
      role="menuitemradio"
      aria-checked={checked}
      aria-disabled={isRowDisabled}
      tabIndex={isRowDisabled ? -1 : 0}
      onClick={isRowDisabled ? undefined : onSelect}
      onKeyDown={(event) => {
        if (isRowDisabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`wf-cascade-row wf-cascade-channel-row ${checked && !isRowDisabled ? 'is-checked' : ''} ${isRowDisabled ? 'is-disabled' : ''}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>{group.label}</span>
          {priceLabel ? (
            <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
              {priceLabel}
            </span>
          ) : null}
          {group.chipLabel ? <Chip tone="muted">{group.chipLabel}</Chip> : null}
          {priceChip ? <Chip tone={chipIsMarkup ? 'muted' : 'danger'}>{priceChip}</Chip> : null}
          {billing ? <Chip>{billing}</Chip> : null}
        </div>
        {group.badge ? (
          <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.4 }}>
            {group.badge}
          </div>
        ) : null}
        {group.description ? (
          <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.4 }}>
            {group.description}
          </div>
        ) : null}
      </div>
      <div style={{ paddingLeft: 10, display: 'flex', alignItems: 'center' }}>
        {checked && !disabled ? <Check size={15} color="var(--dsw-alias-brand-primary)" strokeWidth={2.5} /> : null}
      </div>
    </div>
  );
};

/**
 * 品牌项 / 型号项 / 渠道列内容：真实列与量尺列共用同一实现。
 *
 * 量尺量的是真实列的换行与间距，结构与类名一旦分叉就会量偏，所以只保留这一份实现；
 * 量尺以 `interactive=false` 摘掉事件、测试标识与 tab 停靠，其余标记逐字相同。
 */
const CascadeBrandItem: React.FC<{
  brand: PickerCandidateGroup;
  isSelected: boolean;
  isHovered?: boolean;
  interactive?: boolean;
  onHover?: () => void;
  onSelect?: () => void;
}> = ({ brand, isSelected, isHovered = false, interactive = true, onHover, onSelect }) => (
  <button
    type="button"
    role={interactive ? 'menuitem' : undefined}
    aria-current={interactive ? isSelected : undefined}
    data-testid={interactive ? `wf-cascade-brand-${brand.id}` : undefined}
    tabIndex={interactive ? undefined : -1}
    onMouseEnter={interactive ? onHover : undefined}
    onClick={interactive ? onSelect : undefined}
    className={`wf-cascade-brand-item ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
  >
    <ModelBrandIcon modelId={brand.iconModelId} size={18} />
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</span>
    {isSelected ? <Check size={15} color="rgb(0, 230, 118)" strokeWidth={2.5} /> : null}
  </button>
);

const CascadeModelItem: React.FC<{
  item: PickerCandidate;
  isSelected: boolean;
  isHovered?: boolean;
  interactive?: boolean;
  onHover?: () => void;
  onSelect?: () => void;
}> = ({ item, isSelected, isHovered = false, interactive = true, onHover, onSelect }) => (
  <button
    type="button"
    role={interactive ? 'menuitem' : undefined}
    aria-current={interactive ? isSelected : undefined}
    data-testid={interactive ? `wf-cascade-model-${item.id}` : undefined}
    tabIndex={interactive ? undefined : -1}
    onMouseEnter={interactive ? onHover : undefined}
    onClick={interactive ? onSelect : undefined}
    className={`wf-cascade-model-item ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <span className="wf-cascade-model-item__title">
        {(item.label || item.id) || item.id}
      </span>
      {isSelected ? <Check size={15} color="rgb(0, 230, 118)" strokeWidth={2.5} /> : null}
    </div>
    {item.subtitle ? (
      <div className="wf-cascade-model-item__desc">
        {item.subtitle}
      </div>
    ) : null}
  </button>
);

const CascadeChannelColumn: React.FC<{
  channelGroups: readonly ChannelGroupItem[];
  checkedIds: readonly string[];
  preview?: boolean;
  onSelect?: (groupId: string) => void;
  runtimeSettings?: RuntimeByokChannelSettings | null;
  fallbackState?: ChannelFallbackState | null;
}> = ({ channelGroups, checkedIds, preview = false, onSelect, runtimeSettings, fallbackState }) => {
  const handleSelectGroup = (groupId: string) => {
    onSelect?.(groupId);
  };
  const officialGroups = useMemo(
    () => channelGroups.filter((g) => !isByokGroup(g)),
    [channelGroups],
  );
  const byokGroups = useMemo(
    () => channelGroups.filter((g) => isByokGroup(g)),
    [channelGroups],
  );

  const hasByokEnvSupport = useMemo(() => {
    if (byokGroups.length > 0) return true;
    if (fallbackState?.isFallback) return true;
    if (runtimeSettings) {
      if (runtimeSettings.runtimeKeyVerified || runtimeSettings.runtimeMediaProvider) return true;
      if (Array.isArray(runtimeSettings.byokProviders) && runtimeSettings.byokProviders.length > 0) return true;
    }
    return false;
  }, [byokGroups, fallbackState?.isFallback, runtimeSettings]);

  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', padding: '6px 8px 8px' }}>
        渠道
      </div>

      {channelGroups.length === 0 ? (
        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)', padding: '4px 8px' }}>
          该模型尚未配置渠道分组，请求将按模型默认通道执行。
        </div>
      ) : (
        <div className="wf-cascade-channel-sections" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {officialGroups.length > 0 ? (
            <div className="wf-cascade-channel-section">
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-tertiary)', padding: '2px 8px 6px' }}>
                官方专线
              </div>
              <div className="wf-cascade-channel-list">
                {officialGroups.map((group) => (
                  <ChannelRow
                    key={group.id}
                    group={group}
                    checked={checkedIds.includes(group.id)}
                    disabled={preview}
                    onSelect={() => handleSelectGroup(group.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {hasByokEnvSupport ? (
            <div
              className="wf-cascade-channel-section"
              style={officialGroups.length > 0 ? { borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 8 } : undefined}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-tertiary)', padding: '2px 8px 6px' }}>
                自备渠道
              </div>
              {byokGroups.length > 0 ? (
                <div className="wf-cascade-channel-list">
                  {byokGroups.map((group) => (
                    <ChannelRow
                      key={group.id}
                      group={group}
                      checked={checkedIds.includes(group.id)}
                      disabled={preview}
                      onSelect={() => handleSelectGroup(group.id)}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-dimmed)', padding: '4px 8px 6px' }}>
                  未配置自备渠道
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
};

export const ModelCascadeMenu: React.FC<ModelCascadeMenuProps> = ({
  modelValue,
  routing,
  options,
  execBusy,
  runtimeSettings,
  fallbackState,
  onSelect,
}) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  /** place() 只在展开时注册一次，用 ref 读锁定高度，避免闭包读到展开那一刻的旧值。 */
  const lockedHeightRef = useRef<number | null>(null);

  const brandList = useMemo(() => groupPickerCandidates(options), [options]);
  const { modelId: canonicalModel } = parseModelAndGroup(modelValue);
  const currentModelId = isPickerCandidate(options, canonicalModel) ? canonicalModel : '';
  const activeModelId = currentModelId;
  const activeBrandId = brandList.find((brand) => brand.rows.some((row) => row.id === activeModelId))?.id ?? '';
  const [hoverBrandId, setHoverBrandId] = useState<string | null>(null);
  const [hoverModelId, setHoverModelId] = useState<string | null>(null);

  const activeFamily = options.find((row) => row.id === activeModelId)?.family;
  const modelsForBrand = useCallback((brandId: string) => (
    brandList.find((brand) => brand.id === brandId)?.rows ?? []
  ), [brandList]);
  const shownBrandId = hoverBrandId ?? (activeBrandId || brandList[0]?.id || '');
  const shownModels = modelsForBrand(shownBrandId);

  // 悬停到非选中品牌时只显示二级；悬停到型号（或没有任何悬停）时才显示三级。
  // 渠道列（三级菜单）仅在模型有多个可选渠道时（>1）才展示；
  // 若分组为空（0个）或只有唯一默认渠道（<=1），则直接不显示三级菜单。
  const hoveringOtherBrand = hoverBrandId !== null && hoverBrandId !== activeBrandId;
  const channelModelId = hoverModelId ?? activeModelId;
  const channelGroups = useMemo(
    () => isPickerCandidate(options, channelModelId) ? getModelChannelGroups(channelModelId, runtimeSettings) : [],
    [options, channelModelId, runtimeSettings],
  );
  const activeChannelGroups = useMemo(
    () => isPickerCandidate(options, activeModelId) ? getModelChannelGroups(activeModelId, runtimeSettings) : [],
    [options, activeModelId, runtimeSettings],
  );
  const hasMultipleChannels = channelGroups.length > 1;
  const showChannelColumn = hasMultipleChannels && (hoveringOtherBrand ? hoverModelId !== null : true);
  const isChannelPreview = hoverModelId !== null && hoverModelId !== activeModelId;

  // 渠道单选收敛：仅选择一个分组并锁定契约
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() => {
    const rawAllowed = routing?.allowedGroups?.[0];
    const rawExplicit = routing?.channelGroupId;
    const normAllowed = typeof rawAllowed === 'string' && rawAllowed.trim() !== '' ? rawAllowed.trim() : undefined;
    const normExplicit = typeof rawExplicit === 'string' && rawExplicit.trim() !== '' ? rawExplicit.trim() : undefined;
    let candidate: string | undefined;
    if (normAllowed && normExplicit && normAllowed !== normExplicit) {
      // 检测到 normAllowed 与 normExplicit 冲突时优先取 normExplicit（BYOK 权威 ID）或回退至安全首项
      candidate = activeChannelGroups.some((g) => g.id === normExplicit)
        ? normExplicit
        : activeChannelGroups.some((g) => g.id === normAllowed)
        ? normAllowed
        : activeChannelGroups.find((group) => group.enabled !== false && group.isAvailable !== false)?.id;
    } else {
      candidate = normExplicit ?? normAllowed;
    }
    if (candidate && activeChannelGroups.some((g) => g.id === candidate && g.enabled !== false && g.isAvailable !== false)) {
      return [candidate];
    }
    const fallbackGroup = activeChannelGroups.find((group) => group.enabled !== false && group.isAvailable !== false);
    return fallbackGroup ? [fallbackGroup.id] : [];
  });

  // 外部候选或选择变化后丢弃预览，选中态直接由合法持久值派生。
  useEffect(() => {
    setHoverBrandId(null);
    setHoverModelId(null);
  }, [currentModelId, options]);

  const persistedGroups = routing?.allowedGroups;
  const persistedGroupId = routing?.channelGroupId;
  useEffect(() => {
    const rawAllowed = persistedGroups?.[0];
    const rawExplicit = persistedGroupId;
    const normAllowed = typeof rawAllowed === 'string' && rawAllowed.trim() !== '' ? rawAllowed.trim() : undefined;
    const normExplicit = typeof rawExplicit === 'string' && rawExplicit.trim() !== '' ? rawExplicit.trim() : undefined;
    let candidate: string | undefined;
    if (normAllowed && normExplicit && normAllowed !== normExplicit) {
      // 检测到 normAllowed 与 normExplicit 冲突时优先取 normExplicit（BYOK 权威 ID）或回退至安全首项
      candidate = activeChannelGroups.some((g) => g.id === normExplicit)
        ? normExplicit
        : activeChannelGroups.some((g) => g.id === normAllowed)
        ? normAllowed
        : activeChannelGroups.find((group) => group.enabled !== false && group.isAvailable !== false)?.id;
    } else {
      candidate = normExplicit ?? normAllowed;
    }
    if (candidate && activeChannelGroups.some((g) => g.id === candidate && g.enabled !== false && g.isAvailable !== false)) {
      setSelectedGroupIds([candidate]);
    } else {
      const fallbackGroup = activeChannelGroups.find((group) => group.enabled !== false && group.isAvailable !== false);
      setSelectedGroupIds(fallbackGroup ? [fallbackGroup.id] : []);
    }
  }, [activeChannelGroups, persistedGroups, persistedGroupId]);

  const emit = useCallback((modelId: string, groupIds: string[]) => {
    if (!isPickerCandidate(options, modelId)) return;
    const groups = resolveModelChannelGroups(modelId, runtimeSettings);
    const payload = buildChannelSelectionPayload(modelId, groupIds, groups);
    if (!payload) return;
    onSelect(payload);
  }, [onSelect, options, runtimeSettings]);

  /** 悬停只切换预览；写入节点只发生在点击与渠道单选。 */
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

  const handleSelectModel = useCallback((modelId: string) => {
    if (!isPickerCandidate(options, modelId)) return;
    const groups = resolveModelChannelGroups(modelId, runtimeSettings);
    const defaultGroup = groups.find((group) => group.enabled !== false && group.isAvailable !== false)?.id;
    const nextGroupIds = defaultGroup ? [defaultGroup] : [];
    setSelectedGroupIds(nextGroupIds);
    setHoverBrandId(null);
    setHoverModelId(null);
    emit(modelId, nextGroupIds);
  }, [options, runtimeSettings, emit]);

  /** 点击品牌只选择该分组的真实候选首项。 */
  const handleBrandClick = useCallback((brandId: string) => {
    const targetModelId = modelsForBrand(brandId)[0]?.id;
    if (targetModelId) handleSelectModel(targetModelId);
  }, [handleSelectModel, modelsForBrand]);

  const handleSelectGroup = useCallback((groupId: string) => {
    if (!isPickerCandidate(options, activeModelId) || !activeChannelGroups.some((group) => group.id === groupId)) return;
    const next = [groupId];
    setSelectedGroupIds(next);
    emit(activeModelId, next);
  }, [options, activeChannelGroups, activeModelId, emit]);

  const [popoverPos, setPopoverPos] = useState<{ bottom: number; left: number }>({ bottom: 44, left: 16 });
  const [popoverSurface, setPopoverSurface] = useState<string>('var(--dsw-alias-bg-elevated)');

  useLayoutEffect(() => {
    if (!isOpen) {
      lockedHeightRef.current = null;
      setLockedHeight(null);
      return;
    }
    const host = probeRef.current;
    if (!host) return;
    let tallest = POPOVER_MIN_HEIGHT;
    for (const column of host.querySelectorAll<HTMLElement>('[data-cascade-probe-col]')) {
      tallest = Math.max(tallest, column.getBoundingClientRect().height);
    }
    const locked = Math.min(POPOVER_MAX_HEIGHT, Math.max(POPOVER_MIN_HEIGHT, Math.round(tallest)));
    lockedHeightRef.current = locked;
    setLockedHeight((prev) => (prev === locked ? prev : locked));
  }, [isOpen, brandList, runtimeSettings, fallbackState?.isFallback]);

  /** 量尺内容只依赖候选集与运行时配置，悬停引发的重渲染在这棵子树上直接 bail out。 */
  const probeColumns = useMemo(() => (
    <>
      <div className="wf-loomi-col wf-loomi-col--brand" data-cascade-probe-col="">
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', padding: '6px 8px 8px' }}>品牌</div>
        {brandList.map((brand) => (
          <CascadeBrandItem key={brand.id} brand={brand} isSelected={false} interactive={false} />
        ))}
      </div>
      {brandList.map((brand) => (
        <div key={brand.id} className="wf-loomi-col wf-loomi-col--model" data-cascade-probe-col="">
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', padding: '6px 8px 8px' }}>型号</div>
          {brand.rows.map((item) => (
            <CascadeModelItem key={item.id} item={item} isSelected={false} interactive={false} />
          ))}
        </div>
      ))}
      {brandList.flatMap((brand) => brand.rows).map((item) => {
        const groups = resolveModelChannelGroups(item.id, runtimeSettings);
        if (groups.length <= 1) return null;
        return (
          <div key={item.id} className="wf-loomi-col wf-loomi-col--channel" data-cascade-probe-col="">
            <CascadeChannelColumn
              channelGroups={groups}
              checkedIds={NO_GROUP_IDS}
              runtimeSettings={runtimeSettings}
              fallbackState={fallbackState}
            />
          </div>
        );
      })}
    </>
  ), [brandList, runtimeSettings, fallbackState]);

  useEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPopoverSurface(resolvePopoverSurface(triggerRef.current));
      setPopoverPos({
        bottom: Math.max(8, Math.min(window.innerHeight - rect.top + 8, Math.max(8, window.innerHeight - (lockedHeightRef.current ?? POPOVER_MAX_HEIGHT) - 12))),
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

  useEffect(() => {
    if (isOpen) return;
    setHoverBrandId(null);
    setHoverModelId(null);
  }, [isOpen]);

  const shortName = activeModelId ? resolveShortModelName(activeModelId, activeFamily) : '待重新选择';
  const selectedGroupId = selectedGroupIds[0];
  const activeGroup = activeChannelGroups.find((g) => g.id === selectedGroupId);
  const isFallback = Boolean(fallbackState?.isFallback);
  const triggerDisplayText = isFallback
    ? (fallbackState?.triggerDisplayText || shortName)
    : (activeGroup ? `${shortName} · ${activeGroup.label}` : shortName);

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
        title={triggerDisplayText}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <ModelBrandIcon modelId={activeModelId} size={15} />
        <span className="wf-model-cascade-capsule__name">{isFallback ? triggerDisplayText : shortName}</span>

        {activeGroup && activeChannelGroups.length > 1 && !isFallback ? (
          <span className="wf-model-cascade-capsule__badge">
            <span>{activeGroup.label}</span>
          </span>
        ) : null}

        <ChevronDown className="wf-model-cascade-capsule__chevron" size={14} strokeWidth={1.75} />
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={popoverRef}
            className="wf-model-cascade-popover wf-loomi-popover nodrag nopan"
            role="menu"
            aria-label="选择模型与渠道策略"
            onMouseLeave={handlePopoverLeave}
            style={{
              bottom: popoverPos.bottom,
              left: popoverPos.left,
              ...(lockedHeight === null ? null : { height: lockedHeight }),
            }}
          >
            {/* 栏 1：品牌 */}
            <div role="group" aria-label="选择品牌" className="wf-loomi-col wf-loomi-col--brand">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', padding: '6px 8px 8px' }}>品牌</div>
              {brandList.map((brand) => {
                const isSelected = activeBrandId === brand.id;
                const isHovered = shownBrandId === brand.id && hoverBrandId !== null;
                return (
                  <CascadeBrandItem
                    key={brand.id}
                    brand={brand}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    onHover={() => handleBrandHover(brand.id)}
                    onSelect={() => handleBrandClick(brand.id)}
                  />
                );
              })}
            </div>

            {/* 栏 2：型号 */}
            <div role="group" aria-label="选择模型版本" className="wf-loomi-col wf-loomi-col--model">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', padding: '6px 8px 8px' }}>型号</div>
              {shownModels.map((item) => {
                const isSelected = activeModelId === item.id;
                const isHovered = hoverModelId === item.id;
                return (
                  <CascadeModelItem
                    key={item.id}
                    item={item}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    onHover={() => handleModelHover(item.id)}
                    onSelect={() => handleSelectModel(item.id)}
                  />
                );
              })}
            </div>

            {/* 栏 3：渠道分组单选 */}
            {showChannelColumn ? (
              <div
                role="group"
                aria-label="选择渠道策略"
                className="wf-loomi-col wf-loomi-col--channel"
              >
                <CascadeChannelColumn
                  channelGroups={channelGroups}
                  checkedIds={isChannelPreview ? [channelGroups[0]?.id ?? ''] : selectedGroupIds}
                  preview={isChannelPreview}
                  onSelect={handleSelectGroup}
                  runtimeSettings={runtimeSettings}
                  fallbackState={fallbackState}
                />
              </div>
            ) : null}

            {/* 量尺：离屏渲染候选集里所有可能的列形态，只量高度，不进无障碍树、不可交互 */}
            <div ref={probeRef} aria-hidden="true" style={PROBE_HOST_STYLE}>
              {probeColumns}
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
};
