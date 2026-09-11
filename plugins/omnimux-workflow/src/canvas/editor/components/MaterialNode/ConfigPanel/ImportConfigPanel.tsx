/**
 * @file plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/ImportConfigPanel.tsx
 * ConfigPanel sub-component for imported asset nodes (display filename & replace resource action).
 */

import React from 'react';
import type { MaterialNodeData } from '../../../../types/materialNode';
import { useT } from '../../../../i18n';
import type { SlotPickRequest } from './SlotWells/types';

export interface ImportConfigPanelProps {
  nodeData: MaterialNodeData;
  execBusy?: boolean;
  onOpenResourcePicker?: (requestOrMode?: 'add' | 'replace' | SlotPickRequest, targetSlotIndex?: number) => void;
}

export const ImportConfigPanelImpl: React.FC<ImportConfigPanelProps> = ({
  nodeData,
  execBusy,
  onOpenResourcePicker,
}) => {
  const t = useT();
  const isNodeBusy =
    Boolean(execBusy) ||
    nodeData.executionStatus === 'running' ||
    nodeData.executionStatus === 'pending' ||
    nodeData.status === 'generating';

  const fileName = nodeData.realPath ? String(nodeData.realPath).split('/').pop() : '';

  return (
    <div className="wf-config-panel wf-config-panel--import">
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--dsw-alias-label-secondary, var(--wb-text-secondary))' }}>
            {t('panel.hintImportNode')}
          </span>
          {Boolean(fileName) && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--dsw-alias-label-tertiary, var(--wb-text-muted))',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '240px',
              }}
              title={String(nodeData.realPath)}
            >
              {fileName}
            </span>
          )}
        </div>
        {onOpenResourcePicker && !isNodeBusy && (
          <button
            type="button"
            className="wf-param-pill wf-param-pill--btn"
            style={{ padding: '4px 10px', height: '28px' }}
            onClick={() => onOpenResourcePicker('replace')}
          >
            <span>{t('node.replace')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
