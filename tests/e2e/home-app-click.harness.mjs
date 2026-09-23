import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { copyOriginalMetrics, readPreparedContract } from './home-app-click.contracts.mjs';

export function spawnFormalWrapper({ root, out, contract }) {
  readPreparedContract(contract);
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['--test', 'tests/e2e/home-app-click.e2e.test.mjs'], {
      cwd: root, env: { ...process.env, OMX_HOME_APP_E2E: '1',
        OMX_HOME_APP_PREPARED: JSON.stringify(contract), OMX_HOME_APP_QA_OUT: out },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', data => { log += data; });
    child.stderr.on('data', data => { log += data; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, log }));
  });
}

/** Borrow an existing task. Its external owner alone finishes it and cleans its environment. */
export async function runPreparedHomeAppWrapper({ root, out, task, prepare,
  originalMetricsOverride, runWrapper = spawnFormalWrapper }) {
  const report = { prepared: false, wrapperStarted: false, errors: [] };
  await fs.mkdir(out, { recursive: true });
  try {
    const original = copyOriginalMetrics(originalMetricsOverride);
    const preparation = await prepare({ task, page: task.page('p1'), out });
    const contract = { prepared: preparation?.prepared === true, spaceId: task.spaceId,
      originalMetricsOverride: original };
    readPreparedContract(contract);
    Object.assign(report, contract);
    await fs.writeFile(path.join(out, 'prepared.json'), JSON.stringify(contract, null, 2));
    report.wrapperStarted = true;
    const result = await runWrapper({ root, out, contract });
    report.wrapperExit = { code: result.code, signal: result.signal };
    await fs.writeFile(path.join(out, 'wrapper.log'), result.log || '');
    if (result.code !== 0) throw new Error(`Formal wrapper failed: ${result.code ?? result.signal}`);
    return report;
  } catch (error) {
    report.errors = [error.message];
    const failure = new Error(error.message, { cause: error });
    failure.preparedReport = report;
    throw failure;
  } finally {
    await fs.writeFile(path.join(out, 'prepared-run.json'), JSON.stringify(report, null, 2));
  }
}

/** Own only resources created by these factories; prepare must return {prepared:true}.
 * startEnvironment returns {env:{cleanup}, ...}; createTask returns a NEW owned task.
 * originalMetricsOverride describes p1 AFTER prepare, before the formal journey.
 */
export async function runOwnedHomeAppHarness({ root, out, startEnvironment, createTask,
  prepare, originalMetricsOverride, runWrapper = spawnFormalWrapper }) {
  const report = { prepared: false, wrapperStarted: false, errors: [] };
  let task, environment;
  const errors = [];
  await fs.mkdir(out, { recursive: true });
  try {
    const original = copyOriginalMetrics(originalMetricsOverride);
    environment = await startEnvironment();
    task = await createTask();
    Object.assign(report, await runPreparedHomeAppWrapper({ root, out, task,
      originalMetricsOverride: original, runWrapper,
      prepare: context => prepare({ ...context, environment }),
    }));
  } catch (error) {
    if (error.preparedReport) Object.assign(report, error.preparedReport);
    errors.push(error);
  }
  finally {
    try {
      if (task) report.browserCleanup = await task.finish({ keep: [] });
    } catch (error) { errors.push(error); }
    finally {
      try {
        if (environment) report.environmentCleanup = await environment.env.cleanup();
      } catch (error) { errors.push(error); }
    }
    report.errors = errors.map(error => error.message);
    await fs.writeFile(path.join(out, 'owner-lifecycle.json'), JSON.stringify(report, null, 2));
  }
  if (errors.length) throw new AggregateError(errors, report.errors.join('; '));
  return report;
}
