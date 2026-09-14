import * as fs from 'node:fs';
import { userInfo } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { isAlias, isMap, isScalar, parseDocument, visit } from 'yaml';

const LIMIT = 64 * 1024;
const PREFIX = 'TEST_ENV_CREDENTIAL_';

/** @param {string} suffix */
function failure(suffix) {
  const code = PREFIX + suffix;
  return Object.assign(new Error(code), { code });
}

/** Parse a restricted credentials document without resolving aliases or exposing diagnostics.
 * @param {string} text
 * @returns {string} Secret for the selected child process only; never log this value.
 */
export function parseDevDeepSeekCredential(text) {
  if (typeof text !== 'string') throw failure('INVALID');
  if (Buffer.byteLength(text, 'utf8') > LIMIT) throw failure('TOO_LARGE');
  try {
    const doc = parseDocument(text, { uniqueKeys: true, strict: true, schema: 'core', customTags: [] });
    if (doc.errors.length || doc.warnings.length || !isMap(doc.contents)) throw failure('INVALID');
    visit(doc, (_key, node) => {
      if (node && (isAlias(node) || node.anchor || node.tag)) throw failure('INVALID');
    });
    const refs = doc.contents.get('refs', true);
    if (!isMap(refs)) throw failure('INVALID');
    const key = refs.get('DEEPSEEK_API_KEY', true);
    if (!isScalar(key) || typeof key.value !== 'string' || !key.value.trim()) throw failure('INVALID');
    return key.value.trim();
  } catch {
    throw failure('INVALID');
  }
}

/**
 * Read only the operating-system user's fixed Dev credential path. Dependency overrides
 * are for in-memory tests, not CLI options. No environment or provider fallback is used.
 * @param {{fs?: Pick<typeof fs, 'lstatSync'|'realpathSync'|'openSync'|'fstatSync'|'readSync'|'closeSync'>, userInfo?: () => {homedir: string}}} [deps]
 * @returns {string}
 */
export function readDevDeepSeekCredential(deps = {}) {
  const io = deps.fs ?? fs;
  let fd;
  let bytes;
  try {
    const home = (deps.userInfo ?? userInfo)().homedir;
    if (typeof home !== 'string' || !isAbsolute(home) || resolve(home) !== home) throw failure('PATH_UNSAFE');
    const dev = join(home, '.omnimux-dev');
    const path = join(dev, '.credentials.yaml');
    for (const directory of [home, dev]) {
      const stat = io.lstatSync(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory() || io.realpathSync(directory) !== directory) throw failure('PATH_UNSAFE');
    }
    const before = io.lstatSync(path);
    if (before.isSymbolicLink() || !before.isFile() || io.realpathSync(path) !== path) throw failure('PATH_UNSAFE');
    if (fs.constants.O_NOFOLLOW === undefined || fs.constants.O_NONBLOCK === undefined) throw failure('UNSUPPORTED');
    fd = io.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const opened = io.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw failure('PATH_UNSAFE');
    if (opened.size > LIMIT) throw failure('TOO_LARGE');
    // Recheck the fixed parent and file identity before the first byte is read.
    if (io.realpathSync(dev) !== dev || io.realpathSync(path) !== path) throw failure('PATH_UNSAFE');
    const current = io.lstatSync(path);
    if (current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino) throw failure('PATH_UNSAFE');
    bytes = Buffer.alloc(LIMIT + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = io.readSync(fd, bytes, length, bytes.length - length, length);
      if (count === 0) break;
      length += count;
    }
    if (length > LIMIT) throw failure('TOO_LARGE');
    return parseDevDeepSeekCredential(bytes.subarray(0, length).toString('utf8'));
  } catch (error) {
    if (error instanceof Error && /^TEST_ENV_CREDENTIAL_[A-Z_]+$/.test(error.message)) throw failure(error.message.slice(PREFIX.length));
    throw failure(error?.code === 'ENOENT' ? 'MISSING' : 'UNREADABLE');
  } finally {
    bytes?.fill(0);
    if (fd !== undefined) {
      try { io.closeSync(fd); } catch { throw failure('UNREADABLE'); }
    }
  }
}
