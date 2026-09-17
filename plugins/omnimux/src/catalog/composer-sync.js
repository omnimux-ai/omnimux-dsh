/**
 * Keep the composer's text-model list in step with the execution hub.
 *
 * The list the app's model button renders comes from the `llm-pi-ai` provider
 * profile. That namespace declares `omnimux` as a configurable provider, so the
 * list is already a settings surface: writing `providers.omnimux.models` there
 * narrows what the route serves, and the app's own selectors re-read it on
 * `settings/document-updated`. Nothing in the official UI changes — only the
 * list it reads.
 *
 * This module owns that write. It never invents a model, never empties the list
 * because the hub is unreachable, and never throws into plugin startup.
 */

import { catalogIds, composeComposerModels, sameModelList } from './composer-list.js';

/** Settings namespace the pi-ai adapter registers its configurable providers under. */
export const PI_AI_NAMESPACE = 'llm-pi-ai';
/** Provider route whose model list the composer renders. */
export const OMNIMUX_PROVIDER = 'omnimux';

/**
 * The settings descriptor for one namespace, or null.
 * @param {unknown} descriptors
 * @param {string} ns
 * @returns {any}
 */
export function findDescriptor(descriptors, ns) {
  for (const descriptor of Array.isArray(descriptors) ? descriptors : []) {
    if (descriptor && typeof descriptor === 'object' && descriptor.ns === ns) return descriptor;
  }
  return null;
}

/**
 * One layer's model rows for a provider route.
 *
 * `base` is the composition layer `cordis.patch.yml` writes and no user layer
 * can silently replace; `user` is what a previous sync (or a person editing the
 * official Models page) stored. Field truth comes from `base`; `user` is only
 * read to decide whether a write is needed.
 *
 * @param {unknown} layer
 * @param {string} provider
 * @returns {Array<Record<string, unknown>>}
 */
export function providerModels(layer, provider = OMNIMUX_PROVIDER) {
  const root = layer && typeof layer === 'object' ? /** @type {Record<string, unknown>} */ (layer) : null;
  const providers = root && root.providers && typeof root.providers === 'object'
    ? /** @type {Record<string, unknown>} */ (root.providers)
    : null;
  const profile = providers && providers[provider] && typeof providers[provider] === 'object'
    ? /** @type {Record<string, unknown>} */ (providers[provider])
    : null;
  return Array.isArray(profile?.models) ? /** @type {Array<Record<string, unknown>>} */ (profile.models) : [];
}

/**
 * One sync attempt's outcome, for logging and tests. `reason` names the branch
 * that ran; only `written` means the document changed.
 * @typedef {{ written: boolean, reason: string, modelIds?: string[], error?: unknown }} ComposerSyncResult
 */

/**
 * Build the sync closure over a settings provider.
 *
 * @param {{
 *   settings: { describe?: Function, update?: Function },
 *   log?: (event: string, detail?: Record<string, unknown>) => void,
 * }} deps
 * @returns {{ sync: (input: { hubText?: unknown, hiddenIds?: unknown }) => Promise<ComposerSyncResult> }}
 */
export function createComposerListSync(deps) {
  const settings = deps?.settings;
  const log = typeof deps?.log === 'function' ? deps.log : () => {};

  /**
   * Bring the composer list in line with the hub. Idempotent: an already-matching
   * list is not rewritten.
   *
   * @param {{ hubText?: unknown, hiddenIds?: unknown }} input
   * @returns {Promise<ComposerSyncResult>}
   */
  async function sync(input) {
    if (!settings || typeof settings.describe !== 'function' || typeof settings.update !== 'function') {
      return { written: false, reason: 'settings-unavailable' };
    }

    const hubIds = catalogIds(input?.hubText);
    // An empty hub bucket is "no information", not "the user wants nothing":
    // a cold hub, an unreadable contract, or a host that has not finished
    // loading must never empty a working list. Keep the last accepted one.
    if (hubIds.length === 0) return { written: false, reason: 'hub-empty' };

    // A concurrent writer moves the revision; re-read and recompose once rather
    // than overwrite a change this sync never saw.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let descriptor;
      try {
        descriptor = findDescriptor(settings.describe(), PI_AI_NAMESPACE);
      } catch (error) {
        return { written: false, reason: 'describe-failed', error };
      }
      if (!descriptor) return { written: false, reason: 'namespace-absent' };

      const target = composeComposerModels({
        hubText: input?.hubText,
        shippedModels: providerModels(descriptor.base),
        hiddenIds: input?.hiddenIds,
      });
      // The hub lists models but the user hid every one of them. Writing an
      // empty list would leave the composer with nothing usable, so keep the
      // last accepted one and report the distinct reason instead.
      if (target.length === 0) return { written: false, reason: 'hidden-all' };

      const current = providerModels(descriptor.user);
      if (sameModelList(current, target)) {
        return { written: false, reason: 'unchanged', modelIds: target.map((row) => String(row.id)) };
      }

      try {
        await settings.update(
          PI_AI_NAMESPACE,
          { providers: { [OMNIMUX_PROVIDER]: { models: target } } },
          descriptor.revision,
        );
        log('composer-list-written', { count: target.length });
        return { written: true, reason: 'written', modelIds: target.map((row) => String(row.id)) };
      } catch (error) {
        const stale = Boolean(error && typeof error === 'object' && error.code === 'SETTINGS_CONFLICT');
        if (stale && attempt === 0) continue;
        // A refused write leaves the previous list serving. Report it; never
        // retry with a smaller list and never clear the list to "recover".
        log('composer-list-write-failed', { message: error instanceof Error ? error.message : String(error) });
        return { written: false, reason: stale ? 'conflict' : 'write-failed', error };
      }
    }

    // Unreachable: attempt 0 either returns or continues, and attempt 1 returns
    // on every branch. Kept as a total function for the type checker.
    return { written: false, reason: 'conflict' };
  }

  return { sync };
}
