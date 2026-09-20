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
  options: readonly PickerCandidate[];
  execBusy?: boolean;
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
  const priceChip = formatPriceChip(group.pricing?.priceRatio ?? group.pricing?.discountRate);
  const chipIsMarkup = typeof group.pricing?.priceRatio === 'number'
    ? group.pricing.priceRatio > 1
    : typeof group.pricing?.discountRate === 'number' && group.pricing.discountRate > 1;
  const billing = formatBillingLabel(group.pricing?.billingMode);

  return (
    <div
      role="menuitemradio"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`wf-cascade-row wf-cascade-channel-row ${checked && !disabled ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>{group.label}</span>
        <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
          {formatPriceLabel(group.pricing)}
        </span>
        {priceChip ? <Chip tone={chipIsMarkup ? 'muted' : 'danger'}>{priceChip}</Chip> : null}
        {group.badge ? <Chip>{group.badge}</Chip> : null}
        {billing ? <Chip>{billing}</Chip> : null}
        {group.description ? (
          <div style={{ width: '100%', fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 2, lineHeight: 1.4 }}>
            {group.description}
          </div>
        ) : null}
      </div>
      <div style={{ paddingLeft: 10 }}>
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
}> = ({ channelGroups, checkedIds, preview = false, onSelect }) => (
  <>
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', padding: '2px 4px 10px' }}>选择版本</div>

    {channelGroups.length === 0 ? (
      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)', padding: '4px' }}>
        该模型尚未配置渠道分组，请求将按模型默认通道执行。
      </div>
    ) : (
      <div className="wf-cascade-channel-list">
        {channelGroups.map((group) => (
          <ChannelRow
            key={group.id}
            group={group}
            checked={checkedIds.includes(group.id)}
            disabled={preview}
            onSelect={() => onSelect?.(group.id)}
          />
        ))}
      </div>
    )}
  </>
);

export const ModelCascadeMenu: React.FC<ModelCascadeMenuProps> = ({
  modelValue,
  routing,
  options,
  execBusy,
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
  const channelGroups = useMemo(() => isPickerCandidate(options, channelModelId) ? getModelChannelGroups(channelModelId) : [], [options, channelModelId]);
  const activeChannelGroups = useMemo(() => isPickerCandidate(options, activeModelId) ? getModelChannelGroups(activeModelId) : [], [options, activeModelId]);
  const hasMultipleChannels = channelGroups.length > 1;
  const showChannelColumn = hasMultipleChannels && (hoveringOtherBrand ? hoverModelId !== null : true);
  const isChannelPreview = hoverModelId !== null && hoverModelId !== activeModelId;

  // 渠道单选收敛：仅选择一个分组并锁定契约
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() => {
    const candidate = routing?.allowedGroups?.[0];
    if (candidate && activeChannelGroups.some((g) => g.id === candidate)) {
      return [candidate];
    }
    return activeChannelGroups[0] ? [activeChannelGroups[0].id] : [];
  });

  // 外部候选或选择变化后丢弃预览，选中态直接由合法持久值派生。
  useEffect(() => {
    setHoverBrandId(null);
    setHoverModelId(null);
  }, [currentModelId, options]);

  const persistedGroups = routing?.allowedGroups;
  useEffect(() => {
    const candidate = persistedGroups?.[0];
    if (candidate && activeChannelGroups.some((g) => g.id === candidate)) {
      setSelectedGroupIds([candidate]);
    } else if (activeChannelGroups[0]) {
      setSelectedGroupIds([activeChannelGroups[0].id]);
    } else {
      setSelectedGroupIds([]);
    }
  }, [activeChannelGroups, persistedGroups]);

  const emit = useCallback((modelId: string, groupIds: string[]) => {
    if (!isPickerCandidate(options, modelId)) return;
    const groups = getModelChannelGroups(modelId);
    if (groupIds.some((id) => !groups.some((group) => group.id === id))) return;
    onSelect({
      modelId,
      strategy: 'auto',
      ...(groupIds.length === 0 ? {} : { allowedGroups: groupIds }),
    });
  }, [onSelect, options]);

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
    const defaultGroup = getModelChannelGroups(modelId)[0]?.id;
    const nextGroupIds = defaultGroup ? [defaultGroup] : [];
    setSelectedGroupIds(nextGroupIds);
    setHoverBrandId(null);
    setHoverModelId(null);
    emit(modelId, nextGroupIds);
  }, [options, emit]);

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

  /**
   * 展开期间锁定浮层高度（Issue #2250）。
   *
   * 浮层底边锚在触发器上、顶边由高度决定：只要悬停能改变高度，顶边就会位移，光标下的行
   * 随之移走、悬停态翻转、内容再变——自我维持成整块浮层频闪抖动（#2195 引入的回归）。
   * 量尺把当前候选集里所有可能出现的列（品牌列、每个品牌的型号列、每个型号的渠道列）
   * 都离屏渲染一遍，取最大自然高度一次性锁定，于是悬停只换内容、不再动外框。
   *
   * 依赖只有展开状态与候选集，**绝不含 hoverBrandId / hoverModelId** —— 这是修复的支点。
   * 用 useLayoutEffect 而非 useEffect，保证绘制前完成锁定，不出现「先按内容高度画一帧再跳变」。
   */
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
  }, [isOpen, brandList]);

  /** 量尺内容只依赖候选集，悬停引发的重渲染在这棵子树上直接 bail out。 */
  const probeColumns = useMemo(() => (
    <>
      <div className="wf-loomi-col wf-loomi-col--brand" data-cascade-probe-col="">
        {brandList.map((brand) => (
          <CascadeBrandItem key={brand.id} brand={brand} isSelected={false} interactive={false} />
        ))}
      </div>
      {brandList.map((brand) => (
        <div key={brand.id} className="wf-loomi-col wf-loomi-col--model" data-cascade-probe-col="">
          {brand.rows.map((item) => (
            <CascadeModelItem key={item.id} item={item} isSelected={false} interactive={false} />
          ))}
        </div>
      ))}
      {brandList.flatMap((brand) => brand.rows).map((item) => {
        const groups = getModelChannelGroups(item.id);
        if (groups.length <= 1) return null;
        return (
          <div key={item.id} className="wf-loomi-col wf-loomi-col--channel" data-cascade-probe-col="">
            <CascadeChannelColumn channelGroups={groups} checkedIds={NO_GROUP_IDS} />
          </div>
        );
      })}
    </>
  ), [brandList]);

  useEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPopoverSurface(resolvePopoverSurface(triggerRef.current));
      setPopoverPos({
        bottom: Math.max(8, Math.min(window.innerHeight - rect.top + 8, Math.max(8, window.innerHeight - (lockedHeightRef.current ?? POPOVER_MAX_HEIGHT) - 12))),
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

  const shortName = activeModelId ? resolveShortModelName(activeModelId, activeFamily) : '待重新选择';
  const selectedGroupId = selectedGroupIds[0];
  const activeGroup = activeChannelGroups.find((g) => g.id === selectedGroupId);

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
        title={activeGroup ? `已选版本：${activeGroup.label}` : undefined}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <ModelBrandIcon modelId={activeModelId} size={15} />
        <span className="wf-model-cascade-capsule__name">{shortName}</span>

        {activeGroup && activeChannelGroups.length > 1 ? (
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
              // 锁定高度：悬停换列不再改变浮层外框，顶边因此纹丝不动。
              ...(lockedHeight === null ? null : { height: lockedHeight }),
            }}
          >
            {/* 栏 1：品牌（宽 168px，悬停即切换二级，点击固定当前列；高度由锁定值统一决定） */}
            <div role="group" aria-label="选择品牌" className="wf-loomi-col wf-loomi-col--brand">
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

            {/* 栏 2：型号（宽 230px，悬停即预览三级；高度由锁定值统一决定） */}
            <div role="group" aria-label="选择模型版本" className="wf-loomi-col wf-loomi-col--model">
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

            {/* 栏 3：渠道分组单选（宽 400px，选中链可见可交互；悬停其他品牌时隐藏，悬停其型号时只读预览） */}
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
