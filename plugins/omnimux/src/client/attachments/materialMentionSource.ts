/**
 * @ 菜单里的「已加入素材」。
 *
 * 只列出当前输入框卡槽里已经加入的素材，排在官方文件与对话记录之前。
 * 没有素材时返回空列表，菜单不出现空分组。选中后插入一条引用，
 * 发送时展开成模型能读到的素材说明。不替换官方的 reference 源。
 */

import { getGlobalAttachmentStore } from './store.ts';
import type { ConversationAttachment } from './types.ts';

const SOURCE_NAME = 'material';
const SECTION = '已加入素材';

const KIND_LABEL: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  table: '表格',
  canvas: '画布',
  asset: '资产',
  product: '商品',
  inspiration: '灵感',
};

export interface MaterialMentionValue {
  id: string;
  title: string;
}

export const ENTITY_CATEGORY_CHARACTER_VALUE = 'entity:category:character';
export const ENTITY_CATEGORY_PRODUCT_VALUE = 'entity:category:product';

export function isEntityCategoryRef(ref: string): boolean {
  return ref === ENTITY_CATEGORY_CHARACTER_VALUE || ref === ENTITY_CATEGORY_PRODUCT_VALUE;
}

export function entityCategoryCandidates(query = '') {
  const q = query.trim().toLowerCase();
  const categories = [
    {
      name: '角色',
      description: '›',
      section: SECTION,
      value: ENTITY_CATEGORY_CHARACTER_VALUE,
    },
    {
      name: '产品',
      description: '›',
      section: SECTION,
      value: ENTITY_CATEGORY_PRODUCT_VALUE,
    },
  ];
  if (!q) return categories;
  return categories.filter((item) =>
    item.name.toLowerCase().includes(q) ||
    (item.value && item.value.toLowerCase().includes(q))
  );
}

export function materialMentionRef(attachment: Pick<ConversationAttachment, 'id'>): string {
  return `material:${attachment.id}`;
}

export function parseMaterialMention(ref: string): MaterialMentionValue | null {
  if (!ref.startsWith('material:')) return null;
  const id = ref.slice('material:'.length);
  if (!id) return null;
  return { id, title: '' };
}

export function listSessionMaterials(sessionId: string): readonly ConversationAttachment[] {
  const store = getGlobalAttachmentStore();
  const target = sessionId || store.getActiveSessionId();
  const rows = store.getSnapshot(target);
  if (rows.length > 0 || target === 'default') return rows;
  // 选择器还没认领到当前对话时，素材先停在待挂载分组。不读别的对话。
  return store.getSnapshot('default');
}

export function findSessionMaterial(sessionId: string, id: string): ConversationAttachment | undefined {
  return listSessionMaterials(sessionId).find((item) => item.id === id);
}

function matches(attachment: ConversationAttachment, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const kind = KIND_LABEL[attachment.kind] || '';
  return `${attachment.title} ${kind}`.toLowerCase().includes(needle);
}

export function materialCandidates(sessionId: string, query: string) {
  return listSessionMaterials(sessionId)
    .filter((item) => matches(item, query))
    .map((item) => ({
      name: item.title || '未命名素材',
      description: KIND_LABEL[item.kind] || '素材',
      section: SECTION,
      value: materialMentionRef(item),
    }));
}

export function serializeMaterialMention(sessionId: string, ref: string): string {
  const parsed = parseMaterialMention(ref);
  if (!parsed) return ref;
  const attachment = findSessionMaterial(sessionId, parsed.id);
  if (!attachment) return ref;
  const rawTitle = attachment.title || '素材';
  // 剥离英文双引号和换行符，避免引用 Token 闭合错位与断裂
  const safeTitle = rawTitle.replace(/["\r\n]/g, '').trim() || '素材';
  // 若素材名称含空格，按 DSH 语法使用 @"名称"（无空格使用 @名称）
  if (/\s/.test(safeTitle)) {
    return `@"${safeTitle}"`;
  }
  return `@${safeTitle}`;
}

export function createMaterialMentionSource() {
  return {
    trigger: '@' as const,
    name: SOURCE_NAME,
    // 官方 reference 默认 0。负值保证素材分组排在文件与对话记录之前。
    order: -10,
    showGroupTitle: false,
    candidates(session: { sessionId?: string }, req: { query?: string }) {
      const q = req?.query || '';
      const categories = entityCategoryCandidates(q);
      const materials = materialCandidates(session?.sessionId || '', q);
      return Promise.resolve([...categories, ...materials]);
    },
    lexicon(session: { sessionId?: string }) {
      const materialTitles = listSessionMaterials(session?.sessionId || '').map((item) => item.title).filter(Boolean);
      return ['角色', '产品', ...materialTitles];
    },
    subscribeLexicon(_session: unknown, listener: () => void) {
      return getGlobalAttachmentStore().subscribeRoster(listener);
    },
    onPick(pick: { candidate?: { value?: string; name?: string }; session?: { sessionId?: string } }) {
      const ref = pick?.candidate?.value || '';
      if (isEntityCategoryRef(ref)) {
        // 拦截分类入口误点击，主要交互由二级悬停完成
        return undefined;
      }
      const parsed = parseMaterialMention(ref);
      if (!parsed) return undefined;
      const attachment = findSessionMaterial(pick?.session?.sessionId || '', parsed.id);
      const label = attachment?.title || pick?.candidate?.name || '素材';
      return {
        insert: {
          source: SOURCE_NAME,
          ref,
          label,
          appearance: 'file' as const,
          // 写进用户消息的只留名称。文件说明走不显示的通道。
          clipboardText: label,
        },
      };
    },
    codec: {
      clipboardText(ref: string) {
        const parsed = parseMaterialMention(ref);
        if (!parsed) return ref;
        const attachment = findSessionMaterial(getGlobalAttachmentStore().getActiveSessionId(), parsed.id);
        return attachment?.title || '素材';
      },
      serialize(ref: string, _signal?: AbortSignal, sessionId?: string) {
        const target = sessionId || getGlobalAttachmentStore().getActiveSessionId();
        return Promise.resolve(serializeMaterialMention(target, ref));
      },
    },
  };
}

export function registerMaterialMentionSource(ctx: any): (() => void) | undefined {
  if (!ctx) return undefined;
  let activeUnregister: (() => void) | undefined;
  let registered = false;

  const tryRegister = (inputTriggers: any): (() => void) | undefined => {
    if (registered) return undefined;
    if (!inputTriggers || typeof inputTriggers.registerSource !== 'function') return undefined;
    const sources = inputTriggers.live?.sources;
    if (Array.isArray(sources) && sources.some((item: any) => item?.trigger === '@' && item?.name === SOURCE_NAME)) {
      registered = true;
      return undefined;
    }
    try {
      const unregister = inputTriggers.registerSource(createMaterialMentionSource());
      registered = true;
      activeUnregister = unregister;
      return unregister;
    } catch (err) {
      console.warn('[omnimux] registerSource("material") failed:', err);
      return undefined;
    }
  };

  if (typeof ctx.get === 'function') {
    const direct = ctx.get('inputTriggers');
    if (direct) {
      const unregister = tryRegister(direct);
      if (unregister && typeof ctx.effect === 'function') {
        ctx.effect(() => unregister, 'omnimux: material mention source');
      }
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['inputTriggers'], (inner: any) => {
      const unregister = tryRegister(inner.inputTriggers);
      if (unregister && typeof inner.effect === 'function') {
        inner.effect(() => unregister, 'omnimux: material mention source');
      }
    });
  }

  return () => {
    if (activeUnregister) {
      activeUnregister();
      activeUnregister = undefined;
    }
  };
}
