import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import { checkLimit, failure, reject, resolveLimits } from './install-validation-contract.js';
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const offsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get;
const lengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
/** Copy bounded caller bytes synchronously, validate in an isolated worker, and await its exit. */
export function validateInstallPackage(input, options = {}) {
    try {
        const signal = options.signal;
        const limits = resolveLimits(options.limits);
        if (signal?.aborted)
            return Promise.resolve({ ok: false, code: 'VALIDATION_ABORTED', reason: 'ABORTED' });
        if (!input || types.isProxy(input))
            reject('PACKAGE_FORMAT', 'INPUT_FORMAT');
        // Read only own data descriptors: admission must not invoke caller getters or proxy traps.
        const formatField = Object.getOwnPropertyDescriptor(input, 'format');
        const nameField = Object.getOwnPropertyDescriptor(input, 'fileName');
        const bytesField = Object.getOwnPropertyDescriptor(input, 'bytes');
        if (!formatField || !('value' in formatField) || !nameField || !('value' in nameField))
            reject('PACKAGE_FORMAT', 'INPUT_FORMAT');
        const format = formatField.value;
        const fileName = nameField.value;
        if ((format !== 'zip' && format !== 'markdown') || typeof fileName !== 'string')
            reject('PACKAGE_FORMAT', 'INPUT_FORMAT');
        if (format === 'markdown' ? fileName !== 'SKILL.md' : !/\.zip$/i.test(fileName))
            reject('PACKAGE_FORMAT', 'FILE_NAME');
        if (!bytesField || !('value' in bytesField)) {
            // An accessor cannot establish the ZIP input budget without executing untrusted code.
            reject(format === 'zip' ? 'PACKAGE_LIMIT' : 'PACKAGE_FORMAT', 'INPUT_BYTES_DESCRIPTOR');
        }
        const bytes = bytesField.value;
        if (!types.isUint8Array(bytes))
            reject('PACKAGE_FORMAT', 'UNSHARED_BYTES_REQUIRED');
        const backing = bufferGetter.call(bytes);
        if (!types.isArrayBuffer(backing))
            reject('PACKAGE_FORMAT', 'UNSHARED_BYTES_REQUIRED');
        const byteOffset = offsetGetter.call(bytes);
        const byteLength = lengthGetter.call(bytes);
        checkLimit(byteLength, format === 'zip' ? limits.zipBytes : limits.skillBytes, 'INPUT_BYTES');
        // A native view bypasses shadowed properties/iterators; construction also rejects detachment.
        const source = new Uint8Array(backing, byteOffset, byteLength);
        const copy = new Uint8Array(byteLength);
        copy.set(source);
        const started = performance.now();
        const worker = new Worker(new URL('./install-validation-worker.js', import.meta.url), {
            workerData: { bytes: copy.buffer, format, limits }, transferList: [copy.buffer],
        });
        return new Promise(resolve => {
            let result = null;
            let stopping = false;
            const stop = (next) => {
                if (stopping)
                    return;
                stopping = true;
                result = next;
                // The promise resolves only in 'exit'; terminate completion alone is not the result event.
                void worker.terminate().catch(() => { result = { ok: false, code: 'PACKAGE_FORMAT', reason: 'WORKER_TERMINATION' }; });
            };
            const abort = () => stop({ ok: false, code: 'VALIDATION_ABORTED', reason: 'ABORTED' });
            const timeout = () => stop({ ok: false, code: 'VALIDATION_TIMEOUT', reason: 'DEADLINE' });
            const timer = setTimeout(timeout, Math.max(0, limits.timeoutMs - (performance.now() - started)));
            worker.on('message', (message) => {
                if (performance.now() - started >= limits.timeoutMs)
                    timeout();
                else
                    stop(message);
            });
            worker.on('error', () => stop({ ok: false, code: 'PACKAGE_FORMAT', reason: 'WORKER_FAILURE' }));
            worker.once('exit', () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                resolve(result ?? { ok: false, code: 'PACKAGE_FORMAT', reason: 'WORKER_EXIT' });
            });
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted)
                abort();
        });
    }
    catch (error) {
        return Promise.resolve(failure(error));
    }
}
