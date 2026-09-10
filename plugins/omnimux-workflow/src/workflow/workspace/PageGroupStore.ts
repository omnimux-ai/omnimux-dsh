/**
 * PageGroupStore: 持久化非 Project 独立画布的多创作页分组关系。
 *
 * 存储路径：$workspacesDir/page-groups.json
 * 确保即使没有默认库下的 project.json，任意工作区画布的多页面关系也能 100% 物理落盘。
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface PageItem {
  id: string;
  title: string;
  canvasWorkspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageGroup {
  groupId: string;
  activePageId: string;
  pages: PageItem[];
  updatedAt: string;
}

interface PageGroupsData {
  groups: Record<string, PageGroup>;
}

function atomicWriteJson(filePath: string, data: unknown): void {
  mkdirSync(join(filePath, '..'), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class PageGroupStore {
  private readonly filePath: string;

  constructor(workspacesDir: string) {
    this.filePath = join(workspacesDir, 'page-groups.json');
  }

  private loadData(): PageGroupsData {
    const data = readJsonFile<PageGroupsData>(this.filePath);
    if (data && typeof data.groups === 'object' && data.groups !== null) {
      return data;
    }
    return { groups: {} };
  }

  private saveData(data: PageGroupsData): void {
    atomicWriteJson(this.filePath, data);
  }

  /**
   * 根据任一画布 workspaceId 反查其所属的页面组
   */
  findGroupByWorkspaceId(workspaceId: string): PageGroup | null {
    if (!workspaceId) return null;
    const data = this.loadData();
    for (const group of Object.values(data.groups)) {
      if (group.pages.some((p) => p.canvasWorkspaceId === workspaceId)) {
        return group;
      }
    }
    return null;
  }

  /**
   * 确保或初始化该画布所在的分组
   */
  ensureGroup(workspaceId: string, fallbackTitle = '创作页 1'): PageGroup {
    const found = this.findGroupByWorkspaceId(workspaceId);
    if (found) return found;

    const data = this.loadData();
    const groupId = `group_${workspaceId}`;
    const now = new Date().toISOString();
    const newGroup: PageGroup = {
      groupId,
      activePageId: 'page-1',
      pages: [
        {
          id: 'page-1',
          title: fallbackTitle,
          canvasWorkspaceId: workspaceId,
          createdAt: now,
          updatedAt: now,
        },
      ],
      updatedAt: now,
    };
    data.groups[groupId] = newGroup;
    this.saveData(data);
    return newGroup;
  }

  /**
   * 在分组内新增一个创作页
   */
  addPage(workspaceId: string, title: string, newCanvasWorkspaceId: string): { group: PageGroup; page: PageItem } {
    const group = this.ensureGroup(workspaceId);
    const data = this.loadData();
    const currentGroup = data.groups[group.groupId] || group;

    const now = new Date().toISOString();
    const pageId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newPage: PageItem = {
      id: pageId,
      title: title.trim() || `创作页 ${currentGroup.pages.length + 1}`,
      canvasWorkspaceId: newCanvasWorkspaceId,
      createdAt: now,
      updatedAt: now,
    };

    currentGroup.pages.push(newPage);
    currentGroup.activePageId = pageId;
    currentGroup.updatedAt = now;
    data.groups[currentGroup.groupId] = currentGroup;
    this.saveData(data);

    return { group: currentGroup, page: newPage };
  }

  /**
   * 切换分组内的激活创作页
   */
  setActivePage(workspaceId: string, pageId: string): PageGroup | null {
    const group = this.findGroupByWorkspaceId(workspaceId);
    if (!group) return null;
    const data = this.loadData();
    const currentGroup = data.groups[group.groupId];
    if (!currentGroup) return null;

    if (currentGroup.pages.some((p) => p.id === pageId)) {
      currentGroup.activePageId = pageId;
      currentGroup.updatedAt = new Date().toISOString();
      this.saveData(data);
    }
    return currentGroup;
  }

  /**
   * 重命名分组内的创作页
   */
  renamePage(workspaceId: string, pageId: string, title: string): PageGroup | null {
    const group = this.findGroupByWorkspaceId(workspaceId);
    if (!group) return null;
    const data = this.loadData();
    const currentGroup = data.groups[group.groupId];
    if (!currentGroup) return null;

    const page = currentGroup.pages.find((p) => p.id === pageId);
    if (page) {
      page.title = title.trim() || page.title;
      page.updatedAt = new Date().toISOString();
      currentGroup.updatedAt = new Date().toISOString();
      this.saveData(data);
    }
    return currentGroup;
  }

  /**
   * 删除创作页 (至少保留 1 页)
   */
  removePage(workspaceId: string, pageId: string): PageGroup | null {
    const group = this.findGroupByWorkspaceId(workspaceId);
    if (!group) return null;
    const data = this.loadData();
    const currentGroup = data.groups[group.groupId];
    if (!currentGroup || currentGroup.pages.length <= 1) return null;

    currentGroup.pages = currentGroup.pages.filter((p) => p.id !== pageId);
    if (currentGroup.activePageId === pageId) {
      currentGroup.activePageId = currentGroup.pages[0].id;
    }
    currentGroup.updatedAt = new Date().toISOString();
    this.saveData(data);
    return currentGroup;
  }
}
