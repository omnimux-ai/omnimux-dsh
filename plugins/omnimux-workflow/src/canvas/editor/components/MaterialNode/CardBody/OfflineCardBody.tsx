/**
 * OfflineCardBody — 媒体素材离线/丢失状态展示与重连组件
 */

import React from 'react';
import { Unlink } from 'lucide-react';
import { useT } from '../../../../i18n';
import type { MaterialType } from '../../../../types/materialNode';

export interface OfflineCardBodyProps {
  materialType: MaterialType;
  onRelink: (materialType: MaterialType) => void;
}

export const OfflineCardBody: React.FC<OfflineCardBodyProps> = ({ materialType, onRelink }) => {
  const t = useT();

  return (
    <div className="wf-material-node__media wf-media-offline">
      <Unlink size={22} className="wf-media-offline__icon" />
      <div className="wf-media-offline__title">{t('node.offline')}</div>
      <div className="wf-media-offline__hint">{t('node.offlineHint')}</div>
      <button
        type="button"
        className="wf-media-offline__relink nodrag"
        onClick={() => onRelink(materialType)}
      >
        {t('node.relink')}
      </button>
    </div>
  );
};
