/**
 * 模板面板纯逻辑（Issue #3625 工作流 5，无 React 依赖，供 node:test 断言）。
 *
 * 面板是**卡片形态**：左侧分类卡 + 右侧模板卡网格 + 「新建模板」入口卡。
 * 本模块只负责可判定的数据行为（分类派生 / 搜索过滤 / 命中判定），文案一律由
 * 组件经 i18n 字典渲染 —— 这里不出现任何用户可见字符串，也不做任何数据伪造。
 *
 * 分类来源是模板自身的 `tags`（`workflow/templates/templateSchema.ts` 的
 * `tags: string[]`）：**没有标签就没有分类卡**，绝不为了凑形态而编造分类。
 */

/** 分类重置项 id。其**文案**由 i18n 提供，且必须恰好是「全部」/「All」。 */
export const ALL_CATEGORIES_ID = 'all';

export interface TemplateCardModel {
  id: string;
  name: string;
  nodeCount: number;
  /** 模板描述（服务端 schema 有该字段；上游投影缺失时为 undefined）。 */
  description?: string;
  /** 模板分类标签（分类卡的唯一来源）。 */
  tags?: string[];
  /** 封面地址（可选；缺失时卡片走无封面形态，不塞占位图）。 */
  coverUrl?: string;
}

export interface TemplateCategoryOption {
  /** `ALL_CATEGORIES_ID` 或某个真实标签。 */
  id: string;
  /** 该分类下的模板数量（真实计数）。 */
  count: number;
}

/** 搜索词归一化：仅接受字符串，去首尾空白并小写。 */
export function normalizeTemplateQuery(query: unknown): string {
  return typeof query === 'string' ? query.trim().toLowerCase() : '';
}

/** 模板的分类标签集合：去重、保序、剔除空白项。 */
export function collectTemplateCategories(
  templates: readonly TemplateCardModel[] | undefined,
): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const template of templates ?? []) {
    for (const tag of template?.tags ?? []) {
      if (typeof tag !== 'string') continue;
      const trimmed = tag.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      categories.push(trimmed);
    }
  }
  return categories;
}

/**
 * 分类卡选项：首项恒为重置项 `ALL_CATEGORIES_ID`（文案「全部」），其后按模板标签
 * 出现顺序排列，各带真实计数。无标签时只返回重置项。
 */
export function deriveCategoryOptions(
  templates: readonly TemplateCardModel[] | undefined,
): TemplateCategoryOption[] {
  const list = (templates ?? []).filter(Boolean);
  const options: TemplateCategoryOption[] = [{ id: ALL_CATEGORIES_ID, count: list.length }];
  for (const category of collectTemplateCategories(list)) {
    options.push({
      id: category,
      count: list.filter((template) => templateMatchesCategory(template, category)).length,
    });
  }
  return options;
}

/** 分类命中：重置项（或空分类）匹配全部；否则要求标签精确相等。 */
export function templateMatchesCategory(
  template: TemplateCardModel | undefined,
  categoryId: string | undefined,
): boolean {
  if (!template) return false;
  if (!categoryId || categoryId === ALL_CATEGORIES_ID) return true;
  return (template.tags ?? []).some(
    (tag) => typeof tag === 'string' && tag.trim() === categoryId,
  );
}

/** 搜索命中：名称 / 描述 / 标签，大小写不敏感。空搜索词匹配全部。 */
export function templateMatchesQuery(
  template: TemplateCardModel | undefined,
  query: unknown,
): boolean {
  if (!template) return false;
  const normalized = normalizeTemplateQuery(query);
  if (!normalized) return true;
  const haystack = [template.name, template.description ?? '', ...(template.tags ?? [])]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .toLowerCase();
  return haystack.includes(normalized);
}

/** 分类 + 搜索双重过滤，保持输入顺序（不重排，避免掩盖服务端顺序）。 */
export function filterTemplates(
  templates: readonly TemplateCardModel[] | undefined,
  categoryId: string | undefined,
  query: unknown,
): TemplateCardModel[] {
  return (templates ?? []).filter(
    (template) => templateMatchesCategory(template, categoryId) && templateMatchesQuery(template, query),
  );
}

/**
 * 某分类在当前搜索词下是否还有命中。
 *
 * 用于把「空分类」如实标成不可用，而不是把卡片藏起来——空态来自数据，
 * 不是 CSS 遮盖。
 */
export function categoryHasMatches(
  templates: readonly TemplateCardModel[] | undefined,
  categoryId: string | undefined,
  query: unknown,
): boolean {
  return filterTemplates(templates, categoryId, query).length > 0;
}

/**
 * 「新建模板」入口卡是否渲染。
 *
 * 只有调用方提供了真实的新建回调时才渲染入口卡 —— 没有回调就画一张点不动的卡
 * 属于假入口，禁止。
 */
export function shouldRenderCreateEntry(
  onCreateWorkflow: ((...args: unknown[]) => void) | undefined,
): boolean {
  return typeof onCreateWorkflow === 'function';
}
