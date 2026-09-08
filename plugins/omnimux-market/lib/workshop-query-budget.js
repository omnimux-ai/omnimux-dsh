import { WORKSHOP_QUERY_LIMITS, WorkshopQueryError } from './workshop-query.js';
/** One budget spans all remote sources of a query, not one budget per page/source. */
export function createWorkshopLoadBudget(now) {
    if (!Number.isFinite(now) || now < 0)
        throw new WorkshopQueryError('INVALID_REQUEST');
    return { startedAt: now, pages: 0, candidates: 0, cursors: [], pageKeys: [], stop: null };
}
/** Invoke before requesting/reading more data; the transport must enforce the same deadline. */
export function canLoadWorkshopPage(budget, now) {
    return Number.isFinite(now) && now >= budget.startedAt && now - budget.startedAt < WORKSHOP_QUERY_LIMITS.wallMs
        && budget.stop === null && budget.pages < WORKSHOP_QUERY_LIMITS.pages && budget.candidates < WORKSHOP_QUERY_LIMITS.candidates;
}
/** Pure evidence transition, not a network loader. Rejected pages contribute no accepted rows. */
export function acceptWorkshopPage(budget, page, now) {
    if (!Number.isSafeInteger(page.candidates) || page.candidates < 0 || typeof page.pageKey !== 'string'
        || !page.pageKey || typeof page.exhausted !== 'boolean'
        || (page.nextCursor !== null && (typeof page.nextCursor !== 'string' || !page.nextCursor)))
        throw new WorkshopQueryError('INVALID_REQUEST');
    if (!canLoadWorkshopPage(budget, now)) {
        return { budget: { ...budget, stop: budget.stop || (now - budget.startedAt >= WORKSHOP_QUERY_LIMITS.wallMs || now < budget.startedAt || !Number.isFinite(now) ? 'timeout' : 'limit') }, accepted: 0 };
    }
    if (page.failed)
        return { budget: { ...budget, stop: 'source-error' }, accepted: 0 };
    if (budget.pageKeys.includes(page.pageKey) || (page.nextCursor !== null && budget.cursors.includes(page.nextCursor))
        || (!page.exhausted && (page.candidates === 0 || page.nextCursor === null))
        || (page.exhausted && page.nextCursor !== null))
        return { budget: { ...budget, stop: 'no-progress' }, accepted: 0 };
    const accepted = Math.min(page.candidates, WORKSHOP_QUERY_LIMITS.pageSize, WORKSHOP_QUERY_LIMITS.candidates - budget.candidates);
    const pages = budget.pages + 1;
    const candidates = budget.candidates + accepted;
    const stop = accepted < page.candidates ? 'limit' : page.exhausted ? 'complete'
        : pages >= WORKSHOP_QUERY_LIMITS.pages || candidates >= WORKSHOP_QUERY_LIMITS.candidates ? 'limit' : null;
    return { budget: { ...budget, pages, candidates, stop,
            cursors: page.nextCursor === null ? [...budget.cursors] : [...budget.cursors, page.nextCursor],
            pageKeys: [...budget.pageKeys, page.pageKey] }, accepted };
}
