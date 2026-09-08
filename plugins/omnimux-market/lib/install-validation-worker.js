import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { checkLimit, failure, reject, resolveLimits } from './install-validation-contract.js';
import { validateMarkdown } from './install-validation-markdown.js';
import { validateZip } from './install-validation-zip.js';
async function run() {
    let result;
    try {
        const data = workerData;
        if (data.format !== 'zip' && data.format !== 'markdown')
            reject('PACKAGE_FORMAT', 'INPUT_FORMAT');
        const limits = resolveLimits(data.limits);
        // Brand-check and measure the worker's actual ArrayBuffer before hashing or parsing.
        const byteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(data.bytes);
        checkLimit(byteLength, data.format === 'zip' ? limits.zipBytes : limits.skillBytes, 'INPUT_BYTES');
        if (data.format === 'markdown')
            checkLimit(byteLength, limits.totalBytes, 'TOTAL_BYTES');
        const bytes = Buffer.from(data.bytes);
        const contentHash = createHash('sha256').update(bytes).digest('hex');
        const validated = data.format === 'zip' ? await validateZip(bytes, limits) : {
            metadata: validateMarkdown(bytes, limits),
            totalBytes: bytes.length,
            manifest: [{ path: 'SKILL.md', kind: 'file', bytes: bytes.length, sha256: contentHash }],
        };
        result = { ok: true, stage: 'validated', format: data.format, contentHash, inputBytes: bytes.length, ...validated };
    }
    catch (error) {
        result = failure(error);
    }
    parentPort?.postMessage(result);
    parentPort?.close();
}
if (parentPort)
    void run();
