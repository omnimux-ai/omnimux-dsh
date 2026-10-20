/**
 * Loopback HTTP transport for extension → local OmniMux/DSH calls.
 *
 * These endpoints authenticate with the bridge token (or loopback trust), never
 * with the browser cookie jar. Chromium still attaches every cookie stored for
 * host `127.0.0.1` — and cookies ignore ports — so each local instance that ever
 * set a `dsh-auth-*` cookie leaves another entry the jar never reclaims. A profile
 * with a few hundred of them sends a request header larger than the host's
 * 16 KiB `maxHeaderSize`, and the host answers 431 before any route runs. Users
 * see "save failed, check OmniMux" while the WebSocket bridge is still connected,
 * because that handshake carries no such cookie.
 *
 * Sending no credentials keeps every loopback call independent of that
 * accumulating jar.
 */
export function loopbackFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: 'omit' })
}
