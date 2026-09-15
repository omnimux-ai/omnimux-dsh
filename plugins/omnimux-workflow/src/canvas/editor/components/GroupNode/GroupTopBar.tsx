import React, { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { useViewport } from '@xyflow/react';
import {
  Play,
  Save,
  Rocket,
  Ungroup,
  Trash2,
} from 'lucide-react';
import { useT } from '../../../i18n';
import { stopToolbarNativeEvent } from '../toolbarPointerGuard';
import {
  inverseScaleForZoom,
  isCustomGroupAccent,
  resolveGroupAccentStyle,
  resolveGroupTopBarLayout,
} from '../../utils/nodeVisualMath';

export interface GroupTopBarProps {
  groupId: string;
  groupTitle: string;
  groupColor: string;
  isCollapsed?: boolean;
  onExecuteGroup: () => void;
  onCreateWorkflow: () => void;
  onPublishApp?: () => void;
  onUngroup: () => void;
  onDeleteWorkflow?: () => void;
  onColorChange: (color: string) => void;
  onRename?: (newTitle: string) => void;
}

const NEUTRAL_SWATCH = '';
/** 8个经典高对比度调色板（对标图示色彩序列） */
const PALETTE_COLORS = [
  NEUTRAL_SWATCH,
  '#8b5cf6', // 紫罗兰
  '#38bdf8', // 天蓝
  '#06b6d4', // 湖蓝
  '#10b981', // 翡翠绿
  '#f59e0b', // 琥珀黄
  '#f97316', // 活力橙
  '#ec4899', // 蔷薇粉
];

export const GroupTopBar: React.FC<GroupTopBarProps> = memo(({
  groupTitle,
  groupColor,
  isCollapsed = false,
  onExecuteGroup,
  onCreateWorkflow,
  onPublishApp,
  onUngroup,
  onDeleteWorkflow,
  onColorChange,
  onRename,
}) => {
  const t = useT();
  const { zoom } = useViewport();
  const inverseScale = useMemo(() => inverseScaleForZoom(zoom), [zoom]);
  const layout = useMemo(
    () => resolveGroupTopBarLayout({ isCollapsed, inverseScale }),
    [isCollapsed, inverseScale],
  );
  const accentStyle = useMemo(() => resolveGroupAccentStyle(groupColor), [groupColor]);
  const isNeutral = !isCustomGroupAccent(groupColor);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(groupTitle);

  useEffect(() => {
    setEditTitle(groupTitle);
  }, [groupTitle]);

  const handleTitleSubmit = useCallback(() => {
    setIsEditing(false);
    const clean = editTitle.trim();
    if (clean && clean !== groupTitle && onRename) {
      onRename(clean);
    }
  }, [editTitle, groupTitle, onRename]);

  return (
    <div
      className="wf-floating-top-pill wf-group-topbar nodrag nopan nowheel"
      onPointerDown={stopToolbarNativeEvent}
      onMouseDown={stopToolbarNativeEvent}
      style={{
        ...accentStyle,
        top: layout.top,
        left: layout.left,
        right: layout.right,
        transform: layout.transform,
        transformOrigin: layout.transformOrigin,
      }}
    >
      <div className="wf-floating-top-pill__group">
        {/* 工作流标题药丸（带圆点，支持点击就地重命名） */}
        <div
          className="wf-group-topbar__badge"
          title={t('group.renameHint')}
          onClick={() => setIsEditing(true)}
        >
          <span
            className="wf-group-topbar__badge-dot"
            style={{ backgroundColor: isNeutral ? 'var(--wb-node-ring)' : groupColor }}
          />
          {isEditing ? (
            <input
              type="text"
              className="wf-group-topbar__badge-input"
              value={editTitle}
              autoFocus
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSubmit();
                if (e.key === 'Escape') {
                  setEditTitle(groupTitle);
                  setIsEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="wf-group-topbar__badge-title">{groupTitle}</span>
          )}
        </div>

        <span className="wf-floating-top-pill__divider" />

        {/* 整组执行 */}
        <button
          type="button"
          className="wf-floating-top-pill__btn wf-floating-top-pill__btn--success"
          onClick={onExecuteGroup}
          title={t('group.executeTitle')}
        >
          <Play size={12} className="wf-floating-top-pill__icon wf-floating-top-pill__icon--success" />
          <span>{t('group.execute')}</span>
        </button>

        <span className="wf-floating-top-pill__divider" />

        {/* 保存工作流 */}
        <button
          type="button"
          className="wf-floating-top-pill__btn"
          onClick={onCreateWorkflow}
          title={t('group.saveWorkflowTitle')}
        >
          <Save size={13} className="wf-floating-top-pill__icon" />
          <span>{t('group.saveWorkflow')}</span>
        </button>

        <span className="wf-floating-top-pill__divider" />

        {/* 发布应用 (收敛新增) */}
        {onPublishApp && (
          <>
            <button
              type="button"
              className="wf-floating-top-pill__btn wf-floating-top-pill__btn--primary"
              onClick={onPublishApp}
              title={t('group.publishAppTitle')}
            >
              <Rocket size={13} className="wf-floating-top-pill__icon wf-floating-top-pill__icon--primary" />
              <span>{t('group.publishApp')}</span>
            </button>
            <span className="wf-floating-top-pill__divider" />
          </>
        )}

        {/* 调色盘横排 8 色点 */}
        <div className="wf-group-topbar__palette-row" title={t('group.colorTitle')}>
          {PALETTE_COLORS.map((c) => {
            const isReset = c === NEUTRAL_SWATCH;
            const isActive = isReset ? isNeutral : groupColor === c;
            return (
              <button
                key={isReset ? 'neutral-reset' : c}
                type="button"
                className={`wf-group-topbar__palette-dot ${isActive ? 'is-active' : ''}`}
                style={{ backgroundColor: isReset ? 'var(--wb-node-ring)' : c }}
                title={isReset ? t('group.colorReset') : undefined}
                onClick={() => onColorChange(isReset ? '' : c)}
              />
            );
          })}
        </div>

        <span className="wf-floating-top-pill__divider" />

        {/* 解体 */}
        <button
          type="button"
          className="wf-floating-top-pill__btn"
          onClick={onUngroup}
          title={t('group.ungroupGroupTitle')}
        >
          <Ungroup size={13} className="wf-floating-top-pill__icon" />
          <span>{t('group.ungroupGroup')}</span>
        </button>

        {/* 删除工作流 */}
        {onDeleteWorkflow && (
          <>
            <span className="wf-floating-top-pill__divider" />
            <button
              type="button"
              className="wf-floating-top-pill__btn wf-floating-top-pill__btn--danger"
              onClick={onDeleteWorkflow}
              title={t('group.deleteWorkflowTitle')}
            >
              <Trash2 size={13} className="wf-floating-top-pill__icon wf-floating-top-pill__icon--danger" />
              <span>{t('group.deleteWorkflow')}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
});

GroupTopBar.displayName = 'GroupTopBar';
