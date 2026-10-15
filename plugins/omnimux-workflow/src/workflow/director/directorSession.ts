import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Public Hub status snapshot, supplied by the Host; reading it here never performs I/O to the cloud. */
export interface DirectorPublicIdentityStatus {
  logged_in?: boolean;
  verified?: boolean | null;
  id?: string | number;
  base_url?: string;
}
export interface DirectorAuthenticatedRequestContext {
  /** Must be set after the actual Connection admission, not parsed from a JSON body. */
  authenticated: true;
  rawCookie: string;
  publicIdentityStatus?: DirectorPublicIdentityStatus | null;
}
export type DirectorCloudAccount =
  | { status: 'unknown'; reason: 'public-identity-unavailable' | 'public-identity-unverified' | 'public-account-id-unavailable' }
  | { status: 'signed-out' }
  | { status: 'known'; scope: string; source: 'host-public-identity-snapshot' };
export interface DirectorSessionContext {
  /** Local single-operator installation, not the workspace or a claimed cloud user. */
  operatorScope: string;
  sessionDigest: string;
  owner: string;
  epoch: number;
  cloudAccount: DirectorCloudAccount;
  /** Unknown cloud identity fails closed for account-owned model tasks, not local editing. */
  modelTaskScope: string | null;
  /** Stable paid-task ownership: installation operator + public cloud origin/id; never cookie or epoch. */
  modelTaskOwner: string | null;
  localProjects: 'installation-shared';
}
export interface DirectorSessionFactory {
  fromAuthenticatedRequest(request: DirectorAuthenticatedRequestContext): DirectorSessionContext;
  isCurrent(context: DirectorSessionContext): boolean;
}
interface PersistedSession {
  version: 1;
  installationId: string;
  epoch: number;
  contextDigest: string | null;
}
const digest = (...parts: string[]): string => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

function accountFromSnapshot(snapshot?: DirectorPublicIdentityStatus | null): DirectorCloudAccount {
  if (!snapshot || typeof snapshot.logged_in !== 'boolean') return { status: 'unknown', reason: 'public-identity-unavailable' };
  if (!snapshot.logged_in) return { status: 'signed-out' };
  if (snapshot.verified === false) return { status: 'unknown', reason: 'public-identity-unverified' };
  const id = typeof snapshot.id === 'string' || typeof snapshot.id === 'number' && Number.isFinite(snapshot.id) ? String(snapshot.id).trim() : '';
  if (!id || !snapshot.base_url) return { status: 'unknown', reason: 'public-account-id-unavailable' };
  try {
    const url = new URL(snapshot.base_url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return { status: 'unknown', reason: 'public-account-id-unavailable' };
    return { status: 'known', scope: `cloud-account:${digest(url.origin, id)}`, source: 'host-public-identity-snapshot' };
  } catch {
    return { status: 'unknown', reason: 'public-account-id-unavailable' };
  }
}

/** Local installation policy only: this does not provide server multi-tenant authorization. */
export function createDirectorSessionFactory(options: { stateDir: string }): DirectorSessionFactory {
  mkdirSync(options.stateDir, { recursive: true });
  const statePath = join(options.stateDir, 'director-session.json');
  const load = (): PersistedSession => {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as PersistedSession;
    if (parsed.version !== 1 || !/^[0-9a-f-]{36}$/i.test(parsed.installationId) || !Number.isSafeInteger(parsed.epoch) || parsed.epoch < 0 || !(parsed.contextDigest === null || /^[0-9a-f]{64}$/.test(parsed.contextDigest))) throw new Error('director-session-state-invalid');
    return parsed;
  };
  if (!existsSync(statePath)) {
    const initial: PersistedSession = { version: 1, installationId: randomUUID(), epoch: 0, contextDigest: null };
    try { writeFileSync(statePath, JSON.stringify(initial), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
  }
  load();
  return {
    isCurrent(context) {
      const state = load();
      const expected = digest(context.sessionDigest, context.cloudAccount.status === 'known' ? context.cloudAccount.scope : context.cloudAccount.status);
      return context.operatorScope === `local-operator:${state.installationId}` && context.epoch === state.epoch && expected === state.contextDigest;
    },
    fromAuthenticatedRequest(request): DirectorSessionContext {
      if (request.authenticated !== true || typeof request.rawCookie !== 'string' || !request.rawCookie.trim()) throw new Error('director-authenticated-session-required');
      const state = load();
      const operatorScope = `local-operator:${state.installationId}`;
      const sessionDigest = digest(state.installationId, request.rawCookie);
      const cloudAccount = accountFromSnapshot(request.publicIdentityStatus);
      const contextDigest = digest(sessionDigest, cloudAccount.status === 'known' ? cloudAccount.scope : cloudAccount.status);
      if (state.contextDigest !== contextDigest) {
        if (state.epoch === Number.MAX_SAFE_INTEGER) throw new Error('director-session-epoch-exhausted');
        state.epoch++;
        state.contextDigest = contextDigest;
        const temporaryPath = join(options.stateDir, `director-session-${randomUUID()}.tmp`);
        writeFileSync(temporaryPath, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
        renameSync(temporaryPath, statePath);
      }
      return {
        operatorScope, sessionDigest, owner: `director-owner:${digest(operatorScope, sessionDigest, String(state.epoch))}`, epoch: state.epoch,
        cloudAccount, modelTaskScope: cloudAccount.status === 'known' ? `director-model-task:${digest(operatorScope, sessionDigest, cloudAccount.scope, String(state.epoch))}` : null,
        modelTaskOwner: cloudAccount.status === 'known' ? `director-model-owner:${digest(operatorScope, cloudAccount.scope)}` : null,
        localProjects: 'installation-shared',
      };
    },
  };
}
