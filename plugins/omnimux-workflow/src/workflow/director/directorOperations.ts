import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, fstatSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync, type Stats } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { assertProjectWriteSafe, resolveProjectPaths, resolveProjectRelPath } from '../../projects/paths.ts';
import { directorOperationRequestSchema, directorOperationReceiptSchema, directorOperationSourceHash,
  type DirectorOperationRequest, type DirectorOperationQuery, type DirectorOperationReceipt } from '../agent/directorTools.ts';
import { DirectorHostError, type DirectorHost } from './directorHost.ts';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { ProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const recordSchema = z.strictObject({ schemaVersion: z.literal(1), validationVersion: z.literal(2), version: z.number().int().min(0).max(255),
  request: directorOperationRequestSchema, receipt: directorOperationReceiptSchema,
  sceneHash: z.string().regex(/^[a-f0-9]{64}$/), sourceNodeHash: z.string().regex(/^[a-f0-9]{64}$/),
  claim: z.strictObject({ ownerId: id, tokenHash: z.string().regex(/^[a-f0-9]{64}$/), leaseUntil: z.number().int().positive(), deadline: z.number().int().positive() }).optional() });
type OperationRecord = z.infer<typeof recordSchema>;
function reject(code: string): never { throw new DirectorHostError(code); }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

/** Queue-owned entries never follow symlinks; missing entries may be created by other writers. */
function assertQueuePathSafe(target: string, root: string): void {
  const suffix = relative(root, target);
  if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`)) reject('path-denied');
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) reject('path-denied');
  const parts = suffix ? suffix.split(sep) : [];
  let path = root;
  for (let index = 0; index < parts.length; index++) {
    path = join(path, parts[index]!);
    let entry: Stats;
    try { entry = lstatSync(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (entry.isSymbolicLink() || (index < parts.length - 1 ? !entry.isDirectory() : !entry.isDirectory() && !entry.isFile())
      || realpathSync(path) !== path) reject('path-denied');
  }
}

/** Durable public browser handoff. Completion methods belong only to authenticated Host routes. */
export function createDirectorOperations({ host, store, assetsStore }: {
  host: DirectorHost; store: Pick<WorkspaceStore, 'get' | 'resolveProjectRoot'>; assetsStore: Pick<ProjectAssetsStore, 'get'>;
}) {
  function directory(workspaceId: string): { path: string; root: string } {
    if (!id.safeParse(workspaceId).success) reject('invalid-id');
    store.get(workspaceId);
    const bound = store.resolveProjectRoot(workspaceId);
    if (!bound) reject('project-required');
    const root = realpathSync(resolveProjectPaths(bound.path).projectRoot);
    const path = join(root, '.omnimux', 'director-operations', workspaceId);
    assertQueuePathSafe(path, root);
    return { path, root };
  }
  function location(workspaceId: string, operationId: string) {
    if (!id.safeParse(operationId).success) reject('invalid-id');
    const base = directory(workspaceId);
    const path = join(base.path, operationId);
    assertQueuePathSafe(path, base.root);
    return { path, root: base.root };
  }
  function read(location: { path: string; root: string }): OperationRecord | null {
    let latest: OperationRecord | null = null;
    for (let version = 0; version <= 255; version++) {
      const file = join(location.path, `${version}.json`);
      assertQueuePathSafe(file, location.root);
      if (!existsSync(file)) break;
      try {
        const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        let text: string;
        try {
          const before = fstatSync(descriptor);
          if (!before.isFile() || before.size > 32768) reject('director-operation-invalid-record');
          const bytes = Buffer.alloc(before.size);
          let offset = 0;
          while (offset < bytes.length) {
            const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
            if (!count) reject('director-operation-invalid-record');
            offset += count;
          }
          const after = fstatSync(descriptor);
          if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs) reject('director-operation-invalid-record');
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } finally { closeSync(descriptor); }
        const value: unknown = JSON.parse(text);
        if (value && typeof value === 'object' && !Object.hasOwn(value, 'validationVersion')) reject('director-operation-legacy-unverified');
        const parsed = recordSchema.safeParse(value);
        if (!parsed.success || parsed.data.version !== version) reject('director-operation-invalid-record');
        const next = parsed.data;
        if (location.path !== join(directory(next.request.workspaceId).path, next.request.operationId)) reject('director-operation-invalid-record');
        try { receiptFor(next.receipt, next.request); }
        catch { reject('director-operation-invalid-record'); }
        if ((!latest && (next.receipt.status !== 'pending' || next.claim))
          || (['running', 'completed'].includes(next.receipt.status) && !next.claim)) reject('director-operation-invalid-record');
        if (latest) {
          const before = latest.receipt.status, after = next.receipt.status;
          if (!same(next.request, latest.request) || next.sceneHash !== latest.sceneHash || next.sourceNodeHash !== latest.sourceNodeHash
            || !['pending', 'running'].includes(before)
            || (before === 'pending' && !['running', 'error', 'cancelled'].includes(after))
            || (before === 'running' && !['running', 'completed', 'error', 'cancelled'].includes(after))
            || (latest.claim && (!next.claim || next.claim.ownerId !== latest.claim.ownerId || next.claim.tokenHash !== latest.claim.tokenHash
              || next.claim.deadline !== latest.claim.deadline))) reject('director-operation-invalid-record');
        }
        latest = next;
      } catch (error) {
        if (error instanceof DirectorHostError) throw error;
        reject('director-operation-invalid-record');
      }
    }
    return latest;
  }
  function write(location: { path: string; root: string }, record: OperationRecord): void {
    assertQueuePathSafe(location.path, location.root);
    mkdirSync(location.path, { recursive: true });
    assertQueuePathSafe(location.path, location.root);
    const file = join(location.path, `${record.version}.json`);
    assertQueuePathSafe(file, location.root);
    // Publish a complete immutable version exclusively; readers never observe partial JSON.
    const temporary = join(location.path, `.${randomUUID()}.tmp`);
    assertQueuePathSafe(temporary, location.root);
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporary, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify(recordSchema.parse(record)));
      fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
      assertQueuePathSafe(file, location.root);
      linkSync(temporary, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') reject('director-operation-busy');
      throw error;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temporary)) { assertQueuePathSafe(temporary, location.root); unlinkSync(temporary); }
    }
  }
  function authority(request: DirectorOperationRequest) {
    const document = host.getScene(request.workspaceId, request.nodeId);
    const root = host.projectRootFor(request.workspaceId, request.nodeId);
    const workspace = store.get(request.workspaceId);
    if (document.workspaceId !== request.workspaceId || document.nodeId !== request.nodeId
      || document.scene.id !== request.sceneId || document.revision !== request.sourceRevision
      || hash(root) !== request.projectKey || workspace.version < request.workspaceVersion) reject('director-operation-identity-mismatch');
    if (request.action === 'export') {
      const shot = document.scene.shots.find(item => item.id === request.shot.id);
      if (!shot || !same(request.shot, { id: shot.id, cameraId: shot.cameraId, duration: shot.duration, fps: shot.fps })) reject('director-operation-identity-mismatch');
    }
    const sourceNode = workspace.nodes.find(node => node.id === request.nodeId && node.type === 'director');
    if (!sourceNode) reject('director-node-not-found');
    return { sceneHash: hash(JSON.stringify(document)), sourceNodeHash: directorOperationSourceHash(sourceNode, document.scene.id) };
  }
  function verify(record: OperationRecord): void {
    const current = authority(record.request);
    if (current.sceneHash !== record.sceneHash || current.sourceNodeHash !== record.sourceNodeHash) reject('director-operation-identity-mismatch');
    if (record.receipt.status === 'completed' && record.request.action === 'export') verifyExport(record.request, record.receipt);
  }
  function verifyExport(request: DirectorOperationRequest, receipt: DirectorOperationReceipt): void {
    if (request.action !== 'export' || !receipt.resource) reject('director-operation-unconfirmed');
    const resource = receipt.resource;
    const suffix = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/webm': 'webm', 'video/mp4': 'mp4' } as const)[resource.mimeType];
    const prefix = `artifacts/director/${request.workspaceId}/${request.nodeId}/`;
    const filename = resource.storageKey.slice(prefix.length);
    if (!resource.storageKey.startsWith(prefix) || !new RegExp(`^[a-f0-9]{64}\\.${suffix}$`).test(filename)
      || !resource.mimeType.startsWith(`${request.kind}/`)
      || (request.kind === 'image' && resource.durationSec !== undefined)
      || (request.kind === 'video' && (resource.durationSec === undefined
        || Math.abs(resource.durationSec - request.shot.duration) > Math.max(0.3, request.shot.duration * 0.05)))) reject('director-operation-unconfirmed');
    const root = host.projectRootFor(request.workspaceId, request.nodeId);
    const file = resolveProjectRelPath(root, resource.storageKey);
    assertProjectWriteSafe(file, root);
    if (!existsSync(file)) reject('director-operation-unconfirmed');
    const stat = statSync(file);
    if (!stat.isFile() || stat.size !== resource.bytes || stat.size > 100 * 1024 * 1024) reject('director-operation-unconfirmed');
    const bytes = readFileSync(file);
    if (bytes.length !== resource.bytes || createHash('sha256').update(bytes).digest('hex') !== filename.split('.')[0]) reject('director-operation-unconfirmed');
    const asset = assetsStore.get(request.workspaceId).items.find(item => item.id === resource.assetId);
    if (!asset || asset.relative_path !== resource.storageKey || asset.type !== request.kind
      || asset.mimeType !== resource.mimeType || (asset.sizeBytes ?? asset.size) !== resource.bytes
      || (request.kind === 'video' && asset.durationSec !== resource.durationSec)) reject('director-operation-unconfirmed');
    const node = store.get(request.workspaceId).nodes.find(item => item.id === resource.outputNodeId);
    const data = node?.data as Record<string, unknown> | undefined;
    const dimensions = data?.dimensions as { width?: unknown; height?: unknown } | undefined;
    if (node?.type !== 'material' || data?.status !== 'completed' || data.materialType !== request.kind
      || data.assetId !== resource.assetId || data.relativePath !== resource.storageKey || data.mimeType !== resource.mimeType
      || data.sizeBytes !== resource.bytes || dimensions?.width !== resource.width || dimensions.height !== resource.height
      || data.directorSourceNodeId !== request.nodeId || data.directorSourceRevision !== request.sourceRevision
      || (request.kind === 'video' && data.durationSec !== resource.durationSec)) reject('director-operation-unconfirmed');
  }
  function transition(record: OperationRecord, changes: Partial<OperationRecord>): OperationRecord {
    if (record.version >= 255) reject('director-operation-transition-budget');
    const next = { ...record, ...changes, version: record.version + 1 };
    write(location(record.request.workspaceId, record.request.operationId), next);
    return next;
  }
  function recover(record: OperationRecord): OperationRecord {
    if (record.receipt.status === 'running' && (!record.claim || record.claim.leaseUntil <= Date.now())) {
      return transition(record, { receipt: { ...record.request, status: 'error', error: 'director-operation-lease-expired' } });
    }
    return record;
  }
  function lease(ms: number | undefined): number {
    const value = ms ?? 30000;
    if (!Number.isInteger(value) || value < 1000 || value > 180000) reject('director-operation-invalid-lease');
    return value;
  }
  function loadRequest(request: DirectorOperationRequest): OperationRecord {
    const parsed = directorOperationRequestSchema.safeParse(request);
    if (!parsed.success) reject('director-operation-invalid-request');
    const record = read(location(parsed.data.workspaceId, parsed.data.operationId));
    if (!record) reject('director-operation-not-found');
    if (!same(parsed.data, record.request)) reject('director-operation-identity-mismatch');
    verify(record); return recover(record);
  }
  function owner(record: OperationRecord, input: { ownerId: string; claimToken: string }): void {
    if (!record.claim) reject('director-operation-not-claimed');
    if (!id.safeParse(input.ownerId).success || record.claim.ownerId !== input.ownerId
      || typeof input.claimToken !== 'string' || hash(input.claimToken) !== record.claim.tokenHash) reject('director-operation-owner-mismatch');
    if (record.claim.leaseUntil <= Date.now()) reject('director-operation-lease-expired');
  }
  function receiptFor(input: unknown, request: DirectorOperationRequest): DirectorOperationReceipt {
    const parsed = directorOperationReceiptSchema.safeParse(input);
    if (!parsed.success) reject('director-operation-invalid-receipt');
    const receipt = parsed.data;
    const { status, error, confirmed, opened, resource, ...identity } = receipt;
    if (!same(identity, request)) reject('director-operation-identity-mismatch');
    if ((status === 'error' && !error) || (status !== 'error' && error)
      || (status !== 'completed' && (confirmed || opened || resource))) reject('director-operation-invalid-receipt');
    if (request.action === 'open' && (resource || (status === 'completed' && (!opened || !confirmed)))) reject('director-operation-invalid-receipt');
    if (request.action === 'export' && (opened || confirmed || (status === 'completed' && !resource))) reject('director-operation-invalid-receipt');
    return receipt;
  }
  const operations = {
    claim(input: { request: DirectorOperationRequest; ownerId: string; leaseMs?: number }) {
      if (!id.safeParse(input.ownerId).success) reject('director-operation-invalid-owner');
      const leaseMs = lease(input.leaseMs);
      const record = loadRequest(input.request);
      if (record.receipt.status !== 'pending') reject('director-operation-already-claimed');
      const claimToken = randomUUID();
      const claim = { ownerId: input.ownerId, tokenHash: hash(claimToken), leaseUntil: Date.now() + leaseMs, deadline: Date.now() + 300000 };
      const next = transition(record, { claim, receipt: { ...record.request, status: 'running' } });
      verify(next);
      return { request: next.request, receipt: next.receipt, sceneHash: next.sceneHash, ownerId: claim.ownerId, claimToken, leaseUntil: claim.leaseUntil };
    },
    renew(input: { request: DirectorOperationRequest; ownerId: string; claimToken: string; leaseMs?: number }) {
      const record = loadRequest(input.request); owner(record, input);
      if (record.receipt.status !== 'running') reject('director-operation-not-running');
      const claim = { ...record.claim!, leaseUntil: Math.min(Date.now() + lease(input.leaseMs), record.claim!.deadline) };
      const next = transition(record, { claim });
      return { receipt: next.receipt, leaseUntil: claim.leaseUntil };
    },
    fail(input: { request: DirectorOperationRequest; ownerId: string; claimToken: string; error: string }): DirectorOperationReceipt {
      if (!z.string().min(1).max(240).safeParse(input.error).success) reject('director-operation-invalid-receipt');
      const record = loadRequest(input.request); owner(record, input);
      if (record.receipt.status !== 'running') reject('director-operation-not-running');
      return transition(record, { receipt: { ...record.request, status: 'error', error: input.error } }).receipt;
    },
    cancel(input: { request: DirectorOperationRequest; ownerId?: string; claimToken?: string }): DirectorOperationReceipt {
      const record = loadRequest(input.request);
      if (record.receipt.status === 'cancelled') return record.receipt;
      if (record.receipt.status === 'running') owner(record, { ownerId: input.ownerId ?? '', claimToken: input.claimToken ?? '' });
      if (!['pending', 'running'].includes(record.receipt.status)) reject('director-operation-terminal');
      return transition(record, { receipt: { ...record.request, status: 'cancelled' } }).receipt;
    },
    complete(input: { receipt: unknown; ownerId: string; claimToken: string }): DirectorOperationReceipt {
      const parsed = directorOperationReceiptSchema.safeParse(input.receipt);
      if (!parsed.success) reject('director-operation-invalid-receipt');
      const record = read(location(parsed.data.workspaceId, parsed.data.operationId));
      if (!record) reject('director-operation-not-found');
      verify(record);
      const receipt = receiptFor(input.receipt, record.request);
      owner(record, input);
      if (record.receipt.status === 'completed') {
        if (!same(receipt, record.receipt)) reject('director-operation-identity-mismatch');
        return record.receipt;
      }
      if (record.receipt.status !== 'running') reject('director-operation-not-running');
      if (receipt.status !== 'completed') reject('director-operation-invalid-receipt');
      if (record.request.action === 'export') verifyExport(record.request, receipt);
      verify(record);
      return transition(record, { receipt }).receipt;
    },
    request(input: DirectorOperationRequest): DirectorOperationReceipt {
      const parsed = directorOperationRequestSchema.safeParse(input);
      if (!parsed.success) reject('director-operation-invalid-request');
      const request = parsed.data;
      const current = authority(request);
      const place = location(request.workspaceId, request.operationId);
      const existing = read(place);
      if (existing) {
        if (!same(request, existing.request)) reject('director-operation-identity-mismatch');
        verify(existing); return recover(existing).receipt;
      }
      if (store.get(request.workspaceId).version !== request.workspaceVersion) reject('version_conflict');
      const record: OperationRecord = { schemaVersion: 1, validationVersion: 2, version: 0, request, receipt: { ...request, status: 'pending' }, ...current };
      try { write(place, record); }
      catch (error) {
        if (!(error instanceof DirectorHostError && error.code === 'director-operation-busy')) throw error;
        const winner = read(place);
        if (!winner || !same(request, winner.request)) reject('director-operation-identity-mismatch');
        verify(winner); return winner.receipt;
      }
      verify(record); return recover(record).receipt;
    },
    get(query: DirectorOperationQuery): DirectorOperationReceipt | null {
      const record = read(location(query.workspaceId, query.operationId));
      if (!record) return null;
      for (const key of ['schemaVersion', 'operationId', 'workspaceId', 'nodeId', 'sceneId', 'projectKey', 'sourceRevision'] as const) {
        if (query[key] !== record.request[key]) reject('director-operation-identity-mismatch');
      }
      if (!Number.isInteger(query.workspaceVersion) || query.workspaceVersion < record.request.workspaceVersion
        || query.workspaceVersion > store.get(query.workspaceId).version) reject('director-operation-identity-mismatch');
      verify(record); return recover(record).receipt;
    },
    list({ workspaceId }: { workspaceId: string }) {
      const base = directory(workspaceId);
      if (!existsSync(base.path)) return [];
      const names = readdirSync(base.path);
      if (names.length > 1000) reject('director-operation-queue-budget');
      return names.filter(name => id.safeParse(name).success).flatMap(name => {
        const record = read(location(workspaceId, name));
        if (!record || !['pending', 'running'].includes(record.receipt.status)) return [];
        try { verify(record); }
        catch (error) {
          if (!(error instanceof DirectorHostError) || !['director-operation-identity-mismatch', 'director-node-not-found', 'director-scene-not-found'].includes(error.code)) throw error;
          transition(record, { receipt: { ...record.request, status: 'error', error: 'director-operation-source-invalidated' } });
          return [];
        }
        const current = recover(record);
        if (!['pending', 'running'].includes(current.receipt.status)) return [];
        return [{ request: current.request, receipt: current.receipt, sceneHash: current.sceneHash }];
      });
    },
  };
  return operations;
}
export type DirectorOperations = ReturnType<typeof createDirectorOperations>;
