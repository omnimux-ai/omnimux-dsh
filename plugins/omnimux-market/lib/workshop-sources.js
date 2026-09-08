import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { mapSkill } from './api.js';
import { parseCatalog } from './expert/catalog.js';
import { packageRoot } from './expert/paths.js';
import { catalogSkillChannel } from './skill-aggregate.js';
import { acceptWorkshopPage, canLoadWorkshopPage, createWorkshopLoadBudget } from './workshop-query-budget.js';
import { createWorkshopSnapshot, normalizeWorkshopDiscovery, pageWorkshopSnapshot, retainWorkshopSnapshot, workshopQueryKey, WorkshopQueryError, WORKSHOP_QUERY_LIMITS } from './workshop-query.js';
import { readWorkshopFile, validSourceRef, WorkshopReadError } from './workshop-store.js';
/** Only the packaged controlled catalog; no user marketplace or installed-file probing. */
export async function readWorkshopCatalog(root = packageRoot()) {
    try {
        const bytes = await readWorkshopFile(join(root, 'catalog'), 'index.json', 8 * 1024 * 1024);
        const catalog = parseCatalog(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
        return { catalog, revision: createHash('sha256').update(bytes).digest('hex'),
            sourceStatus: ['omnimux', 'workbuddy'].map((origin) => ({ origin, status: 'complete', exhausted: true,
                fetched: catalog.items.filter((r) => catalogSkillChannel(r) === (origin === 'omnimux' ? 'custom' : 'workbuddy')).length })) };
    }
    catch {
        return { catalog: { items: [] }, revision: 'catalog-unavailable', sourceStatus: ['omnimux', 'workbuddy']
                .map((origin) => ({ origin, status: 'error', exhausted: false, fetched: 0, code: 'CATALOG_UNREADABLE' })) };
    }
}
/** Complete response-body budget, independent of the old cached/fallback search endpoint. */
async function remoteJson(url, userAgent, signal, fetchImpl) {
    signal.throwIfAborted();
    const response = await fetchImpl(url, { signal, redirect: 'error', headers: { accept: 'application/json', 'user-agent': userAgent } });
    if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new WorkshopReadError('SOURCE_ERROR');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0, complete = false;
    try {
        while (true) {
            signal.throwIfAborted();
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.byteLength;
            if (size > 2 * 1024 * 1024)
                throw new WorkshopReadError('SOURCE_BODY_LIMIT');
            chunks.push(part.value);
        }
        signal.throwIfAborted();
        complete = true;
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    }
    finally {
        if (!complete)
            await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
/** Existing SkillHub /api/skills pagination. total is advisory; no popular fallback. */
export function createWorkshopSources(cfg, fetchImpl = fetch) {
    return {
        catalog: () => readWorkshopCatalog(),
        async remotePage(query, cursor, signal) {
            if (!query.trim())
                throw new WorkshopReadError('INVALID_REQUEST', 400);
            const page = cursor === null ? 1 : Number(cursor);
            if (!Number.isSafeInteger(page) || page < 1 || page > 20)
                throw new WorkshopReadError('INVALID_REQUEST', 400);
            const base = new URL(cfg.apiBase);
            if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash)
                throw new WorkshopReadError('SOURCE_CONFIG_INVALID');
            const url = new URL(`${cfg.apiBase.replace(/\/$/, '')}/api/skills`);
            url.search = new URLSearchParams({ keyword: query.trim(), sortBy: 'updated_at', order: 'desc', page: String(page), pageSize: '80' }).toString();
            const raw = await remoteJson(url.href, cfg.userAgent, signal, fetchImpl);
            if (raw?.code !== 0 || !raw.data || !Array.isArray(raw.data.skills))
                throw new WorkshopReadError('SOURCE_INVALID');
            const rows = raw.data.skills.map((value) => {
                if (!value || typeof value !== 'object' || Array.isArray(value))
                    throw new WorkshopReadError('SOURCE_INVALID');
                const item = value;
                if (typeof item.slug !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(item.slug)
                    || (item.name !== undefined && typeof item.name !== 'string')
                    || (item.description !== undefined && typeof item.description !== 'string'))
                    throw new WorkshopReadError('SOURCE_INVALID');
                const card = mapSkill(item, cfg.webBase);
                if (!card)
                    throw new WorkshopReadError('SOURCE_INVALID');
                const identity = item.namespace?.canonicalName;
                const version = typeof item.version === 'string' && item.version.trim() ? item.version.trim() : null;
                const downloads = item.stats?.downloads ?? item.downloads;
                return { card, sourceRef: typeof identity === 'string' && identity.trim() ? { kind: 'skillhub', identity, version } : null,
                    downloads: typeof downloads === 'number' && Number.isSafeInteger(downloads) && downloads >= 0 ? downloads : null,
                    // This consumed API model has no verified timestamp fields.
                    updatedAt: null, publishedAt: null };
            });
            // A short page or advisory total can omit later matches. Continue to an empty page.
            const end = rows.length === 0;
            return { rows, exhausted: end, nextCursor: end ? null : String(page + 1), stable: false };
        },
    };
}
/** Consume the existing budget state machine and abort both fetch and its full body at deadline. */
export async function enumerateWorkshopRemote(sources, query, options = {}) {
    const now = options.now || (() => performance.now());
    const timeoutMs = options.timeoutMs ?? WORKSHOP_QUERY_LIMITS.wallMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > WORKSHOP_QUERY_LIMITS.wallMs)
        throw new WorkshopReadError('INVALID_REQUEST', 400);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted)
        abort();
    const timer = setTimeout(abort, timeoutMs);
    let budget = createWorkshopLoadBudget(now());
    const remote = [];
    let cursor = null, stable = true, code = '';
    try {
        while (canLoadWorkshopPage(budget, now())) {
            controller.signal.throwIfAborted();
            // Race is needed for a provider that fails to settle after cancellation.
            const page = await abortable(sources.remotePage(query, cursor, controller.signal), controller.signal);
            stable = stable && page.stable === true;
            const accepted = acceptWorkshopPage(budget, { candidates: page.rows.length,
                pageKey: createHash('sha256').update(JSON.stringify(page.rows.map((r) => r.card.slug.trim().toLowerCase()))).digest('hex'),
                nextCursor: page.nextCursor, exhausted: page.exhausted }, now());
            budget = accepted.budget;
            remote.push(...page.rows.slice(0, accepted.accepted));
            if (budget.stop)
                break;
            cursor = page.nextCursor;
        }
        if (!budget.stop)
            code = 'SOURCE_TIMEOUT';
        else if (budget.stop !== 'complete')
            code = `SOURCE_${budget.stop.toUpperCase().replace('-', '_')}`;
        else if (!stable)
            code = 'SOURCE_SNAPSHOT_UNVERIFIED';
    }
    catch (error) {
        code = controller.signal.aborted ? 'SOURCE_TIMEOUT' : error instanceof WorkshopReadError ? error.code : 'SOURCE_ERROR';
    }
    finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        controller.abort();
    }
    const complete = budget.stop === 'complete' && stable && !code;
    return { remote, status: { origin: 'skillhub', fetched: remote.length, exhausted: budget.stop === 'complete',
            status: complete ? 'complete' : remote.length ? 'partial' : 'error', ...(code ? { code } : {}) } };
}
async function abortable(promise, signal) {
    let listener;
    try {
        return await Promise.race([promise, new Promise((_resolve, reject) => {
                listener = () => reject(new WorkshopReadError('SOURCE_TIMEOUT'));
                if (signal.aborted)
                    listener();
                else
                    signal.addEventListener('abort', listener, { once: true });
            })]);
    }
    finally {
        if (listener)
            signal.removeEventListener('abort', listener);
    }
}
/** One service per authorized scope; never accept roots or a caller-selected scope. */
export class QueryService {
    sources;
    inventory;
    now;
    snapshots = [];
    constructor(sources, inventory, now = () => performance.now()) {
        this.sources = sources;
        this.inventory = inventory;
        this.now = now;
    }
    async query(request) {
        workshopQueryKey(request);
        if (request.query.length > 2048 || (request.cursor?.length || 0) > 2048)
            throw new WorkshopQueryError('INVALID_REQUEST');
        const inventory = await this.inventory.reconcile();
        if (inventory.status === 'error' || (request.view === 'discover' && inventory.status !== 'complete'))
            throw new WorkshopQueryError('INVENTORY_UNAVAILABLE');
        const catalog = await this.sources.catalog();
        const versions = { scopeKey: inventory.scopeKey, catalogRevision: catalog.revision, inventoryRevision: inventory.revision };
        if (request.cursor) {
            let id;
            try {
                id = JSON.parse(request.cursor)[1];
            }
            catch {
                throw new WorkshopQueryError('CURSOR_EXPIRED');
            }
            const snapshot = this.snapshots.find((s) => s.id === id);
            if (!snapshot)
                throw new WorkshopQueryError('CURSOR_EXPIRED');
            return pageWorkshopSnapshot(snapshot, request, versions, this.now());
        }
        const remote = request.view === 'discover' && request.query.trim()
            ? await enumerateWorkshopRemote(this.sources, request.query) : null;
        // Never attach an inventory revision captured before an asynchronous source load changed it.
        const current = await this.inventory.reconcile();
        const currentCatalog = await this.sources.catalog();
        if (current.revision !== inventory.revision || currentCatalog.revision !== catalog.revision)
            throw new WorkshopQueryError('CURSOR_EXPIRED');
        const input = { catalog: catalog.catalog, catalogRevision: catalog.revision,
            remote: remote?.remote || [], sourceStatus: [...catalog.sourceStatus, ...(remote ? [remote.status] : [])], inventory: current };
        const snapshot = createWorkshopSnapshot(input, request, randomUUID(), this.now());
        this.snapshots = retainWorkshopSnapshot(this.snapshots, snapshot, this.now());
        return pageWorkshopSnapshot(snapshot, request, versions, this.now());
    }
    async detail(request) {
        if (!request || typeof request.skillKey !== 'string' || (request.sourceRef !== null && !validSourceRef(request.sourceRef)))
            throw new WorkshopReadError('INVALID_REQUEST', 400);
        const inventory = await this.inventory.reconcile();
        if (inventory.status === 'error')
            throw new WorkshopQueryError('INVENTORY_UNAVAILABLE');
        if (request.installId) {
            const record = inventory.records.find((r) => r.installId === request.installId && r.skill.skillKey === request.skillKey);
            if (!record || !sameSource(record.skill.sourceRef, request.sourceRef))
                throw new WorkshopReadError('SOURCE_CHANGED');
            return { skill: structuredClone(record.skill), descriptionComplete: false, reasons: [...record.reasons, 'DESCRIPTION_METADATA_ONLY'] };
        }
        const catalog = await this.sources.catalog();
        if (request.sourceRef?.kind === 'catalog') {
            if (request.sourceRef.revision !== catalog.revision)
                throw new WorkshopReadError('SOURCE_CHANGED');
            const item = catalog.catalog.items.find((row) => row.id === request.sourceRef.catalogId);
            if (!item)
                throw new WorkshopReadError('SOURCE_UNAVAILABLE', 404);
            const [skill] = normalizeWorkshopDiscovery({ catalog: { items: [item] }, catalogRevision: catalog.revision,
                inventory, remote: [], sourceStatus: catalog.sourceStatus }, false);
            if (!skill || skill.skillKey !== request.skillKey)
                throw new WorkshopReadError('SOURCE_CHANGED');
            return { skill, descriptionComplete: false, reasons: ['DESCRIPTION_METADATA_ONLY'] };
        }
        // Remote details may only reuse an exact, unexpired source selected by this scope's query.
        for (const snapshot of this.snapshots) {
            if (this.now() - snapshot.createdAt >= WORKSHOP_QUERY_LIMITS.ttlMs || snapshot.inventoryRevision !== inventory.revision
                || snapshot.catalogRevision !== catalog.revision)
                continue;
            const skill = [...snapshot.items, ...snapshot.featured].find((s) => s.skillKey === request.skillKey && request.sourceRef !== null && sameSource(s.sourceRef, request.sourceRef));
            if (skill)
                return { skill: structuredClone(skill), descriptionComplete: false, reasons: ['EXACT_DETAIL_PROVIDER_UNAVAILABLE'] };
        }
        throw new WorkshopReadError('EXACT_DETAIL_PROVIDER_UNAVAILABLE', 503);
    }
}
function sameSource(a, b) {
    if (a === null || b === null)
        return a === b;
    if (a.kind !== b.kind)
        return false;
    return Object.keys(a).every((key) => a[key] === b[key])
        && Object.keys(a).length === Object.keys(b).length;
}
