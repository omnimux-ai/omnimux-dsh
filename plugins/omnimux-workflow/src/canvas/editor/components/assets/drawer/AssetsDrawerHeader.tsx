import React from 'react';
import { X } from 'lucide-react';
import type { ActiveTab } from '../types';

export interface AssetsDrawerHeaderProps {
  activeTab: ActiveTab;
  viewState: 'normal' | 'subject-library';
  onSelectCanvas: () => void;
  onSelectAssets: () => void;
  onClose: () => void;
}

export const AssetsDrawerHeader: React.FC<AssetsDrawerHeaderProps> = ({
  activeTab,
  viewState,
  onSelectCanvas,
  onSelectAssets,
  onClose,
}) => {
  const isCanvasActive = activeTab === 'canvas' && viewState === 'normal';
  const isAssetsActive = activeTab === 'assets' || viewState === 'subject-library';

  return (
    <div className="wf-drawer-header-compact">
      <div className="wf-segmented-switch-compact">
        <button
          type="button"
          className={`wf-segmented-tab-compact ${isCanvasActive ? 'active' : ''}`}
          onClick={onSelectCanvas}
        >
          画布
        </button>

        <button
          type="button"
          className={`wf-segmented-tab-compact ${isAssetsActive ? 'active' : ''}`}
          onClick={onSelectAssets}
        >
          资产
        </button>
      </div>

      <button
        type="button"
        className="wf-drawer-close-btn-compact"
        onClick={onClose}
        title="关闭抽屉 (Esc / A)"
      >
        <X size={14} />
      </button>
    </div>
  );
};
