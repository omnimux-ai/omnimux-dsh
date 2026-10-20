#!/usr/bin/env node
/**
 * scripts/dev-launch-env.mjs
 *
 * Shared launch environment for the Electron desktop apps (Dev / Prod).
 *
 * Agent shells usually run inside an Electron host (DeepSeek Harness and other
 * Electron apps) and therefore carry `ELECTRON_RUN_AS_NODE=1`. `open` inherits
 * the caller environment, so an app launched from such a shell boots as a Node
 * process and exits immediately (observed after #3437 / fixed for the ship path
 * in #3442). Every manual launch path must use the same sanitized environment.
 */
import { spawnSync } from 'node:child_process';

/**
 * GUI launch environment: copy the current environment and drop
 * `ELECTRON_RUN_AS_NODE`. Other variables (PATH, DSH_* …) stay untouched, and
 * the input object is never mutated.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {NodeJS.ProcessEnv}
 */
export function devLaunchEnv(env = process.env) {
  const next = { ...env };
  delete next.ELECTRON_RUN_AS_NODE;
  return next;
}

/**
 * Launch an app bundle via macOS `open` with the sanitized environment.
 * `spawn` is injectable and may be a spawnSync wrapper returning only
 * `{ status }` (the reload path injects its own runner).
 * @param {string} name  app name accepted by `open -a` (e.g. `OmniMux Dev`)
 * @param {{
 *   spawn?: (command: string, args: string[], options: { stdio: string, env: NodeJS.ProcessEnv }) => { status: number | null },
 *   env?: NodeJS.ProcessEnv,
 *   stdio?: 'inherit' | 'ignore' | 'pipe',
 * }} [options]
 * @returns {{ status: number | null }}
 */
export function launchApp(name, { spawn = spawnSync, env = devLaunchEnv(), stdio = 'inherit' } = {}) {
  return spawn('open', ['-a', name], { stdio, env });
}
