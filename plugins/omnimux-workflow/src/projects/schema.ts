/**
 * OmniMux 项目（Phase 0）数据契约 + zod 校验。
 *
 * 术语纪律（docs/contracts/gxgen-workflow-migration.md §1）：
 *   「项目」 = 默认库里的一个作品文件夹；该文件夹 **就是** dsh 工作区
 *   （会话 cwd）。不是画布 `WorkspaceStore`，也不是「父 cwd 下藏一堆 json」。
 *
 * 落盘布局（2026-08-23 改冻）：
 *   <videos>/OmniMux/Projects/<可读名>/
 *     .omnimux/project.json
 *
 * schemaVersion 仍从 1 起；字段增量向后兼容。读到更高版本拒绝（坏文件跳过不崩库）。
 * index.json 不再是主路径；扫描目录为真相。
 */
import { z } from 'zod';

export const PROJECT_SCHEMA_VERSION = 1 as const;

/** 项目标题长度上限（与画布 workspace 的 name 上限一致，M2 QA 惯例）。 */
export const MAX_PROJECT_TITLE_LENGTH = 200;

/** 创作页数据模型（1 个项目可包含 N 个创作页，每个创作页有独立画布） */
export const projectPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(MAX_PROJECT_TITLE_LENGTH),
  createdAt: z.string(),
  updatedAt: z.string(),
  canvasWorkspaceId: z.string().optional(),
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
  /** 绑定会话；新建项目时写入，可为 null（尚未建会话的中间态）。 */
  sessionId: z.string().nullable(),
  /** 关联画布工作区 id 列表。 */
  canvasWorkspaceIds: z.array(z.string()),
  /** 当前激活的创作页 ID */
  activePageId: z.string().optional(),
  /** 项目包含的创作页列表 */
  pages: z.array(projectPageSchema).optional(),
});

export type Project = z.infer<typeof projectSchema>;

/** 列表摘要 + 扫描得到的绝对路径。 */
export const projectSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(MAX_PROJECT_TITLE_LENGTH),
  updatedAt: z.string(),
  sessionId: z.string().nullable(),
  path: z.string().min(1).optional(),
  pages: z.array(projectPageSchema).optional(),
  activePageId: z.string().optional(),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

/**
 * 历史 index.json（停用主路径）。解析保留以便跳过坏文件，不再作为 list 真源。
 */
export const projectIndexSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  projects: z.array(projectSummarySchema),
});

export type ProjectIndex = z.infer<typeof projectIndexSchema>;

/**
 * 读取侧容错解析：schemaVersion 更高 / 结构不合法一律返回 null（跳过坏文件）。
 * 写入侧严格校验（见 ProjectStore，写前 re-validate）。
 */
export function parseProject(raw: unknown): Project | null {
  const result = projectSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseProjectIndex(raw: unknown): ProjectIndex | null {
  const result = projectIndexSchema.safeParse(raw);
  return result.success ? result.data : null;
}
