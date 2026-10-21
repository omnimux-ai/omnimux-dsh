import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DESKTOP_APPS, listMainPids, restartDesktopApp } from './app-restart.mjs';

/**
 * Fake process table + runner. `quitEffect` decides what the AppleScript quit
 * does: exits | hangs | rejected.
 */
function probe({ pids = [], quitEffect = 'exits' } = {}) {
  const calls = [];
  const instances = pids.map((pid) => ({
    pid,
    command: `${DESKTOP_APPS.dev.bundle}/Contents/MacOS/OmniMux`,
  }));
  const run = (command, args) => {
    calls.push([command].concat(args).join(' '));
    if (command === 'pgrep') {
      const executable = args[1] ?? args[0];
      const matched = instances.filter((entry) => entry.command.startsWith(executable));
      return matched.length
        ? { status: 0, stdout: `${matched.map((entry) => entry.pid).join('\n')}\n` }
        : { status: 1, stdout: '' };
    }
    if (command === 'ps') {
      const found = instances.find((entry) => entry.pid === args[1]);
      return found ? { status: 0, stdout: `${found.command}\n` } : { status: 1, stdout: '' };
    }
    if (command === 'osascript') {
      if (quitEffect === 'rejected') return { status: 1, stdout: '' };
      if (quitEffect === 'exits') instances.length = 0;
      return { status: 0, stdout: '' };
    }
    return { status: 0, stdout: '' };
  };
  return { run, calls };
}

const noKill = (calls) => !calls.some((call) => /(^|\s)(pkill|kill)(\s|$)/.test(call));

test('app-restart rejects an unknown target without touching processes', () => {
  const { run, calls } = probe();
  const result = restartDesktopApp('staging', { run });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid-target');
  assert.deepEqual(calls, []);
});

test('app-restart launches when the app is not running', () => {
  const { run, calls } = probe();
  const launches = [];
  const result = restartDesktopApp('dev', {
    run,
    sleep: () => {},
    launch: (name) => { launches.push(name); return { status: 0 }; },
    waitMs: 0,
  });
  assert.deepEqual(result, { ok: true, status: 'launched' });
  assert.deepEqual(launches, [DESKTOP_APPS.dev.name]);
  assert.ok(!calls.some((call) => call.startsWith('osascript')), '未运行时不发送退出请求');
  assert.ok(noKill(calls));
});

test('app-restart refuses concurrent instances without quitting or launching', () => {
  const { run, calls } = probe({ pids: ['100', '200'] });
  const launches = [];
  const result = restartDesktopApp('dev', {
    run,
    sleep: () => {},
    launch: (name) => { launches.push(name); return { status: 0 }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'shared-instance');
  assert.deepEqual(launches, []);
  assert.ok(!calls.some((call) => call.startsWith('osascript')));
  assert.ok(noKill(calls));
});

test('app-restart reports a rejected quit request and never launches', () => {
  const { run, calls } = probe({ pids: ['4242'], quitEffect: 'rejected' });
  const launches = [];
  const result = restartDesktopApp('dev', {
    run,
    sleep: () => {},
    launch: (name) => { launches.push(name); return { status: 0 }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'quit-request-failed');
  assert.equal(result.pid, '4242');
  assert.deepEqual(launches, []);
  assert.ok(noKill(calls));
});

test('app-restart reports quit-timeout and sends no force kill', () => {
  const { run, calls } = probe({ pids: ['4242'], quitEffect: 'hangs' });
  const launches = [];
  const result = restartDesktopApp('dev', {
    run,
    sleep: () => {},
    launch: (name) => { launches.push(name); return { status: 0 }; },
    waitMs: 0,
    pollMs: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'quit-timeout');
  assert.deepEqual(launches, []);
  assert.ok(noKill(calls));
});

test('app-restart reports launch-failed after a successful quit', () => {
  const { run } = probe({ pids: ['4242'] });
  const result = restartDesktopApp('dev', {
    run,
    sleep: () => {},
    launch: () => ({ status: null }),
    waitMs: 0,
    pollMs: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'launch-failed');
});

test('app-restart reports restarted only after quit and successful launch', () => {
  const { run, calls } = probe({ pids: ['4242'] });
  const launches = [];
  const result = restartDesktopApp('dev', {
    run,
    sleep: () => {},
    launch: (name) => { launches.push(name); return { status: 0 }; },
    waitMs: 0,
    pollMs: 1,
  });
  assert.deepEqual(result, { ok: true, status: 'restarted' });
  assert.deepEqual(launches, [DESKTOP_APPS.dev.name]);
  assert.ok(calls.some((call) => call.startsWith('osascript')));
  assert.ok(noKill(calls));
});

test('listMainPids filters shell and helper processes that only mention the path', () => {
  const bundle = DESKTOP_APPS.dev.bundle;
  const run = (command, args) => {
    if (command === 'pgrep') return { status: 0, stdout: '10\n11\n12\n' };
    if (command === 'ps') {
      if (args[1] === '10') return { status: 0, stdout: `${bundle}/Contents/MacOS/OmniMux\n` };
      if (args[1] === '11') return { status: 0, stdout: `bash -c open ${bundle}/Contents/MacOS/OmniMux\n` };
      return { status: 0, stdout: `${bundle}/Contents/MacOS/OmniMux --type=renderer\n` };
    }
    return { status: 0, stdout: '' };
  };
  assert.deepEqual(listMainPids(run, bundle), ['10']);
});
