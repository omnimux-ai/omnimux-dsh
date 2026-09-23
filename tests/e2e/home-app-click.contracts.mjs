import assert from 'node:assert/strict';

// null explicitly means the owner had no Emulation device-metrics override.
export function copyOriginalMetrics(value) {
  assert.notEqual(value, undefined, 'Owner must supply originalMetricsOverride (null means no override)');
  if (value === null) return null;
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Invalid metrics override');
  for (const key of ['width', 'height', 'deviceScaleFactor']) {
    assert.ok(Number.isFinite(value[key]) && value[key] >= 0, `Invalid metrics ${key}`);
  }
  assert.equal(typeof value.mobile, 'boolean', 'Invalid metrics mobile');
  return JSON.parse(JSON.stringify(value));
}

export function readPreparedContract(value) {
  assert.equal(value?.prepared, true, 'Task owner preparation did not succeed');
  assert.ok(Number.isSafeInteger(value.spaceId) && value.spaceId > 0, 'Invalid owned TaskSpace ID');
  return { spaceId: value.spaceId, originalMetricsOverride: copyOriginalMetrics(value.originalMetricsOverride) };
}

// Restore even when setting the first size or observing the resized page fails.
export async function withRestoredMetrics(page, originalMetricsOverride, run) {
  const original = copyOriginalMetrics(originalMetricsOverride);
  let failure;
  try { await run(); } catch (error) { failure = error; }
  finally {
    try {
      if (original === null) await page.cdp('Emulation.clearDeviceMetricsOverride');
      else await page.cdp('Emulation.setDeviceMetricsOverride', original);
    } catch (error) {
      const restoreFailure = new AggregateError(
        failure ? [failure, error] : [error],
        `Viewport restoration failed: ${error.message}${failure ? `; resize failed: ${failure.message}` : ''}`,
      );
      restoreFailure.code = 'HOME_APP_METRICS_RESTORE_FAILED';
      throw restoreFailure;
    }
  }
  if (failure) throw failure;
}

export function lifecycleBlockReason(error) {
  return error?.code === 'HOME_APP_METRICS_RESTORE_FAILED'
    ? `05-resize did not restore the owner viewport: ${error.message}` : undefined;
}
