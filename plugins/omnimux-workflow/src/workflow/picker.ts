/**
 * Native file chooser for canvas import (path index, never a copy).
 *
 * macOS drives an AppKit `NSOpenPanel` through JavaScript for Automation
 * (`osascript -l JavaScript`). The panel is owned by the helper process and the
 * app runs as an accessory, so the chooser needs no Automation (Apple Events)
 * permission and shows no temporary Dock icon. The previous
 * `tell application "System Events"` wrapper required `kTCCServiceAppleEvents`,
 * which ad-hoc signed builds can never be granted — every import then failed
 * with `picker-failed`.
 *
 * Other platforms answer `picker-unsupported` (no silent path-typing fallback).
 */
import { spawn } from 'node:child_process';

const PROMPTS = {
  file: '选择要导入的素材',
  directory: '选择要导入的文件夹',
} as const;

export type PickKind = 'file' | 'directory';

export interface PickNativePathDeps {
  platform?: NodeJS.Platform;
  run?: (command: string, argv: string[]) => Promise<{ stdout: string; stderr: string }>;
}

export class PickerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PickerError';
    this.code = code;
  }
}

/**
 * Build the JXA chooser. Keeping the panel inside `osascript` avoids the Apple
 * Events (System Events) TCC dependency entirely; the accessory activation
 * policy keeps the dialog out of the Dock, matching the intent of the earlier
 * dock-bounce fix. The modal answer is 1 for "choose"; anything else is a
 * cancel.
 */
function pickScript(kind: PickKind): string {
  const chooseFiles = kind === 'file';
  const chooseDirectories = kind === 'directory';
  return [
    "ObjC.import('Cocoa');",
    'function run() {',
    '  var app = $.NSApplication.sharedApplication;',
    '  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);',
    '  app.activateIgnoringOtherApps(true);',
    '  var panel = $.NSOpenPanel.openPanel;',
    `  panel.setCanChooseFiles(${chooseFiles});`,
    `  panel.setCanChooseDirectories(${chooseDirectories});`,
    '  panel.setAllowsMultipleSelection(true);',
    `  panel.setMessage(${JSON.stringify(PROMPTS[kind])});`,
    '  panel.setPrompt("选取");',
    '  if (Number(panel.runModal) !== 1) return "";',
    '  var urls = panel.URLs;',
    '  var picked = [];',
    '  for (var i = 0; i < Number(urls.count); i += 1) {',
    '    picked.push(ObjC.unwrap(urls.objectAtIndex(i).path));',
    '  }',
    '  return picked.join("\\n");',
    '}',
  ].join('\n');
}

export function parsePickedPaths(stdout: string): string[] {
  const text = typeof stdout === 'string' ? stdout : '';
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const path = line.replace(/\s+$/, '');
    if (path === '') continue;
    paths.push(path);
  }
  return paths;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const extra = (error as Error & { stderr?: string }).stderr ?? '';
    return `${error.message} ${extra}`;
  }
  return String(error);
}

function isUserCancel(error: unknown): boolean {
  return /User canceled|-128/i.test(messageOf(error));
}

function runCommand(command: string, argv: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk as Buffer));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk as Buffer));
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} exited with code ${code}`) as Error & {
        code?: number | string;
        stderr?: string;
      };
      error.code = code ?? undefined;
      error.stderr = stderr;
      rejectPromise(error);
    });
  });
}

export async function pickNativePath(
  kind: string,
  deps: PickNativePathDeps = {},
): Promise<{ path: string | null; paths: string[] }> {
  if (kind !== 'file' && kind !== 'directory') {
    throw new PickerError('picker-invalid-kind', `unknown pick kind: ${String(kind)}`);
  }
  const platform = deps.platform ?? process.platform;
  if (platform !== 'darwin') {
    throw new PickerError('picker-unsupported', `native picker not supported on ${platform}`);
  }
  const run = deps.run ?? runCommand;
  try {
    const { stdout } = await run('osascript', ['-l', 'JavaScript', '-e', pickScript(kind)]);
    const paths = parsePickedPaths(stdout);
    return { path: paths[0] ?? null, paths };
  } catch (error) {
    if (isUserCancel(error)) return { path: null, paths: [] };
    throw new PickerError('picker-failed', messageOf(error));
  }
}
