/**
 * OmniMux 项目（Phase 0）数据契约 + zod 校验。
 *
 * 术语纪律（docs/contracts/gxgen-workflow-migration.md §1）：
 *   「项目」 = 默认库里的一个作品文件夹；该文件夹 **就是** dsh 工作区
 *   （会话 cwd）。不是画布 `WorkspaceStore`，也不是「父 cwd 下藏一堆 json」。
 *
 * schemaVersion 2 是唯一模型：项目只持 pages/activePageId，不再持会话或画布 id 数组。
 */
import { z } from 'zod';

export const PROJECT_SCHEMA_VERSION = 2 as const;

/** 项目标题长度上限（与画布 workspace 的 name 上限一致，M2 QA 惯例）。 */
export const MAX_PROJECT_TITLE_LENGTH = 200;

/** 创作页数据模型（1 个项目可包含 N 个创作页，每个创作页有独立画布） */
export const projectPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(MAX_PROJECT_TITLE_LENGTH),
  createdAt: z.string(),
  updatedAt: z.string(),
  canvasWorkspaceId: z.string().min(1),
  loadMemory: z.boolean().optional(),
});

export type ProjectPage = z.infer<typeof projectPageSchema>;

/** project.json 全量字段（不含磁盘路径；path 由扫描派生）。 */
export const projectSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string().min(1).max(MAX_PROJECT_TITLE_LENGTH),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** 当前激活的创作页 ID */
  activePageId: z.string().min(1),
  /** 项目包含的创作页列表 */
  pages: z.array(projectPageSchema).min(1),
});

export type Project = z.infer<typeof projectSchema>;

/** 列表摘要 + 扫描得到的绝对路径。 */
export const projectSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(MAX_PROJECT_TITLE_LENGTH),
  updatedAt: z.string(),
  path: z.string().min(1).optional(),
  pages: z.array(projectPageSchema).min(1),
  activePageId: z.string().min(1),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

/** 历史 index.json（停用主路径）。 */
export const projectIndexSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  projects: z.array(projectSummarySchema),
});

export type ProjectIndex = z.infer<typeof projectIndexSchema>;

const tolerantPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(MAX_PROJECT_TITLE_LENGTH),
  createdAt: z.string(),
  updatedAt: z.string(),
  canvasWorkspaceId: z.string().optional(),
  loadMemory: z.boolean().optional(),
});

const tolerantProjectSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string().min(1).max(MAX_PROJECT_TITLE_LENGTH),
  createdAt: z.string(),
  updatedAt: z.string(),
  activePageId: z.string().optional(),
  pages: z.array(tolerantPageSchema).optional(),
});

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Deterministic canvas id for a page that predates the pages model (no random →
 *  migration is pure and re-running it yields the same record). */
function migratedCanvasId(projectId: string, index: number): string {
  const seed = projectId.replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || 'project';
  return index === 0 ? `ws_${seed}` : `ws_${seed}_${index + 1}`;
}

/** Generated page titles (e.g. `${title} · 创作页 N`) can exceed the project title
 *  cap even when the v1 project title itself is legal. Every generated title must be
 *  clamped, otherwise a long-titled v1 migrates to a v2 record that later fails
 *  projectSchema and the project silently disappears (the very loop we're fixing). */
function migratePageTitle(base: string, index: number): string {
  const generated = index === 0 ? base : `${base} · 创作页 ${index + 1}`;
  return generated.slice(0, MAX_PROJECT_TITLE_LENGTH);
}

/**
 * v1→v2 读取迁移。v1 只持 sessionId / canvasWorkspaceIds，没有 pages；这里把它翻成
 * 合法的 v2：
 *   - 丢弃 sessionId / canvasWorkspaceIds（v2 不再持会话或画布 id 数组）；
 *   - 保留 id / title / createdAt / updatedAt；
 *   - pages 优先取 v1 的 pages[]（若已带 pages），否则用 canvasWorkspaceIds[0]（或确定性生成）
 *     造出 ≥1 个 page，且每个 page 都有非空 canvasWorkspaceId；
 *   - activePageId 落在现有 page 上，否则取第一页。
 * 纯函数、确定性、幂等：对同一 v1 输入重复迁移结果一致，对已是 v2 的输入不生效。
 */
function migrateV1Project(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object' || (raw as { schemaVersion?: unknown }).schemaVersion !== 1) return null;
  const record = raw as Record<string, unknown>;
  const id = nonEmpty(record.id);
  const rawTitle = nonEmpty(record.title);
  // A v1 title over the cap is clamped rather than rejected: dropping the record
  // would make the project invisible again (the original bug), and every consumer
  // treats the title as display-only.
  if (!id || !rawTitle) return null;
  const title = rawTitle.slice(0, MAX_PROJECT_TITLE_LENGTH);
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : '';

  let pages: ProjectPage[];
  const rawPages = record.pages;
  if (Array.isArray(rawPages) && rawPages.length > 0) {
    pages = rawPages.map((entry, index) => {
      const page = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      return {
        id: nonEmpty(page.id) ?? (index === 0 ? 'page-default' : `page-${index + 1}`),
        title: nonEmpty(page.title)
          ? String(page.title).slice(0, MAX_PROJECT_TITLE_LENGTH)
          : migratePageTitle(title, index),
        createdAt: typeof page.createdAt === 'string' ? page.createdAt : createdAt,
        updatedAt: typeof page.updatedAt === 'string' ? page.updatedAt : updatedAt,
        canvasWorkspaceId: nonEmpty(page.canvasWorkspaceId) ?? migratedCanvasId(id, index),
      };
    });
  } else {
    const ids = Array.isArray(record.canvasWorkspaceIds)
      ? record.canvasWorkspaceIds.map((value) => nonEmpty(value)).filter((value): value is string => value !== null)
      : [];
    const canvasIds = ids.length > 0 ? ids : [migratedCanvasId(id, 0)];
    pages = canvasIds.map((canvasWorkspaceId, index) => ({
      id: index === 0 ? 'page-default' : `page-${index + 1}`,
      title: migratePageTitle(title, index),
      createdAt,
      updatedAt,
      canvasWorkspaceId,
    }));
  }

  const requestedActive = nonEmpty(record.activePageId);
  const activePageId = requestedActive && pages.some((page) => page.id === requestedActive)
    ? requestedActive
    : pages[0]!.id;

  // Validate the migration output before handing it out: a migrated record that does
  // not satisfy projectSchema would be written back to disk only to fail parseProject
  // later. With every generated title clamped (and the project title clamped above),
  // this must succeed; the safeParse is a guard, not a fallback path.
  const migrated: Project = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id,
    title,
    createdAt,
    updatedAt,
    activePageId,
    pages,
  };
  const validated = projectSchema.safeParse(migrated);
  return validated.success ? validated.data : null;
}

/**
 * 读取侧容错解析：接受 v2（严格/宽松）与 v1（读迁移为 v2）；更高版本或坏结构返回 null。
 * v1 不再被“跳过”——迁移后正常收录，避免列表看不到、按根查不到、create 反复 409。
 */
export function parseProject(raw: unknown): Project | null {
  const result = projectSchema.safeParse(raw);
  if (result.success) return result.data;
  const tolerantResult = tolerantProjectSchema.safeParse(raw);
  if (tolerantResult.success) {
    return tolerantResult.data as unknown as Project;
  }
  return migrateV1Project(raw);
}

export function parseProjectIndex(raw: unknown): ProjectIndex | null {
  const result = projectIndexSchema.safeParse(raw);
  return result.success ? result.data : null;
}
