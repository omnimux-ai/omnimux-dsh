import { WorkshopReadError } from './workshop-store.js';
export const WORKSHOP_READ_METHODS = Object.freeze(['workshopCapabilities', 'workshopQuery', 'workshopDetail', 'workshopInventory']);
export function canonicalWorkshopOrigin(value) {
    if (typeof value !== 'string' || !value || value !== value.trim() || value === 'null' || value.includes(','))
        return null;
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
            || !/^https?:\/\/[^/]+$/.test(value) || url.origin === 'null')
            return null;
        return url.origin;
    }
    catch {
        return null;
    }
}
/** Read-route guard only; it cannot authorize any installation or other mutation. */
export class RequestGuard {
    authorization;
    constructor(authorization) {
        this.authorization = authorization;
    }
    async authorizeHeaders(req, operation) {
        const { connection, trustedOrigin, authorizeRead } = this.authorization;
        if (!connection || typeof connection.requestRejection !== 'function')
            throw new WorkshopReadError('AUTH_REQUIRED', 401);
        const rejection = connection.requestRejection(req);
        if (rejection)
            throw new WorkshopReadError(rejection.status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN_OPERATION', rejection.status === 401 ? 401 : 403);
        const expected = canonicalWorkshopOrigin(trustedOrigin);
        if (!expected)
            throw new WorkshopReadError('ORIGIN_UNVERIFIED', 503);
        const count = req.rawHeaders?.filter((name, index) => index % 2 === 0 && name.toLowerCase() === 'origin').length ?? 0;
        if (count > 1 || canonicalWorkshopOrigin(req.headers.origin) !== expected)
            throw new WorkshopReadError('FORBIDDEN_ORIGIN', 403);
        if (!authorizeRead || await authorizeRead(req, operation) !== true)
            throw new WorkshopReadError('FORBIDDEN_OPERATION', 403);
        if (req.method !== 'GET')
            throw new WorkshopReadError('METHOD_NOT_ALLOWED', 405);
        if (req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length'] !== '0'))
            throw new WorkshopReadError('INVALID_REQUEST', 400);
    }
}
