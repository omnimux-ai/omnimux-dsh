import { itemShelfTags, matchesDomainTag, skillToken } from './client/skill-picker-logic.js';
import { catalogSkillChannel, catalogSkillSlug } from './skill-aggregate.js';
import { checkSkillBilingual, isOfficialShelfItem } from './skill-bilingual.js';
/** View order only. Membership and fallback matching remain owned by SkillShelf. */
export const WORKSHOP_DOMAINS = Object.freeze([
    '短剧漫剧', '专业影视', '动画', '商业广告', '电商', '教育', '创意实验', '音频音乐', '平台工具',
]);
export const WORKSHOP_CATEGORIES = Object.freeze(['all', 'featured', ...WORKSHOP_DOMAINS]);
export const WORKSHOP_ORIGINS = Object.freeze([
    'omnimux', 'workbuddy', 'skillhub', 'local', 'unknown',
]);
export const WORKSHOP_QUERY_LIMITS = Object.freeze({ pageSize: 80, pages: 20, candidates: 1600, wallMs: 30_000, snapshots: 8, ttlMs: 300_000 });
export class WorkshopQueryError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'WorkshopQueryError';
    }
}
/** Unknown dates stay unknown; only explicit UTC timestamps may influence ordering. */
export function workshopDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))
        return null;
    const time = Date.parse(value);
    if (!Number.isFinite(time))
        return null;
    const canonical = new Date(time).toISOString();
    const normalized = value.length === 20 ? value.replace('Z', '.000Z') : value;
    return canonical === normalized ? canonical : null;
}
function knownCount(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
/** Explicit shelf tags take precedence; reuse the existing bounded fallback otherwise. */
export function workshopDomains(item) {
    if (!item || typeof item !== 'object')
        return [];
    const explicit = itemShelfTags(item);
    return WORKSHOP_DOMAINS.filter((domain) => explicit.length ? explicit.includes(domain) : matchesDomainTag(item, domain));
}
export function workshopQueryKey(request) {
    validateRequest(request);
    return JSON.stringify([request.view, request.query.trim().toLowerCase(), request.domain, request.source, request.uninstalledOnly]);
}
function validateRequest(request) {
    if (!request || !['discover', 'mine'].includes(request.view) || typeof request.query !== 'string'
        || !WORKSHOP_CATEGORIES.includes(request.domain) || !['all', ...WORKSHOP_ORIGINS].includes(request.source)
        || typeof request.uninstalledOnly !== 'boolean' || !Number.isSafeInteger(request.queryRevision) || request.queryRevision < 0
        || (request.view === 'mine' && request.domain === 'featured')
        || (request.cursor !== undefined && typeof request.cursor !== 'string'))
        throw new WorkshopQueryError('INVALID_REQUEST');
}
function matches(skill, request) {
    const fields = [skill.title, skill.description, skill.token, skill.skillKey].map((s) => s.toLowerCase());
    const words = request.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.every((word) => fields.some((field) => field.includes(word)))
        && (request.domain === 'all' || request.domain === 'featured' || skill.domains.includes(request.domain));
}
function recent(a, b) {
    const at = a.updatedAt || a.publishedAt;
    const bt = b.updatedAt || b.publishedAt;
    const delta = (bt ? Date.parse(bt) : -Infinity) - (at ? Date.parse(at) : -Infinity);
    return (Number.isNaN(delta) ? 0 : delta) || (a.skillKey < b.skillKey ? -1 : a.skillKey > b.skillKey ? 1 : 0);
}
/** This input is an adapter contract, not proof that the runtime inventory was reconciled. */
export function workshopSourceOptions(inventory) {
    if (inventory.status === 'error')
        throw new WorkshopQueryError('INVENTORY_UNAVAILABLE');
    return ['all', ...WORKSHOP_ORIGINS.filter((origin) => inventory.entries.some((entry) => entry.origin === origin))];
}
function normalizeSkill(skill) {
    const bilingual = checkSkillBilingual(skill);
    return {
        ...skill, domains: WORKSHOP_DOMAINS.filter((domain) => skill.domains.includes(domain)),
        sourceRef: skill.sourceRef ? { ...skill.sourceRef } : null,
        version: typeof skill.version === 'string' && skill.version.trim() ? skill.version.trim() : null,
        recommended: false, cover: undefined,
        titleZh: bilingual.titleZh, titleEn: bilingual.titleEn, summaryZh: bilingual.summaryZh, summaryEn: bilingual.summaryEn,
        downloads: knownCount(skill.downloads), updatedAt: workshopDate(skill.updatedAt), publishedAt: workshopDate(skill.publishedAt),
        enabled: typeof skill.enabled === 'boolean' ? skill.enabled : null,
    };
}
/**
 * 官方货架条目的运行时准入判定。
 * 范围外条目（155 项遗留技能、已装技能、SkillHub/WorkBuddy 远程行）一律放行——门禁不越界。
 */
export function admitWorkshopCatalogSkill(item) {
    if (!isOfficialShelfItem(item))
        return true;
    return checkSkillBilingual(item).ok;
}
/** 被拒 id 的审计上限：超出部分只累加 `skippedCount`，避免脏数据撑爆快照。 */
export const ADMISSION_SKIPPED_ID_LIMIT = 50;
/** 汇总审计摘要：id 去重升序，最多保留 `ADMISSION_SKIPPED_ID_LIMIT` 条。 */
export function summarizeAdmission(outcome) {
    const ids = [...new Set(outcome.rejectedIds.map((id) => String(id)))].sort();
    return {
        enforced: outcome.enforced,
        skippedCount: ids.length,
        skippedIds: ids.slice(0, ADMISSION_SKIPPED_ID_LIMIT),
    };
}
/** 只告警不外抛：运行时门禁是纵深防御，不得因脏数据让整个市场不可用。 */
function warnAdmissionRejected(admission, catalogRevision) {
    const omitted = admission.skippedCount - admission.skippedIds.length;
    console.warn(`[omnimux-market] 技能双语准入门禁拒绝了 ${admission.skippedCount} 条官方货架技能`
        + `（catalog=${catalogRevision}）：${admission.skippedIds.join(', ')}${omitted > 0 ? ` … 另 ${omitted} 条` : ''}`
        + '。补齐目录 index.json 的 titleZh/titleEn/summaryZh/summaryEn 后重试；'
        + '用 corepack pnpm verify:skill-bilingual 定位缺失字段，契约见 docs/contracts/skill-bilingual.md。');
}
/**
 * 工坊发现投影：目录条目优先，远程候选补位。
 *
 * 准入门禁发生在 `winners.set` **之前**（ADR-BL-01）：拒绝即出局——既不写入 winners，
 * 也不允许远程同名行顶替。若先写入再过滤，未过门禁的官方技能会被非官方远程行替代，
 * 等于门禁被绕过。
 */
function collectWorkshopDiscovery(input, includeRemote) {
    const inventory = new Map(input.inventory.entries.map((entry) => [entry.skill.skillKey, entry.skill]));
    const winners = new Map();
    const outcome = { enforced: false, rejectedIds: [] };
    /** 被拒 token 的出局名录：远程候选同样不得补位（ADR-BL-01「拒绝即出局，不降级、不顶替」）。 */
    const rejectedTokens = new Set();
    for (const channel of ['custom', 'workbuddy']) {
        for (const item of input.catalog.items) {
            if (catalogSkillChannel(item) !== channel)
                continue;
            const token = skillToken({ slug: catalogSkillSlug(item) }).toLowerCase();
            if (!token || winners.has(token))
                continue;
            if (isOfficialShelfItem(item)) {
                outcome.enforced = true;
                if (!admitWorkshopCatalogSkill(item)) {
                    outcome.rejectedIds.push(String(item.id));
                    rejectedTokens.add(token);
                    continue;
                }
            }
            const installed = inventory.get(token);
            const domains = workshopDomains(item);
            // 范围外条目「尽力携带」双语：不判不拦，但字段缺失时保持空串。
            const bilingual = checkSkillBilingual(item);
            winners.set(token, {
                skillKey: token, token, title: item.title || token, description: item.summary || '', domains,
                titleZh: bilingual.titleZh, titleEn: bilingual.titleEn,
                summaryZh: bilingual.summaryZh, summaryEn: bilingual.summaryEn,
                sourceRef: { kind: 'catalog', catalogId: item.id, revision: input.catalogRevision },
                version: typeof item.version === 'string' && item.version.trim() ? item.version.trim() : null,
                recommended: Object.hasOwn(item, 'recommended') && item.recommended === true && domains.length > 0,
                cover: item.cover && /^catalog\/covers\/[a-z0-9][a-z0-9-]*\.(png|jpg|jpeg|webp)$/.test(item.cover.asset) ? { ...item.cover } : undefined,
                downloads: knownCount(item.downloads), updatedAt: workshopDate(item.updatedAt), publishedAt: workshopDate(item.publishedAt),
                installed: !!installed, enabled: installed && typeof installed.enabled === 'boolean' ? installed.enabled : null,
            });
        }
    }
    if (includeRemote) {
        for (const row of input.remote) {
            const token = skillToken({ slug: row.card.slug }).toLowerCase();
            if (!token || winners.has(token) || rejectedTokens.has(token))
                continue;
            const installed = inventory.get(token);
            winners.set(token, {
                skillKey: token, token, title: row.card.name, description: row.card.description, domains: workshopDomains(row.card),
                sourceRef: row.sourceRef ? { ...row.sourceRef } : null,
                version: row.sourceRef?.version || null, recommended: false,
                downloads: knownCount(row.downloads), updatedAt: workshopDate(row.updatedAt), publishedAt: workshopDate(row.publishedAt),
                installed: !!installed, enabled: installed && typeof installed.enabled === 'boolean' ? installed.enabled : null,
            });
        }
    }
    // Directory order, not channel order, determines controlled featured order.
    const order = new Map(input.catalog.items.map((item, index) => [item.id, index]));
    const skills = [...winners.values()].sort((a, b) => {
        const ai = a.sourceRef?.kind === 'catalog' ? order.get(a.sourceRef.catalogId) ?? Infinity : Infinity;
        const bi = b.sourceRef?.kind === 'catalog' ? order.get(b.sourceRef.catalogId) ?? Infinity : Infinity;
        return ai - bi || 0;
    });
    return { skills, admission: summarizeAdmission(outcome) };
}
/** 兼容既有调用点：只返回投影结果；准入审计由 `createWorkshopSnapshot` 读取。 */
export function normalizeWorkshopDiscovery(input, includeRemote) {
    return collectWorkshopDiscovery(input, includeRemote).skills;
}
/** Compute an offline snapshot. Callers must supply source exhaustion and inventory evidence. */
export function createWorkshopSnapshot(input, request, id, now, pageSize = 48) {
    const key = workshopQueryKey(request);
    if (!id || !input.inventory.scopeKey || !input.catalogRevision || !Number.isFinite(now) || now < 0
        || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > WORKSHOP_QUERY_LIMITS.pageSize
        || !Number.isSafeInteger(input.inventory.revision) || input.inventory.revision < 0 || request.cursor) {
        throw new WorkshopQueryError('INVALID_REQUEST');
    }
    // With a boolean installed contract, missing rows in partial inventory cannot mean uninstalled.
    if (input.inventory.status === 'error' || (request.view === 'discover' && input.inventory.status !== 'complete')) {
        throw new WorkshopQueryError('INVENTORY_UNAVAILABLE');
    }
    const keys = input.inventory.entries.map((entry) => entry.skill.skillKey);
    if (new Set(keys).size !== keys.length || input.inventory.entries.some((entry) => !entry.skill.skillKey || entry.skill.skillKey !== skillToken({ slug: entry.skill.token }).toLowerCase()
        || !WORKSHOP_ORIGINS.includes(entry.origin)))
        throw new WorkshopQueryError('INVALID_REQUEST');
    const includeRemote = request.query.trim().length > 0;
    const required = request.view === 'mine' ? [] : includeRemote ? ['omnimux', 'workbuddy', 'skillhub'] : ['omnimux', 'workbuddy'];
    const sourceStatus = required.map((origin) => {
        const statuses = input.sourceStatus.filter((s) => s.origin === origin);
        return statuses.length === 1 ? { ...statuses[0] } : { origin, status: 'partial', fetched: 0, exhausted: false, code: 'SOURCE_UNVERIFIED' };
    });
    const complete = input.inventory.status === 'complete' && sourceStatus.every((s) => s.status === 'complete' && s.exhausted === true && knownCount(s.fetched) !== null);
    let featured = [];
    let items = [];
    let admission = summarizeAdmission({ enforced: false, rejectedIds: [] });
    if (request.view === 'mine') {
        items = input.inventory.entries.filter((entry) => request.source === 'all' || entry.origin === request.source)
            .map((entry) => ({ ...normalizeSkill(entry.skill), installed: true }))
            .filter((skill) => matches(skill, request));
    }
    else {
        const discovery = collectWorkshopDiscovery(input, includeRemote);
        admission = discovery.admission;
        const filtered = discovery.skills.filter((skill) => skill.domains.length > 0 && matches(skill, request));
        featured = filtered.filter((skill) => skill.recommended);
        items = request.domain === 'featured' ? [] : filtered.filter((skill) => !skill.recommended && (!request.uninstalledOnly || !skill.installed));
    }
    items.sort(recent);
    if (admission.skippedCount > 0)
        warnAdmissionRejected(admission, input.catalogRevision);
    return { id, createdAt: now, scopeKey: input.inventory.scopeKey, catalogRevision: input.catalogRevision,
        inventoryRevision: input.inventory.revision, queryRevision: request.queryRevision, queryKey: key,
        pageSize, featured, items, complete, sourceStatus, admission };
}
/** Cursors select frozen data only; they do not authorize access to a scope. */
export function pageWorkshopSnapshot(snapshot, request, versions, now) {
    const queryKey = workshopQueryKey(request);
    if (!Number.isFinite(now) || now < snapshot.createdAt || now - snapshot.createdAt >= WORKSHOP_QUERY_LIMITS.ttlMs
        || snapshot.queryKey !== queryKey || snapshot.queryRevision !== request.queryRevision
        || snapshot.catalogRevision !== versions.catalogRevision || snapshot.inventoryRevision !== versions.inventoryRevision
        || snapshot.scopeKey !== versions.scopeKey)
        throw new WorkshopQueryError('CURSOR_EXPIRED');
    let offset = 0;
    if (request.cursor !== undefined) {
        try {
            const cursor = JSON.parse(request.cursor);
            if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[0] !== 1 || cursor[1] !== snapshot.id
                || !Number.isSafeInteger(cursor[2]) || cursor[2] <= 0 || cursor[2] % snapshot.pageSize !== 0
                || cursor[2] >= snapshot.items.length)
                throw new Error('cursor');
            offset = cursor[2];
        }
        catch {
            throw new WorkshopQueryError('CURSOR_EXPIRED');
        }
    }
    const next = offset + snapshot.pageSize;
    return { schemaVersion: 1, snapshotId: snapshot.id, scopeKey: snapshot.scopeKey, queryKey,
        catalogRevision: snapshot.catalogRevision, queryRevision: snapshot.queryRevision, inventoryRevision: snapshot.inventoryRevision,
        featured: structuredClone(snapshot.featured), items: structuredClone(snapshot.items.slice(offset, next)),
        count: { value: snapshot.items.length, mode: snapshot.complete ? 'exact' : 'loaded' },
        completeness: snapshot.complete ? 'complete' : 'partial', sortScope: snapshot.complete ? 'complete-result' : 'loaded-result',
        nextCursor: next < snapshot.items.length ? JSON.stringify([1, snapshot.id, next]) : null,
        sourceStatus: structuredClone(snapshot.sourceStatus), ...(snapshot.admission ? { admission: structuredClone(snapshot.admission) } : {}) };
}
/** Pure bounded cache replacement; caller owns memory and scope authorization. */
export function retainWorkshopSnapshot(snapshots, next, now) {
    if (!Number.isFinite(now) || now < next.createdAt || now - next.createdAt >= WORKSHOP_QUERY_LIMITS.ttlMs)
        throw new WorkshopQueryError('CURSOR_EXPIRED');
    if (snapshots.some((s) => s.id === next.id))
        throw new WorkshopQueryError('INVALID_REQUEST');
    return [...snapshots.filter((s) => now >= s.createdAt && now - s.createdAt < WORKSHOP_QUERY_LIMITS.ttlMs), next]
        .sort((a, b) => a.createdAt - b.createdAt).slice(-WORKSHOP_QUERY_LIMITS.snapshots);
}
/** Reject legacy envelopes or responses from an older query/catalog/inventory/scope. */
export function isWorkshopResponseApplicable(result, request, versions) {
    if (!result || typeof result !== 'object')
        return false;
    const row = result;
    if (request.cursor !== undefined) {
        try {
            const cursor = JSON.parse(request.cursor);
            if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[0] !== 1 || cursor[1] !== row.snapshotId
                || !Number.isSafeInteger(cursor[2]) || cursor[2] <= 0)
                return false;
        }
        catch {
            return false;
        }
    }
    return row.schemaVersion === 1 && typeof row.snapshotId === 'string' && row.snapshotId.length > 0
        && row.queryRevision === request.queryRevision && row.queryKey === workshopQueryKey(request)
        && row.inventoryRevision === versions.inventoryRevision && row.catalogRevision === versions.catalogRevision
        && row.scopeKey === versions.scopeKey && Array.isArray(row.items) && Array.isArray(row.featured)
        && (row.completeness === 'complete' ? row.count?.mode === 'exact' && row.sortScope === 'complete-result'
            : row.completeness === 'partial' && row.count?.mode === 'loaded' && row.sortScope === 'loaded-result')
        && knownCount(row.count?.value) !== null;
}
