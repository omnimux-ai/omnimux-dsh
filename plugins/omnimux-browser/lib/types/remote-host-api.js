/**
 * dsh 0.1.5 Host adapter.
 *
 * Unary calls go directly through TypertGateway. Long-lived Session and
 * forwarded-event streams use the Gateway wire seam, while `$events/result`
 * goes through Connection because it is a Gateway-owned RPC endpoint rather
 * than a Typert Remote method.
 *
 * @module @yuxianglin/dsh-bridge-browser/src/remote-host-api
 */
import { hostFailure, isRecord } from "./host-api.js";
import { ExtensionSessionRegistry, shouldBridgeOwnQuestion, } from "./extension-sessions.js";
/** Build the dsh 0.1.5 Host implementation. */
export function createRemoteHostApi(gateway, connection) {
    return new RemoteHostApi(gateway, connection);
}
class RemoteHostApi {
    gateway;
    fetchHandler;
    extensionSessions = new ExtensionSessionRegistry();
    /** Last known session/follow tip per Session; drives session/page throughSeq. */
    historyCursors = new Map();
    activeEvents;
    constructor(gateway, connection) {
        this.gateway = gateway;
        this.fetchHandler = connection.createSharedFetchHandler('/api');
    }
    async call(call) {
        if (call.method === 'session.history')
            return this.sessionHistory(call);
        if (call.method === 'workspace.list')
            return this.workspaceList(call);
        const target = invokeTarget(call);
        if ('error' in target)
            return { ok: false, error: target.error };
        try {
            // Deferred Sessions have no history call with which to establish the
            // follower. Open it after materialization and before prompt admission,
            // so the first user/turn events cannot race past the extension.
            if (call.method === 'session.prompt') {
                const sessionId = sessionIdOf(call.payload);
                if (sessionId !== undefined)
                    await this.activeEvents?.ensureSessionFollow(sessionId, call.signal);
            }
            const value = await this.gateway.invoke({
                namespace: target.namespace,
                method: target.method,
                args: target.args,
                signal: call.signal,
            });
            // Only claim ownership after a successful create/prompt. A failed prompt
            // against a Desktop session must not steal later ask_user_question away
            // from the native waterfall.
            if (call.method === 'session.create' || call.method === 'session.prompt') {
                this.extensionSessions.note(sessionIdOf(call.payload));
                this.extensionSessions.note(sessionIdOf(value));
                if (typeof value === 'string')
                    this.extensionSessions.note(value);
            }
            return { ok: true, value: target.adapt?.(value) ?? value };
        }
        catch (error) {
            return { ok: false, error: this.failure(error) };
        }
    }
    async *events(signal) {
        const generation = new EventGeneration(this.gateway, this.sendRemoteEventResult.bind(this), this.extensionSessions, this.noteHistoryCursor.bind(this), signal);
        const previous = this.activeEvents;
        this.activeEvents = generation;
        await previous?.dispose();
        generation.start();
        try {
            yield* generation.events();
        }
        finally {
            if (this.activeEvents === generation)
                this.activeEvents = undefined;
            await generation.dispose();
        }
    }
    async respond(rpcId, result, signal) {
        const generation = this.activeEvents;
        if (generation === undefined)
            return { accepted: false, reason: 'not-pending' };
        return generation.respond(rpcId, result, signal);
    }
    async sessionHistory(call) {
        const sessionId = sessionIdOf(call.payload);
        if (sessionId === undefined)
            return badRequest('session.history requires a non-empty sessionId');
        let beforeSeq;
        let maxMessages;
        try {
            beforeSeq = optionalNonNegativeInteger(call.payload, 'beforeSeq');
            maxMessages = optionalPositiveInteger(call.payload, 'maxMessages');
        }
        catch (error) {
            return badRequest(error instanceof Error ? error.message : 'session.history pagination is invalid');
        }
        try {
            if (beforeSeq !== undefined) {
                const throughSeq = await this.historyThroughSeq(sessionId, call.signal);
                const page = await this.gateway.invoke({
                    namespace: 'session',
                    method: 'page',
                    args: {
                        request: {
                            address: { kind: 'session', sessionId },
                            throughSeq,
                            beforeSeq,
                            ...(maxMessages === undefined ? {} : { maxMessages }),
                        },
                    },
                    signal: call.signal,
                });
                return { ok: true, value: historyPageValue(page) };
            }
            const snapshot = this.activeEvents === undefined
                ? await oneShotSessionSnapshot(this.gateway, sessionId, call.signal, maxMessages)
                : await this.activeEvents.openSessionHistory(sessionId, call.signal, maxMessages);
            this.noteHistoryCursor(sessionId, snapshot.cursor);
            return { ok: true, value: historyValue(snapshot) };
        }
        catch (error) {
            return { ok: false, error: this.failure(error) };
        }
    }
    /**
     * Resolve a Host-legal throughSeq for older history pages.
     * Never invent Number.MAX_SAFE_INTEGER — session/page rejects tips past the log cursor.
     */
    async historyThroughSeq(sessionId, signal) {
        const cached = this.historyCursors.get(sessionId);
        if (cached !== undefined)
            return cached;
        const snapshot = this.activeEvents === undefined
            ? await oneShotSessionSnapshot(this.gateway, sessionId, signal)
            : await this.activeEvents.openSessionHistory(sessionId, signal);
        this.noteHistoryCursor(sessionId, snapshot.cursor);
        const throughSeq = this.historyCursors.get(sessionId);
        if (throughSeq === undefined) {
            throw new TypeError('session/follow snapshot did not provide a usable history cursor');
        }
        return throughSeq;
    }
    noteHistoryCursor(sessionId, cursor) {
        // Host session/page refuses throughSeq past the durable tip; MAX_SAFE_INTEGER is
        // only a UI sentinel elsewhere and must never be forwarded as a page tip.
        if (!Number.isSafeInteger(cursor) || cursor < -1 || cursor === Number.MAX_SAFE_INTEGER)
            return;
        const previous = this.historyCursors.get(sessionId);
        if (previous === undefined || cursor > previous)
            this.historyCursors.set(sessionId, cursor);
    }
    async workspaceList(call) {
        try {
            const controller = new AbortController();
            const signal = AbortSignal.any([call.signal, controller.signal]);
            const source = await this.gateway.wireStream.open('workspace/follow', { args: {} }, signal);
            const iterator = source[Symbol.asyncIterator]();
            try {
                const first = await iterator.next();
                if (first.done || !isWorkspaceBaseline(first.value)) {
                    throw new TypeError('workspace/follow did not begin with a baseline');
                }
                return { ok: true, value: first.value.value };
            }
            finally {
                controller.abort(new Error('workspace baseline received'));
                await iterator.return?.();
            }
        }
        catch (error) {
            return { ok: false, error: this.failure(error) };
        }
    }
    failure(error) {
        try {
            return this.gateway.wireStream.failure(error);
        }
        catch {
            return hostFailure(error);
        }
    }
    async sendRemoteEventResult(clientId, eventId, outcome, signal) {
        const rpcId = crypto.randomUUID();
        const request = new Request('http://dsh.internal/api/$events/result', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                type: 'client-request',
                rpcId,
                method: '$events/result',
                payload: { args: { clientId, eventId, outcome } },
            }),
            signal,
        });
        const response = await this.fetchHandler.fetch(request);
        if (!response.ok) {
            throw new Error(`$events/result transport failed with HTTP ${String(response.status)}: ${await response.text()}`);
        }
        const envelope = await response.json();
        if (!isRecord(envelope) || envelope.type !== 'server-response' || envelope.rpcId !== rpcId
            || !isRecord(envelope.result) || typeof envelope.result.ok !== 'boolean') {
            throw new TypeError('$events/result returned an invalid server-response');
        }
        if (envelope.result.ok)
            return;
        const error = isRecord(envelope.result.error) ? envelope.result.error : {};
        const failure = new Error(typeof error.message === 'string' ? error.message : '$events/result was rejected');
        if (typeof error.code === 'string')
            failure.code = error.code;
        if (error.details !== undefined)
            failure.details = error.details;
        throw failure;
    }
}
/** One authenticated extension connection's event streams and active Session follower. */
class EventGeneration {
    gateway;
    sendResult;
    extensionSessions;
    onHistoryCursor;
    lifetime = new AbortController();
    signal;
    queue = new AsyncEventQueue();
    tasks = new Set();
    pendingQuestions = new Map();
    clientId;
    followAbort;
    followedSessionId;
    followRevision = 0;
    disposed = false;
    constructor(gateway, sendResult, extensionSessions, onHistoryCursor, outerSignal) {
        this.gateway = gateway;
        this.sendResult = sendResult;
        this.extensionSessions = extensionSessions;
        this.onHistoryCursor = onHistoryCursor;
        this.signal = AbortSignal.any([outerSignal, this.lifetime.signal]);
    }
    start() {
        this.track(this.pumpRemoteEvents());
    }
    events() {
        return this.queue.iterate(this.signal);
    }
    async openSessionHistory(sessionId, callSignal, maxMessages) {
        return this.openSessionFollow(sessionId, callSignal, maxMessages);
    }
    async ensureSessionFollow(sessionId, callSignal) {
        if (this.followedSessionId === sessionId && this.followAbort?.signal.aborted === false)
            return;
        await this.openSessionFollow(sessionId, callSignal);
    }
    async respond(rpcId, result, signal) {
        const pending = this.pendingQuestions.get(rpcId);
        const clientId = this.clientId;
        if (pending === undefined || pending.settled || clientId === undefined) {
            return { accepted: false, reason: 'not-pending' };
        }
        pending.settled = true;
        try {
            await this.sendResult(clientId, rpcId, respondOutcome(result), AbortSignal.any([this.signal, signal]));
            return { accepted: true };
        }
        catch (error) {
            pending.settled = false;
            throw error;
        }
    }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.followAbort?.abort(new Error('browser bridge event generation closed'));
        this.lifetime.abort(new Error('browser bridge event generation closed'));
        this.queue.end();
        await Promise.all(this.tasks);
    }
    async openSessionFollow(sessionId, callSignal, maxMessages) {
        const revision = ++this.followRevision;
        this.followAbort?.abort(new Error('browser bridge Session follower replaced'));
        const controller = new AbortController();
        this.followAbort = controller;
        this.followedSessionId = sessionId;
        const signal = AbortSignal.any([this.signal, callSignal, controller.signal]);
        try {
            const source = await this.gateway.wireStream.open('session/follow', {
                args: {
                    request: {
                        address: { kind: 'session', sessionId },
                        assistantStream: true,
                        ...(maxMessages === undefined ? {} : { maxMessages }),
                    },
                },
            }, signal);
            const iterator = source[Symbol.asyncIterator]();
            const first = await iterator.next();
            if (first.done || !isSessionSnapshot(first.value)) {
                await iterator.return?.();
                throw new TypeError('session/follow did not begin with a snapshot');
            }
            if (revision !== this.followRevision || signal.aborted) {
                await iterator.return?.();
                signal.throwIfAborted();
                throw new Error('browser bridge Session follower was replaced while opening');
            }
            this.onHistoryCursor(sessionId, first.value.cursor);
            const snapshotId = first.value.assistantStream === undefined ? undefined : crypto.randomUUID();
            // Publish the reconnect prefix before any suffix chunks. RPC responses
            // and pushed events can otherwise race, dropping the beginning of an
            // already-running attempt when the panel reopens its history.
            if (first.value.assistantStream !== undefined) {
                this.queue.push({
                    rpcId: crypto.randomUUID(),
                    method: 'session/assistant-stream',
                    payload: {
                        sessionId,
                        snapshotId,
                        frame: { type: 'snapshot', baseline: first.value.assistantStream },
                    },
                });
            }
            this.track(this.pumpSessionEvents(sessionId, revision, iterator, signal));
            return {
                cursor: first.value.cursor,
                records: first.value.records,
                hasMore: first.value.hasMore,
                ...(first.value.projections === undefined ? {} : { projections: first.value.projections }),
                ...(first.value.assistantStream === undefined ? {} : { assistantStream: first.value.assistantStream }),
                ...(snapshotId === undefined ? {} : { snapshotId }),
            };
        }
        catch (error) {
            if (revision === this.followRevision) {
                this.followedSessionId = undefined;
                this.followAbort = undefined;
            }
            throw error;
        }
    }
    async pumpSessionEvents(sessionId, revision, iterator, signal) {
        try {
            while (!signal.aborted) {
                const next = await iterator.next();
                // Abort is advisory to an AsyncIterator: a buffered frame may still
                // resolve after this follower was replaced. Never let that stale
                // generation update the extension's active/recent session state.
                if (signal.aborted || revision !== this.followRevision)
                    break;
                if (next.done)
                    break;
                if (isRecord(next.value) && next.value.type === 'assistant-stream' && isRecord(next.value.frame)) {
                    this.queue.push({
                        rpcId: crypto.randomUUID(),
                        method: 'session/assistant-stream',
                        payload: { sessionId, frame: next.value.frame },
                    });
                    continue;
                }
                if (!isSessionEventEntry(next.value)) {
                    throw new TypeError('session/follow emitted an invalid incremental frame');
                }
                const seq = next.value.event.seq;
                if (typeof seq === 'number')
                    this.onHistoryCursor(sessionId, seq);
                this.queue.push({
                    rpcId: crypto.randomUUID(),
                    method: 'session/event',
                    payload: { type: 'session/event', sessionId, event: next.value.event },
                });
            }
            if (!signal.aborted && revision === this.followRevision) {
                throw new Error('session/follow ended unexpectedly');
            }
        }
        catch (error) {
            if (!signal.aborted && revision === this.followRevision)
                this.queue.fail(error);
        }
        finally {
            await iterator.return?.();
            if (revision === this.followRevision) {
                this.followedSessionId = undefined;
                this.followAbort = undefined;
            }
        }
    }
    async pumpRemoteEvents() {
        try {
            const source = await this.gateway.wireStream.open('$events', { args: {} }, this.signal);
            let ready = false;
            for await (const value of source) {
                if (!ready) {
                    if (!isRemoteEventReady(value))
                        throw new TypeError('$events did not begin with ready');
                    this.clientId = value.clientId;
                    ready = true;
                    continue;
                }
                await this.handleRemoteEvent(value);
            }
            if (!this.signal.aborted)
                throw new Error('$events ended unexpectedly');
        }
        catch (error) {
            if (!this.signal.aborted)
                this.queue.fail(error);
        }
    }
    async handleRemoteEvent(value) {
        if (!isRecord(value) || typeof value.type !== 'string') {
            throw new TypeError('$events emitted an invalid frame');
        }
        if (value.type === 'emit')
            return;
        if (value.type === 'cancel' && typeof value.eventId === 'string') {
            const pending = this.pendingQuestions.get(value.eventId);
            if (pending === undefined)
                return;
            this.pendingQuestions.delete(value.eventId);
            this.queue.push({
                rpcId: crypto.randomUUID(),
                method: 'question/resolved',
                payload: {
                    type: 'question/resolved',
                    sessionId: pending.sessionId,
                    questionRpcId: value.eventId,
                },
            });
            return;
        }
        if (value.type !== 'waterfall'
            || typeof value.event !== 'string'
            || typeof value.eventId !== 'string'
            || typeof value.agentId !== 'string'
            || !isRecord(value.request)) {
            throw new TypeError('$events emitted an invalid waterfall frame');
        }
        if (value.event !== 'user-questions/request' || !Array.isArray(value.request.questions)) {
            const clientId = this.clientId;
            if (clientId !== undefined) {
                await this.sendResult(clientId, value.eventId, { kind: 'next' }, this.signal);
            }
            return;
        }
        // Desktop-owned sessions keep the native waterfall. Only forward questions
        // for sessions the extension successfully created or prompted.
        if (!shouldBridgeOwnQuestion({
            hasExtensionConnection: true,
            sessionId: value.agentId,
            extensionSessions: this.extensionSessions,
        })) {
            const clientId = this.clientId;
            if (clientId !== undefined) {
                await this.sendResult(clientId, value.eventId, { kind: 'next' }, this.signal);
            }
            return;
        }
        this.pendingQuestions.set(value.eventId, { sessionId: value.agentId, settled: false });
        this.queue.push({
            rpcId: value.eventId,
            method: 'question/requested',
            payload: {
                type: 'question/requested',
                sessionId: value.agentId,
                questions: value.request.questions,
            },
        });
    }
    track(task) {
        const tracked = task.catch((error) => {
            if (!this.signal.aborted)
                this.queue.fail(error);
        });
        this.tasks.add(tracked);
        void tracked.finally(() => { this.tasks.delete(tracked); });
    }
}
class AsyncEventQueue {
    frames = [];
    wake;
    failure;
    closed = false;
    push(frame) {
        if (this.closed || this.failure !== undefined)
            return;
        this.frames.push(frame);
        this.wake?.();
    }
    fail(error) {
        if (this.closed || this.failure !== undefined)
            return;
        this.failure = error;
        this.wake?.();
    }
    end() {
        if (this.closed)
            return;
        this.closed = true;
        this.wake?.();
    }
    async *iterate(signal) {
        const onAbort = () => { this.wake?.(); };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
            while (true) {
                while (this.frames.length > 0)
                    yield this.frames.shift();
                if (this.failure !== undefined)
                    throw this.failure;
                if (this.closed || signal.aborted)
                    return;
                await new Promise((resolve) => { this.wake = resolve; });
                this.wake = undefined;
            }
        }
        finally {
            signal.removeEventListener('abort', onAbort);
        }
    }
}
function invokeTarget(call) {
    if (!isRecord(call.payload))
        return { error: badRequestFailure(`${call.method} payload must be an object`) };
    switch (call.method) {
        case 'session.list':
            return { namespace: 'session', method: 'list', args: { _request: call.payload } };
        case 'session.create':
        case 'session.selectModel':
        case 'session.attachment':
        case 'session.cancel':
        case 'workspace.create':
        case 'workspace.archiveSession': {
            const [namespace, method] = call.method.split('.');
            return { namespace, method, args: { request: call.payload } };
        }
        case 'session.prompt':
            return {
                namespace: 'session',
                method: 'prompt',
                args: { request: { requestId: call.rpcId, ...call.payload } },
            };
        case 'settings.describe':
            return { namespace: 'settings', method: 'describe', args: {} };
        case 'settings.mutate':
            return { namespace: 'settings', method: 'mutate', args: call.payload };
        case 'credentials.describe':
            return {
                namespace: 'credentials',
                method: 'describe',
                args: call.payload,
                adapt: value => ({ credentials: value }),
            };
        case 'credentials.set':
        case 'credentials.unset': {
            const method = call.method.slice('credentials.'.length);
            return { namespace: 'credentials', method, args: call.payload, adapt: () => ({}) };
        }
        case 'llm.discoverModels': {
            const { settingsNs, ...request } = call.payload;
            if (typeof settingsNs !== 'string' || settingsNs.length === 0) {
                return { error: badRequestFailure('llm.discoverModels requires settingsNs') };
            }
            return {
                namespace: 'llm',
                method: 'discoverModels',
                args: { settingsNs, request },
                adapt: value => ({ models: value }),
            };
        }
        default:
            return {
                error: {
                    code: 'not-found',
                    message: `browser bridge Host method ${JSON.stringify(call.method)} is unavailable`,
                    details: {},
                },
            };
    }
}
async function oneShotSessionSnapshot(gateway, sessionId, outerSignal, maxMessages) {
    const controller = new AbortController();
    const signal = AbortSignal.any([outerSignal, controller.signal]);
    const source = await gateway.wireStream.open('session/follow', {
        args: {
            request: {
                address: { kind: 'session', sessionId },
                assistantStream: true,
                ...(maxMessages === undefined ? {} : { maxMessages }),
            },
        },
    }, signal);
    const iterator = source[Symbol.asyncIterator]();
    try {
        const first = await iterator.next();
        if (first.done || !isSessionSnapshot(first.value)) {
            throw new TypeError('session/follow did not begin with a snapshot');
        }
        return {
            cursor: first.value.cursor,
            records: first.value.records,
            hasMore: first.value.hasMore,
            ...(first.value.projections === undefined ? {} : { projections: first.value.projections }),
            ...(first.value.assistantStream === undefined ? {} : { assistantStream: first.value.assistantStream }),
        };
    }
    finally {
        controller.abort(new Error('Session snapshot received'));
        await iterator.return?.();
    }
}
function historyValue(snapshot) {
    return {
        // V3 records remain durable events with embedded Assistant streams. Keep
        // the legacy chunk-row decoder for older logs/Hosts, without assigning
        // synthetic durable seqs to the new process-local assistant stream.
        events: snapshot.records.flatMap(historyRecordEvents).map(event => ({ event })),
        hasMore: snapshot.hasMore,
        ...(snapshot.projections === undefined ? {} : { projections: snapshot.projections }),
        ...(snapshot.assistantStream === undefined ? {} : { assistantStream: snapshot.assistantStream }),
        ...(snapshot.snapshotId === undefined ? {} : { snapshotId: snapshot.snapshotId }),
    };
}
function historyPageValue(page) {
    if (!isRecord(page) || !Array.isArray(page.records) || typeof page.hasMore !== 'boolean') {
        throw new TypeError('session/page returned an invalid history page');
    }
    return historyValue({
        cursor: -1,
        records: page.records,
        hasMore: page.hasMore,
        ...(page.projections === undefined ? {} : { projections: page.projections }),
    });
}
function optionalNonNegativeInteger(payload, key) {
    if (!isRecord(payload) || !(key in payload) || payload[key] === undefined)
        return undefined;
    const value = payload[key];
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
        throw new TypeError(`${key} must be a non-negative safe integer`);
    }
    return value;
}
function optionalPositiveInteger(payload, key) {
    if (!isRecord(payload) || !(key in payload) || payload[key] === undefined)
        return undefined;
    const value = payload[key];
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`${key} must be a positive safe integer`);
    }
    return value;
}
function historyRecordEvents(record) {
    if (!isRecord(record)
        || (record.type !== 'event' && record.type !== 'chunks')
        || !isRecord(record.event)) {
        throw new TypeError('session history carried an invalid record');
    }
    const event = record.event;
    if (!isChunkRowEvent(event)) {
        if (record.type === 'chunks') {
            throw new TypeError('session history chunks record carried a non-chunk event');
        }
        return [event];
    }
    const data = event.data;
    const members = event.type === 'chunkrow/tool-call-chunks' ? data.args : data.texts;
    const deltas = data.dt;
    if (!Array.isArray(members) || members.length === 0 || members.some(member => typeof member !== 'string')
        || !Array.isArray(deltas) || deltas.length !== members.length - 1
        || deltas.some(delta => !Number.isSafeInteger(delta))) {
        throw new TypeError(`${event.type} carried an invalid compact run`);
    }
    if (members.length - 1 > Number.MAX_SAFE_INTEGER - event.seq) {
        throw new TypeError(`${event.type} sequence range is unsafe`);
    }
    const events = [];
    let time = event.time;
    for (let index = 0; index < members.length; index += 1) {
        if (index > 0)
            time += deltas[index - 1];
        if (!Number.isSafeInteger(time))
            throw new TypeError(`${event.type} timestamp range is unsafe`);
        const chunk = compactChunk(event.type, data, members[index]);
        events.push({
            type: 'assistant/chunk',
            seq: event.seq + index,
            time,
            data: { turn: data.turn, step: data.step, chunk },
        });
    }
    return events;
}
function isChunkRowEvent(event) {
    if (event.type !== 'chunkrow/text-chunks'
        && event.type !== 'chunkrow/reasoning-chunks'
        && event.type !== 'chunkrow/tool-call-chunks')
        return false;
    if (!Number.isSafeInteger(event.seq) || event.seq < 0 || !Number.isSafeInteger(event.time)
        || !isRecord(event.data)) {
        throw new TypeError(`${String(event.type)} carried an invalid compact envelope`);
    }
    const data = event.data;
    if (typeof data.turn !== 'number' || typeof data.step !== 'number' || typeof data.index !== 'number') {
        throw new TypeError(`${String(event.type)} carried invalid compact coordinates`);
    }
    if (event.type === 'chunkrow/tool-call-chunks'
        && (typeof data.id !== 'string' || (data.name !== undefined && typeof data.name !== 'string'))) {
        throw new TypeError(`${event.type} carried an invalid tool identity`);
    }
    return true;
}
function compactChunk(type, data, member) {
    if (type === 'chunkrow/text-chunks') {
        return { type: 'text-delta', index: data.index, text: member };
    }
    if (type === 'chunkrow/reasoning-chunks') {
        return { type: 'reasoning-delta', index: data.index, text: member };
    }
    return {
        type: 'tool-call-delta',
        index: data.index,
        id: data.id,
        ...(data.name === undefined ? {} : { name: data.name }),
        argumentsDelta: member,
    };
}
function respondOutcome(result) {
    if (result.ok) {
        const value = isRecord(result.value) && isRecord(result.value.answer)
            ? result.value.answer
            : result.value;
        return value === undefined ? { kind: 'result' } : { kind: 'result', value };
    }
    return {
        kind: 'rejected',
        error: {
            name: 'Error',
            message: result.error.message,
            code: result.error.code,
            details: result.error.details,
        },
    };
}
function sessionIdOf(payload) {
    if (!isRecord(payload))
        return undefined;
    return typeof payload.sessionId === 'string' && payload.sessionId.length > 0
        ? payload.sessionId
        : undefined;
}
function badRequest(message) {
    return { ok: false, error: badRequestFailure(message) };
}
function badRequestFailure(message) {
    return { code: 'bad-request', message, details: {} };
}
function isWorkspaceBaseline(value) {
    return isRecord(value) && value.type === 'baseline' && isRecord(value.value);
}
function isSessionSnapshot(value) {
    return isRecord(value)
        && value.type === 'snapshot'
        && Number.isSafeInteger(value.cursor)
        && value.cursor >= -1
        && value.cursor !== Number.MAX_SAFE_INTEGER
        && Array.isArray(value.records)
        && typeof value.hasMore === 'boolean';
}
function isSessionEventEntry(value) {
    return isRecord(value) && value.type === 'event' && isRecord(value.event);
}
function isRemoteEventReady(value) {
    return isRecord(value) && value.type === 'ready'
        && typeof value.clientId === 'string' && value.clientId.length > 0;
}
//# sourceMappingURL=remote-host-api.js.map