/**
 * Display-only cost estimate for the media composer.
 *
 * The model catalog exposes `pricing.pointsEstimate` per channel. This helper
 * multiplies that authoritative per-result estimate by the requested batch
 * count; it never invents a price, calls a pricing endpoint, or reads the
 * model-id price tables. Callers hide the line when the estimate is null.
 */

/** Round a raw point value for display: integers at >=10, 1dp at >=1, 2dp below. */
export function formatEstimatedPoints(points) {
  const value = Number(points);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value >= 10) return String(Math.round(value));
  if (value >= 1) return Number(value.toFixed(1)).toString();
  return Number(value.toFixed(2)).toString();
}

/**
 * @param {{ points?: number | null, count?: number | string | null }} [input]
 * @returns {{ points: number, text: string } | null}
 */
export function estimateMediaPoints({ points, count } = {}) {
  if (typeof points !== 'number' || !Number.isFinite(points) || points < 0) return null;
  const unit = points;
  const batch = Number.parseInt(String(count ?? 1), 10);
  // Image submissions clamp to 1..4 (MediaViewerTab); the estimate must match.
  const quantity = Math.min(4, Math.max(1, Number.isFinite(batch) && batch > 0 ? batch : 1));
  const raw = unit * quantity;
  const rounded = raw >= 10
    ? Math.round(raw)
    : raw >= 1
      ? Math.round(raw * 10) / 10
      : Math.round(raw * 100) / 100;
  const text = rounded === 0 && raw > 0 ? '<0.01' : formatEstimatedPoints(rounded);
  return { points: rounded, text };
}
