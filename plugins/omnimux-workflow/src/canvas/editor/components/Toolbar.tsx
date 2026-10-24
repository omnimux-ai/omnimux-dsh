/**
 * Modernized Floating Dock Toolbar (aligned with modern AI video/workflow canvases):
 *
 * 1. Centered bottom floating capsule dock (.wf-canvas-toolbar nodrag nopan).
 * 2. Primary (+) button (Hotkey N) opening AddNodeMenu (scope="dock").
 * 3. Pointer mode selector: Select (V) / Pan (H).
 * 4. Project Assets drawer trigger (Hotkey A).
 * 5. Hotkey help (?) modal.
 *
 * Maintains .nodrag .nopan and pointer event guards to prevent xyflow mouse capture.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  MousePointer,
  Hand,
  FolderOpen,
  HelpCircle,
  ChevronUp,
  FileCode,
  Download,
  Upload,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useT } from '../../i18n';
import { CustomDropdown, type DropdownMenuItem } from '../../ui';
import { useClickOutside } from '../hooks/useClickOutside';
import { useWorkflowTransferStore, type TransferState } from '../../store/workflowTransferStore';
import {
  preventToolbarAddContextMenu,
  stopToolbarNativeEvent,
} from './toolbarPointerGuard';
import AddNodeMenu from './AddNodeMenu';
import WorkflowTemplatePanel from './WorkflowTemplatePanel';
import type { CanvasAddNodeType } from './addNodePalette';

export type CanvasPointerMode = 'select' | 'pan';

export type { CanvasAddNodeType };

/**
 * Inline import/export feedback. Every failure is surfaced here with its
 * codec error code; nothing is swallowed and no success is faked.
 *
 * 状态本体在 `useWorkflowTransferStore`（Issue 3669）：工具栏按钮与「添加节点」面板
 * 入口共用同一份预览状态与同一套动作，这里只负责渲染。
 */
export interface ToolbarProps {
  onAddNode: (type: CanvasAddNodeType) => void;
  pointerMode?: CanvasPointerMode;
  onPointerModeChange?: (mode: CanvasPointerMode) => void;
  onOpenAssets?: () => void;
  onOpenHelp?: () => void;
  isAddMenuOpen?: boolean;
  onToggleAddMenu?: () => void;
  isAssetsOpen?: boolean;
  templates?: Array<{
    id: string;
    name: string;
    nodeCount: number;
    description?: string;
    tags?: string[];
    coverUrl?: string;
  }>;
  onInsertTemplate?: (id: string) => void;
  /** 新建模板入口；缺省时不渲染入口卡（不伪造入口）。 */
  onCreateWorkflow?: () => void;
  /** 模板列表真实加载态（透传模板面板）。 */
  isTemplateLoading?: boolean;
  /** 模板列表真实错误文案（透传模板面板，可读、不静默）。 */
  templateError?: string;
  /** 导出文件使用的当前画布名称。 */
  workflowName?: string;
}

/** Translate a codec/unsupported token, falling back to the raw token. */
function translateToken(
  t: (key: string) => string,
  prefix: string,
  token: string,
  replacements?: Record<string, string>,
): string {
  const key = `${prefix}${token}`;
  const value = t(key);
  const text = value === key ? token : value;
  if (!replacements) return text;
  let out = text;
  for (const [name, replacement] of Object.entries(replacements)) {
    out = out.replace(`{${name}}`, replacement);
  }
  return out;
}

interface TransferPanelProps {
  state: TransferState;
  onClose: () => void;
  onApplyOwn: () => void;
  onApplyComfy: () => void;
}

const TransferPanel: React.FC<TransferPanelProps> = memo(({
  state,
  onClose,
  onApplyOwn,
  onApplyComfy,
}) => {
  const t = useT();

  const head = (
    <div className="wf-transfer-panel__head">
      <span className="wf-transfer-panel__title">
        {state.kind === 'error'
          ? <><AlertTriangle size={14} /> {t('transfer.errorTitle')}</>
          : state.kind === 'exported'
            ? t('transfer.exportedTitle')
            : state.kind === 'comfy'
              ? t('transfer.comfyTitle').replace('{format}', state.format)
              : t('transfer.ownTitle')}
      </span>
      <button
        type="button"
        className="wf-transfer-panel__close"
        onClick={onClose}
        title={t('transfer.close')}
      >
        <X size={14} />
      </button>
    </div>
  );

  if (state.kind === 'error') {
    return (
      <div className="wf-transfer-panel" role="status" aria-live="polite">
        {head}
        <p className="wf-transfer-panel__message wf-transfer-panel__message--error">
          {translateToken(t, 'transfer.error.', state.code, { path: state.path })}
        </p>
        <p className="wf-transfer-panel__detail">{state.message}</p>
      </div>
    );
  }

  if (state.kind === 'exported') {
    return (
      <div className="wf-transfer-panel" role="status" aria-live="polite">
        {head}
        <p className="wf-transfer-panel__message">
          {t('transfer.exportedBody')
            .replace('{name}', state.fileName)
            .replace('{count}', String(state.nodeCount))}
        </p>
        {state.droppedCount > 0 ? (
          <p className="wf-transfer-panel__warning">
            {t('transfer.exportedDropped').replace('{count}', String(state.droppedCount))}
          </p>
        ) : null}
      </div>
    );
  }

  if (state.kind === 'own') {
    return (
      <div className="wf-transfer-panel" role="status" aria-live="polite">
        {head}
        <p className="wf-transfer-panel__message">
          {t('transfer.ownBody')
            .replace('{name}', state.file.name)
            .replace('{nodes}', String(state.file.metadata.nodeCount))
            .replace('{edges}', String(state.file.metadata.edgeCount))}
        </p>
        {state.applied ? (
          <p className="wf-transfer-panel__success">{t('transfer.applied')}</p>
        ) : (
          <>
            <p className="wf-transfer-panel__warning">{t('transfer.replaceHint')}</p>
            <div className="wf-transfer-panel__actions">
              <button type="button" className="wf-transfer-panel__button" onClick={onApplyOwn}>
                {t('transfer.apply')}
              </button>
              <button
                type="button"
                className="wf-transfer-panel__button wf-transfer-panel__button--ghost"
                onClick={onClose}
              >
                {t('transfer.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const { projection } = state;
  const supportedPreview = projection.supported.slice(0, 12);
  const unsupportedByReason = new Map<string, string[]>();
  for (const entry of projection.unsupported) {
    const ids = unsupportedByReason.get(entry.reason) ?? [];
    ids.push(entry.id);
    unsupportedByReason.set(entry.reason, ids);
  }

  return (
    <div className="wf-transfer-panel wf-transfer-panel--comfy" role="status" aria-live="polite">
      {head}
      <p className="wf-transfer-panel__message">
        {t('transfer.comfyBody')
          .replace('{supported}', String(projection.supported.length))
          .replace('{unsupported}', String(projection.unsupported.length))}
      </p>
      <div className="wf-transfer-panel__section">
        <span className="wf-transfer-panel__section-title">{t('transfer.supported')}</span>
        <ul className="wf-transfer-panel__list">
          {supportedPreview.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`} className="wf-transfer-panel__list-item">
              <span className="wf-transfer-panel__list-id">{entry.id}</span>
              <span className="wf-transfer-panel__list-note">
                {entry.targetType ?? entry.kind}
                {entry.lossy ? ` · ${t('transfer.lossy')}` : ''}
              </span>
            </li>
          ))}
          {projection.supported.length > supportedPreview.length ? (
            <li className="wf-transfer-panel__list-item wf-transfer-panel__list-item--muted">
              {t('transfer.more').replace('{count}', String(projection.supported.length - supportedPreview.length))}
            </li>
          ) : null}
        </ul>
      </div>
      <div className="wf-transfer-panel__section">
        <span className="wf-transfer-panel__section-title">
          {t('transfer.unsupported')} · {projection.unsupported.length}
        </span>
        {unsupportedByReason.size === 0 ? (
          <p className="wf-transfer-panel__list-item--muted">{t('transfer.unsupportedEmpty')}</p>
        ) : (
          <ul className="wf-transfer-panel__list">
            {[...unsupportedByReason.entries()].map(([reason, ids]) => (
              <li key={reason} className="wf-transfer-panel__reason">
                <span className="wf-transfer-panel__reason-label">
                  {translateToken(t, 'transfer.reason.', reason)}
                </span>
                <span className="wf-transfer-panel__reason-count">{ids.length}</span>
                <span className="wf-transfer-panel__reason-ids">{ids.slice(0, 5).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {state.applied ? (
        <p className="wf-transfer-panel__success">{t('transfer.applied')}</p>
      ) : (
        <>
          <p className="wf-transfer-panel__warning">{t('transfer.replaceHint')}</p>
          <div className="wf-transfer-panel__actions">
            <button type="button" className="wf-transfer-panel__button" onClick={onApplyComfy}>
              {t('transfer.apply')}
            </button>
            <button
              type="button"
              className="wf-transfer-panel__button wf-transfer-panel__button--ghost"
              onClick={onClose}
            >
              {t('transfer.cancel')}
            </button>
          </div>
        </>
      )}
    </div>
  );
});

TransferPanel.displayName = 'TransferPanel';

const Toolbar: React.FC<ToolbarProps> = ({
  onAddNode,
  pointerMode = 'select',
  onPointerModeChange,
  onOpenAssets,
  onOpenHelp,
  isAddMenuOpen: externalIsAddMenuOpen,
  onToggleAddMenu,
  isAssetsOpen = false,
  templates = [],
  onInsertTemplate,
  onCreateWorkflow,
  isTemplateLoading = false,
  templateError,
  workflowName = 'workflow',
}) => {
  const t = useT();
  const [internalIsAddMenuOpen, setInternalIsAddMenuOpen] = useState(false);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  // 导入/导出状态本体（Issue 3669）：工具栏按钮、拖拽与预览面板共用。
  const transfer = useWorkflowTransferStore((state) => state.transfer);
  const importNonce = useWorkflowTransferStore((state) => state.importNonce);
  const exportWorkflow = useWorkflowTransferStore((state) => state.exportWorkflow);
  const importText = useWorkflowTransferStore((state) => state.importText);
  const failImport = useWorkflowTransferStore((state) => state.failImport);
  const requestImport = useWorkflowTransferStore((state) => state.requestImport);
  const applyComfy = useWorkflowTransferStore((state) => state.applyComfy);
  const applyOwn = useWorkflowTransferStore((state) => state.applyOwn);
  const dismissTransfer = useWorkflowTransferStore((state) => state.dismiss);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const transferRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAddOpen = externalIsAddMenuOpen !== undefined ? externalIsAddMenuOpen : internalIsAddMenuOpen;
  const closeAdd = useCallback(() => {
    if (onToggleAddMenu) {
      if (isAddOpen) onToggleAddMenu();
    } else {
      setInternalIsAddMenuOpen(false);
    }
  }, [isAddOpen, onToggleAddMenu]);
  const toggleAdd = onToggleAddMenu || (() => setInternalIsAddMenuOpen((v) => !v));

  const handleSelectNodeType = useCallback(
    (type: CanvasAddNodeType) => {
      onAddNode(type);
      closeAdd();
    },
    [onAddNode, closeAdd],
  );

  /** 读文件并把文本交给共享状态机（解析顺序与错误码在 store 里，只有一份）。 */
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset so picking the same file again still fires a change event.
      event.target.value = '';
      if (!file) return;
      void file.text()
        .then((text) => importText(text, file.name))
        .catch((error: unknown) => {
          failImport('read-failed', error instanceof Error ? error.message : String(error));
        });
    },
    [failImport, importText],
  );

  /** 「添加节点」面板与工具栏按钮共用同一个文件选择器：只认 nonce 递增。 */
  useEffect(() => {
    if (importNonce === 0) return;
    fileInputRef.current?.click();
  }, [importNonce]);

  /** 底部 ComfyUI 工作流入口已删除（Issue 3741）：文件导入仍走工具栏按钮与拖拽。 */

  useClickOutside({
    refs: addMenuRef,
    onClose: closeAdd,
    enabled: isAddOpen,
  });

  useClickOutside({
    refs: templateMenuRef,
    onClose: () => setIsTemplateMenuOpen(false),
    enabled: isTemplateMenuOpen,
  });

  useClickOutside({
    refs: transferRef,
    onClose: dismissTransfer,
    enabled: transfer !== null,
  });

  const pointerMenuItems: DropdownMenuItem[] = [
    {
      key: 'select',
      icon: <MousePointer size={18} />,
      label: t('toolbar.selectMode'),
      onClick: () => onPointerModeChange?.('select'),
    },
    {
      key: 'pan',
      icon: <Hand size={18} />,
      label: t('toolbar.panMode'),
      onClick: () => onPointerModeChange?.('pan'),
    },
  ];

  return (
    <div
      className="wf-canvas-toolbar nodrag nopan"
      onPointerDown={stopToolbarNativeEvent}
      onMouseDown={stopToolbarNativeEvent}
    >
      {/* 核心 (+) 按钮与浮层菜单 */}
      <div ref={addMenuRef} style={{ position: 'relative' }}>
        <button
          type="button"
          className={`wf-canvas-toolbar__item wf-canvas-toolbar__item--primary-add ${isAddOpen ? 'wf-canvas-toolbar__item--primary-add-open' : ''}`}
          onClick={toggleAdd}
          onContextMenu={preventToolbarAddContextMenu}
          title={t('toolbar.addNode')}
        >
          <span className="wf-canvas-toolbar__icon">
            <Plus size={24} />
          </span>
        </button>

        {isAddOpen ? (
          <AddNodeMenu scope="dock" onSelect={handleSelectNodeType} />
        ) : null}
      </div>

      <div className="wf-canvas-toolbar__divider" />

      {onInsertTemplate && (
        <div ref={templateMenuRef} className="wf-canvas-toolbar__anchor">
          <button
            type="button"
            className="wf-canvas-toolbar__item wf-canvas-toolbar__item--icon-only"
            onClick={() => setIsTemplateMenuOpen((open) => !open)}
            title={t('toolbar.insertTemplate')}
          >
            <span className="wf-canvas-toolbar__icon">
              <FileCode size={20} />
            </span>
            <span className="wf-canvas-toolbar__label">{t('toolbar.insertTemplateLabel')}</span>
          </button>
          {isTemplateMenuOpen && (
            <WorkflowTemplatePanel
              templates={templates}
              onInsertTemplate={(id) => {
                onInsertTemplate(id);
                setIsTemplateMenuOpen(false);
              }}
              onCreateWorkflow={onCreateWorkflow}
              isLoading={isTemplateLoading}
              errorMessage={templateError}
              onClose={() => setIsTemplateMenuOpen(false)}
            />
          )}
        </div>
      )}

      {/* 工作流文件导出 / 导入（Issue #3625 工作流 4） */}
      <button
        type="button"
        className="wf-canvas-toolbar__item wf-canvas-toolbar__item--icon-only"
        onClick={() => exportWorkflow(workflowName)}
        title={t('toolbar.exportWorkflow')}
      >
        <span className="wf-canvas-toolbar__icon">
          <Download size={20} />
        </span>
        <span className="wf-canvas-toolbar__label">{t('toolbar.exportWorkflow')}</span>
      </button>

      <button
        type="button"
        className={`wf-canvas-toolbar__item wf-canvas-toolbar__item--icon-only ${transfer ? 'wf-canvas-toolbar__item--active' : ''}`}
        onClick={requestImport}
        title={t('toolbar.importWorkflow')}
      >
        <span className="wf-canvas-toolbar__icon">
          <Upload size={20} />
        </span>
        <span className="wf-canvas-toolbar__label">{t('toolbar.importWorkflow')}</span>
      </button>

      <input
        ref={fileInputRef}
        className="wf-transfer-input"
        type="file"
        accept="application/json,.json"
        onChange={handleFileInputChange}
      />

      {/* 指针模式选择 (V/H) */}
      <CustomDropdown
        items={pointerMenuItems}
        selectedKeys={[pointerMode]}
        placement="topCenter"
      >
        <button
          type="button"
          className="wf-canvas-toolbar__item"
          title={pointerMode === 'select' ? t('toolbar.selectMode') : t('toolbar.panMode')}
        >
          <span className="wf-canvas-toolbar__icon">
            {pointerMode === 'select' ? <MousePointer size={20} /> : <Hand size={20} />}
          </span>
          <ChevronUp size={14} style={{ opacity: 0.6, marginLeft: 2 }} />
        </button>
      </CustomDropdown>

      {/* 项目资产库入口 */}
      <button
        type="button"
        className={`wf-canvas-toolbar__item wf-canvas-toolbar__item--icon-only ${isAssetsOpen ? 'wf-canvas-toolbar__item--active' : ''}`}
        onClick={onOpenAssets}
        title={t('toolbar.assets')}
      >
        <span className="wf-canvas-toolbar__icon">
          <FolderOpen size={20} />
        </span>
        <span className="wf-canvas-toolbar__label">{t('toolbar.assets')}</span>
      </button>

      {/* 帮助 */}
      {onOpenHelp && (
        <>
          <div className="wf-canvas-toolbar__divider" />
          <button
            type="button"
            className="wf-canvas-toolbar__item wf-canvas-toolbar__item--icon-only"
            onClick={onOpenHelp}
            title={t('toolbar.help')}
          >
            <span className="wf-canvas-toolbar__icon">
              <HelpCircle size={20} />
            </span>
            <span className="wf-canvas-toolbar__label">{t('toolbar.help')}</span>
          </button>
        </>
      )}

      {/* 导入 / 导出结果面板（不支持项显式列出，不静默丢弃） */}
      {transfer ? (
        <div ref={transferRef} className="wf-transfer-panel-anchor">
          <TransferPanel
            state={transfer}
            onClose={dismissTransfer}
            onApplyOwn={applyOwn}
            onApplyComfy={applyComfy}
          />
        </div>
      ) : null}
    </div>
  );
};

export default memo(Toolbar);
