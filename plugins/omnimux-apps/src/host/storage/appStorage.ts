/**
 * plugins/omnimux-apps/src/host/storage/appStorage.ts
 *
 * Local POSIX atomic file storage for OmniMux AI Applications.
 * Manages ~/.omnimux/apps/<appId>/manifest@<version>.json, index app.json, and task projections.
 *
 * Architecture SSOT: docs/contracts/workflow-app-boundary.md & ai-app-ui-spec.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ApplicationManifest, ApplicationCategory } from '../../shared/manifest.ts';
import { validateApplicationManifest } from '../../shared/schemaValidator.ts';

export class AppStorageError extends Error {
  public readonly code: 'version_conflict' | 'not_found' | 'invalid_manifest' | 'io_error';
  public readonly details?: unknown;

  constructor(
    code: 'version_conflict' | 'not_found' | 'invalid_manifest' | 'io_error',
    message: string,
    details?: unknown,
  ) {
    super(`[AppStorage] ${code}: ${message}`);
    this.name = 'AppStorageError';
    this.code = code;
    this.details = details;
  }
}

/** appId 只允许这组字符：它是目录名，任何路径分隔或 `..` 都必须在这里被拒。 */
export const APP_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * 版本号进入文件名 `manifest@<version>.json`：允许 semver 的点号与预发布标记，
 * 但绝不允许路径分隔符，也不允许整体是 `..`。
 */
export const APP_VERSION_PATTERN = /^(?!\.\.?$)[a-zA-Z0-9._+-]+$/;

/**
 * appId 是否可作为目录名。写路径由 schemaValidator 校验，读路径（getManifest /
 * 任务记录）此前没有任何校验——`%2F` 解码出的 `/` 会直接拼进 path.join，
 * 读走应用目录外的 JSON。判定必须落在存储层，不能只靠某个调用方拦。
 */
export function isValidAppId(appId: unknown): appId is string {
  return typeof appId === 'string' && APP_ID_PATTERN.test(appId);
}

/** Lightweight metadata index persisted at ~/.omnimux/apps/<appId>/app.json */
export interface AppIndexEntry {
  appId: string;
  name: string;
  category: ApplicationCategory;
  description?: string;
  iconSvg: string;
  coverUrl?: string;
  latestVersion: string;
  versions: string[];
  createdAt: string;
  updatedAt: string;
}

/** Local task execution projection persisted at ~/.omnimux/apps/<appId>/tasks/<taskId>.json */
export interface TaskRecord {
  taskId: string;
  appId: string;
  appVersion: string;
  executionId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  inputs: Record<string, unknown>;
  outputs?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppStorageOptions {
  baseDir?: string;
}

/**
 * Local filesystem storage provider for AI applications.
 */
export class AppStorage {
  public readonly baseDir: string;

  constructor(options?: AppStorageOptions) {
    if (options?.baseDir) {
      this.baseDir = path.resolve(options.baseDir);
    } else if (process.env.OMNIMUX_APPS_DIR) {
      this.baseDir = path.resolve(process.env.OMNIMUX_APPS_DIR);
    } else {
      const home = process.env.HOME || os.homedir();
      this.baseDir = path.join(home, '.omnimux', 'apps');
    }
  }

  /**
   * Save an application manifest with POSIX atomic write and immutable version enforcement.
   */
  public async saveManifest(manifest: ApplicationManifest): Promise<{ success: boolean; filePath: string }> {
    // 1. Strict contract validation
    const valResult = validateApplicationManifest(manifest);
    if (!valResult.valid) {
      throw new AppStorageError(
        'invalid_manifest',
        `Manifest validation failed: ${valResult.errors.join('; ')}`,
        valResult.errors,
      );
    }

    const appDir = path.join(this.baseDir, manifest.appId);
    const manifestPath = path.join(appDir, `manifest@${manifest.version}.json`);
    const indexPath = path.join(appDir, 'app.json');

    // 2. Immutable version check (Fail-Closed, allow overwrite if user explicitly overrides)
    const isOverride = Boolean((manifest as any).isUserOverridden || (manifest as any).metadata?.isUserOverridden);
    if (fs.existsSync(manifestPath) && !isOverride) {
      throw new AppStorageError(
        'version_conflict',
        `App version already exists and is immutable: ${manifest.appId}@${manifest.version}`,
      );
    }

    // Ensure application directory exists
    await fs.promises.mkdir(appDir, { recursive: true });

    // 3. POSIX atomic write manifest: write to unique temp file, then atomic rename
    await this.atomicWriteFile(manifestPath, JSON.stringify(manifest, null, 2));

    // 4. Update index app.json atomically
    let indexEntry: AppIndexEntry;
    if (fs.existsSync(indexPath)) {
      try {
        const raw = await fs.promises.readFile(indexPath, 'utf-8');
        indexEntry = JSON.parse(raw) as AppIndexEntry;
        indexEntry.name = manifest.metadata.name;
        indexEntry.category = manifest.metadata.category;
        indexEntry.description = manifest.metadata.description;
        indexEntry.iconSvg = manifest.metadata.iconSvg;
        indexEntry.coverUrl = manifest.metadata.coverUrl;
        indexEntry.latestVersion = manifest.version;
        if (!indexEntry.versions.includes(manifest.version)) {
          indexEntry.versions.push(manifest.version);
        }
        indexEntry.updatedAt = new Date().toISOString();
      } catch (err: any) {
        throw new AppStorageError('io_error', `Failed to read existing index ${indexPath}: ${err.message}`);
      }
    } else {
      indexEntry = {
        appId: manifest.appId,
        name: manifest.metadata.name,
        category: manifest.metadata.category,
        description: manifest.metadata.description,
        iconSvg: manifest.metadata.iconSvg,
        coverUrl: manifest.metadata.coverUrl,
        latestVersion: manifest.version,
        versions: [manifest.version],
        createdAt: manifest.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    await this.atomicWriteFile(indexPath, JSON.stringify(indexEntry, null, 2));

    return {
      success: true,
      filePath: manifestPath,
    };
  }

  /**
   * Retrieve an application manifest by appId and optional exact version.
   * If version is omitted, returns the manifest corresponding to `latestVersion`.
   */
  public async getManifest(appId: string, version?: string): Promise<ApplicationManifest | null> {
    if (!isValidAppId(appId)) return null;
    const appDir = path.join(this.baseDir, appId);
    let targetVersion = version;

    if (!targetVersion) {
      const indexPath = path.join(appDir, 'app.json');
      if (!fs.existsSync(indexPath)) {
        return null;
      }
      try {
        const raw = await fs.promises.readFile(indexPath, 'utf-8');
        const index = JSON.parse(raw) as AppIndexEntry;
        targetVersion = index.latestVersion;
      } catch (err: any) {
        // 索引存在但读不出/解析不了 = 存储损坏，不是「没有这个应用」。
        // 静默 return null 会让调用方回落出厂版本，把用户覆盖发布的应用无声换回官方原版。
        throw new AppStorageError('io_error', `Failed to read app index ${indexPath}: ${err.message}`);
      }
    }

    if (!targetVersion) {
      return null;
    }
    // 版本号同样进入文件名，必须挡住分隔符与 `..`。
    if (typeof targetVersion !== 'string' || !APP_VERSION_PATTERN.test(targetVersion)) {
      throw new AppStorageError('invalid_manifest', `Invalid version identifier: ${String(targetVersion)}`);
    }

    const manifestPath = path.join(appDir, `manifest@${targetVersion}.json`);
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const raw = await fs.promises.readFile(manifestPath, 'utf-8');
      return JSON.parse(raw) as ApplicationManifest;
    } catch (err: any) {
      throw new AppStorageError('io_error', `Failed to read manifest ${manifestPath}: ${err.message}`);
    }
  }

  /**
   * List all registered apps, optionally filtering by category ('video' | 'image' | 'audio').
   */
  public async listApps(filter?: { category?: ApplicationCategory }): Promise<AppIndexEntry[]> {
    if (!fs.existsSync(this.baseDir)) {
      return [];
    }

    const results: AppIndexEntry[] = [];
    try {
      const entries = await fs.promises.readdir(this.baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const indexPath = path.join(this.baseDir, entry.name, 'app.json');
          if (fs.existsSync(indexPath)) {
            try {
              const raw = await fs.promises.readFile(indexPath, 'utf-8');
              const index = JSON.parse(raw) as AppIndexEntry;
              if (!filter?.category || index.category === filter.category) {
                results.push(index);
              }
            } catch {
              // Ignore corrupted entry and continue
            }
          }
        }
      }
    } catch (err: any) {
      throw new AppStorageError('io_error', `Failed to list apps in ${this.baseDir}: ${err.message}`);
    }

    // Sort by updatedAt descending
    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return results;
  }

  /**
   * Record a task projection for an application.
   */
  public async recordTask(appId: string, taskRecord: TaskRecord): Promise<{ success: boolean; taskId: string }> {
    if (!isValidAppId(appId)) {
      throw new AppStorageError('invalid_manifest', `Invalid appId: ${String(appId)}`);
    }
    if (!taskRecord.taskId || !taskRecord.taskId.trim()) {
      throw new AppStorageError('io_error', 'taskRecord.taskId must be a non-empty string');
    }
    if (!APP_ID_PATTERN.test(taskRecord.taskId)) {
      throw new AppStorageError('invalid_manifest', `Invalid taskId: ${String(taskRecord.taskId)}`);
    }
    if (taskRecord.appId !== appId) {
      throw new AppStorageError('io_error', `taskRecord.appId (${taskRecord.appId}) does not match appId (${appId})`);
    }

    const tasksDir = path.join(this.baseDir, appId, 'tasks');
    await fs.promises.mkdir(tasksDir, { recursive: true });

    const taskPath = path.join(tasksDir, `${taskRecord.taskId}.json`);
    await this.atomicWriteFile(taskPath, JSON.stringify(taskRecord, null, 2));

    return {
      success: true,
      taskId: taskRecord.taskId,
    };
  }

  /**
   * Retrieve a recorded task.
   */
  public async getTask(appId: string, taskId: string): Promise<TaskRecord | null> {
    if (!isValidAppId(appId) || !APP_ID_PATTERN.test(String(taskId ?? ''))) return null;
    const taskPath = path.join(this.baseDir, appId, 'tasks', `${taskId}.json`);
    if (!fs.existsSync(taskPath)) {
      return null;
    }
    try {
      const raw = await fs.promises.readFile(taskPath, 'utf-8');
      return JSON.parse(raw) as TaskRecord;
    } catch (err: any) {
      throw new AppStorageError('io_error', `Failed to read task ${taskPath}: ${err.message}`);
    }
  }

  /**
   * List task history for an application.
   */
  public async listTasks(appId: string, limit: number = 50): Promise<TaskRecord[]> {
    if (!isValidAppId(appId)) return [];
    const tasksDir = path.join(this.baseDir, appId, 'tasks');
    if (!fs.existsSync(tasksDir)) {
      return [];
    }

    const results: TaskRecord[] = [];
    try {
      const entries = await fs.promises.readdir(tasksDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const taskPath = path.join(tasksDir, entry.name);
          try {
            const raw = await fs.promises.readFile(taskPath, 'utf-8');
            results.push(JSON.parse(raw) as TaskRecord);
          } catch {
            // ignore corrupted task file
          }
        }
      }
    } catch (err: any) {
      throw new AppStorageError('io_error', `Failed to list tasks in ${tasksDir}: ${err.message}`);
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return results.slice(0, limit);
  }

  /**
   * Internal helper: POSIX atomic write (write tmp in target directory -> rename).
   */
  private async atomicWriteFile(targetPath: string, content: string): Promise<void> {
    const dir = path.dirname(targetPath);
    const tmpPath = path.join(
      dir,
      `.tmp.${path.basename(targetPath)}.${Date.now()}.${Math.random().toString(36).slice(2)}`,
    );

    try {
      await fs.promises.writeFile(tmpPath, content, 'utf-8');
      await fs.promises.rename(tmpPath, targetPath);
    } catch (err: any) {
      // Clean up tmp file on error if it was created
      if (fs.existsSync(tmpPath)) {
        try {
          await fs.promises.unlink(tmpPath);
        } catch {
          // ignore unlink error
        }
      }
      throw new AppStorageError('io_error', `Failed atomic write to ${targetPath}: ${err.message}`);
    }
  }
}
