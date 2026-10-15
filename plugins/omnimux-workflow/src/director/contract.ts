import type { DirectorScene, DirectorSceneOutput } from './scene-types';
export type * from './scene-types';

/** No React, Three, vendor runtime or provider types cross this DOM boundary. */
export interface DirectorIdentity {
  userId: string;
  projectId: string;
  nodeId: string;
  sceneId: string;
  /** Changes on project/node/session replacement, including A → B → A. */
  epoch: number;
}
export interface DirectorResource {
  assetId?: string;
  storageKey: string;
  /** Managed reference, not an expiring blob or developer absolute path. */
  url: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  fileName?: string;
}
export interface DirectorImageResource extends DirectorResource { width: number; height: number }
export interface DirectorExportResource extends DirectorResource { assetId: string; outputNodeId: string; width: number; height: number; durationSec?: number }
export interface DirectorExportResult { confirmed: true; resource?: DirectorExportResource }
export interface DirectorCommand { operationId: string; kind: 'image' | 'video'; shotId: string; sourceRevision: number }
export interface DirectorCommandOptions { signal?: AbortSignal; timeoutMs?: number }
export interface DirectorAsset {
  id: string;
  kind: 'image' | 'model' | 'video';
  title: string;
  coverUrl?: string;
  tags: string[];
  source?: string;
  metadata?: Record<string, unknown>;
  data: { storageKey?: string; url?: string; dataUrl?: string; width?: number; height?: number; bytes?: number; mimeType?: string; fileName?: string };
}
export type DirectorNewAsset = Omit<DirectorAsset, 'id'>;
export interface DirectorImageNode { id: string; title: string; metadata?: { content?: string; storageKey?: string; mimeType?: string; naturalWidth?: number; naturalHeight?: number } }
export interface DirectorTaskUpdate { id: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; progress?: number }
export interface DirectorSaveReceipt { confirmed: true; revision: number; sceneId: string }
export type DirectorSaveErrorCode = 'version_conflict' | 'forbidden';
export interface DirectorSaveError { code: DirectorSaveErrorCode; message?: string }
export interface DirectorConflictVersion { identity: DirectorIdentity; revision: number; scene: DirectorScene }
export interface DirectorConflictRecoveryReceipt extends DirectorSaveReceipt { sceneFingerprint: string }
export interface DirectorOperationContext { identity: DirectorIdentity; signal: AbortSignal }
export interface DirectorConflictRecoveryContext extends DirectorOperationContext {
  expectedRevision: number;
  /** Host must GET and validate the current document before review; false means no write. */
  confirmReplacement(latest: DirectorConflictVersion): Promise<boolean>;
}
export interface DirectorAdapters {
  /** Resolver may produce temporary runtime URLs but must not mutate scene refs. */
  resolveResource(reference: string): Promise<string>;
  /** Source constants persist package-relative identities, mapped by host resolver. */
  resolveBuiltInResource?(reference: string): string;
  resolveModelDependencies?(reference: string): Promise<{ mainUrl: string; dependencies: Array<{ uri: string; url: string }>; embeddedUris: string[] }>;
  saveScene(scene: DirectorScene, context: DirectorOperationContext & { expectedRevision: number }): Promise<DirectorSaveReceipt>;
  /** Explicit review → fresh-revision CAS → readback. Never acknowledge a GET as a save. */
  recoverSaveConflict?(scene: DirectorScene, context: DirectorConflictRecoveryContext): Promise<DirectorConflictRecoveryReceipt | null>;
  importImage(source: string | Blob, context: DirectorOperationContext): Promise<DirectorImageResource>;
  /** Host validates GLB/GLTF and all sidecars before returning a managed resource. */
  importModel(file: Blob, context: DirectorOperationContext & { fileName: string; sidecars?: File[] }): Promise<DirectorResource>;
  persistAsset(asset: DirectorNewAsset, context: DirectorOperationContext & { existingAssetId?: string; existingPersisted?: boolean }): Promise<{ assetId: string; created: boolean; confirmed: true }>;
  exportOutput(output: DirectorSceneOutput, context: DirectorOperationContext & { revision: number; operationId?: string }): Promise<DirectorExportResult>;
  exportScreenshot?(input: { scene: DirectorScene; shotId: string; screenshotId: string }, context: DirectorOperationContext & { revision: number }): Promise<{ confirmed: true }>;
  captureCover?(input: { scene: DirectorScene; shotId: string; beauty: Blob }, context: DirectorOperationContext): Promise<void>;
  shouldCaptureCover?(scene: DirectorScene, shotId: string): boolean;
  addCanvasImage?(image: DirectorImageResource, title: string, context: DirectorOperationContext): Promise<{ assetId?: string; persisted?: boolean } | void>;
  deleteImageNode?(nodeId: string, context: DirectorOperationContext): void;
  analyzeImage?(input: { imageUrl: string; prompt: string; maxElements: 16 }, context: DirectorOperationContext): Promise<string>;
  generatePanorama?(input: { file: File; sceneId: string; prompt: string; onTaskUpdate?: (task: DirectorTaskUpdate) => void }, context: DirectorOperationContext): Promise<DirectorImageResource & { id: string; name: string }>;
  recoverPanoramaTasks?(context: DirectorOperationContext): Promise<number>;
  /** Preferences only, never the authoritative scene. */
  preferences?: { getItem<T>(key: string): Promise<T | null>; setItem(key: string, value: unknown): Promise<void> };
  notify?(kind: 'success' | 'warning' | 'error' | 'info', message: string): void;
  diagnostic?(code: string, fields: Record<string, string | number | boolean | undefined>): void;
}
export interface DirectorSceneProps {
  identity: DirectorIdentity;
  scene: DirectorScene;
  revision: number;
  assets: DirectorAsset[];
  imageNodes: DirectorImageNode[];
  adapters: DirectorAdapters;
  onChange(scene: DirectorScene): void;
  onClose(): void;
  /** Explicit capability availability, unrelated to selected chat model. */
  capabilities?: { analyzeImage?: boolean; panoramaGeneration?: boolean };
}
export interface DirectorMountHandle {
  update(props: DirectorSceneProps): void;
  execute(command: DirectorCommand, options?: DirectorCommandOptions): Promise<{ confirmed: true; resource: DirectorExportResource }>;
  cancel(operationId?: string): void;
  /** False means the current draft could not be confirmed; the Host must keep this root mounted. */
  prepareClose(): Promise<boolean>;
  /** Forced disposal never flushes an old identity; recovery requires a successfully stored coordinator draft. */
  unmount(): void;
}
export interface DirectorRuntime { mount(container: HTMLElement, props: DirectorSceneProps): DirectorMountHandle }
