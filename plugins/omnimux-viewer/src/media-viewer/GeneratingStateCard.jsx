import React from 'react';
import { GenWaveCard } from 'dsh-ui-kit';

/**
 * GeneratingStateCard
 * 生成中任务卡：内部动效为 GenWaveCard 点阵双波场（dsh-ui-kit），
 * 状态文案由 GenWaveCard 顶部行承载（statusText 透传）。
 *
 * @param {{ statusText?: string, className?: string, status?: string }} props
 */
export function GeneratingStateCard({ statusText = '等待生成工具启动', className = '', status = 'pending' }) {
  return (
    <div className={`omx-generating-box ${className}`} data-generation-phase={status}>
      <GenWaveCard statusText={statusText} className="omx-genwave-fill" />
    </div>
  );
}
