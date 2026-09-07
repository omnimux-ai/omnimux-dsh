import fs from 'node:fs/promises';
import path from 'node:path';
import { AsyncMutex } from './AsyncMutex.ts';
import {
  type HTableDocument,
  HTableDocumentSchema,
  migrateLegacyTableDocument,
} from '../../shared/types/htable.ts';

export class TableStorageError extends Error {
  readonly code: string;
  readonly currentRev?: number;
  constructor(code: string, message: string, currentRev?: number) {
    super(message);
    this.name = 'TableStorageError';
    this.code = code;
    this.currentRev = currentRev;
  }
}

export interface SaveTableResult {
  document: HTableDocument;
  contentRev: number;
}

export class TableStorageService {
  private static fileLocks = new Map<string, AsyncMutex>();

  private static getMutex(tablePath: string): AsyncMutex {
    if (!this.fileLocks.has(tablePath)) {
      this.fileLocks.set(tablePath, new AsyncMutex());
    }
    return this.fileLocks.get(tablePath)!;
  }

  /**
   * 安全加载并校验 .htable 表格文件（支持老版本数组格式平滑迁移）
   */
  static async loadTable(tablePath: string): Promise<HTableDocument> {
    const mutex = this.getMutex(tablePath);
    return await mutex.runExclusive(async () => {
      const raw = await fs.readFile(tablePath, 'utf-8');
      const json = JSON.parse(raw);
      // 容错迁移老数据与坏结构
      const migrated = migrateLegacyTableDocument(json);
      return HTableDocumentSchema.parse(migrated);
    });
  }

  /**
   * 原子化写入 .htable 文件 (tmp -> rename)，支持 expectedRev 乐观锁校验
   */
  static async saveTable(
    tablePath: string,
    doc: HTableDocument,
    opts: { expectedRev?: number } = {},
  ): Promise<SaveTableResult> {
    const mutex = this.getMutex(tablePath);
    return await mutex.runExclusive(async () => {
      let currentRev = 0;
      let fileExisted = false;

      try {
        const existingRaw = await fs.readFile(tablePath, 'utf-8');
        fileExisted = true;
        const existingJson = JSON.parse(existingRaw);
        if (typeof existingJson.contentRev === 'number') {
          currentRev = existingJson.contentRev;
        }
      } catch {
        fileExisted = false;
      }

      if (opts.expectedRev !== undefined && fileExisted) {
        if (currentRev !== opts.expectedRev) {
          throw new TableStorageError(
            'version_conflict',
            `Table version conflict: expected rev ${opts.expectedRev}, but current rev is ${currentRev}`,
            currentRev,
          );
        }
      }

      const nextRev = opts.expectedRev !== undefined ? opts.expectedRev + 1 : currentRev + 1;

      // 1. 容错迁移并注入递增后的 contentRev
      const normalized = migrateLegacyTableDocument({
        ...doc,
        contentRev: nextRev,
      });
      const validated = HTableDocumentSchema.parse(normalized);
      const content = JSON.stringify(validated, null, 2);

      // 2. 确保目录存在
      const dir = path.dirname(tablePath);
      await fs.mkdir(dir, { recursive: true });

      // 3. 写入临时文件
      const tempPath = path.join(
        dir,
        `.${path.basename(tablePath)}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`,
      );
      await fs.writeFile(tempPath, content, 'utf-8');

      // 4. 原子重命名覆盖
      await fs.rename(tempPath, tablePath);

      return { document: validated, contentRev: nextRev };
    });
  }

  /**
   * 删除表格文件 (幂等)
   */
  static async deleteTable(tablePath: string): Promise<boolean> {
    const mutex = this.getMutex(tablePath);
    return await mutex.runExclusive(async () => {
      try {
        await fs.unlink(tablePath);
        return true;
      } catch (err: any) {
        if (err.code === 'ENOENT') return false;
        throw err;
      }
    });
  }

  /**
   * 检查表格文件是否存在
   */
  static async exists(tablePath: string): Promise<boolean> {
    try {
      await fs.access(tablePath);
      return true;
    } catch {
      return false;
    }
  }
}
