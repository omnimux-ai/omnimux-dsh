/**
 * Manual account refresh over the browser.
 *
 * The client opens the account profile in the default browser with a one-time
 * token in the URL hash; the content script captures the page and hands the data
 * here. This module only talks to the local host, never to a cloud/API endpoint.
 *
 * @module
 */

import { loopbackFetch } from '../shared/loopback-fetch.ts'

export const ACCOUNT_REFRESH_CLAIM_PATH = '/omnimux/inspiration/local/rival-accounts/plugin-refresh/claim'
export const ACCOUNT_REFRESH_COMPLETE_PATH = '/omnimux/inspiration/local/rival-accounts/plugin-refresh/complete'

const REQUEST_TIMEOUT_MS = 20_000

interface RefreshResponse {
  ok: boolean
  data?: unknown
  error?: string
}

const jsonOf = (response: Response): Promise<any> => Promise.resolve(response.json()).then((value) => value, () => null)

async function postJson(ports: number[], path: string, body: Record<string, unknown>): Promise<Response | null> {
  for (const port of ports) {
    const response = await Promise.resolve(loopbackFetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })).then((result) => result, () => null)
    if (response !== null && response.ok) return response
  }
  return null
}

/** Claim a one-time refresh token for the page the content script is on. */
export async function claimAccountRefresh(
  ports: number[],
  request: { token: string, pageUrl: string, handle: string },
): Promise<RefreshResponse> {
  const response = await postJson(ports, ACCOUNT_REFRESH_CLAIM_PATH, {
    token: request.token,
    page_url: request.pageUrl,
    handle: request.handle,
  })
  if (response === null) return { ok: false, error: 'host-unreachable' }
  const body = await jsonOf(response)
  if (body === null || body.data === undefined) return { ok: false, error: (body && body.error) || 'claim-rejected' }
  return { ok: true, data: body.data }
}

/** Send the captured profile + posts back; the host merges them and resets timers. */
export async function completeAccountRefresh(
  ports: number[],
  request: { token: string, account: Record<string, unknown> },
): Promise<RefreshResponse> {
  const response = await postJson(ports, ACCOUNT_REFRESH_COMPLETE_PATH, {
    token: request.token,
    account: request.account,
  })
  if (response === null) return { ok: false, error: 'host-unreachable' }
  const body = await jsonOf(response)
  if (body === null || body.data === undefined) return { ok: false, error: (body && body.error) || 'complete-rejected' }
  return { ok: true, data: body.data }
}

/** Close the tab this refresh opened; callers only invoke it after a successful write. */
export async function closeRefreshedTab(tabId: number): Promise<boolean> {
  return Promise.resolve(chrome.tabs.remove(tabId)).then(() => true, () => false)
}
