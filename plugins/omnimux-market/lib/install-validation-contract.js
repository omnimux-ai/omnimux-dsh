/** Offline validation contracts. No result grants installation or execution authority. */
export const VALIDATION_LIMITS = Object.freeze({
    zipBytes: 20 * 1024 * 1024,
    skillBytes: 1024 * 1024,
    resourceBytes: 10 * 1024 * 1024,
    totalBytes: 100 * 1024 * 1024,
    entries: 1000,
    depth: 8,
    pathCodePoints: 240,
    pathBytes: 960,
    componentBytes: 255,
    ratio: 100,
    frontmatterBytes: 64 * 1024,
    timeoutMs: 30_000,
});
export class ValidationError extends Error {
    code;
    reason;
    constructor(code, reason) {
        super(reason);
        this.code = code;
        this.reason = reason;
        this.name = 'ValidationError';
    }
}
export function reject(code, reason) {
    throw new ValidationError(code, reason);
}
export function failure(error) {
    return error instanceof ValidationError
        ? { ok: false, code: error.code, reason: error.reason }
        : { ok: false, code: 'PACKAGE_FORMAT', reason: 'MALFORMED_PACKAGE' };
}
export function resolveLimits(reduced = {}) {
    const limits = { ...VALIDATION_LIMITS };
    for (const key of Object.keys(reduced)) {
        const value = reduced[key];
        if (!Object.hasOwn(VALIDATION_LIMITS, key) || !Number.isSafeInteger(value) || value <= 0
            || value > VALIDATION_LIMITS[key])
            reject('PACKAGE_LIMIT', 'INVALID_BUDGET');
        limits[key] = value;
    }
    return limits;
}
export function checkLimit(value, maximum, reason) {
    if (value > maximum)
        reject('PACKAGE_LIMIT', reason);
}
