/**
 * omnimux-workflow canvas island application root.
 *
 * Boot flow: ensure a workspace exists (create on first open) -> hydrate
 * the canvas store -> render the editor.
 *
 * M2: saving is automatic — useWorkspacePersistence debounces store
 * changes (1s), PUTs with the optimistic-lock version, resolves 409s by
 * pulling + retrying once. 顶栏「我的工作流 / 关闭 / 保存态」已去掉；
 * 冲突条仍保留，日常保存态不再占 chrome。
 */

import { useCallback, useEffect, useRef } from 'react';
import CanvasEditor from './editor/CanvasEditor';
import { CanvasErrorBoundary } from './ui/CanvasErrorBoundary';
import { useExecutionController } from './hooks/useExecutionController';
import { useCanvasBoot } from './hooks/useCanvasBoot';
import { setLocale, useT, type Locale } from './i18n';
import { useWorkspacePersistence } from './bridge/useWorkspacePersistence';
import { useTablePersistence } from './bridge/useTablePersistence';
import type { CanvasWorkspaceSnapshot } from '../shared/canvasTypes';

export interface CanvasAppProps {
  /** 宿主可传；岛内顶栏已撤，关闭走宿主 tab / overlay。 */
  onClose?: () => void;
  /** 宿主语言（island 边界纯数据 prop），变化时下发到 i18n 模块。 */
  locale?: Locale;
  /** 专属工作区/画布 ID（实现各个项目与创作页之间 100% 独立的物理隔离） */
  workspaceId?: string;
}

const App: React.FC<CanvasAppProps> = ({ locale, workspaceId }) => {
  const t = useT();
  // persist 第一轮尚未挂上时 no-op；cleanup 时 flushRef 已指向同步 capture
  const flushRef = useRef(() => {});
  const { boot, setBoot, catalog } = useCanvasBoot({
    workspaceId,
    beforeReset: () => {
      flushRef.current();
    },
  });

  // 宿主 → island 语言通道：locale prop 变化时下发（live 切换走
  // updateCanvas 重 render，W4 接入宿主 subscribe）。
  useEffect(() => {
    setLocale(locale);
  }, [locale]);

  const workspace = boot.phase === 'ready' ? boot.workspace : null;

  const handleSaved = useCallback((snapshot: CanvasWorkspaceSnapshot) => {
    setBoot((prev) => (prev.phase === 'ready' && prev.workspace.id === snapshot.id
      ? { phase: 'ready', workspace: snapshot } : prev));
  }, [setBoot]);

  // hydrate 完成、boot.phase === 'ready' 之前禁止订阅 / flush，避免空图 autosave
  const persistence = useWorkspacePersistence(workspace, {
    onSaved: handleSaved,
    enabled: boot.phase === 'ready',
  });
  flushRef.current = persistence.flushPendingSave;

  const tablePersistence = useTablePersistence({
    workspaceId: workspace ? workspace.id : null,
    enabled: boot.phase === 'ready',
  });

  // M3 execution controller: full/subset runs, SSE subscription, node-state
  // sync, and island-reload restore (re-subscribes a still-live execution).
  const execution = useExecutionController(workspace ? workspace.id : null, {
    onBeforeStart: async () => {
      await tablePersistence.saveNow();
      await persistence.saveNow();
    },
  });

  if (boot.phase === 'loading') {
    return (
      <div className="wf-canvas-root">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--wb-text-muted)' }}>
          {t('app.loading')}
        </div>
      </div>
    );
  }

  if (boot.phase === 'error') {
    return (
      <div className="wf-canvas-root">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 13, color: 'var(--wb-text-muted)' }}>
          <span>{boot.message}</span>
          <button type="button" className="wf-canvas-header__button" onClick={() => window.location.reload()}>
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wf-canvas-root">
      {persistence.status === 'conflict' ? (
        <div className="wf-canvas-conflict-banner" role="alert">
          <span>
            {t('app.conflictBanner')}
          </span>
          <button type="button" className="wf-canvas-header__button" onClick={() => void persistence.resolveConflict()}>
            {t('app.conflictOverwrite')}
          </button>
          <button
            type="button"
            className="wf-canvas-header__button wf-canvas-header__button--ghost"
            onClick={() => void persistence.reloadFromServer()}
          >
            {t('app.conflictReload')}
          </button>
        </div>
      ) : null}
      <main className="wf-canvas-main">
        <CanvasErrorBoundary>
          <CanvasEditor
            catalog={catalog}
            workspaceId={workspace?.id ?? null}
            onExecuteNodeIds={(nodeIds) => {
              // M4 组/子集执行入口（右键菜单）：subset 模式自动补传递上游闭包。
              void execution.startExecution({ mode: 'subset', nodeIds });
            }}
            onStartExecution={() => void execution.startExecution({ mode: 'full' })}
            onPauseExecution={() => void execution.pause()}
            onResumeExecution={() => void execution.resume()}
            onCancelExecution={() => void execution.cancel()}
            onResetExecution={execution.reset}
          />
        </CanvasErrorBoundary>
      </main>
    </div>
  );
};

export default App;
