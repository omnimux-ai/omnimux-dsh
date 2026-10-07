/**
 * Issue #3237 — dev-only failure recorder + one-command replay.
 *
 * Covers the acceptance table of `specs/dev-replay-entry.spec.md`:
 *   R1 开关默认关闭 → 原样透传、零开销、不建文件
 *   R2 开关开启且成功（2xx）→ 不记录
 *   R3 ≥400 且响应为 JSON → 一行 JSONL，含方法/路径/请求体/响应体/状态/时间
 *   R4 SSE / 文件流分支 → 不记录且不报错（明确边界）
 *   R5 sk-* / Bearer <token> / access_token → 落盘为占位符
 *   R6 请求体超 1MB → 只记 {omitted:true,bytes:N}
 *   R7 条数 / 字节超限 → 裁剪最旧记录
 *   R8 缺失或非 `1` 的开关值 → 一律关闭（生产路径绝不写盘）
 *   R9 重放脚本只面向开发态端口，对生产端口拒绝执行并给出明确提示
 *
 * Run: `node --test scripts/dev-replay.test.mjs`
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEV_FAILURE_FILE_NAME,
  DEV_REPLAY_ENV,
  createDevFailureRecorder,
  isDevReplayEnabled,
  redactText,
  redactValue,
  summarizeBody,
  withDevFailureRecorder,
} from '../plugins/omnimux-workflow/src/workflow/devFailureRecorder.ts';
import {
  DEV_ORIGIN,
  PROD_PORT,
  assertDevOrigin,
  checkRecordedOrigin,
  loadFailures,
  resolveDevFailureFile,
} from './dev-replay.mjs';

const SCRIPT = fileURLToPath(new URL('./dev-replay.mjs', import.meta.url));
const ON = { [DEV_REPLAY_ENV]: '1' };
const cleanups = [];

after(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

/** Fresh, isolated record path — never touches the real $DSH_HOME. */
function tmpFile(name = DEV_FAILURE_FILE_NAME) {
  const dir = mkdtempSync(join(tmpdir(), 'dev-replay-'));
  cleanups.push(dir);
  return join(dir, name);
}

function lines(file) {
  return readFileSync(file, 'utf8').split('\n').filter((line) => line !== '');
}

function records(file) {
  return lines(file).map((line) => JSON.parse(line));
}

function failing(body, status = 500) {
  return { dispatch: async () => ({ status, body }) };
}

// ---------------------------------------------------------------- R1 / R8

test('R1 开关默认关闭：原样透传同一个对象、零开销、不建文件', async () => {
  const file = tmpFile();
  const inner = failing({ error: 'internal' });
  const wrapped = withDevFailureRecorder(inner, { env: {}, file });

  assert.equal(wrapped, inner, '关闭时必须返回入参 dispatcher 本身（无包装、无新增分支）');
  assert.equal(isDevReplayEnabled({}), false);

  const result = await wrapped.dispatch({ method: 'POST', url: '/omnimux-workflow/api/x' });
  assert.deepEqual(result, { status: 500, body: { error: 'internal' } });
  assert.equal(existsSync(file), false, '关闭时不得创建记录文件');
});

test('R1 关闭时 createDevFailureRecorder 不产生任何 IO（目录也不建）', () => {
  const file = join(tmpFile('unused.jsonl'), '..', 'nested', 'dev-failures.jsonl');
  const recorder = createDevFailureRecorder({ env: {}, file });
  assert.equal(recorder.enabled, false);
  assert.equal(recorder.recordFailure({ method: 'POST', url: '/x' }, { status: 500, body: {} }, 1), false);
  assert.equal(existsSync(file), false);
  assert.equal(existsSync(join(file, '..')), false);
});

test('R8 只有显式 `1` 才算 opt-in；缺失 / true / 0 一律关闭且不写盘', async () => {
  const file = tmpFile();
  for (const value of [undefined, '', '0', 'true', 'yes', 'ON']) {
    const env = value === undefined ? {} : { [DEV_REPLAY_ENV]: value };
    assert.equal(isDevReplayEnabled(env), false, `env=${String(value)} 必须视为关闭`);
    const wrapped = withDevFailureRecorder(failing({ error: 'internal' }), { env, file });
    await wrapped.dispatch({ method: 'POST', url: '/omnimux-workflow/api/x' });
  }
  assert.equal(existsSync(file), false, '非 opt-in 值绝不写盘（生产路径默认）');
});

// -------------------------------------------------------------------- R2

test('R2 开关开启但请求成功（2xx）：不记录', async () => {
  const file = tmpFile();
  const wrapped = withDevFailureRecorder(
    { dispatch: async () => ({ status: 200, body: { ok: true } }) },
    { env: ON, file },
  );
  const result = await wrapped.dispatch({ method: 'GET', url: '/omnimux-workflow/api/manifest' });
  assert.equal(result.status, 200);
  assert.equal(existsSync(file), false);
});

// -------------------------------------------------------------------- R3

test('R3 ≥400 且响应为 JSON：追加一行 JSONL，含方法/路径/请求体/响应体/状态/时间', async () => {
  const file = tmpFile();
  const wrapped = withDevFailureRecorder(failing({ error: 'internal', message: 'boom' }), {
    env: ON,
    file,
    now: () => new Date('2026-10-07T03:21:09.123Z'),
  });

  await wrapped.dispatch({
    method: 'POST',
    url: '/omnimux-workflow/api/workspaces/w1/save',
    origin: DEV_ORIGIN,
    referer: `${DEV_ORIGIN}/`,
    secFetchSite: 'same-origin',
    range: 'bytes=0-99',
    body: { name: 'canvas', nodes: [1, 2] },
  });

  const raw = readFileSync(file, 'utf8');
  assert.ok(raw.endsWith('\n'), 'JSONL 每条记录以换行结尾');
  assert.equal(lines(file).length, 1);

  const [record] = records(file);
  assert.equal(record.method, 'POST');
  assert.equal(record.url, '/omnimux-workflow/api/workspaces/w1/save');
  assert.equal(record.status, 500);
  assert.equal(record.ts, '2026-10-07T03:21:09.123Z');
  assert.ok(Number.isFinite(record.durationMs), '含耗时');
  assert.deepEqual(record.body, { name: 'canvas', nodes: [1, 2] });
  assert.deepEqual(record.responseBody, { error: 'internal', message: 'boom' });
  assert.equal(record.headers.origin, DEV_ORIGIN);
  assert.equal(record.headers.referer, `${DEV_ORIGIN}/`);
  assert.equal(record.headers['sec-fetch-site'], 'same-origin');
  assert.equal(record.headers.range, 'bytes=0-99');
});

test('R3 403 / 404 同样记录，且透传原始响应结果不变', async () => {
  const file = tmpFile();
  let n = 0;
  const results = [
    { status: 403, body: { error: 'not-local' } },
    { status: 404, body: { error: 'not-found' } },
  ];
  const wrapped = withDevFailureRecorder({ dispatch: async () => results[n++] }, { env: ON, file });

  const first = await wrapped.dispatch({ method: 'POST', url: '/omnimux-workflow/api/x' });
  const second = await wrapped.dispatch({ method: 'GET', url: '/omnimux-workflow/api/nope' });

  assert.deepEqual(first, results[0], '装饰器不得改写 dispatch 结果');
  assert.deepEqual(second, results[1]);
  assert.deepEqual(
    records(file).map((record) => record.status),
    [403, 404],
  );
});

test('R3 handleAudioRequest 原样透传（不在记录范围内）', async () => {
  const file = tmpFile();
  let called = 0;
  const inner = {
    dispatch: async () => ({ status: 500, body: {} }),
    handleAudioRequest: async () => {
      called += 1;
      return true;
    },
  };
  const wrapped = withDevFailureRecorder(inner, { env: ON, file });
  assert.equal(await wrapped.handleAudioRequest({}, {}), true);
  assert.equal(called, 1);
});

// -------------------------------------------------------------------- R4

test('R4 SSE / 文件流分支：不记录，也不抛错', async () => {
  const file = tmpFile();
  let n = 0;
  const results = [
    { status: 500, file: '/tmp/never-served.bin' },
    { status: 500, sse: { context: { id: 'x' }, eventLog: [] } },
  ];
  const wrapped = withDevFailureRecorder({ dispatch: async () => results[n++] }, { env: ON, file });

  const fromFile = await wrapped.dispatch({ method: 'GET', url: '/omnimux-workflow/api/media/1' });
  const fromSse = await wrapped.dispatch({ method: 'GET', url: '/omnimux-workflow/api/executions/1/events' });

  assert.equal('file' in fromFile, true);
  assert.equal('sse' in fromSse, true);
  assert.equal(existsSync(file), false, '不可 JSON 序列化的分支明确不覆盖');
});

// -------------------------------------------------------------------- R5

test('R5 脱敏：sk-* / Bearer <token> / access_token 落盘为占位符', async () => {
  const file = tmpFile();
  const skKey = 'sk-proj-ABCDEFGH12345678';
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.header-payload.signature';
  const oauthToken = 'ya29.GOOGLE-OAUTH-SECRET';
  const inlineKey = `sk-${'a'.repeat(24)}`;

  const wrapped = withDevFailureRecorder(
    failing({
      error: 'refused',
      access_token: oauthToken,
      message: `upstream said Bearer ${jwt}`,
      echo: `token=${skKey}`,
    }),
    { env: ON, file },
  );

  await wrapped.dispatch({
    method: 'POST',
    url: '/omnimux-workflow/api/x',
    body: {
      authorization: `Bearer ${jwt}`,
      apiKey: skKey,
      nested: { refresh_token: oauthToken, inline: inlineKey },
      query: `access_token=${oauthToken}`,
      list: [`sk-${'b'.repeat(16)}`],
    },
  });

  const raw = readFileSync(file, 'utf8');
  for (const secret of [skKey, jwt, oauthToken, inlineKey, 'b'.repeat(16)]) {
    assert.equal(raw.includes(secret), false, `落盘内容不得包含明文凭据：${secret.slice(0, 12)}…`);
  }
  assert.ok(raw.includes('[REDACTED]'));

  const [record] = records(file);
  assert.equal(record.body.authorization, '[REDACTED]');
  assert.equal(record.body.apiKey, '[REDACTED]');
  assert.equal(record.body.nested.refresh_token, '[REDACTED]');
  assert.equal(record.body.nested.inline, '[REDACTED]');
  assert.equal(record.body.list[0], '[REDACTED]');
  assert.equal(record.body.query, '[REDACTED]');
  assert.equal(record.responseBody.access_token, '[REDACTED]');
  assert.ok(record.responseBody.message.includes('[REDACTED]'));
  assert.ok(record.responseBody.echo.includes('[REDACTED]'));
});

test('R5 脱敏单元：三种形态各自命中，普通文本不被误伤', () => {
  assert.equal(redactText('k=sk-proj-ABCDEFGH12345678'), 'k=[REDACTED]');
  assert.equal(redactText('Authorization: Bearer abc.def.ghi'), 'Authorization: [REDACTED]');
  assert.equal(redactText('access_token=ya29.SECRET&x=1'), '[REDACTED]&x=1');
  assert.equal(redactText('{"access_token": "ya29.SECRET"}'), '{"[REDACTED]"}');
  assert.equal(redactText('task-1234 and sketch-abc'), 'task-1234 and sketch-abc');
  assert.deepEqual(redactValue({ a: { b: ['x', { password: 'p' }] } }), { a: { b: ['x', { password: '[REDACTED]' }] } });
});

// -------------------------------------------------------------------- R6

test('R6 请求体超 1MB：只记 {omitted:true,bytes:N}，不落原始内容', async () => {
  const file = tmpFile();
  const big = { blob: 'x'.repeat(1024 * 1024 + 16) };
  const expectedBytes = Buffer.byteLength(JSON.stringify(big), 'utf8');
  assert.ok(expectedBytes > 1024 * 1024);

  const wrapped = withDevFailureRecorder(failing({ error: 'body-too-large' }, 413), { env: ON, file });
  await wrapped.dispatch({ method: 'POST', url: '/omnimux-workflow/api/assets/ingest', body: big });

  const raw = readFileSync(file, 'utf8');
  assert.equal(raw.includes('xxxx'), false, '不得内联原始大体积内容');
  const [record] = records(file);
  assert.deepEqual(record.body, { omitted: true, bytes: expectedBytes });
});

test('R6 响应体同样适用体积上限；阈值以下照常记录', () => {
  const big = { blob: 'y'.repeat(64) };
  assert.deepEqual(summarizeBody(big, 32), { omitted: true, bytes: Buffer.byteLength(JSON.stringify(big), 'utf8') });
  assert.deepEqual(summarizeBody({ ok: 1 }, 1024), { ok: 1 });
  assert.equal(summarizeBody(undefined, 1024), undefined);
});

// -------------------------------------------------------------------- R7

test('R7 条数上限：超出后裁剪最旧记录，保留最新 N 条', async () => {
  const file = tmpFile();
  const wrapped = withDevFailureRecorder(failing({ error: 'internal' }), { env: ON, file, maxEntries: 3 });

  for (let i = 1; i <= 6; i += 1) {
    await wrapped.dispatch({ method: 'POST', url: `/omnimux-workflow/api/fail/${i}` });
  }

  const kept = records(file);
  assert.equal(kept.length, 3);
  assert.deepEqual(
    kept.map((record) => record.url),
    ['/omnimux-workflow/api/fail/4', '/omnimux-workflow/api/fail/5', '/omnimux-workflow/api/fail/6'],
    '保留最新三条，最旧的被裁掉',
  );
});

test('R7 字节上限：超出后裁剪最旧记录，且文件不再无限增长', async () => {
  const file = tmpFile();
  const wrapped = withDevFailureRecorder(failing({ error: 'internal', padding: 'z'.repeat(64) }), {
    env: ON,
    file,
    maxEntries: 1000,
    maxBytes: 400,
  });

  for (let i = 1; i <= 8; i += 1) {
    await wrapped.dispatch({ method: 'POST', url: `/omnimux-workflow/api/fail/${i}` });
  }

  const raw = readFileSync(file, 'utf8');
  assert.ok(Buffer.byteLength(raw, 'utf8') <= 400, `文件必须受字节上限约束，实际 ${Buffer.byteLength(raw, 'utf8')}`);
  const kept = records(file);
  assert.ok(kept.length >= 1 && kept.length < 8, '发生了裁剪');
  assert.equal(kept[kept.length - 1].url, '/omnimux-workflow/api/fail/8', '最新一条必须保留');
});

test('R7 单条即超上限时仍保留最新一条（不写空文件）', async () => {
  const file = tmpFile();
  const wrapped = withDevFailureRecorder(failing({ error: 'internal', padding: 'z'.repeat(4096) }), {
    env: ON,
    file,
    maxBytes: 64,
  });
  await wrapped.dispatch({ method: 'POST', url: '/omnimux-workflow/api/fail/only' });
  const kept = records(file);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].url, '/omnimux-workflow/api/fail/only');
});

// -------------------------------------------------------------------- R9

describe('R9 重放脚本：只面向开发态端口', () => {
  test('接受 Dev 端口 45120', () => {
    assert.equal(assertDevOrigin(DEV_ORIGIN).port, String(45120));
    assert.equal(assertDevOrigin('http://localhost:45120').hostname, 'localhost');
  });

  test('拒绝生产端口 44200 并给出明确提示', () => {
    assert.throws(
      () => assertDevOrigin(`http://127.0.0.1:${PROD_PORT}`),
      (error) => {
        assert.match(error.message, /refusing to replay against port 44200/);
        assert.match(error.message, /production/);
        assert.match(error.message, /45120/);
        return true;
      },
    );
  });

  test('拒绝其它端口与非 loopback 主机', () => {
    assert.throws(() => assertDevOrigin('http://127.0.0.1:8080'), /refusing to replay against port 8080/);
    assert.throws(() => assertDevOrigin('http://example.com:45120'), /only the local Dev app on loopback/);
    assert.throws(() => assertDevOrigin('https://127.0.0.1:45120'), /the Dev app serves plain http/);
    assert.throws(() => assertDevOrigin('not a url'), /not a valid URL/);
  });

  test('CLI --replay 对生产端口退出码非 0 且提示包含 44200', () => {
    const file = tmpFile();
    const wrapped = createDevFailureRecorder({ env: ON, file });
    wrapped.recordFailure(
      { method: 'POST', url: '/omnimux-workflow/api/x', origin: DEV_ORIGIN },
      { status: 500, body: { error: 'internal' } },
      1,
    );
    assert.equal(loadFailures(file).length, 1);

    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--replay', '1', '--file', file, '--origin', `http://127.0.0.1:${PROD_PORT}`],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0, '必须拒绝执行');
    assert.match(result.stderr, /44200/);
    assert.match(result.stderr, /refusing to replay against port/);
  });

  test('CLI 拒绝「记录本身采自生产端口」的条目，即使目标指向 Dev', () => {
    const file = tmpFile();
    const wrapped = createDevFailureRecorder({ env: ON, file });
    wrapped.recordFailure(
      { method: 'POST', url: '/omnimux-workflow/api/x', origin: `http://127.0.0.1:${PROD_PORT}` },
      { status: 500, body: { error: 'internal' } },
      1,
    );

    const result = spawnSync(process.execPath, [SCRIPT, '--replay', '1', '--file', file], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /record #1 origin/);
    assert.match(result.stderr, /44200/);
    assert.match(result.stderr, /production/);
  });

  test('记录采自另一个 loopback 开发端口：允许重放并显式提示（不静默换目标）', () => {
    // A worktree harness / QA runner binds an ephemeral port; the record is
    // truthful about it and the replay reports the mismatch instead of hiding it.
    assert.deepEqual(checkRecordedOrigin(DEV_ORIGIN).warning, null);
    const other = checkRecordedOrigin('http://127.0.0.1:45199', { label: 'record #1 origin' });
    assert.match(other.warning, /record #1 origin was captured on port 45199/);
    assert.throws(() => checkRecordedOrigin('http://example.com:45120'), /only the local Dev app on loopback/);
  });

  test('CLI --list 列出记录；无记录时提示开关默认关闭', () => {
    const file = tmpFile();
    const wrapped = createDevFailureRecorder({ env: ON, file });
    wrapped.recordFailure(
      { method: 'POST', url: '/omnimux-workflow/api/workspaces/w1/save', origin: DEV_ORIGIN },
      { status: 500, body: { error: 'internal' } },
      7,
    );

    const listed = spawnSync(process.execPath, [SCRIPT, '--list', '--file', file], { encoding: 'utf8' });
    assert.equal(listed.status, 0);
    assert.match(listed.stdout, /1 recorded failure/);
    assert.match(listed.stdout, /POST\s+\/omnimux-workflow\/api\/workspaces\/w1\/save/);

    const empty = spawnSync(process.execPath, [SCRIPT, '--list', '--file', tmpFile()], { encoding: 'utf8' });
    assert.equal(empty.status, 1);
    assert.match(empty.stdout, new RegExp(`${DEV_REPLAY_ENV}=1`));
  });

  test('记录文件路径复用 workflow root（$DSH_HOME/omnimux/workflow）', () => {
    assert.equal(
      resolveDevFailureFile({ DSH_HOME: '/tmp/dev-home' }),
      join('/tmp/dev-home', 'omnimux', 'workflow', DEV_FAILURE_FILE_NAME),
    );
  });
});
