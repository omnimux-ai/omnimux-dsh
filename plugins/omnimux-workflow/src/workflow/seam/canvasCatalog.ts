import type { CapabilityCatalog, CatalogModelDto, CapabilityModelItem } from '../../shared/api.ts';
import { projectCanvasCatalog } from '../../shared/generationPolicy.ts';

type Getter = (name: string) => unknown;
interface CatalogSeam { list(): Partial<CapabilityCatalog> }

function rows(value: unknown): CapabilityModelItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === 'object').map((row) => ({
    id: String(row.id ?? ''),
    label: typeof row.label === 'string' && row.label.trim() ? row.label : String(row.id ?? ''),
    ...(typeof row.badge === 'string' ? { badge: row.badge } : {}),
    ...(typeof row.subtitle === 'string' ? { subtitle: row.subtitle } : {}),
    ...(typeof row.family === 'string' ? { family: row.family } : {}),
    ...(Array.isArray(row.aliases) ? { aliases: row.aliases.map(String) } : {}),
    ...(row.inputCapability && typeof row.inputCapability === 'object' ? { inputCapability: row.inputCapability } : {}),
    ...(row.parameters && typeof row.parameters === 'object' ? { parameters: row.parameters } : {}),
  })).filter((row) => row.id.length > 0);
}

/** Catalog DTO passthrough; curation never fabricates an executable operation. */
export function readCanvasCatalog(getSeam: Getter): CapabilityCatalog {
  const source = ['videoGenerate', 'imageGenerate', 'audioGenerate', 'textComplete'].some((name) => {
    const seam = getSeam(name) as { execute?: unknown } | undefined;
    return typeof seam?.execute === 'function';
  }) ? 'omnimux' : 'static-stub';
  const seam = getSeam('modelCatalog') as CatalogSeam | undefined;
  if (!seam || typeof seam.list !== 'function') return { source, text: [], image: [], video: [], audio: [] };
  const body = seam.list();
  const models = Array.isArray(body.models) ? body.models.filter((row): row is CatalogModelDto =>
    typeof row === 'object' && row !== null && typeof row.id === 'string') : undefined;
  const defaultsByOperation = body.defaultsByOperation && typeof body.defaultsByOperation === 'object'
    ? Object.fromEntries(Object.entries(body.defaultsByOperation).filter(([, value]) => typeof value === 'string' && value))
    : undefined;
  return projectCanvasCatalog({
    source: body.source === 'omnimux' || body.source === 'static-stub' ? body.source : source,
    schemaVersion: typeof body.schemaVersion === 'string' ? body.schemaVersion : undefined,
    fingerprint: typeof body.fingerprint === 'string' ? body.fingerprint : undefined,
    defaults: body.defaults, models, defaultsByOperation,
    text: rows(body.text), image: rows(body.image), video: rows(body.video), audio: rows(body.audio),
  });
}
