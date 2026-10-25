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
import { gatewayMembershipExemptionsList } from '../serving/id-universe.js'

/**
 * @param {{
 *   live: { resolve: () => object },
 *   refresher: { state: () => object },
 *   listCatalog: () => object,
 *   gatewayMembershipExemptions?: () => Array<{ modelId: string, reason: string }>,
 * }} deps
 */
export function createCatalogDiagnostics(deps) {
  const exemptions = deps.gatewayMembershipExemptions ?? gatewayMembershipExemptionsList
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
      // #3763: which models are excused from the gateway membership gate, and why.
      // Declared in auto-serving-manifest.json; the settings card reads this body
      // verbatim, so the waiver set is user-visible instead of living in code.
      membershipExemptions: exemptions(),
      drift: drift ? driftSummaryCounts(drift) : null,
    }
  }
}
