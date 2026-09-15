import type { ConversationAttachment } from './types.ts';

export interface SubmittedTurn {
  id: string;
  sessionId: string;
  promptText: string;
  attachments: ConversationAttachment[];
  timestamp: number;
  consumedBubbleIndex?: number;
}

const STORAGE_KEY_PREFIX = 'omx_submitted_att_';

class SubmittedAttachmentStore {
  private memory = new Map<string, SubmittedTurn[]>();

  record(sessionId: string, promptText: string, attachments: readonly ConversationAttachment[]): void {
    if (!attachments || attachments.length === 0) return;
    const targetSession = sessionId || 'default';
    const list = this.memory.get(targetSession) || [];

    const turn: SubmittedTurn = {
      id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId: targetSession,
      promptText: (promptText || '').trim(),
      attachments: attachments.map((item) => ({ ...item })),
      timestamp: Date.now(),
    };

    list.push(turn);
    this.memory.set(targetSession, list);
    this.persistToStorage(targetSession, list);
  }

  getTurnForBubble(sessionId: string, bubbleText: string, index: number): ConversationAttachment[] | null {
    const targetSession = sessionId || 'default';
    let list = this.memory.get(targetSession);
    if (!list || list.length === 0) {
      list = this.restoreFromStorage(targetSession);
      if (list.length > 0) {
        this.memory.set(targetSession, list);
      }
    }
    if (!list || list.length === 0) return null;

    const trimmed = (bubbleText || '').trim();

    // 1. 优先按未消费、且文本精确匹配的项查找
    for (const item of list) {
      if (item.consumedBubbleIndex === index) {
        return item.attachments;
      }
    }

    for (const item of list) {
      if (item.consumedBubbleIndex === undefined) {
        // 如果文本一致，或者其中包含该文字
        if (item.promptText === trimmed || trimmed.includes(item.promptText) || item.promptText.includes(trimmed)) {
          item.consumedBubbleIndex = index;
          this.persistToStorage(targetSession, list);
          return item.attachments;
        }
      }
    }

    // 2. 兜底：若未消费且按时序最近的一项
    const unconsumed = list.filter((i) => i.consumedBubbleIndex === undefined);
    if (unconsumed.length > 0) {
      const candidate = unconsumed[0];
      candidate.consumedBubbleIndex = index;
      this.persistToStorage(targetSession, list);
      return candidate.attachments;
    }

    return null;
  }

  clear(sessionId: string): void {
    const targetSession = sessionId || 'default';
    this.memory.delete(targetSession);
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${targetSession}`);
      } catch {
        // ignore
      }
    }
  }

  private persistToStorage(sessionId: string, list: SubmittedTurn[]) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      // 限制每个会话最多保留最近 20 次提交记录
      const bounded = list.slice(-20);
      sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${sessionId}`, JSON.stringify(bounded));
    } catch {
      // ignore quota errors
    }
  }

  private restoreFromStorage(sessionId: string): SubmittedTurn[] {
    if (typeof sessionStorage === 'undefined') return [];
    try {
      const raw = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${sessionId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

export const submittedAttachmentStore = new SubmittedAttachmentStore();
