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
import { groupPickerCandidates, isPickerCandidate, type PickerCandidate } from './modelPickerCandidates';
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
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>{group.label}</span>
        <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
          {formatPriceLabel(group.pricing)}
        </span>
        {priceChip ? <Chip tone={chipIsMarkup ? 'muted' : 'danger'}>{priceChip}</Chip> : null}
        {group.badge ? <Chip>{group.badge}</Chip> : null}
        {billing ? <Chip>{billing}</Chip> : null}
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
  options,
  execBusy,
  onSelect,
}) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const brandList = useMemo(() => groupPickerCandidates(options), [options]);
  const { modelId: canonicalModel } = parseModelAndGroup(modelValue);
  const currentModelId = isPickerCandidate(options, canonicalModel) ? canonicalModel : '';
  const activeModelId = currentModelId;
  const activeBrandId = brandList.find((brand) => brand.rows.some((row) => row.id === activeModelId))?.id ?? '';
  const [activeStrategy, setActiveStrategy] = useState<RouteStrategy>(routing?.strategy ?? 'stability_first');
  const [hoverBrandId, setHoverBrandId] = useState<string | null>(null);
  const [hoverModelId, setHoverModelId] = useState<string | null>(null);

  const activeFamily = options.find((row) => row.id === activeModelId)?.family;
  const modelsForBrand = useCallback((brandId: string) => (
    brandList.find((brand) => brand.id === brandId)?.rows ?? []
  ), [brandList]);
  const shownBrandId = hoverBrandId ?? (activeBrandId || brandList[0]?.id || '');
  const shownModels = modelsForBrand(shownBrandId);

  // 悬停到非选中品牌时只显示二级；悬停到型号（或没有任何悬停）时才显示三级。
  // 渠道策略列（三级菜单）仅在模型有多个可选渠道时（>1）才展示；
  // 若分组为空（0个）或只有唯一默认渠道（<=1），则直接不显示三级菜单。
  const hoveringOtherBrand = hoverBrandId !== null && hoverBrandId !== activeBrandId;
  const channelModelId = hoverModelId ?? activeModelId;
  const channelGroups = useMemo(() => isPickerCandidate(options, channelModelId) ? getModelChannelGroups(channelModelId) : [], [options, channelModelId]);
  const activeChannelGroups = useMemo(() => isPickerCandidate(options, activeModelId) ? getModelChannelGroups(activeModelId) : [], [options, activeModelId]);
  const hasMultipleChannels = channelGroups.length > 1;
  const showChannelColumn = hasMultipleChannels && (hoveringOtherBrand ? hoverModelId !== null : true);
  const isChannelPreview = hoverModelId !== null && hoverModelId !== activeModelId;

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    () => (routing?.allowedGroups ?? activeChannelGroups.map((group) => group.id))
      .filter((id) => activeChannelGroups.some((group) => group.id === id)),
  );

  // 外部候选或选择变化后丢弃预览，选中态直接由合法持久值派生。
  useEffect(() => {
    setHoverBrandId(null);
    setHoverModelId(null);
  }, [currentModelId, options]);

  useEffect(() => {
    if (routing?.strategy) setActiveStrategy(routing.strategy);
  }, [routing?.strategy]);

  const persistedGroups = routing?.allowedGroups;
  useEffect(() => {
    setSelectedGroupIds((persistedGroups ?? activeChannelGroups.map((group) => group.id))
      .filter((id) => activeChannelGroups.some((group) => group.id === id)));
  }, [activeChannelGroups, persistedGroups]);

  const emit = useCallback((modelId: string, strategy: RouteStrategy, groupIds: string[]) => {
    if (!isPickerCandidate(options, modelId)) return;
    const groups = getModelChannelGroups(modelId);
    if (groupIds.some((id) => !groups.some((group) => group.id === id))) return;
    onSelect({
      modelId,
      strategy,
      ...(groupIds.length === 0 ? {} : { allowedGroups: groupIds }),
    });
  }, [onSelect, options]);

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

  const handleSelectModel = useCallback((modelId: string) => {
    if (!isPickerCandidate(options, modelId)) return;
    const groupIds = getModelChannelGroups(modelId).map((group) => group.id);
    setSelectedGroupIds(groupIds);
    setHoverBrandId(null);
    setHoverModelId(null);
    emit(modelId, activeStrategy, groupIds);
  }, [activeStrategy, options, emit]);

  /** 点击品牌只选择该分组的真实候选首项。 */
  const handleBrandClick = useCallback((brandId: string) => {
    const targetModelId = modelsForBrand(brandId)[0]?.id;
    if (targetModelId) handleSelectModel(targetModelId);
  }, [handleSelectModel, modelsForBrand]);

  const handleStrategyChange = useCallback((strategy: RouteStrategy) => {
    if (!isPickerCandidate(options, activeModelId)) return;
    setActiveStrategy(strategy);
    emit(activeModelId, strategy, selectedGroupIds);
  }, [options, activeModelId, selectedGroupIds, emit]);

  const toggleGroupSelection = useCallback((groupId: string) => {
    if (!isPickerCandidate(options, activeModelId) || !activeChannelGroups.some((group) => group.id === groupId)) return;
    const prev = selectedGroupIds.filter((id) => activeChannelGroups.some((group) => group.id === id));
    // 至少保留一个渠道；副作用不放进 React 状态更新函数。
    if (prev.includes(groupId) && prev.length <= 1) return;
    const next = prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId];
    setSelectedGroupIds(next);
    emit(activeModelId, activeStrategy, next);
  }, [options, selectedGroupIds, activeChannelGroups, activeModelId, activeStrategy, emit]);

  const applyGroupSelection = useCallback((groupIds: string[]) => {
    if (!isPickerCandidate(options, activeModelId) || groupIds.some((id) => !activeChannelGroups.some((group) => group.id === id))) return;
    setSelectedGroupIds(groupIds);
    emit(activeModelId, activeStrategy, groupIds);
  }, [options, activeChannelGroups, activeModelId, activeStrategy, emit]);

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

  const shortName = activeModelId ? resolveShortModelName(activeModelId, activeFamily) : '待重新选择';
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

        {activeChannelGroups.length > 1 ? (
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
            className="wf-model-cascade-popover wf-loomi-popover nodrag nopan"
            role="menu"
            aria-label="选择模型与渠道策略"
            onMouseLeave={handlePopoverLeave}
            style={{
              bottom: popoverPos.bottom,
              left: popoverPos.left,
            }}
          >
            {/* 栏 1：品牌（168px x 360px，悬停即切换二级，点击固定当前列） */}
            <div role="group" aria-label="选择品牌" className="wf-loomi-col wf-loomi-col--brand">
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
                    className={`wf-cascade-brand-item ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
                  >
                    <ModelBrandIcon modelId={brand.iconModelId} size={18} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</span>
                    {isSelected ? <Check size={15} color="rgb(0, 230, 118)" strokeWidth={2.5} /> : null}
                  </button>
                );
              })}
            </div>

            {/* 栏 2：型号（230px x 360px，悬停即预览三级） */}
            <div role="group" aria-label="选择模型版本" className="wf-loomi-col wf-loomi-col--model">
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
              })}
            </div>

            {/* 栏 3：渠道策略（400px，选中链可见可交互；悬停其他品牌时隐藏，悬停其型号时只读预览） */}
            {showChannelColumn ? (
              <div
                role="group"
                aria-label="选择渠道策略"
                className="wf-loomi-col wf-loomi-col--channel"
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', padding: '2px 4px' }}>选择渠道策略</div>

                {channelGroups.length === 0 ? (
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)', padding: '4px' }}>
                    该模型尚未配置渠道分组，请求将按模型默认通道执行。
                  </div>
                ) : (
                  <>
                    <div className="wf-cascade-strategy-grid">
                      {([
                        { id: 'stability_first' as const, label: '稳定性优先', icon: <ShieldCheck size={16} /> },
                        { id: 'cost_first' as const, label: '低价优先', icon: <Percent size={15} /> },
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
                              <span style={{ color: isActive ? 'rgb(0, 230, 118)' : 'var(--dsw-alias-label-secondary)', display: 'inline-flex' }}>
                                {option.icon}
                              </span>
                              {option.label}
                            </span>
                            {isActive ? <Check size={14} color="rgb(0, 230, 118)" strokeWidth={2.5} /> : null}
                          </button>
                        );
                      })}
                    </div>

                    <div className="wf-cascade-channel-list">
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

                    {!isChannelPreview ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: 10,
                          borderTop: '1px solid rgba(255, 255, 255, 0.10)',
                        }}
                      >
                        <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                          已选 {selectedCount}/{channelGroups.length} 个
                        </div>
                        <div style={{ display: 'flex', gap: 14 }}>
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
                            style={{ background: 'transparent', border: 'none', color: 'var(--dsw-alias-label-primary)', fontSize: 12, cursor: 'pointer', padding: 0 }}
                          >
                            全选
                          </button>
                        </div>
                      </div>
                    ) : null}
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
