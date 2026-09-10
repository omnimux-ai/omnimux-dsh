/**
 * NodeEmptyState — 材质卡片在空态（未填充媒体/文本）时的引导视图。
 *
 * 1:1 还原设计图：
 * - 文本：居中文档图标 + "试试:" + 4 个垂直胶囊按钮（自己编写内容 / 剧本生成 / 策划案生成 / 提示词生成）
 * - 图片：居中相框图标占位
 * - 视频：居中播放图标占位 + 底部快捷参考区（尝试 MiniMax-H3 / 全能参考 / 首尾帧）
 * - 音频：居中音符图标占位
 */

import React, { memo } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Play,
  Music,
  ExternalLink,
  PenLine,
  Clapperboard,
  FileEdit,
  Sparkles,
  Wand2,
  Film,
  UploadCloud,
} from 'lucide-react';
import type { MaterialType, NodeKind } from '../../../types/materialNode';
import { useT } from '../../../i18n';

export interface NodeEmptyStateProps {
  materialType: MaterialType;
  nodeKind?: NodeKind;
  onApplyPreset?: (presetKey: string) => void;
  onStartEdit?: () => void;
  onImport?: () => void;
}

const NodeEmptyState: React.FC<NodeEmptyStateProps> = ({
  materialType,
  nodeKind = 'generate',
  onApplyPreset,
  onStartEdit,
  onImport,
}) => {
  const t = useT();

  if (nodeKind === 'import') {
    return (
      <div
        className="wf-node-empty wf-node-empty--import-kind nodrag"
        role={onImport ? 'button' : undefined}
        tabIndex={onImport ? 0 : undefined}
        onClick={(e) => {
          if (!onImport) return;
          e.stopPropagation();
          onImport();
        }}
        onKeyDown={(e) => {
          if (!onImport) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onImport();
          }
        }}
      >
        <div className="wf-node-empty__icon-box">
          <UploadCloud size={44} strokeWidth={1.5} className="wf-node-empty__icon" />
        </div>
        <div className="wf-node-empty__try-label">{t('panel.dropToImport')}</div>
      </div>
    );
  }

  if (materialType === 'text') {
    return (
      <div className="wf-node-empty wf-node-empty--text">
        <div className="wf-node-empty__icon-box">
          <FileText size={32} strokeWidth={1.75} className="wf-node-empty__icon" />
        </div>
        <div className="wf-node-empty__try-label">{t('pills.tryLabel')}</div>
        <div
          className="wf-node-empty__actions nodrag"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="wf-node-empty__pill-btn"
            onClick={onStartEdit}
          >
            <PenLine size={14} className="wf-node-empty__pill-icon" />
            <span>{t('pills.writePrompt')}</span>
          </button>
          <button
            type="button"
            className="wf-node-empty__pill-btn"
            onClick={() => onApplyPreset?.('script')}
          >
            <Clapperboard size={14} className="wf-node-empty__pill-icon" />
            <span>{t('pills.scriptGen')}</span>
          </button>
          <button
            type="button"
            className="wf-node-empty__pill-btn"
            onClick={() => onApplyPreset?.('planning')}
          >
            <FileEdit size={14} className="wf-node-empty__pill-icon" />
            <span>{t('pills.planningGen')}</span>
          </button>
          <button
            type="button"
            className="wf-node-empty__pill-btn"
            onClick={() => onApplyPreset?.('prompt')}
          >
            <Sparkles size={14} className="wf-node-empty__pill-icon" />
            <span>{t('pills.promptExpand')}</span>
          </button>
        </div>
      </div>
    );
  }

  if (materialType === 'image') {
    return (
      <div className="wf-node-empty wf-node-empty--image">
        <div className="wf-node-empty__icon-box">
          <ImageIcon size={44} strokeWidth={1.5} className="wf-node-empty__icon" />
        </div>
      </div>
    );
  }

  if (materialType === 'video') {
    return (
      <div className="wf-node-empty wf-node-empty--video">
        <div className="wf-node-empty__icon-box">
          <Play size={44} strokeWidth={1.5} className="wf-node-empty__icon" />
        </div>
      </div>
    );
  }

  if (materialType === 'audio') {
    return (
      <div className="wf-node-empty wf-node-empty--audio">
        <div className="wf-node-empty__icon-box">
          <Music size={44} strokeWidth={1.5} className="wf-node-empty__icon" />
        </div>
      </div>
    );
  }

  return null;
};

export default memo(NodeEmptyState);
