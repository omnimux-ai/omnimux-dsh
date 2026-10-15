import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, unlinkSync, lstatSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, posix, relative } from 'node:path';
import { assertProjectWriteSafe, resolveProjectPaths, resolveProjectRelPath } from '../../projects/paths.ts';
import { DirectorHostError } from './directorHost.ts';

export interface DirectorModelFile { name: string; bytes: Uint8Array }
export type DirectorModelTrustedInspect = (input: { path: string; type: 'image'; maxBytes: number; signal?: AbortSignal }) => Promise<{ type: string; mime: string; sizeBytes: number; width: number; height: number }>;
import { createDirectorModelManifest, verifyDirectorModel, DIRECTOR_MODEL_BUDGETS as BUDGETS, directorModelSha256, type DirectorModelManifest, type DirectorModelCosts, type DirectorModelDecodedImage } from './modelManifest.ts';
export { verifyDirectorModel, getDirectorModelDependencies } from './modelManifest.ts';
export interface DirectorModelResource { storageKey: string; url: string; mimeType: string; bytes: number; fileName: string; assetId: string; bundleBytes: number; manifestPath: string; manifest: DirectorModelManifest; confirmed: true }
const LIMIT = 64 * 1024 * 1024;
const JSON_LIMIT = 4 * 1024 * 1024;
function fail(code = 'director-model-invalid'): never { throw new DirectorHostError(code); }
type ModelJson = Record<string, any>;
type ModelFile = { name: string; bytes: Buffer };

function dataProperties(value: unknown): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) fail();
  return descriptors;
}
function snapshot(input: unknown): { projectRoot: string; files: Map<string, ModelFile>; signal?: AbortSignal; trustedInspect?: DirectorModelTrustedInspect } {
  const properties = dataProperties(input);
  const projectRoot = properties.projectRoot?.value;
  const signal = properties.signal?.value as AbortSignal | undefined;
  if (typeof projectRoot !== 'string' || (signal !== undefined && !(signal instanceof AbortSignal))) fail();
  signal?.throwIfAborted();
  const trustedInspect = properties.trustedInspect?.value;
  if (trustedInspect !== undefined && typeof trustedInspect !== 'function') fail('director-model-inspector-required');
  const raw = properties.files?.value;
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || !raw.length || raw.length > BUDGETS.files) fail('director-model-budget');
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const files = new Map<string, ModelFile>(); let total = 0;
  for (let i = 0; i < raw.length; i++) {
    const item = descriptors[String(i)]; if (!item || !('value' in item)) fail();
    const file = dataProperties(item.value); const name = safeName(file.name?.value); const bytes: unknown = file.bytes?.value;
    if (!/\.(glb|gltf|bin|png|jpe?g|webp)$/i.test(name)) fail('director-model-path-denied');
    if (!(bytes instanceof Uint8Array) || ![Uint8Array.prototype, Buffer.prototype].includes(Object.getPrototypeOf(bytes)) || !(bytes.buffer instanceof ArrayBuffer) || !bytes.byteLength) fail();
    total += bytes.byteLength; if (total > LIMIT) fail('director-model-budget');
    if ([...files.keys()].some(key => key.toLowerCase() === name.toLowerCase())) fail('director-model-duplicate-file');
    files.set(name, { name, bytes: Buffer.from(bytes) });
  }
  const directories = new Set<string>();
  for (const name of files.keys()) {
    if ([...files.keys()].some(other => other.toLowerCase().startsWith(name.toLowerCase() + '/'))) fail('director-model-path-denied');
    const parts = name.split('/'); for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  }
  if (directories.size + files.size + 1 > 256) fail('director-model-budget');
  return { projectRoot, files, signal, trustedInspect };
}
function safeName(name: unknown): string {
  if (typeof name !== 'string' || name.length > 240 || !name.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(part) && part !== '.' && part !== '..')) fail('director-model-path-denied');
  return name;
}
function parseJson(bytes: Buffer): ModelJson {
  if (bytes.length > JSON_LIMIT) fail('director-model-budget');
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== 'object' || value.asset?.version !== '2.0') fail();
    return value;
  } catch (error) { if (error instanceof DirectorHostError) throw error; return fail(); }
}
function parseGlb(bytes: Buffer): { json: ModelJson; binary?: Buffer } {
  if (bytes.length < 20 || bytes.length % 4 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) fail();
  let offset = 12; let chunks = 0; let json: ModelJson | undefined; let binary: Buffer | undefined;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail();
    const length = bytes.readUInt32LE(offset); const type = bytes.readUInt32LE(offset + 4);
    if (!length || length % 4 || offset + 8 + length > bytes.length || chunks > 1 || type !== (chunks === 0 ? 0x4e4f534a : 0x004e4942)) fail();
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (chunks === 0) json = parseJson(data); else binary = data;
    chunks++; offset += 8 + length;
  }
  if (!json) fail();
  return { json, binary };
}
function boundedJson(json: ModelJson, allowedUris: Set<object>): void {
  let nodes = 0;
  const visit = (value: any, depth: number): void => {
    if (++nodes > 100000 || depth > 32) fail('director-model-budget');
    if (typeof value === 'number' && !Number.isFinite(value)) fail();
    if (typeof value === 'string' && /(?:<\/?script\b|javascript\s*:|vbscript\s*:)/i.test(value)) fail();
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      if (value.length > 10000) fail('director-model-budget');
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:__proto__|prototype|constructor|scripts?|on[a-z]+)$/i.test(key)) fail();
      if (key === 'extensions' && item && Object.keys(item).length) fail('director-model-unsupported-extension');
      if (key === 'uri' && !allowedUris.has(value)) fail('director-model-path-denied');
      visit(item, depth + 1);
    }
  };
  visit(json, 0);
  if ((json.extensionsRequired?.length ?? 0) || (json.extensionsUsed?.length ?? 0)) fail('director-model-unsupported-extension');
}
function array(json: ModelJson, key: string): any[] {
  const values = json[key] ?? [];
  if (!Array.isArray(values) || values.length > 10000 || values.some(value => !value || typeof value !== 'object' || Array.isArray(value))) fail();
  return values;
}
function integer(value: any, min = 0, max = LIMIT): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail();
  return value;
}
function index(value: any, entries: any[]): number { return integer(value, 0, entries.length - 1); }
function validateGeometry(json: ModelJson, buffers: Buffer[]): { costs: DirectorModelCosts; scans: Array<() => void> } {
  const views = array(json, 'bufferViews'); const accessors = array(json, 'accessors');
  const meshes = array(json, 'meshes'); const nodes = array(json, 'nodes'); const scenes = array(json, 'scenes');
  const images = array(json, 'images'); const textures = array(json, 'textures'); const samplers = array(json, 'samplers'); const materials = array(json, 'materials');
  const costs: DirectorModelCosts = { images: images.length, textures: textures.length, materials: materials.length, texturePixels: 0,
    primitiveDefinitions: 0, primitives: 0, instances: 0, triangleDefinitions: 0, triangles: 0, vertices: 0, components: 0 };
  if (images.length > BUDGETS.images || textures.length > BUDGETS.textures || materials.length > BUDGETS.materials) fail('director-model-budget');
  for (const mesh of meshes) {
    if (!Array.isArray(mesh.primitives) || !mesh.primitives.length) fail();
    costs.primitiveDefinitions += mesh.primitives.length;
    if (costs.primitiveDefinitions > BUDGETS.primitiveDefinitions) fail('director-model-budget');
  }
  for (const accessor of accessors) {
    const size = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 } as Record<string, number>)[accessor.type];
    if (!size) fail(); costs.components += integer(accessor.count, 1, 1000000) * size;
    if (costs.components > BUDGETS.components) fail('director-model-budget');
  }
  for (const view of views) {
    const buffer = buffers[index(view.buffer, buffers)]!; const offset = integer(view.byteOffset ?? 0); const length = integer(view.byteLength, 1);
    if (offset + length > buffer.length) fail();
    if (view.byteStride !== undefined && (integer(view.byteStride, 4, 252) % 4)) fail();
    if (view.target !== undefined && view.target !== 34962 && view.target !== 34963) fail();
  }
  const widths: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const elements: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  let components = 0; const scans: Array<() => void> = []; const scannedIndices = new Map<number, number>();
  const meshCosts: Array<{ primitives: number; triangles: number; vertices: number }> = [];
  for (const accessor of accessors) {
    if (accessor.sparse !== undefined) fail('director-model-unsupported-sparse');
    const view = views[index(accessor.bufferView, views)]!;
    const width = widths[accessor.componentType]; const size = elements[accessor.type];
    if (!width || !size) fail();
    const count = integer(accessor.count, 1, 1000000); const offset = integer(accessor.byteOffset ?? 0);
    const column = accessor.type.startsWith('MAT') ? Number(accessor.type.slice(3)) : 0;
    const packed = column ? column * Math.ceil(column * width / 4) * 4 : width * size;
    const stride = view.byteStride ?? packed;
    if (offset % width || (offset + (view.byteOffset ?? 0)) % width || stride < packed || stride % width || offset + (count - 1) * stride + packed > view.byteLength) fail();
    if (accessor.normalized !== undefined && (typeof accessor.normalized !== 'boolean' || (accessor.normalized && [5125, 5126].includes(accessor.componentType)))) fail();
    components += count * size; if (components > 8000000) fail('director-model-budget');
    if (accessor.componentType === 5126) {
      const bytes = buffers[view.buffer]!; const base = (view.byteOffset ?? 0) + offset;
      scans.push(() => {
        for (let i = 0; i < count; i++) for (let component = 0; component < size; component++) {
          const componentOffset = column ? Math.floor(component / column) * Math.ceil(column * width / 4) * 4 + component % column * width : component * width;
          if (!Number.isFinite(bytes.readFloatLE(base + i * stride + componentOffset))) fail();
        }
      });
    }
    for (const key of ['min', 'max']) if (accessor[key] !== undefined && (!Array.isArray(accessor[key]) || accessor[key].length !== size || accessor[key].some((n: unknown) => typeof n !== 'number' || !Number.isFinite(n)))) fail();
  }
  for (const mesh of meshes) {
    if (!Array.isArray(mesh.primitives) || !mesh.primitives.length || mesh.primitives.length > 10000) fail();
    const cost = { primitives: mesh.primitives.length, triangles: 0, vertices: 0 };
    for (const primitive of mesh.primitives) {
      if (!primitive || !primitive.attributes || typeof primitive.attributes !== 'object' || Array.isArray(primitive.attributes)) fail();
      const position = accessors[index(primitive.attributes.POSITION, accessors)]!;
      if (position.type !== 'VEC3' || position.componentType !== 5126) fail();
      for (const value of Object.values(primitive.attributes)) if (accessors[index(value, accessors)]!.count !== position.count) fail();
      if (primitive.indices !== undefined) {
        const indices = accessors[index(primitive.indices, accessors)]!;
        if (indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType) || indices.normalized) fail();
        const prior = scannedIndices.get(primitive.indices);
        scannedIndices.set(primitive.indices, Math.min(prior ?? position.count, position.count));
      }
      const mode = integer(primitive.mode ?? 4, 0, 6);
      const count = primitive.indices === undefined ? position.count : accessors[primitive.indices]!.count;
      cost.triangles += mode === 4 ? Math.floor(count / 3) : [5, 6].includes(mode) ? Math.max(0, count - 2) : 0;
      cost.vertices += position.count;
      if (primitive.material !== undefined) index(primitive.material, materials);
      if (primitive.targets !== undefined) {
        if (!Array.isArray(primitive.targets) || primitive.targets.length > 64) fail();
        for (const target of primitive.targets) { if (!target || typeof target !== 'object') fail(); for (const value of Object.values(target)) index(value, accessors); }
      }
    }
    costs.triangleDefinitions += cost.triangles;
    if (costs.triangleDefinitions > BUDGETS.triangleDefinitions) fail('director-model-budget');
    meshCosts.push(cost);
  }
  for (const [id, maximum] of scannedIndices) {
    const indices = accessors[id]!; const view = views[indices.bufferView]!; const bytes = buffers[view.buffer]!;
    const width = widths[indices.componentType]!; const base = (view.byteOffset ?? 0) + (indices.byteOffset ?? 0); const stride = view.byteStride ?? width;
    costs.components += indices.count; if (costs.components > BUDGETS.components) fail('director-model-budget');
    scans.push(() => { for (let i = 0; i < indices.count; i++) if (bytes.readUIntLE(base + i * stride, width) >= maximum) fail(); });
  }
  for (const node of nodes) {
    if (node.mesh !== undefined) index(node.mesh, meshes);
    if (node.camera !== undefined) index(node.camera, array(json, 'cameras'));
    if (node.skin !== undefined) index(node.skin, array(json, 'skins'));
    for (const [key, size] of [['translation', 3], ['rotation', 4], ['scale', 3], ['matrix', 16]] as const) {
      if (node[key] !== undefined && (!Array.isArray(node[key]) || node[key].length !== size || node[key].some((n: unknown) => typeof n !== 'number' || !Number.isFinite(n)))) fail();
    }
    if (node.matrix !== undefined && ['translation', 'rotation', 'scale'].some(key => node[key] !== undefined)) fail();
    if (node.children !== undefined && (!Array.isArray(node.children) || new Set(node.children).size !== node.children.length)) fail();
    for (const child of node.children ?? []) index(child, nodes);
  }
  const state = new Uint8Array(nodes.length); const parents = new Uint32Array(nodes.length); const heights = new Uint32Array(nodes.length);
  const visit = (id: number, depth: number): void => {
    if (state[id] === 1 || depth > 128) fail();
    if (state[id] === 2) return;
    state[id] = 1;
    for (const child of nodes[id]!.children ?? []) {
      if (++parents[child]! > 1) fail(); visit(child, depth + 1);
      heights[id] = Math.max(heights[id]!, heights[child]! + 1);
      if (heights[id]! > 128) fail('director-model-budget');
    }
    state[id] = 2;
  };
  nodes.forEach((_, i) => visit(i, 0));
  for (const scene of scenes) { if (!Array.isArray(scene.nodes)) fail(); for (const node of scene.nodes) index(node, nodes); }
  if (json.scene !== undefined) index(json.scene, scenes);
  type Expanded = { primitives: number; triangles: number; vertices: number; instances: number };
  const subtree: Array<Expanded | undefined> = new Array(nodes.length);
  const add = (target: Expanded, source: Expanded): void => {
    for (const key of ['primitives', 'triangles', 'vertices', 'instances'] as const) {
      target[key] += source[key]; if (target[key] > BUDGETS[key]) fail('director-model-budget');
    }
  };
  const aggregate = (id: number): Expanded => {
    if (subtree[id]) return subtree[id]!;
    const node = nodes[id]!; const cost: Expanded = { primitives: 0, triangles: 0, vertices: 0, instances: 0 };
    if (node.mesh !== undefined) add(cost, { ...meshCosts[node.mesh]!, instances: 1 });
    for (const child of node.children ?? []) add(cost, aggregate(child));
    subtree[id] = cost; return cost;
  };
  for (let i = 0; i < nodes.length; i++) aggregate(i);
  for (const scene of scenes) for (const id of scene.nodes) add(costs, aggregate(id));
  if (!scenes.length) for (let i = 0; i < nodes.length; i++) if (!parents[i]) add(costs, aggregate(i));
  for (const image of images) if (image.bufferView !== undefined) {
    index(image.bufferView, views); if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) fail();
  }
  for (const texture of textures) { index(texture.source, images); if (texture.sampler !== undefined) index(texture.sampler, samplers); }
  for (const material of materials) {
    for (const info of [material.normalTexture, material.occlusionTexture, material.emissiveTexture, material.pbrMetallicRoughness?.baseColorTexture, material.pbrMetallicRoughness?.metallicRoughnessTexture]) if (info !== undefined) { if (!info) fail(); index(info.index, textures); }
  }
  for (const skin of array(json, 'skins')) {
    if (!Array.isArray(skin.joints) || !skin.joints.length) fail();
    for (const joint of skin.joints) index(joint, nodes);
    if (skin.skeleton !== undefined) index(skin.skeleton, nodes);
    if (skin.inverseBindMatrices !== undefined) { const accessor = accessors[index(skin.inverseBindMatrices, accessors)]!; if (accessor.type !== 'MAT4' || accessor.componentType !== 5126 || accessor.count < skin.joints.length) fail(); }
  }
  for (const animation of array(json, 'animations')) {
    if (!Array.isArray(animation.channels) || !Array.isArray(animation.samplers)) fail();
    for (const sampler of animation.samplers) { if (!sampler) fail(); index(sampler.input, accessors); index(sampler.output, accessors); if (sampler.interpolation !== undefined && !['LINEAR', 'STEP', 'CUBICSPLINE'].includes(sampler.interpolation)) fail(); }
    for (const channel of animation.channels) { if (!channel?.target) fail(); index(channel.sampler, animation.samplers); index(channel.target.node, nodes); if (!['translation', 'rotation', 'scale', 'weights'].includes(channel.target.path)) fail(); }
  }
  return { costs, scans };
}
function validateImage(bytes: Buffer, mime: string): { width: number; height: number } {
  const png = bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR';
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  const webp = bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length;
  if (!(mime === 'image/png' ? png : mime === 'image/jpeg' ? jpeg : mime === 'image/webp' ? webp : false)) fail();
  let width = 0; let height = 0;
  if (png) { width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20); }
  if (jpeg) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) fail();
      const marker = bytes[offset + 1]!; offset += 2;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xff) { offset--; continue; }
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      const length = bytes.readUInt16BE(offset); if (length < 2 || offset + length > bytes.length) fail();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) { if (length < 8) fail(); height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break; }
      offset += length;
    }
  }
  if (webp) {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = bytes.toString('ascii', offset, offset + 4); const length = bytes.readUInt32LE(offset + 4); const data = offset + 8;
      if (data + length > bytes.length) fail();
      if (kind === 'VP8X' && length >= 10) { width = bytes.readUIntLE(data + 4, 3) + 1; height = bytes.readUIntLE(data + 7, 3) + 1; break; }
      if (kind === 'VP8L' && length >= 5 && bytes[data] === 0x2f) { const bits = bytes.readUInt32LE(data + 1); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; break; }
      if (kind === 'VP8 ' && length >= 10 && bytes.subarray(data + 3, data + 6).equals(Buffer.from([0x9d, 1, 0x2a]))) { width = bytes.readUInt16LE(data + 6) & 0x3fff; height = bytes.readUInt16LE(data + 8) & 0x3fff; break; }
      offset = data + length + length % 2;
    }
  }
  if (!width || !height) fail();
  if (width > BUDGETS.imageEdge || height > BUDGETS.imageEdge || width * height > BUDGETS.imagePixels) fail('director-model-budget');
  return { width, height };
}
export function validateDirectorModelBundle(main: ModelFile, files: Map<string, ModelFile>) {
  const { json, binary } = main.name.toLowerCase().endsWith('.glb') ? parseGlb(main.bytes) : { json: parseJson(main.bytes), binary: undefined };
  const used = new Set([main.name]);
  const dependencies = new Map<string, string>(); const embeddedUris = new Set<string>();
  const bufferDefinitions = array(json, 'buffers'); const images = array(json, 'images');
  if (images.length > BUDGETS.images) fail('director-model-budget');
  const imageBytes = new Map<object, { bytes: Buffer; mimeType: string }>();
  boundedJson(json, new Set([...bufferDefinitions, ...images]));
  let decodedBytes = 0;
  const local = (uri: unknown, kind: 'buffer' | 'image', image?: object): Buffer => {
    if (typeof uri === 'string' && uri.startsWith('data:')) {
      const match = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(uri);
      if (!match || !match[2] || match[2].length % 4 || !(kind === 'buffer' ? ['application/octet-stream', 'application/gltf-buffer'] : ['image/png', 'image/jpeg', 'image/webp']).includes(match[1]!)) fail();
      decodedBytes += match[2]!.length / 4 * 3; if (decodedBytes > 16 * 1024 * 1024) fail('director-model-budget');
      const bytes = Buffer.from(match[2]!, 'base64'); if (bytes.toString('base64') !== match[2]) fail();
      embeddedUris.add(uri);
      if (kind === 'image' && image) imageBytes.set(image, { bytes, mimeType: match[1]! });
      return bytes;
    }
    const safe = safeName(uri);
    if (!(kind === 'buffer' ? /\.bin$/i : /\.(png|jpe?g|webp)$/i).test(safe)) fail('director-model-path-denied');
    const name = posix.join(posix.dirname(main.name), safe);
    const file = files.get(name); if (!file) fail('director-model-missing-sidecar');
    if (kind === 'image' && image) imageBytes.set(image, { bytes: file.bytes, mimeType: /\.png$/i.test(safe) ? 'image/png' : /\.webp$/i.test(safe) ? 'image/webp' : 'image/jpeg' });
    dependencies.set(safe, name); used.add(name); return file.bytes;
  };
  const buffers: Buffer[] = [];
  for (const [i, buffer] of bufferDefinitions.entries()) {
    integer(buffer.byteLength, 1);
    const bytes = buffer.uri === undefined ? (i === 0 ? binary : undefined) : local(buffer.uri, 'buffer');
    if (!bytes || bytes.length < buffer.byteLength || (buffer.uri === undefined && bytes.length - buffer.byteLength > 3)) fail();
    if (buffer.uri === undefined && bytes.subarray(buffer.byteLength).some(byte => byte !== 0)) fail();
    buffers.push(bytes.subarray(0, buffer.byteLength));
  }
  if (binary && (!bufferDefinitions.length || bufferDefinitions[0]!.uri !== undefined)) fail();
  for (const image of images) {
    if ((image.uri === undefined) === (image.bufferView === undefined)) fail();
    if (image.uri !== undefined) local(image.uri, 'image', image);
  }
  const { costs, scans } = validateGeometry(json, buffers);
  const views = array(json, 'bufferViews');
  for (const image of images) if (image.bufferView !== undefined) {
    const view = views[image.bufferView]!; const offset = view.byteOffset ?? 0;
    imageBytes.set(image, { bytes: buffers[view.buffer]!.subarray(offset, offset + view.byteLength), mimeType: image.mimeType });
  }
  if (used.size !== files.size) fail('director-model-unreferenced-sidecar');
  const validatedImages = images.map(image => {
    const item = imageBytes.get(image); if (!item) fail();
    if (image.mimeType !== undefined && image.mimeType !== item.mimeType) fail();
    return { ...item, ...validateImage(item.bytes, item.mimeType) };
  });
  const pixels = validatedImages.map(image => image.width * image.height);
  costs.texturePixels = pixels.reduce((sum, count) => sum + count, 0);
  // Distinct texture definitions may create separate decoded/GPU copies of one image.
  const textureCopies = new Map<number, number>();
  for (const texture of array(json, 'textures')) textureCopies.set(texture.source, (textureCopies.get(texture.source) ?? 0) + 1);
  for (const [source, copies] of textureCopies) costs.texturePixels += pixels[source]! * Math.max(0, copies - 1);
  if (costs.texturePixels > BUDGETS.texturePixels) fail('director-model-budget');
  for (const scan of scans) scan();
  return { dependencies: [...dependencies].map(([uri, path]) => ({ uri, path })), embeddedUris: [...embeddedUris], costs, images: validatedImages };
}

/** Copy a validated model bundle into a unique project-owned directory; never load external resources. */
export async function importDirectorModel(input: { projectRoot: string; files: DirectorModelFile[]; signal?: AbortSignal; trustedInspect?: DirectorModelTrustedInspect }): Promise<DirectorModelResource> {
  const { projectRoot, files, signal, trustedInspect } = snapshot(input);
  const mains = [...files.values()].filter(file => /\.(glb|gltf)$/i.test(file.name));
  if (mains.length !== 1) fail();
  const main = mains[0]!; const validation = validateDirectorModelBundle(main, files);
  if (validation.images.length && !trustedInspect) fail('director-model-inspector-required');
  if (files.has('manifest.json')) fail('director-model-path-denied');
  const root = resolveProjectPaths(projectRoot).projectRoot;
  const base = 'assets/imported/director-models'; const id = randomUUID();
  const stageRel = `${base}/.${id}.tmp`;
  const stage = resolveProjectRelPath(root, stageRel);
  const committed = resolveProjectRelPath(root, `${base}/${id}`);
  const storageKey = `${base}/${id}/${main.name}`;
  const check = (path: string): void => {
    try {
      assertProjectWriteSafe(path, root);
      const parts = relative(root, path).split('/');
      for (let i = 1; i <= parts.length; i++) {
        const candidate = resolveProjectRelPath(root, parts.slice(0, i).join('/'));
        try { if (lstatSync(candidate).isSymbolicLink()) fail('path-denied'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
    }
    catch (error) { if ((error as { code?: string }).code === 'path-denied') fail('path-denied'); throw error; }
  };
  check(dirname(stage)); mkdirSync(dirname(stage), { recursive: true }); check(stage); mkdirSync(stage);
  try {
    for (const file of files.values()) {
      const path = resolveProjectRelPath(root, `${stageRel}/${file.name}`); signal?.throwIfAborted(); check(path);
      mkdirSync(dirname(path), { recursive: true }); check(path);
      await writeFile(path, file.bytes, { flag: 'wx', mode: 0o600 }); signal?.throwIfAborted(); check(path);
      if (!(await readFile(path)).equals(file.bytes)) fail('director-model-write-failed');
      signal?.throwIfAborted();
    }
    const decodedImages: DirectorModelDecodedImage[] = [];
    for (const image of validation.images) {
      signal?.throwIfAborted();
      const temporary = resolveProjectRelPath(root, `${stageRel}/.inspect-${randomUUID()}`);
      check(temporary);
      try {
        await writeFile(temporary, image.bytes, { flag: 'wx', mode: 0o600 });
        check(temporary); signal?.throwIfAborted();
        const result = await trustedInspect!({ path: temporary, type: 'image', maxBytes: image.bytes.length, signal });
        signal?.throwIfAborted(); check(temporary);
        const fields = dataProperties(result);
        const width = fields.width?.value; const height = fields.height?.value;
        const sameDimensions = (width === image.width && height === image.height) || (width === image.height && height === image.width);
        if (fields.type?.value !== 'image' || fields.mime?.value !== image.mimeType || fields.sizeBytes?.value !== image.bytes.length || !sameDimensions || !(await readFile(temporary)).equals(image.bytes)) fail('director-model-image-unconfirmed');
        decodedImages.push({ sha256: directorModelSha256(image.bytes), bytes: image.bytes.length, mimeType: image.mimeType, width: image.width, height: image.height });
      } finally { check(temporary); if (existsSync(temporary)) unlinkSync(temporary); }
    }
    const manifest = createDirectorModelManifest(id, main, files, validation, decodedImages);
    const manifestText = JSON.stringify(manifest);
    if (Buffer.byteLength(manifestText) > 256 * 1024) fail('director-model-budget');
    const manifestFile = resolveProjectRelPath(root, `${stageRel}/manifest.json`); check(manifestFile);
    await writeFile(manifestFile, manifestText, { flag: 'wx', mode: 0o600 });
    signal?.throwIfAborted(); check(manifestFile);
    if (!(await readFile(manifestFile)).equals(Buffer.from(manifestText))) fail('director-model-write-failed');
    check(stage); check(committed); signal?.throwIfAborted();
    if (existsSync(committed)) fail('director-model-write-failed');
    renameSync(stage, committed);
    return verifyDirectorModel({ projectRoot: root, reference: storageKey });
  } finally {
    check(stage); if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}
