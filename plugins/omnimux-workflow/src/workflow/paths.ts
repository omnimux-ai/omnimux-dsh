import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Resolve the official DSH home, matching the hub auth/store.js convention.
 */
export function resolveDshHome(
  homeDir: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return homeDir || env.DSH_HOME || join(homedir(), '.dsh');
}

export interface WorkflowPaths {
  /** Plugin-owned root: $DSH_HOME/omnimux/workflow (only writable area). */
  root: string;
  workspacesDir: string;
  executionsDir: string;
  mediaDir: string;
  templatesDir: string;
}

/** All dsh-workflow state lives under `<dsh home>/omnimux/workflow/`. */
export function resolveWorkflowPaths(
  opts: { homeDir?: string; env?: NodeJS.ProcessEnv } = {},
): WorkflowPaths {
  const home = resolveDshHome(opts.homeDir, opts.env);
  const root = join(home, 'omnimux', 'workflow');
  return {
    root,
    // 未绑定项目的工作区画布放在用户级公共目录（与 DSH 的 `_no-cwd` 会话同思路）
    workspacesDir: join(root, 'free'),
    executionsDir: join(root, 'executions'),
    mediaDir: join(root, 'media'),
    templatesDir: join(root, 'templates'),
  };
}
