/**
 * 技能激活状态的跨插件全局通道。
 *
 * 输入框底部工具栏的技能药丸不读取任何插件私有模块：激活态通过
 * `window.__omnimuxActiveSkill` 持久化，变更通过 `omnimux:skill:changed`
 * 广播。任何来源（技能选择器自身、爆款复刻卡片）都只走这一条通道，
 * 药丸与其它联动方因此天然同步。
 */

export const SKILL_CHANGED_EVENT = 'omnimux:skill:changed';

/** 一个可激活技能的稳定身份。 */
export interface ActiveSkillIdentity {
  id?: string;
  name?: string;
  title?: string;
  slug?: string;
  description?: string;
  summary?: string;
  category?: string;
  categories?: readonly string[];
  [key: string]: unknown;
}

/** 读取当前激活技能；未激活或无宿主环境时返回 null。 */
export function readActiveSkill(win: Window | null = typeof window !== 'undefined' ? window : null): ActiveSkillIdentity | null {
  if (!win) return null;
  const skill = (win as unknown as { __omnimuxActiveSkill?: ActiveSkillIdentity | null }).__omnimuxActiveSkill;
  return skill && typeof skill === 'object' ? skill : null;
}

/**
 * 设置激活技能并广播变更。
 * @param skill 要激活的技能；传 null 表示清除
 * @returns 广播后的技能对象
 */
export function publishActiveSkill(
  skill: ActiveSkillIdentity | null,
  win: Window | null = typeof window !== 'undefined' ? window : null,
): ActiveSkillIdentity | null {
  if (!win) return null;
  (win as unknown as { __omnimuxActiveSkill?: ActiveSkillIdentity | null }).__omnimuxActiveSkill = skill;
  dispatchSkillChanged(skill, win);
  return skill;
}

/** 只广播技能变更，不改变持久值（例如另一处已经写入激活技能）。 */
export function dispatchSkillChanged(
  skill: ActiveSkillIdentity | null,
  win: Window | null = typeof window !== 'undefined' ? window : null,
): void {
  if (!win || typeof win.dispatchEvent !== 'function' || typeof win.CustomEvent !== 'function') return;
  try {
    win.dispatchEvent(new win.CustomEvent(SKILL_CHANGED_EVENT, {
      detail: {
        skill,
        category: skill ? String((skill as ActiveSkillIdentity).category || (Array.isArray((skill as ActiveSkillIdentity).categories) ? ((skill as ActiveSkillIdentity).categories as readonly string[])[0] : '') || '') : '',
      },
    }));
  } catch {
    // 广播失败不能影响激活态本身
  }
}

/** 订阅技能变更；返回取消订阅函数。 */
export function subscribeSkillChanged(
  listener: (skill: ActiveSkillIdentity | null) => void,
  win: Window | null = typeof window !== 'undefined' ? window : null,
): () => void {
  if (!win || typeof win.addEventListener !== 'function') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ skill?: ActiveSkillIdentity | null }>).detail;
    listener(detail?.skill || null);
  };
  win.addEventListener(SKILL_CHANGED_EVENT, handler);
  return () => {
    try {
      win.removeEventListener(SKILL_CHANGED_EVENT, handler);
    } catch {
      // 宿主已卸载时忽略
    }
  };
}

/** 解析技能事件载荷：未知形状一律回落为 null，避免污染激活态。 */
export function resolveSkillFromEvent(event: unknown): ActiveSkillIdentity | null {
  const detail = (event as { detail?: { skill?: unknown } } | null | undefined)?.detail;
  const skill = detail?.skill;
  return skill && typeof skill === 'object' ? (skill as ActiveSkillIdentity) : null;
}
