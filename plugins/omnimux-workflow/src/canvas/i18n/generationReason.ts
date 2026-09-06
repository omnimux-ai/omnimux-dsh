import type { CompatRejection } from '../../shared/validation/compatKernel.ts';
import type { DictKey } from './dict.zh.ts';

type Translate = (key: DictKey | (string & {})) => string;

/** Translate typed capability failures without exposing internal operation or slot ids. */
export function generationReasonText(
  t: Translate,
  code: string | undefined,
  reason?: CompatRejection,
): string | undefined {
  if (!code) return undefined;
  const meta = reason?.meta ?? {};
  const withValue = (key: string, name: string, value: unknown) => t(`panel.reason.${key}`).replace(`{${name}}`, String(value));
  switch (code) {
    case 'input_waiting':
    case 'input_unavailable':
      return withValue(code, 'source', meta.sourceLabel ?? meta.sourceNodeId ?? '');
    case 'mime_unsupported':
      if (Array.isArray(meta.allowedMimes) && meta.allowedMimes.length) {
        return withValue('mimeSupported', 'formats', meta.allowedMimes.join(', '));
      }
      break;
    case 'size_exceeded':
      if (typeof meta.maxSizeMb === 'number') return withValue('sizeLimit', 'max', meta.maxSizeMb);
      break;
    case 'duration_exceeded':
      if (typeof meta.maxDurationSec === 'number') return withValue('durationMax', 'max', meta.maxDurationSec);
      if (typeof meta.minDurationSec === 'number') return withValue('durationMin', 'min', meta.minDurationSec);
      break;
    case 'slot_capacity':
      if (typeof meta.max === 'number') return withValue('capacityLimit', 'max', meta.max);
      break;
    case 'min_unsatisfied':
      if (typeof meta.min === 'number' && typeof meta.current === 'number') {
        return withValue('minInputs', 'min', meta.min).replace('{current}', String(meta.current));
      }
      break;
    case 'metadata_required':
      if (reason?.slot === 'file_url') return t('panel.reason.fileUrl');
      if (reason?.slot === 'link_url') return t('panel.reason.linkUrl');
      break;
  }
  const key = `panel.reason.${code}`;
  const copy = t(key);
  return copy === key ? t('panel.reason.no_compatible_model') : copy;
}
