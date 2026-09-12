/**
 * Bridge-owned Host API consumed by the WebSocket carrier.
 *
 * This boundary keeps release-specific Host topology out of the browser wire
 * server. dsh 0.1.5 implements it with Typert Remotes and Connection.
 *
 * @module
 */
/** Convert an arbitrary Host rejection to the open wire failure vocabulary. */
export function hostFailure(error) {
    if (isRecord(error)) {
        const code = typeof error.code === 'string' ? error.code : 'internal';
        const message = typeof error.message === 'string' ? error.message : String(error);
        const details = isRecord(error.details) ? error.details : {};
        return { code, message, details };
    }
    return {
        code: 'internal',
        message: error instanceof Error ? error.message : String(error),
        details: {},
    };
}
/** Narrow unknown JSON-like data without accepting arrays. */
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=host-api.js.map