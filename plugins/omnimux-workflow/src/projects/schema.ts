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

/**
 * 读取侧容错解析：只有 v2 是合法项目；更高/更低版本或坏结构返回 null（跳过坏文件）。
 * 旧的 v1（含 sessionId/canvasWorkspaceIds）不迁移、不读取。
 */
export function parseProject(raw: unknown): Project | null {
  const result = projectSchema.safeParse(raw);
  if (result.success) return result.data;
  const tolerantResult = tolerantProjectSchema.safeParse(raw);
  if (tolerantResult.success) {
    return tolerantResult.data as unknown as Project;
  }
  return null;
}

export function parseProjectIndex(raw: unknown): ProjectIndex | null {
  const result = projectIndexSchema.safeParse(raw);
  return result.success ? result.data : null;
}
