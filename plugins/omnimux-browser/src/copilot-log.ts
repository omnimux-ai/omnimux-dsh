/**
 * Twitter-copilot generation log (Issue #3100): one NDJSON line per
 * generation under the product's own data root. Entries arrive already
 * whitelisted by {@link sanitizeCopilotLogEntry}; this module only appends.
 */

import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** `$DSH_HOME/omnimux-browser/twitter-copilot.ndjson` */
export function copilotLogPath(): string {
  return dshHomePath('omnimux-browser', 'twitter-copilot.ndjson')
}

/** Append one entry; the directory is created on first use. */
export async function appendCopilotLog(entry: Record<string, unknown>, file = copilotLogPath()): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8')
}
