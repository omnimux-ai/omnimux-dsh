import { createHash } from 'node:crypto';
import { z } from 'zod';
import { directorOperationRequestSchema } from '../agent/directorTools.ts';
import type { DirectorOperations } from '../director/directorOperations.ts';
import type { RouteTry } from './dispatch.ts';
const token = z.string().min(20).max(240);
const claim = z.object({ request: directorOperationRequestSchema }).strict();
const leased = z.object({ request: directorOperationRequestSchema, claimToken: token }).strict();
const completion = z.object({ receipt: z.unknown(), claimToken: token }).strict();
export function createDirectorOperationRoutes(operations: DirectorOperations | undefined): { tryHandle: RouteTry } {
  const tryHandle: RouteTry = (method, path, request) => {
    const match = /^\/omnimux-workflow\/api\/workspaces\/([A-Za-z0-9_-]+)\/director-operations(?:\/(claim|renew|complete|fail|cancel))?$/.exec(path);
    if (!match) return null;
    if (!operations) return { status: 503, body: { error: 'director-operations-unavailable' } };
    const workspaceId = match[1]!;
    if (method === 'GET' && !match[2]) return { status: 200, body: { operations: operations.list({ workspaceId }) } };
    if (method !== 'POST') return { status: 405, body: { error: 'method-not-allowed' } };
    if (!request.browserOwner) return { status: 403, body: { error: 'director-browser-owner-required' } };
    const ownerId = createHash('sha256').update(request.browserOwner).digest('hex');
    if (match[2] === 'claim') {
      const parsed = claim.safeParse(request.body); if (!parsed.success || parsed.data.request.workspaceId !== workspaceId) return { status: 400, body: { error: 'director-operation-invalid-request' } };
      return { status: 200, body: operations.claim({ request: parsed.data.request, ownerId, leaseMs: 180000 }) };
    }
    if (match[2] === 'complete') {
      const parsed = completion.safeParse(request.body); if (!parsed.success || (parsed.data.receipt as { workspaceId?: unknown })?.workspaceId !== workspaceId) return { status: 400, body: { error: 'director-operation-invalid-receipt' } };
      return { status: 200, body: operations.complete({ ...parsed.data, ownerId }) };
    }
    if (match[2] === 'fail') {
      const parsed = leased.extend({ error: z.string().min(1).max(240) }).safeParse(request.body);
      if (!parsed.success || parsed.data.request.workspaceId !== workspaceId) return { status: 400, body: { error: 'director-operation-invalid-request' } };
      return { status: 200, body: operations.fail({ ...parsed.data, ownerId }) };
    }
    const parsed = leased.safeParse(request.body); if (!parsed.success || parsed.data.request.workspaceId !== workspaceId) return { status: 400, body: { error: 'director-operation-invalid-request' } };
    if (match[2] === 'renew') return { status: 200, body: operations.renew({ ...parsed.data, ownerId, leaseMs: 180000 }) };
    return { status: 200, body: operations.cancel({ ...parsed.data, ownerId }) };
  };
  return { tryHandle };
}
