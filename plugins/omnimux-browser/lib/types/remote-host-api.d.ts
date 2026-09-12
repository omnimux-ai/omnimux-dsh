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
import type { BrowserHostApi, HostRpcFailure } from './host-api.ts';
/** Structural subset of dsh 0.1.5's Host TypertGateway service. */
export interface TypertGatewayLike {
    readonly wireStream: {
        open(endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
        failure(error: unknown): HostRpcFailure;
    };
    invoke(request: {
        readonly namespace: string;
        readonly method: string;
        readonly args: Readonly<Record<string, unknown>>;
        readonly signal?: AbortSignal;
    }): Promise<unknown>;
}
/** Structural subset of dsh 0.1.5's Host Connection service. */
export interface HostConnectionLike {
    createSharedFetchHandler(channel: '/api'): {
        fetch(request: Request): Promise<Response>;
    };
}
/** Build the dsh 0.1.5 Host implementation. */
export declare function createRemoteHostApi(gateway: TypertGatewayLike, connection: HostConnectionLike): BrowserHostApi;
//# sourceMappingURL=remote-host-api.d.ts.map