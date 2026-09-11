/**
 * ModelCascadeMenu — 画布节点三级级联浮层选择菜单 (品牌 -> 型号 -> 渠道策略与多选池)
 *
 * 1:1 还原参考设计规范：
 * 1. 触发药丸：[品牌Icon] [型号短名] [策略Icon] [渠道数] [向下箭头]
 * 2. 第一级浮层：选择品牌 (Brand)
 * 3. 第二级浮层：模型版本 (Model Variant)
 * 4. 第三级浮层：选择渠道策略 (稳定性优先 vs 低价优先) 与渠道池卡片多选列表 (含点阵稳定率与折扣标签)
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ShieldCheck, Percent, ChevronDown } from 'lucide-react';
import { ModelBrandIcon } from '../../../../ui/ModelBrandIcon';
import type { CapabilityCatalog, CapabilityModelItem } from '../../../../../shared/api';
import {
  getOrGenerateModelChannelGroups,
  parseModelAndGroup,
  resolveShortModelName,
  type ChannelGroupItem,
} from './channelGroups';

export type RouteStrategy = 'auto' | 'stability_first' | 'cost_first';

export interface ModelCascadeSelectValue {
  modelId: string;
  strategy: RouteStrategy;
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

// 预置核心品牌定义
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

/**
 * 24h 稳定率 20 点阵指示器组件
 */
const StabilityDotBar: React.FC<{ rate: number }> = ({ rate }) => {
  const totalDots = 18;
  const activeDots = Math.round((rate / 100) * totalDots);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: totalDots }).map((_, idx) => {
        const isLit = idx < activeDots;
        return (
          <span
            key={idx}
            style={{
              width: 3.5,
              height: 3.5,
              borderRadius: '50%',
              background: isLit
                ? 'var(--dsw-alias-brand-primary, var(--dsw-alias-state-success))'
                : 'var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.15))',
              display: 'inline-block',
            }}
          />
        );
      })}
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
  const [isOpen, setIsOpen] = useState(false);

  // 1. 规范化当前模型和分组
  const { modelId: canonicalModel } = parseModelAndGroup(modelValue);
  const currentModelId = canonicalModel || (materialType === 'video' ? 'seedance-2-0-fast' : materialType === 'image' ? 'gpt-image-2.5' : 'claude-opus-4-6');
  const currentStrategy: RouteStrategy = routing?.strategy || 'stability_first';

  // 2. 解析当前模型所属品牌
  const initialBrandId = useMemo(() => {
    const id = currentModelId.toLowerCase();
    if (id.includes('seed')) return 'bytedance';
    if (id.includes('minimax') || id.includes('hailuo')) return 'minimax';
    if (id.includes('kling')) return 'kling';
    if (id.includes('wan') || id.includes('happyhorse')) return 'alibaba';
    if (id.includes('claude') || id.includes('opus') || id.includes('sonnet')) return 'anthropic';
    if (id.includes('deepseek')) return 'deepseek';
    if (id.includes('gemini') || id.includes('banana') || id.includes('veo')) return 'google';
    if (id.includes('midjourney')) return 'midjourney';
    if (id.includes('gpt') || id.includes('o1') || id.includes('o3')) return 'all_x';
    return 'bytedance';
  }, [currentModelId]);

  const [activeBrandId, setActiveBrandId] = useState<string>(initialBrandId);
  const [activeModelId, setActiveModelId] = useState<string>(currentModelId);
  const [activeStrategy, setActiveStrategy] = useState<RouteStrategy>(currentStrategy);

  // 当外部 modelValue 或 routing 变化时同步
  useEffect(() => {
    if (canonicalModel) {
      setActiveModelId(canonicalModel);
    }
  }, [canonicalModel]);

  useEffect(() => {
    if (routing?.strategy) {
      setActiveStrategy(routing.strategy);
    }
  }, [routing?.strategy]);

  // 3. 当前模态适用的品牌列表
  const brandList = useMemo(() => {
    if (materialType === 'text') {
      return ALL_BRANDS.filter((b) => ['all_x', 'anthropic', 'deepseek', 'google', 'minimax'].includes(b.id));
    }
    if (materialType === 'image') {
      return ALL_BRANDS.filter((b) => ['all_omni', 'midjourney', 'all_x', 'bytedance', 'kling'].includes(b.id));
    }
    // 默认视频
    return ALL_BRANDS.filter((b) => ['all_omni', 'all_x', 'bytedance', 'minimax', 'kling', 'alibaba', 'happyhorse'].includes(b.id));
  }, [materialType]);

  // 4. 当前品牌下的模型型号列表
  const modelListInBrand = useMemo(() => {
    const rawList = (materialType === 'video'
      ? catalog?.video
      : materialType === 'image'
        ? catalog?.image
        : materialType === 'text'
          ? catalog?.text
          : catalog?.models) || [];

    const items = (rawList as CapabilityModelItem[]).filter((m) => {
      const id = m.id.toLowerCase();
      if (activeBrandId === 'bytedance') return id.includes('seed');
      if (activeBrandId === 'minimax') return id.includes('minimax') || id.includes('hailuo');
      if (activeBrandId === 'kling') return id.includes('kling');
      if (activeBrandId === 'alibaba') return id.includes('wan');
      if (activeBrandId === 'happyhorse') return id.includes('happyhorse') || id.includes('wan');
      if (activeBrandId === 'anthropic') return id.includes('claude');
      if (activeBrandId === 'deepseek') return id.includes('deepseek');
      if (activeBrandId === 'google') return id.includes('gemini') || id.includes('veo') || id.includes('banana');
      if (activeBrandId === 'midjourney') return id.includes('midjourney');
      if (activeBrandId === 'all_x') return id.includes('gpt') || id.includes('o1') || id.includes('o3');
      if (activeBrandId === 'all_omni') return true;
      return false;
    });

    if (items.length > 0) return items;

    // 默认 Seedance 兜底备选列表
    if (activeBrandId === 'bytedance') {
      return [
        { id: 'seedance-2-5', name: 'Seedance 2.5', description: '全新 2.5 旗舰全能视频大模型' },
        { id: 'seedance-2-0', name: 'Seedance 2.0', description: '官方 Seedance 2.0 全能视频模型，支持文生、首帧、首尾帧、多参考图' },
        { id: 'seedance-2-0-mini', name: 'Seedance 2.0 Mini', description: '官方 Seedance 2.0 Mini，轻量视频模型，支持文生、首帧、首尾帧' },
        { id: 'seedance-2-0-fast', name: 'Seedance 2.0 Fast', description: '官方 Seedance 2.0 快速版，支持文生、首帧、首尾帧、多参考图，极速出片' },
      ] as CapabilityModelItem[];
    }

    return [{ id: activeModelId, name: activeModelId, description: '全功能模型' }] as CapabilityModelItem[];
  }, [catalog, materialType, activeBrandId, activeModelId]);

  // 5. 当前选中模型的渠道分组池
  const channelGroups = useMemo(() => {
    return getOrGenerateModelChannelGroups(activeModelId);
  }, [activeModelId]);

  // 6. 已选渠道池列表 (多选状态)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() => {
    if (routing?.allowedGroups && routing.allowedGroups.length > 0) {
      return routing.allowedGroups;
    }
    return channelGroups.map((g) => g.id);
  });

  // 当切换模型时，重置并选中该模型的全部渠道
  const handleSelectModel = useCallback((modelId: string) => {
    setActiveModelId(modelId);
    const groups = getOrGenerateModelChannelGroups(modelId);
    const groupIds = groups.map((g) => g.id);
    setSelectedGroupIds(groupIds);
    onSelect({
      modelId,
      strategy: activeStrategy,
      allowedGroups: groupIds,
    });
  }, [activeStrategy, onSelect]);

  const handleStrategyChange = useCallback((strat: RouteStrategy) => {
    setActiveStrategy(strat);
    onSelect({
      modelId: activeModelId,
      strategy: strat,
      allowedGroups: selectedGroupIds,
    });
  }, [activeModelId, selectedGroupIds, onSelect]);

  const toggleGroupSelection = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) => {
      let next: string[];
      if (prev.includes(groupId)) {
        if (prev.length <= 1) return prev; // 至少保留 1 个
        next = prev.filter((id) => id !== groupId);
      } else {
        next = [...prev, groupId];
      }
      onSelect({
        modelId: activeModelId,
        strategy: activeStrategy,
        allowedGroups: next,
      });
      return next;
    });
  }, [activeModelId, activeStrategy, onSelect]);

  const handleClear = useCallback(() => {
    if (channelGroups.length > 0) {
      const single = [channelGroups[0].id];
      setSelectedGroupIds(single);
      onSelect({
        modelId: activeModelId,
        strategy: activeStrategy,
        allowedGroups: single,
      });
    }
  }, [channelGroups, activeModelId, activeStrategy, onSelect]);

  const handleSelectAll = useCallback(() => {
    const all = channelGroups.map((g) => g.id);
    setSelectedGroupIds(all);
    onSelect({
      modelId: activeModelId,
      strategy: activeStrategy,
      allowedGroups: all,
    });
  }, [channelGroups, activeModelId, activeStrategy, onSelect]);

  // 计算浮层弹出定位坐标（紧贴底栏触发按钮上方）
  const [popoverPos, setPopoverPos] = useState<{ bottom: number; left: number }>({ bottom: 44, left: 16 });

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const bottom = window.innerHeight - rect.top + 8;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 820));
    setPopoverPos({ bottom, left });
  }, [isOpen]);

  // 点击外部自动关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (triggerRef.current?.contains(target)) return;
      const popoverEl = document.querySelector('.wf-model-cascade-popover');
      if (popoverEl && popoverEl.contains(target)) return;
      setIsOpen(false);
    };
    window.addEventListener('mousedown', handleDocumentClick, true);
    return () => {
      window.removeEventListener('mousedown', handleDocumentClick, true);
    };
  }, [isOpen]);

  // 触发胶囊展示文案
  const shortName = resolveShortModelName(activeModelId);
  const selectedCount = selectedGroupIds.length;

  return (
    <>
      {/* 底部触发器胶囊：[品牌Icon] [型号名称] [策略Icon] [渠道数] [向下展开箭头] */}
      <button
        ref={triggerRef}
        type="button"
        className="wf-model-cascade-capsule"
        data-testid="wf-model-cascade-trigger"
        disabled={execBusy}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 10px',
          borderRadius: 8,
          background: isOpen ? 'var(--dsw-alias-control-bg-hover, rgba(255, 255, 255, 0.12))' : 'var(--dsw-alias-control-bg, rgba(255, 255, 255, 0.05))',
          border: isOpen ? '1px solid var(--dsw-alias-brand-primary, rgba(255, 255, 255, 0.2))' : '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.08))',
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

        {/* 策略小标识与渠道数 */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 5px',
            borderRadius: 4,
            background: 'var(--dsw-alias-badge-bg, rgba(255, 255, 255, 0.08))',
            color: 'var(--dsw-alias-brand-primary, var(--dsw-alias-state-success))',
            fontSize: 11,
          }}
        >
          {activeStrategy === 'cost_first' ? (
            <Percent size={11} strokeWidth={2.4} />
          ) : (
            <ShieldCheck size={11} strokeWidth={2.4} />
          )}
          <span>{selectedCount}</span>
        </span>

        <ChevronDown
          size={12}
          style={{
            opacity: 0.6,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {/* 向上展开的三栏级联浮层 (Cascade Popover Menu) */}
      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="wf-model-cascade-popover nodrag nopan"
              style={{
                position: 'fixed',
                bottom: popoverPos.bottom,
                left: popoverPos.left,
                display: 'flex',
                gap: 8,
                zIndex: 10000,
                alignItems: 'flex-start',
                userSelect: 'none',
                animation: 'wfFadeIn 0.15s ease',
              }}
            >
              {/* 栏 1：选择品牌 (Brand) */}
              <div
                style={{
                  width: 160,
                  height: 480,
                  background: 'var(--dsw-alias-bg-elevated, rgba(24, 24, 27, 0.96))',
                  backdropFilter: 'blur(16px)',
                  borderRadius: 14,
                  border: '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.08))',
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.6)',
                  padding: '10px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  overflowY: 'auto',
                }}
              >
                <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--dsw-alias-label-secondary)', fontWeight: 500 }}>
                  选择模型
                </div>
                {brandList.map((brand) => {
                  const isSelected = activeBrandId === brand.id;
                  return (
                    <div
                      key={brand.id}
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
                        background: isSelected ? 'var(--dsw-alias-control-bg-hover, rgba(255, 255, 255, 0.08))' : 'transparent',
                        border: isSelected ? '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.1))' : '1px solid transparent',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <ModelBrandIcon modelId={brand.iconModelId} size={16} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {brand.name}
                      </span>
                      {isSelected && <Check size={14} color="var(--dsw-alias-brand-primary, var(--dsw-alias-state-success))" />}
                    </div>
                  );
                })}
              </div>

              {/* 栏 2：模型型号版本列表 (Variant) */}
              <div
                style={{
                  width: 230,
                  height: 480,
                  background: 'var(--dsw-alias-bg-elevated, rgba(24, 24, 27, 0.96))',
                  backdropFilter: 'blur(16px)',
                  borderRadius: 14,
                  border: '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.08))',
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.6)',
                  padding: '10px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  overflowY: 'auto',
                }}
              >
                {modelListInBrand.map((item) => {
                  const isSelected = activeModelId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectModel(item.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: isSelected ? 'var(--dsw-alias-control-bg-hover, rgba(255, 255, 255, 0.08))' : 'transparent',
                        border: isSelected ? '1px solid var(--dsw-alias-brand-primary, rgba(255, 255, 255, 0.2))' : '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.04))',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--dsw-alias-text-primary)' : 'var(--dsw-alias-label-secondary)' }}>
                          {item.name || item.id}
                        </span>
                        {isSelected && <Check size={14} color="var(--dsw-alias-brand-primary, var(--dsw-alias-state-success))" />}
                      </div>
                      {item.description && (
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
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 栏 3：选择渠道策略与渠道列表 (Channel Groups & Strategy) */}
              <div
                style={{
                  width: 380,
                  height: 480,
                  background: 'var(--dsw-alias-bg-elevated, rgba(24, 24, 27, 0.96))',
                  backdropFilter: 'blur(16px)',
                  borderRadius: 14,
                  border: '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.08))',
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.6)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>
                  选择渠道策略
                </div>

                {/* 策略切换双卡片 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {/* 稳定性优先 */}
                  <div
                    onClick={() => handleStrategyChange('stability_first')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: activeStrategy === 'stability_first' ? 'var(--dsw-alias-badge-bg, rgba(255, 255, 255, 0.08))' : 'transparent',
                      border: activeStrategy === 'stability_first' ? '1px solid var(--dsw-alias-brand-primary, currentColor)' : '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.08))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>
                      <ShieldCheck size={15} color={activeStrategy === 'stability_first' ? 'var(--dsw-alias-brand-primary, currentColor)' : 'var(--dsw-alias-label-secondary)'} />
                      <span>稳定性优先</span>
                    </div>
                    {activeStrategy === 'stability_first' && <Check size={13} color="var(--dsw-alias-brand-primary, var(--dsw-alias-state-success))" />}
                  </div>

                  {/* 低价优先 */}
                  <div
                    onClick={() => handleStrategyChange('cost_first')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: activeStrategy === 'cost_first' ? 'var(--dsw-alias-badge-bg, rgba(255, 255, 255, 0.08))' : 'transparent',
                      border: activeStrategy === 'cost_first' ? '1px solid var(--dsw-alias-brand-primary, currentColor)' : '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.08))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>
                      <Percent size={14} color={activeStrategy === 'cost_first' ? 'var(--dsw-alias-brand-primary, currentColor)' : 'var(--dsw-alias-label-secondary)'} />
                      <span>低价优先</span>
                    </div>
                    {activeStrategy === 'cost_first' && <Check size={13} color="var(--dsw-alias-brand-primary, var(--dsw-alias-state-success))" />}
                  </div>
                </div>

                {/* 渠道列表卡片流 (垂直滚动) */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
                  {channelGroups.map((group: ChannelGroupItem) => {
                    const isChecked = selectedGroupIds.includes(group.id);
                    const stabilityRate = group.sla?.stability24h ?? 100;
                    return (
                      <div
                        key={group.id}
                        onClick={() => toggleGroupSelection(group.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          background: isChecked ? 'var(--dsw-alias-control-bg-hover, rgba(255, 255, 255, 0.06))' : 'transparent',
                          border: isChecked ? '1px solid var(--dsw-alias-brand-primary, rgba(255, 255, 255, 0.15))' : '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.04))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
                          {/* 第一行：标题 + 积分 + 徽标 */}
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-text-primary)' }}>
                              {group.label}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                              {typeof group.pricing?.pointsEstimate === 'number'
                                ? `≈${group.pricing.pointsEstimate} 积分`
                                : group.pricing?.pointsEstimate || ''}
                            </span>
                            {group.pricing?.discountRate && group.pricing.discountRate < 1 && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  background: 'var(--dsw-alias-state-danger-bg, rgba(239, 68, 68, 0.2))',
                                  color: 'var(--dsw-alias-state-danger)',
                                  fontWeight: 600,
                                }}
                              >
                                {Math.round(group.pricing.discountRate * 100) / 10}折
                              </span>
                            )}
                            {group.badge && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  background: 'var(--dsw-alias-badge-bg, rgba(255, 255, 255, 0.08))',
                                  color: 'var(--dsw-alias-label-secondary)',
                                }}
                              >
                                {group.badge}
                              </span>
                            )}
                          </div>

                          {/* 第二行：点阵指示条 + 稳定率 + 排队时间 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }}>
                            <StabilityDotBar rate={stabilityRate} />
                            <span>24h 稳定率 {stabilityRate}%</span>
                            {group.sla?.avgWaitTimeSec && (
                              <span>约{Math.round(group.sla.avgWaitTimeSec / 60)}min</span>
                            )}
                          </div>
                        </div>

                        {/* 右侧选中对勾标识 */}
                        <div style={{ paddingLeft: 10 }}>
                          {isChecked ? (
                            <Check size={15} color="var(--dsw-alias-brand-primary, var(--dsw-alias-state-success))" strokeWidth={2.5} />
                          ) : (
                            <span style={{ display: 'inline-block', width: 15 }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 底部信息栏：已选 X/N 个 + 清空 / 全选 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 8,
                    borderTop: '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.06))',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                    已选 {selectedGroupIds.length}/{channelGroups.length} 个
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      type="button"
                      onClick={handleClear}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--dsw-alias-label-secondary)',
                        fontSize: 12,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--dsw-alias-text-primary)',
                        fontSize: 12,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      全选
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
