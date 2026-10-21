import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DESKTOP_APPS, inspectMainPids, listMainPids, restartDesktopApp } from './app-restart.mjs';

/**
 * Fake process table + runner.
 * quitEffect: exits | hangs | rejected | inspect-fail
 * quitDelayPolls: how many pgrep calls after the quit request before the
 * process disappears (models a slow but successful graceful quit).
 */
function probe({
  pids = [],
  quitEffect = 'exits',
  quitDelayPolls = 0,
  psStatus = 0,
  launchPid = '900',
  addOnLaunch = true,
} = {}) {
  const calls = [];
  const sleeps = [];
  const instances = pids.map((pid) => ({
    pid,
    command: `${DESKTOP_APPS.dev.bundle}/Contents/MacOS/OmniMux`,
  }));
  let quitStarted = false;
  let remainingPolls = quitDelayPolls;
  const run = (command, args, options = {}) => {
    calls.push({ command, args, options, text: [command].concat(args).join(' ') });
    if (command === 'pgrep') {
      if (quitEffect === 'inspect-fail') return { status: 2, stdout: '' };
      if (quitStarted && quitEffect === 'delayed' && remainingPolls > 0) {
        remainingPolls -= 1;
        if (remainingPolls === 0) instances.length = 0;
      }
      const executable = args[1] ?? args[0];
      const matched = instances.filter((entry) => entry.command.startsWith(executable));
      return matched.length
        ? { status: 0, stdout: `${matched.map((entry) => entry.pid).join('\n')}\n` }
        : { status: 1, stdout: '' };
    }
    if (command === 'ps') {
      if (psStatus !== 0) return { status: psStatus, stdout: '' };
      const found = instances.find((entry) => entry.pid === args[1]);
      return found ? { status: 0, stdout: `${found.command}\n` } : { status: 1, stdout: '' };
    }
    if (command === 'osascript') {
      if (quitEffect === 'rejected') return { status: 1, stdout: '', stderr: 'execution error: not authorized (-1743)' };
      quitStarted = true;
      if (quitEffect === 'exits') instances.length = 0;
      return { status: 0, stdout: '' };
    }
    return { status: 0, stdout: '' };
  };
  const launch = (name) => {
    if (addOnLaunch) {
      instances.push({ pid: launchPid, command: `${DESKTOP_APPS.dev.bundle}/Contents/MacOS/OmniMux` });
    }
    return { status: launchStatus };
  };
  let launchStatus = 0;
  return {
    run,
    calls,
    sleeps,
    launch,
    setLaunchStatus(status) { launchStatus = status; },
    sleep(ms) { sleeps.push(ms); },
    osascriptCalls() { return calls.filter((entry) => entry.command === 'osascript'); },
    noKill() { return !calls.some((entry) => /(^|\s)(pkill|kill)(\s|$)/.test(entry.text)); },
  };
}

test('app-restart rejects an unknown target without touching processes', () => {
  const fake = probe();
  const result = restartDesktopApp('staging', { run: fake.run });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid-target');
  assert.deepEqual(fake.calls, []);
});

test('app-restart reports inspection failure instead of assuming not running', () => {
  const fake = probe({ quitEffect: 'inspect-fail' });
  const result = restartDesktopApp('dev', { run: fake.run, sleep: fake.sleep });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'inspect-failed');
  assert.match(result.detail, /pgrep 退出码 2/);
  assert.ok(!fake.calls.some((entry) => entry.command === 'osascript'));
  assert.ok(!fake.calls.some((entry) => entry.command === 'open'));
});

test('app-restart reports ps failure as inspection failure', () => {
  const fake = probe({ pids: ['4242'], psStatus: 1 });
  const result = restartDesktopApp('dev', { run: fake.run, sleep: fake.sleep });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'inspect-failed');
  assert.match(result.detail, /ps -p 4242 退出码 1/);
});

test('app-restart launches when the app is not running and confirms the new pid', () => {
  const fake = probe({ launchPid: '777' });
  const result = restartDesktopApp('dev', {
    run: fake.run,
    sleep: fake.sleep,
    launch: fake.launch,
    waitMs: 0,
    launchWaitMs: 0,
  });
  assert.deepEqual(result, { ok: true, status: 'launched', pid: '777' });
  assert.deepEqual(fake.osascriptCalls(), []);
  assert.ok(fake.noKill());
});

test('app-restart refuses concurrent instances without quitting or launching', () => {
  const fake = probe({ pids: ['100', '200'] });
  const result = restartDesktopApp('dev', {
    run: fake.run,
    sleep: fake.sleep,
    launch: fake.launch,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'shared-instance');
  assert.deepEqual(fake.osascriptCalls(), []);
  assert.ok(!fake.calls.some((entry) => entry.command === 'open'));
  assert.ok(fake.noKill());
});

test('app-restart reports a rejected quit request with its stderr and never launches', () => {
  const fake = probe({ pids: ['4242'], quitEffect: 'rejected' });
  const result = restartDesktopApp('dev', {
    run: fake.run,
    sleep: fake.sleep,
    launch: fake.launch,
    waitMs: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'quit-request-failed');
  assert.equal(result.pid, '4242');
  assert.match(result.detail, /-1743/);
  assert.ok(!fake.calls.some((entry) => entry.command === 'open'));
  assert.ok(fake.noKill());
});

test('app-restart quits the exact app target and waits until it disappears', () => {
  const fake = probe({ pids: ['4242'], quitEffect: 'delayed', quitDelayPolls: 2 });
  const result = restartDesktopApp('dev', {
    run: fake.run,
    sleep: fake.sleep,
    launch: fake.launch,
    waitMs: 5_000,
    launchWaitMs: 0,
    pollMs: 10,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'restarted');
  const quit = fake.osascriptCalls()[0];
  assert.ok(quit.text.includes('tell application "OmniMux Dev" to quit'), quit.text);
  assert.ok(fake.sleeps.length > 0, '必须真正等待退出');
  assert.equal(fake.sleeps[0], 10, 'sleep 使用 pollMs');
  assert.ok(fake.noKill());
});

test('app-restart reports quit-timeout when the app stays alive', () => {
  const fake = probe({ pids: ['4242'], quitEffect: 'hangs' });
  const result = restartDesktopApp('dev', {
    run: fake.run,
    sleep: fake.sleep,
    launch: fake.launch,
    waitMs: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'quit-timeout');
  assert.ok(!fake.calls.some((entry) => entry.command === 'open'));
  assert.ok(fake.noKill());
});

test('app-restart reports launch-failed after a successful quit', () => {
  const fake = probe({ pids: ['4242'] });
  fake.setLaunchStatus(null);
  const result = restartDesktopApp('dev', {
    run: fake.run,
    sleep: fake.sleep,
    launch: fake.launch,
    waitMs: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'launch-failed');
});

test('app-restart reports launch-unconfirmed when open succeeds but no pid appears', () => {
  const fake = probe({ pids: ['4242'] });
  fake.setLaunchStatus(0);
  const result = restartDesktopApp('dev', {
    run: fake.run,
    sleep: fake.sleep,
    launch: (name) => { assert.equal(name, DESKTOP_APPS.dev.name); return { status: 0 }; },
    waitMs: 0,
    launchWaitMs: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'launch-unconfirmed');
});

test('inspectMainPids filters shell and helper processes that only mention the path', () => {
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
  assert.deepEqual(inspectMainPids(run, bundle), { status: 'ok', pids: ['10'] });
  assert.deepEqual(listMainPids(run, bundle), ['10']);
});
