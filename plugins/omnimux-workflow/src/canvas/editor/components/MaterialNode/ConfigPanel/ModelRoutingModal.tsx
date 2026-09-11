/**
 * ModelRoutingModal — 品牌/型号/渠道策略三级分层选择弹窗
 *
 * 结构：
 * - 左栏：选择品牌 (Brand)
 * - 中栏：选择模型版本/型号 (Model ID)
 * - 右栏：选择渠道策略 (稳定性优先 vs 低价优先) 与渠道多选池 (Channel Groups)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Check, ShieldCheck, Percent, Sparkles } from 'lucide-react';
import { CustomModal } from '../../../../ui/CustomModal';
import { ModelBrandIcon } from '../../../../ui/ModelBrandIcon';
import type { CapabilityCatalog, CapabilityModelItem } from '../../../../shared/api';
import {
  getModelChannelGroups,
  parseModelAndGroup,
} from './channelGroups';

export type RouteStrategy = 'auto' | 'stability_first' | 'cost_first';

export interface ModelRoutingValue {
  modelId: string;
  strategy: RouteStrategy;
  allowedGroups?: string[];
}

export interface ModelRoutingModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (value: ModelRoutingValue) => void;
  currentModelId?: string;
  currentRouting?: {
    strategy?: RouteStrategy;
    allowedGroups?: string[];
  };
  catalog?: CapabilityCatalog;
  materialType?: string;
}

interface BrandItem {
  id: string;
  name: string;
  iconModelId: string;
}

const BRAND_DEFS: BrandItem[] = [
  { id: 'bytedance', name: 'Seedance', iconModelId: 'seedance-2-0' },
  { id: 'minimax', name: 'MiniMax', iconModelId: 'minimax-h3' },
  { id: 'kling', name: 'Kling', iconModelId: 'kling' },
  { id: 'alibaba', name: 'Wan', iconModelId: 'wan-3.0' },
  { id: 'openai', name: '全能模型 X', iconModelId: 'gpt-5.5' },
  { id: 'google', name: '全能视频 Omni', iconModelId: 'gemini-3.8-flash' },
  { id: 'deepseek', name: 'DeepSeek', iconModelId: 'deepseek-v4-flash-vision-exp' },
  { id: 'anthropic', name: 'Claude', iconModelId: 'claude-opus-4-6' },
  { id: 'grok', name: 'Grok', iconModelId: 'grok-imagine-video-1-5' },
];

export const ModelRoutingModal: React.FC<ModelRoutingModalProps> = ({
  open,
  onCancel,
  onConfirm,
  currentModelId = '',
  currentRouting,
  catalog,
  materialType = 'video',
}) => {
  const { modelId: initialCanonicalModel } = parseModelAndGroup(currentModelId);

  // 1. 初始化选中的模型和品牌
  const [selectedModelId, setSelectedModelId] = useState<string>(initialCanonicalModel || 'seedance-2-0');
  const [selectedStrategy, setSelectedStrategy] = useState<RouteStrategy>(
    currentRouting?.strategy || 'stability_first',
  );

  // 2. 解析当前模型所属品牌
  const initialBrand = useMemo(() => {
    const matched = BRAND_DEFS.find((b) => selectedModelId.toLowerCase().includes(b.id) || b.name.toLowerCase().includes(selectedModelId.toLowerCase()));
    return matched ? matched.id : 'bytedance';
  }, [selectedModelId]);

  const [selectedBrand, setSelectedBrand] = useState<string>(initialBrand);

  // 3. 当前品牌下的可用模型列表
  const modelsInBrand = useMemo(() => {
    const list = (materialType === 'video'
      ? catalog?.video
      : materialType === 'image'
        ? catalog?.image
        : materialType === 'text'
          ? catalog?.text
          : catalog?.models) || [];

    const filtered = (list as CapabilityModelItem[]).filter((m) => {
      const id = m.id.toLowerCase();
      if (selectedBrand === 'bytedance') return id.includes('seed');
      if (selectedBrand === 'minimax') return id.includes('minimax');
      if (selectedBrand === 'kling') return id.includes('kling');
      if (selectedBrand === 'alibaba') return id.includes('wan') || id.includes('happyhorse');
      if (selectedBrand === 'openai') return id.includes('gpt') || id.includes('openai');
      if (selectedBrand === 'google') return id.includes('gemini') || id.includes('veo') || id.includes('banana');
      if (selectedBrand === 'deepseek') return id.includes('deepseek');
      if (selectedBrand === 'anthropic') return id.includes('claude');
      if (selectedBrand === 'grok') return id.includes('grok');
      return false;
    });

    if (filtered.length > 0) return filtered;

    // 针对 Seedance 的默认兜底备选项（如处于离线状态）
    if (selectedBrand === 'bytedance') {
      return [
        { id: 'seedance-2-5', name: 'Seedance 2.5', description: '新一代 2.5 旗舰视频大模型' },
        { id: 'seedance-2-0', name: 'Seedance 2.0', description: '官方 Seedance 2.0 全能视频模型，支持文生、首帧、首尾帧' },
        { id: 'seedance-2-0-mini', name: 'Seedance 2.0 Mini', description: '官方 Seedance 2.0 Mini，轻量视频模型' },
        { id: 'seedance-2-0-fast', name: 'Seedance 2.0 Fast', description: '官方 Seedance 2.0 快速版，支持多参考图与快速出片' },
      ] as CapabilityModelItem[];
    }
    return [
      { id: selectedModelId, name: selectedModelId, description: '全功能模型' },
    ] as CapabilityModelItem[];
  }, [catalog, materialType, selectedBrand, selectedModelId]);

  // 4. 当前选中模型的渠道分组池
  const channelGroups = useMemo(() => {
    const groups = getModelChannelGroups(selectedModelId);
    if (groups && groups.length > 0) return groups;
    // 基础默认池
    return [
      {
        id: 'official',
        label: '官方版',
        badge: '原生不加价',
        pricing: { pointsEstimate: 3568, discountRate: 1.0, billingMode: 'per_second' },
        sla: { stability24h: 99, avgWaitTimeSec: 60 },
        enabled: true,
      },
      {
        id: 'standard',
        label: '标准版',
        badge: '5.2折 · 限时特惠',
        pricing: { pointsEstimate: 1040, discountRate: 0.52, billingMode: 'per_second' },
        sla: { stability24h: 100, avgWaitTimeSec: 180 },
        enabled: true,
      },
    ];
  }, [selectedModelId]);

  // 5. 渠道多选池状态
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() => {
    if (currentRouting?.allowedGroups && currentRouting.allowedGroups.length > 0) {
      return currentRouting.allowedGroups;
    }
    return channelGroups.map((g) => g.id);
  });

  const toggleGroup = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) => {
      if (prev.includes(groupId)) {
        // 至少保留 1 个
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== groupId);
      }
      return [...prev, groupId];
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedGroupIds(channelGroups.map((g) => g.id));
  }, [channelGroups]);

  const handleClear = useCallback(() => {
    if (channelGroups.length > 0) {
      setSelectedGroupIds([channelGroups[0].id]);
    }
  }, [channelGroups]);

  const handleConfirm = useCallback(() => {
    onConfirm({
      modelId: selectedModelId,
      strategy: selectedStrategy,
      allowedGroups: selectedGroupIds,
    });
    onCancel();
  }, [onConfirm, onCancel, selectedModelId, selectedStrategy, selectedGroupIds]);

  return (
    <CustomModal
      open={open}
      onCancel={onCancel}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: '#f3f4f6' }}>
          <Sparkles size={16} color="#a3e635" />
          <span>选择模型与渠道策略</span>
        </div>
      }
      width={840}
    >
      <div style={{ display: 'flex', height: 460, gap: 12, userSelect: 'none', overflow: 'hidden' }}>
        {/* 左栏：品牌筛选 */}
        <div
          style={{
            width: 170,
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 10,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '8px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            overflowY: 'auto',
          }}
        >
          <div style={{ padding: '4px 8px', fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>选择品牌</div>
          {BRAND_DEFS.map((brand) => {
            const isSelected = selectedBrand === brand.id;
            return (
              <div
                key={brand.id}
                onClick={() => setSelectedBrand(brand.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? '#f3f4f6' : '#9ca3af',
                  background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  border: isSelected ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                <ModelBrandIcon modelId={brand.iconModelId} size={16} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {brand.name}
                </span>
                {isSelected && <Check size={14} color="#a3e635" />}
              </div>
            );
          })}
        </div>

        {/* 中栏：模型型号 */}
        <div
          style={{
            width: 250,
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 10,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '8px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            overflowY: 'auto',
          }}
        >
          <div style={{ padding: '4px 8px', fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>模型版本</div>
          {modelsInBrand.map((item) => {
            const isSelected = selectedModelId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedModelId(item.id);
                  const groups = getModelChannelGroups(item.id);
                  if (groups.length > 0) {
                    setSelectedGroupIds(groups.map((g) => g.id));
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  border: isSelected ? '1px solid rgba(163, 230, 53, 0.35)' : '1px solid rgba(255, 255, 255, 0.04)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#f3f4f6' : '#d1d5db' }}>
                    {item.name || item.id}
                  </span>
                  {isSelected && <Check size={14} color="#a3e635" />}
                </div>
                {item.description && (
                  <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 右栏：渠道策略与多选池 */}
        <div
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 10,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minWidth: 0,
          }}
        >
          {/* 策略切换 Tab */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#d1d5db', marginBottom: 8 }}>选择渠道策略</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* 稳定性优先 */}
              <div
                onClick={() => setSelectedStrategy('stability_first')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selectedStrategy === 'stability_first' ? 'rgba(163, 230, 53, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                  border: selectedStrategy === 'stability_first' ? '1px solid #a3e635' : '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f3f4f6', fontSize: 13, fontWeight: 600 }}>
                    <ShieldCheck size={16} color={selectedStrategy === 'stability_first' ? '#a3e635' : '#9ca3af'} />
                    <span>稳定性优先</span>
                  </div>
                  {selectedStrategy === 'stability_first' && <Check size={14} color="#a3e635" />}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.35 }}>
                  在所选渠道里优先尝试稳定渠道，失败自动依次切换，成功率最高。
                </div>
              </div>

              {/* 低价优先 */}
              <div
                onClick={() => setSelectedStrategy('cost_first')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selectedStrategy === 'cost_first' ? 'rgba(163, 230, 53, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                  border: selectedStrategy === 'cost_first' ? '1px solid #a3e635' : '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f3f4f6', fontSize: 13, fontWeight: 600 }}>
                    <Percent size={16} color={selectedStrategy === 'cost_first' ? '#a3e635' : '#9ca3af'} />
                    <span>低价优先</span>
                  </div>
                  {selectedStrategy === 'cost_first' && <Check size={14} color="#a3e635" />}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.35 }}>
                  在所选渠道里优先尝试低价渠道，失败自动依次切换，省钱最大化。
                </div>
              </div>
            </div>
          </div>

          {/* 渠道列表（多选池） */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
            {channelGroups.map((group) => {
              const isChecked = selectedGroupIds.includes(group.id);
              return (
                <div
                  key={group.id}
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isChecked ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                    border: isChecked ? '1px solid rgba(163, 230, 53, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6' }}>{group.label}</span>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>≈{group.pricing?.pointsEstimate ?? 1000} 积分</span>
                      {group.badge && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#d1d5db',
                          }}
                        >
                          {group.badge}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#9ca3af' }}>
                      <span>24h 稳定率 {group.sla?.stability24h ?? 100}%</span>
                      {group.sla?.avgWaitTimeSec && <span>约 {Math.round(group.sla.avgWaitTimeSec / 60)}min</span>}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: isChecked ? '1px solid #a3e635' : '1px solid rgba(255, 255, 255, 0.2)',
                      background: isChecked ? '#a3e635' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isChecked && <Check size={12} color="#000" strokeWidth={3} />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部信息与操作 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              已选 {selectedGroupIds.length}/{channelGroups.length} 个渠道
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleClear}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '4px 8px',
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
                  color: '#d1d5db',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                全选
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  background: '#a3e635',
                  color: '#000',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      </div>
    </CustomModal>
  );
};
