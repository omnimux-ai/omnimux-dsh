import React from 'react';
import { OrganicShimmerOverlay } from './OrganicShimmerOverlay.jsx';

/**
 * GeneratingStateCard
 * 纯视觉生成态卡片，彻底清除底部文字胶囊与一切按钮，统一收敛使用 OrganicShimmerOverlay。
 *
 * @param {{ status?: string, className?: string, statusText?: string }} props
 */
export function GeneratingStateCard({ className = '', status = 'running' }) {
  return (
    <div className={`omx-generating-box ${className}`} data-generation-phase={status}>
      <OrganicShimmerOverlay playing={status === 'running' || status === 'pending'} />
    </div>
  );
}

export default GeneratingStateCard;
