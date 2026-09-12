/**
 * Defer real session creation until the first prompt.
 *
 * The panel calls `session.create` as soon as it connects, but a session that
 * is opened and never used should leave zero trace in the store/GUI. This
 * wrapper answers `session.create` with a provisional id (minted locally,
 * nothing persisted), serves `session.history` for provisional ids as empty,
 * and materializes the real session — same id, original create payload — on
 * the first `session.prompt` for that id. Abandoned provisional ids are
 * pruned after {@link PROVISIONAL_TTL_MS}.
 *
 * @module @yuxianglin/dsh-bridge-browser/src/session-deferral
 */
import { isRecord } from "./host-api.js";
/** Provisional entries older than this are dropped on the next create. */
const PROVISIONAL_TTL_MS = 30 * 60_000;
/**
 * Wrap the gateway sessions API so `session.create` returns a provisional id
 * without creating anything; the real session materializes on the first
 * `session.prompt` for that id.
 *
 * @param api - Gateway API implementation.
 * @param enabled - Whether deferral is active; false returns the API untouched.
 * @param imageLimits - actual host image capability, used for the synthetic
 * empty history before the deferred Session exists.
 * @returns the original API when disabled, otherwise the wrapped API.
 */
export function withSessionDeferral(api, enabled, imageLimits) {
    if (!enabled)
        return api;
    const provisional = new Map();
    const materializing = new Map();
    const prune = () => {
        const cutoff = Date.now() - PROVISIONAL_TTL_MS;
        for (const [id, entry] of provisional) {
            if (entry.createdAt < cutoff)
                provisional.delete(id);
        }
    };
    const mintedId = (payload) => typeof payload.sessionId === 'string' ? payload.sessionId : `session-${crypto.randomUUID()}`;
    return {
        async call(call) {
            if (call.method === 'session.create') {
                if (!isRecord(call.payload)) {
                    return { ok: false, error: { code: 'bad-request', message: 'session.create payload must be an object', details: {} } };
                }
                prune();
                const sessionId = mintedId(call.payload);
                provisional.set(sessionId, { payload: { ...call.payload }, createdAt: Date.now() });
                return { ok: true, value: { sessionId } };
            }
            if (call.method === 'session.history') {
                const sessionId = sessionIdOf(call.payload);
                if (sessionId === undefined || !provisional.has(sessionId))
                    return api.call(call);
                return {
                    ok: true,
                    value: {
                        events: [],
                        hasMore: false,
                        ...(imageLimits === undefined
                            ? {}
                            : { projections: { asOfSeq: -1, values: { imageLimits } } }),
                    },
                };
            }
            if (call.method !== 'session.prompt')
                return api.call(call);
            const sessionId = sessionIdOf(call.payload);
            if (sessionId === undefined)
                return api.call(call);
            const entry = provisional.get(sessionId);
            if (entry === undefined)
                return api.call(call);
            const existing = materializing.get(sessionId);
            const pending = existing ?? api.call({
                rpcId: crypto.randomUUID(),
                method: 'session.create',
                payload: { ...entry.payload, sessionId },
                signal: call.signal,
            });
            if (existing === undefined) {
                materializing.set(sessionId, pending);
                void pending.then(() => { materializing.delete(sessionId); }, () => { materializing.delete(sessionId); });
            }
            const created = await pending;
            if (!created.ok)
                return created;
            provisional.delete(sessionId);
            return api.call(call);
        },
        events: signal => api.events(signal),
        respond: (rpcId, result, signal) => api.respond(rpcId, result, signal),
    };
}
function sessionIdOf(payload) {
    if (!isRecord(payload))
        return undefined;
    return typeof payload.sessionId === 'string' ? payload.sessionId : undefined;
}
//# sourceMappingURL=session-deferral.js.map