/**
 * Read-only gateway-snapshot diagnostics (P1a).
 *
 * Everything the diagnostics endpoint reports is assembled here, so the body
 * that ships can be asserted directly in tests instead of only through a stub.
 *
 * Two rules:
 *   - counts come from the diff document's own summary (`driftSummaryCounts`),
 *     never from a caller guessing a category name;
 *   - no local paths and no raw upstream error text — only stable codes, counts
 *     and timestamps. The detailed cause stays in the refresher's own state for
 *     logs.
 */

import { diffGatewayAgainstHub, driftSummaryCounts } from './diff.js'

/**
 * @param {{
 *   live: { resolve: () => object },
 *   refresher: { state: () => object },
 *   listCatalog: () => object,
 * }} deps
 */
export function createCatalogDiagnostics(deps) {
  return function catalogDiagnostics() {
    const resolved = deps.live.resolve()
    const state = deps.refresher.state()
    const drift = resolved.snapshot
      ? diffGatewayAgainstHub({ gateway: resolved.snapshot, hub: deps.listCatalog() })
      : null
    return {
      schemaVersion: 1,
      snapshot: {
        source: resolved.source,
        digest: resolved.digest,
        generatedAt: resolved.generatedAt,
        fetchedAt: resolved.fetchedAt,
        stale: resolved.stale,
        models: Array.isArray(resolved.snapshot?.models) ? resolved.snapshot.models.length : 0,
        drop: resolved.drop,
        bundledIssueCode: resolved.bundledIssueCode,
      },
      refresh: {
        refresh: state.refresh,
        errorCode: state.errorCode,
        fetchedAt: state.fetchedAt,
        due: state.due,
      },
      drift: drift ? driftSummaryCounts(drift) : null,
    }
  }
}
