import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, realpathSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { once } from 'node:events';

const SOURCE_OBSERVATION_TIMEOUT_MS = 20000;
const SOURCE_OBSERVATION_EVENT_LIMIT = 256;
const INSPECTOR_ENDPOINT_RE = /Debugger listening on (ws:\/\/127\.0\.0\.1:(\d+)\/[0-9a-f-]+)/;
const COMPLETION_MARKER = 'SOURCE_OBSERVATION_DONE';

const failure = (code, hint = null) => Object.assign(new Error('SOURCE_OBSERVATION_' + code), {
  code: 'SOURCE_OBSERVATION_' + code,
  ...(hint ? { hint } : {}),
});

function validateRelativeName(name, label) {
  if (typeof name !== 'string' || !name || isAbsolute(name) || name.includes('..')) {
    throw failure('ARGUMENT', { [label]: name });
  }
}

function requireRelative(ownerRoot, canonicalOwner, name, label) {
  validateRelativeName(name, label);
  const full = join(ownerRoot, name);
  const canonical = realpathSync(full);
  if (!canonical.startsWith(canonicalOwner + sep) && canonical !== canonicalOwner) {
    throw failure('ARGUMENT', { path: name, reason: 'outside-owner' });
  }
  const stat = lstatSync(full);
  if (!stat.isFile() || stat.isSymbolicLink()) throw failure('ARGUMENT', { path: name, reason: 'not-file' });
  return { full, canonical };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function timeout(ms, code, detail) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(failure(code, detail)), ms);
    // The timer only bounds a race; it must not keep the parent event loop alive after resolution.
    if (timer?.unref) timer.unref();
  });
}

function decodeWsMessage(data) {
  try { return JSON.parse(String(data)); } catch { return null; }
}

/**
 * Observed only: the VM parsed a script whose bytes exactly match the controlled file.
 * This does not prove activation, product loading, or installation.
 * @param {{rootDir:string, entryName:string, expectedName:string, decoyName?:string, timeoutMs?:number}} options
 */
export async function observeLoadedSource(options = {}) {
  const { rootDir, entryName, expectedName, decoyName, timeoutMs = SOURCE_OBSERVATION_TIMEOUT_MS } = options;
  if (!rootDir || typeof rootDir !== 'string') throw failure('ROOT_REQUIRED');
  validateRelativeName(entryName, 'entryName');
  validateRelativeName(expectedName, 'expectedName');
  if (decoyName !== undefined) validateRelativeName(decoyName, 'decoyName');
  const root = realpathSync(rootDir);
  mkdirSync(root, { recursive: true });
  const owner = realpathSync(root);
  const ownerStat = lstatSync(owner);
  if (!ownerStat.isDirectory() || ownerStat.isSymbolicLink()) throw failure('ROOT_UNSAFE', { root });

  const entry = requireRelative(owner, owner, entryName, 'entryName');
  const expected = requireRelative(owner, owner, expectedName, 'expectedName');
  const decoy = decoyName ? requireRelative(owner, owner, decoyName, 'decoyName') : null;
  const expectedBytes = readFileSync(expected.full);
  const expectedSha256 = sha256(expectedBytes);
  const expectedUrl = new URL(`file://${expected.canonical}`).href;
  const decoyUrl = decoy ? new URL(`file://${decoy.canonical}`).href : null;

  const childEnv = {
    PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}/usr/bin:/bin`,
    HOME: owner,
    LC_ALL: 'C',
  };
  const child = spawn(process.execPath, [
    '--inspect=127.0.0.1:0',
    '--inspect-publish-uid=stderr',
    entry.full,
  ], { cwd: owner, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });

  const raw = { stdout: '', stderr: '' };
  const scripts = [];
  let endpoint = null;
  let sourceValue = null;
  let sourceError = null;
  let socket = null;
  let seq = 0;
  const pending = new Map();
  const deadline = Date.now() + Math.min(timeoutMs, SOURCE_OBSERVATION_TIMEOUT_MS);
  const state = { exit: null, closed: false };

  const send = (method, params = {}) => {
    const id = ++seq;
    socket.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise((resolve, reject) => pending.set(id, { resolve, reject })),
      timeout(Math.max(1, deadline - Date.now()), 'INSPECTOR_RESPONSE_TIMEOUT', { method }),
    ]);
  };

  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        const onData = (data) => {
          raw.stderr += data.toString();
          if (endpoint) return;
          const match = raw.stderr.match(INSPECTOR_ENDPOINT_RE);
          if (!match) return;
          endpoint = new URL(match[1]);
          if (endpoint.hostname !== '127.0.0.1' || !endpoint.port || Number(endpoint.port) <= 0) {
            reject(failure('UNSAFE_ENDPOINT', { endpoint: String(endpoint) }));
            return;
          }
          resolve();
        };
        child.stderr.on('data', onData);
        child.once('error', reject);
        child.once('exit', () => reject(failure('CHILD_EXIT_BEFORE_ENDPOINT', { stderr: raw.stderr.slice(-4096) })));
      }),
      timeout(Math.max(1, deadline - Date.now()), 'ENDPOINT_TIMEOUT', { stderr: 'inspector endpoint not published' }),
    ]);

    let markerSeen = false;
    child.stdout.on('data', (data) => {
      raw.stdout += data.toString();
      if (raw.stdout.includes(COMPLETION_MARKER)) markerSeen = true;
    });
    child.once('exit', (code, signal) => { state.exit = { code, signal }; });

    socket = new WebSocket(String(endpoint));
    await Promise.race([
      once(socket, 'open'),
      timeout(Math.max(1, deadline - Date.now()), 'WS_CONNECT_TIMEOUT', { endpoint: String(endpoint) }),
    ]);

    socket.addEventListener('message', (event) => {
      const message = decodeWsMessage(event.data);
      if (!message) return;
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      } else if (message.method === 'Debugger.scriptParsed') {
        const params = message.params || {};
        scripts.push(params);
        if (params.url === expectedUrl && params.scriptId && params.isModule === true && !sourceValue) {
          send('Debugger.getScriptSource', { scriptId: params.scriptId })
            .then((result) => { sourceValue = { scriptId: params.scriptId, source: result.scriptSource }; })
            .catch((error) => { sourceError = error; });
        }
      }
      if (scripts.length > SOURCE_OBSERVATION_EVENT_LIMIT) {
        sourceError = sourceError || failure('EVENT_LIMIT', { count: scripts.length });
      }
    });

    await send('Debugger.enable');
    await send('Runtime.runIfWaitingForDebugger');

    const waitDeadline = Date.now() + Math.min(timeoutMs, SOURCE_OBSERVATION_TIMEOUT_MS);
    let markerSettled = null;
    while (Date.now() < waitDeadline) {
      if (sourceValue) break;
      if (sourceError) throw sourceError;
      if (markerSeen && !scripts.some((script) => script.url === expectedUrl)) {
        // The entry already completed its top-level work; no further parse can still arrive.
        markerSettled = markerSettled ?? Date.now() + 150;
        if (Date.now() >= markerSettled) break;
      }
      if (state.exit && !sourceValue) {
        const matching = scripts.find((script) => script.url === expectedUrl && script.isModule === true);
        if (matching && !sourceValue) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!sourceValue) throw failure('SOURCE_NOT_LOADED', { url: expectedUrl, scripts: scripts.length });
    if (sourceError) throw sourceError;

    const expectedText = expectedBytes.toString('utf8');
    if (sourceValue.source !== expectedText) {
      throw failure('SOURCE_MISMATCH', { expectedSha256 });
    }
    const actualSha = sha256(sourceValue.source);
    if (actualSha !== expectedSha256) {
      throw failure('SOURCE_MISMATCH', { expectedSha256, actualSha256: actualSha });
    }

    const matching = scripts.filter((script) => script.url === expectedUrl);
    if (matching.length !== 1) {
      throw failure('AMBIGUOUS_SOURCE', { count: matching.length, url: expectedUrl });
    }
    if (decoyUrl && scripts.some((script) => script.url === decoyUrl)) {
      throw failure('DECOY_LOADED', { url: decoyUrl });
    }

    // Closing the inspector socket ends the session; awaiting a Debugger.disable response can
    // stall when the target already resumed, so teardown is bounded and idempotent instead.
    const socketToClose = socket;
    socket = null;
    try {
      socketToClose.close();
      await Promise.race([
        once(socketToClose, 'close'),
        timeout(2000, 'WS_CLOSE_TIMEOUT', { endpoint: String(endpoint) }),
      ]);
    } catch { /* teardown bounded; session ends with the socket/child anyway */ }
  } finally {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try { socket.close(); } catch { /* best effort */ }
    }
    if (!state.closed) {
      if (!state.exit) {
        child.stdin.end();
        state.exit = await Promise.race([
          new Promise((resolve) => {
            child.once('exit', (code, signal) => resolve({ code, signal }));
          }),
          timeout(1000, 'CHILD_EXIT_TIMEOUT', { pid: child.pid }),
        ]);
      }
      state.closed = true;
      if (!state.exit) {
        child.kill('SIGTERM');
        state.exit = await Promise.race([
          new Promise((resolve) => {
            child.once('exit', (code, signal) => resolve({ code, signal }));
          }),
          timeout(1000, 'CHILD_KILL_TIMEOUT', { pid: child.pid }),
        ]) || { code: null, signal: 'SIGTERM' };
      }
    }
  }

  const childOutcome = state.exit;
  if (childOutcome.code !== 0 || childOutcome.signal) {
    throw failure('CHILD_EXIT', { code: childOutcome.code, signal: childOutcome.signal });
  }
  if (!raw.stdout.includes(COMPLETION_MARKER)) {
    throw failure('COMPLETION_MISSING', { stdout: raw.stdout.slice(-4096) });
  }

  return {
    status: 'observed',
    scope: 'controlled-esm-only',
    activation: 'not-proven',
    productLoaded: 'not-tested',
    scriptId: sourceValue.scriptId,
    url: expectedUrl,
    path: expected.canonical,
    isModule: true,
    bytes: expectedBytes.length,
    sha256: expectedSha256,
    matching: scripts.filter((script) => script.url === expectedUrl).length,
    decoyAbsent: decoyUrl ? !scripts.some((script) => script.url === decoyUrl) : true,
    exit: childOutcome,
    observations: {
      endpoint: String(endpoint),
      childPid: child.pid,
      eventCount: scripts.length,
      rawReceipts: { stdout: raw.stdout.slice(-4096), stderr: raw.stderr.slice(-4096) },
    },
  };
}
