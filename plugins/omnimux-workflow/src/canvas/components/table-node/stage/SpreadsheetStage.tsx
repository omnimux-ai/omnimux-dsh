import React, { useEffect, useState } from 'react';
import { useTableStore } from '../../../store/tableStore';
import { StageTopbar } from './StageTopbar';
import { VirtualDataGrid } from './VirtualDataGrid';
import { ModalColumnEditor } from './modals/ModalColumnEditor';

export const SpreadsheetStage: React.FC = () => {
  const { isStageOpen, closeStage, setActivePopover } = useTableStore();

  // KeepAlive：首次打开后常驻挂载，关页仅隐藏不卸树（对齐 TextStage / 全仓 Stage 规范）
  const [everOpened, setEverOpened] = useState(false);
  if (isStageOpen && !everOpened) {
    setEverOpened(true);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeStage();
      }
    };
    if (isStageOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStageOpen, closeStage]);

  if (!everOpened) return null;

  // 与 TextStage 一致：直接作为 CanvasEditor（.wf-canvas-editor，position: relative）
  // 的标准子组件渲染，通过 position: absolute 贴合铺满右侧侧边栏标签页画布区域，
  // 不再经由 React Portal 传送到宿主全局根节点（那会造成 APP 全局 fixed 覆盖整个窗口）。
  return (
    <div
      className="wf-stage-overlay wf-canvas-root"
      hidden={!isStageOpen}
      data-visible={isStageOpen ? 'true' : 'false'}
      aria-hidden={isStageOpen ? undefined : 'true'}
      style={{
        display: isStageOpen ? 'flex' : 'none',
      }}
      onClick={() => setActivePopover(null)}
    >
      {/* 顶部工具条 */}
      <StageTopbar />

      {/* 数据表格区 */}
      <VirtualDataGrid />

      {/* 【添加列 / 编辑列】模态弹窗 */}
      <ModalColumnEditor />
    </div>
  );
};
