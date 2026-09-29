#!/usr/bin/env node
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const tmpDir = '.tmp'
if (existsSync(tmpDir)) {
  for (const entry of readdirSync(tmpDir)) {
    if (entry === 'AGENTS.md') continue
    rmSync(join(tmpDir, entry), { recursive: true, force: true })
  }
}
