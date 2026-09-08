import { isAlias, isMap, isScalar, isSeq, parseAllDocuments } from 'yaml';
import { checkLimit, reject } from './install-validation-contract.js';
/** Decode without replacement characters; a single leading BOM is handled by the caller. */
export function strictUtf8(bytes, code) {
    try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    }
    catch {
        return reject(code, 'INVALID_UTF8');
    }
}
/** Validate bounded YAML AST before projecting display-only metadata. */
export function validateMarkdown(bytes, limits) {
    checkLimit(bytes.length, limits.skillBytes, 'SKILL_BYTES');
    const start = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 3 : 0;
    const text = strictUtf8(bytes.subarray(start), 'INVALID_SKILL');
    if (!text.startsWith('---\n') && !text.startsWith('---\r\n'))
        reject('INVALID_SKILL', 'FRONTMATTER_REQUIRED');
    const firstEnd = bytes.indexOf(10, start) + 1;
    let cursor = firstEnd;
    let closeStart = -1;
    let closeEnd = -1;
    while (cursor <= bytes.length) {
        const newline = bytes.indexOf(10, cursor);
        const end = newline === -1 ? bytes.length : newline;
        const lineEnd = end > cursor && bytes[end - 1] === 13 ? end - 1 : end;
        if (lineEnd - cursor === 3 && bytes.subarray(cursor, lineEnd).equals(Buffer.from('---'))) {
            closeStart = cursor;
            closeEnd = newline === -1 ? end : end + 1;
            break;
        }
        if (end - start > limits.frontmatterBytes)
            reject('PACKAGE_LIMIT', 'FRONTMATTER_BYTES');
        if (newline === -1)
            break;
        cursor = newline + 1;
    }
    if (closeEnd < 0)
        reject('INVALID_SKILL', 'FRONTMATTER_UNCLOSED');
    checkLimit(closeEnd - start, limits.frontmatterBytes, 'FRONTMATTER_BYTES');
    if (!strictUtf8(bytes.subarray(closeEnd), 'INVALID_SKILL').trim())
        reject('INVALID_SKILL', 'EMPTY_BODY');
    const yaml = strictUtf8(bytes.subarray(firstEnd, closeStart), 'INVALID_SKILL');
    const documents = parseAllDocuments(yaml, {
        version: '1.2', strict: true, uniqueKeys: true, stringKeys: true,
        customTags: [], resolveKnownTags: false, merge: false, logLevel: 'silent',
    });
    if (documents.length !== 1)
        reject('INVALID_SKILL', 'MULTIPLE_YAML_DOCUMENTS');
    const document = documents[0];
    if (document.errors.length || document.warnings.length || !isMap(document.contents)) {
        reject('INVALID_SKILL', 'INVALID_YAML');
    }
    // Iterative traversal also covers metadata that is not part of the display whitelist.
    const pending = [document.contents];
    while (pending.length) {
        const node = pending.pop();
        if (isAlias(node))
            reject('INVALID_SKILL', 'YAML_ALIAS');
        if (isMap(node) || isSeq(node) || isScalar(node)) {
            if (node.tag)
                reject('INVALID_SKILL', 'YAML_TAG');
            if (isMap(node)) {
                for (const item of node.items) {
                    if (!isScalar(item.key) || typeof item.key.value !== 'string')
                        reject('INVALID_SKILL', 'YAML_KEY');
                    pending.push(item.key, item.value);
                }
            }
            else if (isSeq(node))
                pending.push(...node.items);
        }
    }
    const name = document.get('name');
    const description = document.get('description');
    const version = document.get('version');
    // Same invocation-name grammar as the repository's public Registry contract tests.
    if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
        || typeof description !== 'string' || !description.trim()) {
        reject('INVALID_SKILL', 'INVALID_METADATA');
    }
    return { name, description, version: typeof version === 'string' && version.trim() ? version : null };
}
