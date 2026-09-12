/**
 * Resolve the browser-extension bridge WebSocket URL from the current page
 * location or a discovery response. Shared by the settings row and tests.
 * @module @yuxianglin/dsh-bridge-browser/src/bridge-url
 */
/** Minimal Location fields needed to rebuild a loopback-friendly ws URL. */
export interface BridgeLocationLike {
    protocol: string;
    hostname: string;
    port: string;
    host: string;
}
/**
 * Build `ws(s)://…/ext/bridge` from the page that hosts the dsh web UI.
 * Loopback hostnames are normalized to `127.0.0.1` so the address pastes cleanly
 * into the Chrome extension settings.
 */
export declare function bridgeWsUrlFromLocation(location: BridgeLocationLike, bridgePath?: string): string;
/**
 * Prefer the discovery endpoint; fall back to reconstructing from `location`.
 * @param fetchImpl - injectable fetch (defaults to global fetch).
 * @param location - page location used for fallback and relative discovery URL.
 */
export declare function resolveBridgeWsUrl(location: BridgeLocationLike & {
    origin?: string;
}, fetchImpl?: typeof fetch, bridgeConfigPath?: string): Promise<string>;
//# sourceMappingURL=bridge-url.d.ts.map