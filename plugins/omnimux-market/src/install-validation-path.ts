import common from '@unicode/unicode-15.1.0/Case_Folding/C/symbols.js';
import full from '@unicode/unicode-15.1.0/Case_Folding/F/symbols.js';
import { checkLimit, reject, type ValidationLimits } from './install-validation-contract.js';

// The published CJS modules expose Maps, while their declarations use ESM default.
// Check the actual runtime boundary rather than patching third-party declarations.
function foldingMap(value: unknown): ReadonlyMap<string, string> {
  if (!(value instanceof Map)) throw new Error('Invalid Unicode folding data');
  for (const [key, replacement] of value) {
    if (typeof key !== 'string' || typeof replacement !== 'string') throw new Error('Invalid Unicode folding data');
  }
  return value as ReadonlyMap<string, string>;
}
const commonMap = foldingMap(common);
const fullMap = foldingMap(full);

/** Unicode 15.1 default full folding: C/F only, followed by NFC. */
export function pathKey(path: string): string {
  return Array.from(path, character => fullMap.get(character) ?? commonMap.get(character) ?? character).join('').normalize('NFC');
}

/** Portable offline path checks, not a claim that a future destination is writable. */
export function normalizePath(name: string, limits: ValidationLimits): { path: string; directory: boolean } {
  const directory = name.endsWith('/');
  const raw = directory ? name.slice(0, -1) : name;
  if (!raw || /[\\\x00-\x1f\x7f:<>"|?*]/u.test(raw) || raw.startsWith('/')) reject('UNSAFE_PATH', 'PATH_SYNTAX');
  const components = raw.split('/').map(part => part.normalize('NFC'));
  for (const part of components) {
    if (!part || part === '.' || part === '..' || /[. ]$/u.test(part)
        || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part)) reject('UNSAFE_PATH', 'PATH_COMPONENT');
    checkLimit(Buffer.byteLength(part), limits.componentBytes, 'COMPONENT_BYTES');
  }
  const path = components.join('/');
  checkLimit(components.length, limits.depth, 'PATH_DEPTH');
  checkLimit(Array.from(path).length, limits.pathCodePoints, 'PATH_CODE_POINTS');
  checkLimit(Buffer.byteLength(path), limits.pathBytes, 'PATH_BYTES');
  return { path, directory };
}

/** Detect explicit duplicates and conflicts with implicit parent directories. */
export function checkPathSet(entries: readonly { path: string; directory: boolean }[]): void {
  const explicit = new Set<string>();
  const kinds = new Map<string, boolean>();
  const spelling = new Map<string, string>();
  for (const entry of entries) {
    const components = entry.path.split('/');
    for (let i = 1; i <= components.length; i++) {
      const path = components.slice(0, i).join('/');
      const key = pathKey(path);
      const directory = i < components.length || entry.directory;
      const previous = spelling.get(key);
      if (previous !== undefined && previous !== path) reject('UNSAFE_PATH', 'PATH_COLLISION');
      if (kinds.has(key) && kinds.get(key) !== directory) reject('UNSAFE_PATH', 'FILE_DIRECTORY_CONFLICT');
      if (i === components.length) {
        if (explicit.has(key)) reject('UNSAFE_PATH', 'DUPLICATE_PATH');
        explicit.add(key);
      }
      kinds.set(key, directory);
      spelling.set(key, path);
    }
  }
}
