import React from 'react';
import { GenWaveCard } from 'dsh-ui-kit';

/**
 * GeneratingStateCard
 * 生成中任务卡：内部动效为 GenWaveCard 点阵双波场（dsh-ui-kit）。
 * 极简形态：卡片无头行（无图标无文案），点阵动效铺满整卡，
 * 仅保留右下角进度百分比。
 *
 * @param {{ className?: string, status?: string }} props
 */
export function GeneratingStateCard({ className = '', status = 'pending' }) {
  return (
    <div className={`omx-generating-box ${className}`} data-generation-phase={status}>
      <GenWaveCard className="omx-genwave-fill" />
    </div>
  );
}
