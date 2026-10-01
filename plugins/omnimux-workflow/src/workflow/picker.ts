/**
 * Native file chooser for canvas import (path index, never a copy).
 * macOS uses AppleScript `choose file`. Other platforms: picker-unsupported.
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

function pickScript(kind: PickKind): string {
  const prompt = PROMPTS[kind];
  const choose = kind === 'file' ? 'file' : 'folder';
  return [
    'tell application "System Events"',
    '  activate',
    `  set theItems to choose ${choose} with prompt "${prompt}" with multiple selections allowed`,
    'end tell',
    'set posixPaths to ""',
    'repeat with theItem in theItems',
    'set posixPaths to posixPaths & POSIX path of theItem & linefeed',
    'end repeat',
    'return posixPaths',
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
    const { stdout } = await run('osascript', ['-e', pickScript(kind)]);
    const paths = parsePickedPaths(stdout);
    return { path: paths[0] ?? null, paths };
  } catch (error) {
    if (isUserCancel(error)) return { path: null, paths: [] };
    throw new PickerError('picker-failed', messageOf(error));
  }
}
