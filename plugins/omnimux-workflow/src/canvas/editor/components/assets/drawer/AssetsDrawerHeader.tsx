import React from 'react';
import { X } from 'lucide-react';
import type { ActiveTab } from '../types';
import { useT } from '../../../../i18n';

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
  const t = useT();
  const isCanvasActive = activeTab === 'canvas' && viewState === 'normal';
  const isAssetsActive = activeTab === 'assets' || viewState === 'subject-library';

  const canvasText = t('assets.tab.canvas');
  const assetsText = t('assets.tab.assets');
  const canvasLabel = canvasText && canvasText !== 'assets.tab.canvas' ? canvasText : '创作画布';
  const assetsLabel = assetsText && assetsText !== 'assets.tab.assets' ? assetsText : '资产';

  return (
    <div className="wf-drawer-header-compact">
      <div className="wf-segmented-switch-compact">
        <button
          type="button"
          className={`wf-segmented-tab-compact ${isCanvasActive ? 'active' : ''}`}
          onClick={onSelectCanvas}
        >
          {canvasLabel}
        </button>

        <button
          type="button"
          className={`wf-segmented-tab-compact ${isAssetsActive ? 'active' : ''}`}
          onClick={onSelectAssets}
        >
          {assetsLabel}
        </button>
      </div>

      <button
        type="button"
        className="wf-drawer-close-btn-compact"
        onClick={onClose}
        title={t('assets.closeDrawer') || '关闭抽屉 (Esc / A)'}
      >
        <X size={14} />
      </button>
    </div>
  );
};
