/**
 * ComfyUI 工作流卡片的跨节点视图状态（Issue #3751）。
 *
 * 一个画布上可能有很多 ComfyUI 工作流节点，但真页面（iframe）不能各自常驻：
 * 卡片在「想挂」时申请一个名额，卸载或不再需要时释放；满员时后到的卡片先占位。
 * 名额本身是纯数据，分配/释放走 `comfyPageCard.ts` 的纯函数，这里只做状态托管。
 *
 * 另外记录「当前整屏的是哪个节点」：整屏卡片要在画布与画布浮层之上，而 React Flow
 * 容器自己带 z-index 形成层叠上下文，只能由画布根节点加类来抬（见 `App.tsx` 与
 * `theme/comfyPage.css`）。这里只存事实，不碰 DOM。
 */

import { create } from 'zustand';
import { planComfyFrameSlots, releaseComfyFrameSlot } from '../editor/utils/comfyPageCard.ts';

export interface ComfyFrameSlotState {
  slots: string[];
  /** 当前处于整屏态的节点 id；null = 没有整屏卡片。 */
  fullscreenNodeId: string | null;
  claim: (nodeId: string) => void;
  release: (nodeId: string) => void;
  setFullscreenNode: (nodeId: string | null) => void;
}

export const useComfyFrameSlots = create<ComfyFrameSlotState>()((set) => ({
  slots: [],
  fullscreenNodeId: null,
  claim: (nodeId) => {
    set((state) => ({ slots: planComfyFrameSlots(state.slots, nodeId).slots }));
  },
  release: (nodeId) => {
    set((state) => {
      const next = releaseComfyFrameSlot(state.slots, nodeId);
      return next.length === state.slots.length ? state : { slots: next };
    });
  },
  setFullscreenNode: (nodeId) => {
    set((state) => (state.fullscreenNodeId === nodeId ? state : { fullscreenNodeId: nodeId }));
  },
}));
