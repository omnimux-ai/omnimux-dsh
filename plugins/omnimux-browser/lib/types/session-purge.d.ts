/**
 * File-level removal of one session's durable storage under the dsh home.
 *
 * The gateway exposes no session.delete, so the bridge performs the removal
 * itself: this module archives the session under exclusive write ownership,
 * then removes its durable data while retaining the kernel lock's pathname.
 * Session ids are validated against the persisted shape, only data within
 * exact-name directories two levels below the sessions root is removed, and
 * running sessions are refused before anything touches the disk.
 *
 * @module @yuxianglin/dsh-bridge-browser/src/session-purge
 */
/** Stable failure codes surfaced to the panel. Open set: callers must tolerate growth. */
export type SessionPurgeErrorCode = 'not-found' | 'running' | 'invalid-id' | 'internal';
/** Error thrown by {@link purgeSessionFiles}; the server turns it into a wire error. */
export declare class SessionPurgeError extends Error {
    readonly code: SessionPurgeErrorCode;
    constructor(code: SessionPurgeErrorCode, message: string, options?: ErrorOptions);
}
/** Dependencies purging needs from the plugin. */
export interface SessionPurgeDeps {
    /** The dsh sessions root (`dshHomePath('sessions')`). */
    sessionsRoot: string;
    /** Session ids currently running; purging any of these is refused. */
    runningSessionIds: ReadonlySet<string>;
    /**
     * Claim the runtime's exclusive write ownership (including its kernel lock).
     * The returned handle must remain held until removal finishes. Opening a
     * read handle, checking for a lock file, or checking only Agent status does
     * not provide exclusion: idle Agents and other processes can own the log.
     */
    acquireOwnership(sessionId: string): Promise<{
        close(): Promise<void>;
    }>;
    /** Archive while the durable session still exists and exclusive ownership is held. */
    archiveSession(sessionId: string): Promise<void>;
}
/**
 * Validate one session id against the persisted shape. Rejects everything
 * that could escape the sessions root (separators, dot segments) before any
 * filesystem call sees it.
 * @param sessionId - untrusted id from the panel.
 * @returns the id when well-formed.
 * @throws SessionPurgeError with code `invalid-id` otherwise.
 */
export declare function assertPurgeableSessionId(sessionId: string): string;
/**
 * Permanently delete a session's data, keeping its directory and lock inode.
 * The runtime refuses ambiguous duplicate session identities across workspaces.
 * @param deps - root and running-set inputs.
 * @param sessionId - validated session id.
 * @returns nothing; throws {@link SessionPurgeError} on refusal or failure.
 */
export declare function purgeSessionFiles(deps: SessionPurgeDeps, sessionId: string): Promise<void>;
//# sourceMappingURL=session-purge.d.ts.map