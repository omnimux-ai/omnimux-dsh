import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { resolveProjectPaths, resolveProjectRelPath } from '../../projects/paths.ts';
import { DirectorHostError } from './directorHost.ts';
import { validateDirectorModelBundle, type DirectorModelResource } from './modelImport.ts';

export const DIRECTOR_MODEL_BUDGETS = Object.freeze({ bundleBytes: 64 * 1024 * 1024, files: 32,
  images: 32, textures: 64, materials: 128, imageEdge: 8192, imagePixels: 16_000_000, texturePixels: 32_000_000,
  primitiveDefinitions: 2048, primitives: 8192, instances: 1024, triangleDefinitions: 1_000_000,
  triangles: 2_000_000, vertices: 8_000_000, components: 8_000_000 });
export interface DirectorModelCosts {
  images: number; textures: number; materials: number; texturePixels: number; primitiveDefinitions: number;
  primitives: number; instances: number; triangleDefinitions: number; triangles: number; vertices: number; components: number;
}
export interface DirectorModelDecodedImage { sha256: string; bytes: number; mimeType: string; width: number; height: number }
interface BundleFile { name: string; bytes: Buffer }
export interface DirectorModelManifest {
  schemaVersion: 1; validationVersion: 1; commitState: 'committed'; assetId: string; mainPath: string;
  mimeType: string; bundleBytes: number; files: Array<{ path: string; bytes: number; sha256: string }>;
  dependencies: Array<{ uri: string; path: string }>; embeddedUris: string[];
  costs: DirectorModelCosts; budgets: typeof DIRECTOR_MODEL_BUDGETS; decodedImages: DirectorModelDecodedImage[]; hash: string;
}
const BASE = 'assets/imported/director-models';
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const REFERENCE = new RegExp(`^${BASE}/(${UUID})/(.+)$`);
function fail(code = 'director-model-unconfirmed'): never { throw new DirectorHostError(code); }
export function directorModelSha256(bytes: Uint8Array | string): string { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
function safeName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 240 && value.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(part) && part !== '.' && part !== '..');
}
function plain(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function equal(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }
export function createDirectorModelManifest(id: string, main: BundleFile, files: Map<string, BundleFile>, validation: { dependencies: Array<{ uri: string; path: string }>; embeddedUris: string[]; costs: DirectorModelCosts }, decodedImages: DirectorModelDecodedImage[] = []): DirectorModelManifest {
  const data = { schemaVersion: 1 as const, validationVersion: 1 as const, commitState: 'committed' as const,
    assetId: `director-model-${id}`, mainPath: main.name, mimeType: /\.glb$/i.test(main.name) ? 'model/gltf-binary' : 'model/gltf+json',
    bundleBytes: [...files.values()].reduce((sum, file) => sum + file.bytes.length, 0),
    files: [...files.values()].map(file => ({ path: file.name, bytes: file.bytes.length, sha256: directorModelSha256(file.bytes) })).sort((a, b) => a.path.localeCompare(b.path)),
    dependencies: validation.dependencies, embeddedUris: validation.embeddedUris, costs: validation.costs,
    budgets: DIRECTOR_MODEL_BUDGETS, decodedImages };
  return { ...data, hash: directorModelSha256(canonical(data)) };
}
function readBounded(root: string, relative: string, limit: number): Buffer {
  const parts = relative.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const stat = lstatSync(resolveProjectRelPath(root, parts.slice(0, i).join('/')));
    if (stat.isSymbolicLink() || (i < parts.length && !stat.isDirectory()) || (i === parts.length && !stat.isFile())) fail('path-denied');
  }
  const fd = openSync(resolveProjectRelPath(root, relative), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd); if (!before.isFile() || before.size < 1 || before.size > limit) fail('director-model-budget');
    const bytes = Buffer.alloc(before.size); let offset = 0;
    while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) fail(); offset += count; }
    const after = fstatSync(fd); if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail();
    return bytes;
  } finally { closeSync(fd); }
}
function inventory(root: string, relative: string, expected: Set<string>): void {
  let count = 0;
  const visit = (dir: string, prefix: string): void => {
    const stat = lstatSync(resolveProjectRelPath(root, dir)); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('path-denied');
    for (const entry of readdirSync(resolveProjectRelPath(root, dir), { withFileTypes: true })) {
      if (++count > 256 || entry.isSymbolicLink()) fail('director-model-budget');
      const name = prefix + entry.name;
      if (entry.isDirectory()) {
        if (![...expected].some(path => path.startsWith(name + '/'))) fail();
        visit(`${dir}/${entry.name}`, name + '/');
      } else if (!entry.isFile() || !expected.delete(name)) fail();
    }
  };
  visit(relative, ''); if (expected.size) fail();
}
/** Integrity and bounded static verification; not a signature against local directory writers. */
export function verifyDirectorModel({ projectRoot, reference }: { projectRoot: string; reference: string }): DirectorModelResource {
  try {
    if (typeof reference !== 'string') fail(); const match = REFERENCE.exec(reference);
    if (!match || !safeName(match[2]) || !/\.(glb|gltf)$/i.test(match[2]!)) fail('director-model-path-denied');
    const root = resolveProjectPaths(projectRoot).projectRoot; const directory = `${BASE}/${match[1]}`;
    const manifestPath = `${directory}/manifest.json`;
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBounded(root, manifestPath, 256 * 1024))) as DirectorModelManifest;
    if (!plain(manifest) || manifest.schemaVersion !== 1 || manifest.validationVersion !== 1 || manifest.commitState !== 'committed' || manifest.assetId !== `director-model-${match[1]}` || manifest.mainPath !== match[2] || !equal(manifest.budgets, DIRECTOR_MODEL_BUDGETS)) fail();
    const { hash, ...body } = manifest; if (typeof hash !== 'string' || directorModelSha256(canonical(body)) !== hash) fail();
    if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > DIRECTOR_MODEL_BUDGETS.files || !Array.isArray(manifest.decodedImages)) fail();
    const files = new Map<string, BundleFile>(); let total = 0;
    for (const file of manifest.files) {
      if (!plain(file) || !safeName(file.path) || file.path === 'manifest.json' || !/\.(glb|gltf|bin|png|jpe?g|webp)$/i.test(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !/^[a-f0-9]{64}$/.test(file.sha256) || [...files.keys()].some(name => name.toLowerCase() === file.path.toLowerCase())) fail();
      total += file.bytes; if (total > DIRECTOR_MODEL_BUDGETS.bundleBytes) fail('director-model-budget');
      const bytes = readBounded(root, `${directory}/${file.path}`, file.bytes);
      if (bytes.length !== file.bytes || directorModelSha256(bytes) !== file.sha256) fail();
      files.set(file.path, { name: file.path, bytes });
    }
    if (manifest.bundleBytes !== total || [...files.keys()].filter(name => /\.(glb|gltf)$/i.test(name)).length !== 1) fail();
    inventory(root, directory, new Set(['manifest.json', ...files.keys()]));
    const main = files.get(manifest.mainPath); if (!main) fail();
    const validation = validateDirectorModelBundle(main, files);
    const expectedImages = validation.images.map(image => ({ sha256: directorModelSha256(image.bytes), bytes: image.bytes.length, mimeType: image.mimeType, width: image.width, height: image.height }));
    if (!equal(expectedImages, manifest.decodedImages)) fail('director-model-image-unconfirmed');
    const rebuilt = createDirectorModelManifest(match[1]!, main, files, validation, manifest.decodedImages);
    if (!equal(rebuilt, manifest)) fail();
    return { storageKey: reference, url: reference, assetId: manifest.assetId, bytes: main.bytes.length, bundleBytes: total,
      mimeType: manifest.mimeType, fileName: basename(main.name), manifestPath, manifest, confirmed: true };
  } catch (error) { if (error instanceof DirectorHostError) throw error; return fail(); }
}
export function getDirectorModelDependencies(input: { projectRoot: string; reference: string }) {
  const resource = verifyDirectorModel(input); const directory = resource.manifestPath.slice(0, -'/manifest.json'.length);
  return { assetId: resource.assetId, mainPath: resource.storageKey,
    dependencies: resource.manifest.dependencies.map(item => ({ uri: item.uri, storageKey: `${directory}/${item.path}` })),
    embeddedUris: [...resource.manifest.embeddedUris] };
}
