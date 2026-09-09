/**
 * plugins/omnimux-apps/src/host/index.ts
 *
 * Host entry point for omnimux-apps plugin.
 * Provides application storage, registration, and headless workflow coordination.
 */

import { AppStorage, AppStorageError } from './storage/appStorage.ts';
import type { AppIndexEntry, TaskRecord, AppStorageOptions } from './storage/appStorage.ts';
import {
  validateApplicationManifest,
  validateFormSchema,
  validateFormData,
} from '../shared/schemaValidator.ts';
import type {
  ApplicationManifest,
  ApplicationCategory,
  RestrictedJsonSchema,
  FormPropertySchema,
  FieldMappingEntry,
  ShowcaseConfig,
  ShowcaseItem,
} from '../shared/manifest.ts';

export * from '../shared/manifest.ts';
export * from '../shared/schemaValidator.ts';
export * from './storage/appStorage.ts';
export * from './executionBridge.ts';

import {
  executeAppWorkflow,
  queryExecutionStatus,
  cancelAppExecution,
  prepareAndInjectWorkflowSnapshot,
} from './executionBridge.ts';
import type {
  ExecutionBridgeResult,
  PreparedWorkflowSnapshot,
  HeadlessExecutionSeam,
  WorkflowJobStatus,
} from './executionBridge.ts';

export interface OmnimuxAppsService {
  storage: AppStorage;
  saveManifest(manifest: ApplicationManifest): Promise<{ success: boolean; filePath: string }>;
  getManifest(appId: string, version?: string): Promise<ApplicationManifest | null>;
  listApps(filter?: { category?: ApplicationCategory }): Promise<AppIndexEntry[]>;
  recordTask(appId: string, taskRecord: TaskRecord): Promise<{ success: boolean; taskId: string }>;
  getTask(appId: string, taskId: string): Promise<TaskRecord | null>;
  listTasks(appId: string, limit?: number): Promise<TaskRecord[]>;
  validateManifest(manifest: unknown): { valid: boolean; errors: string[] };
  validateFormData(schema: RestrictedJsonSchema, data: unknown): { valid: boolean; errors: string[] };
  prepareSnapshot(manifest: ApplicationManifest, formValues?: Record<string, unknown>): PreparedWorkflowSnapshot;
  executeApp(
    manifest: ApplicationManifest,
    formValues: Record<string, unknown>,
    headlessSeam: HeadlessExecutionSeam,
  ): Promise<ExecutionBridgeResult>;
  getJobStatus(executionId: string, headlessSeam: HeadlessExecutionSeam): Promise<WorkflowJobStatus | null>;
  cancelJob(executionId: string, headlessSeam: HeadlessExecutionSeam): Promise<{ success: boolean; canceledAt: string }>;
}

export function createAppsService(options?: AppStorageOptions): OmnimuxAppsService {
  const storage = new AppStorage(options);
  return {
    storage,
    saveManifest: (manifest) => storage.saveManifest(manifest),
    getManifest: (appId, version) => storage.getManifest(appId, version),
    listApps: (filter) => storage.listApps(filter),
    recordTask: (appId, taskRecord) => storage.recordTask(appId, taskRecord),
    getTask: (appId, taskId) => storage.getTask(appId, taskId),
    listTasks: (appId, limit) => storage.listTasks(appId, limit),
    validateManifest: (manifest) => validateApplicationManifest(manifest),
    validateFormData: (schema, data) => validateFormData(schema, data),
    prepareSnapshot: (manifest, formValues) => prepareAndInjectWorkflowSnapshot(manifest, formValues),
    executeApp: (manifest, formValues, headlessSeam) =>
      executeAppWorkflow({ manifest, formValues, headlessSeam }),
    getJobStatus: (executionId, headlessSeam) => queryExecutionStatus(executionId, headlessSeam),
    cancelJob: (executionId, headlessSeam) => cancelAppExecution(executionId, headlessSeam),
  };
}

export const defaultAppsService = createAppsService();

/**
 * Cordis / DSH Plugin lifecycle entry point
 */
export function apply(ctx: any): void {
  const service = defaultAppsService;

  if (typeof ctx.provide === 'function') {
    ctx.provide('omnimux-apps', service);
  }
  ctx['omnimux-apps'] = service;
}

export default {
  name: 'omnimux-apps',
  apply,
};
