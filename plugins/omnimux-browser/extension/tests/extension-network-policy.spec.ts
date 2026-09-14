// @vitest-environment jsdom
/**
 * The extension talks to models through the local OmniMux/DSH service only.
 *
 * This guards the boundary statically: neither the manifest's extension-page
 * network policy nor any background source may name a model vendor endpoint,
 * carry an embedded bearer credential, or drop the local channel that makes the
 * feature work. Reading the sources keeps the check deterministic and prevents
 * "delete the feature to make the guard green".
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const EXTENSION_ROOT = join(import.meta.dirname, '..')

/**
 * Hosts the extension page is allowed to reach.
 *
 * `https:` was added by the approved design in `specs/browser-attach-media.spec.md`
 * §3.1: lighting a page image downloads it, so the model receives real bytes
 * instead of a URL it may not be able to reach. The extension already declares
 * `host_permissions` for every http and https page and injects them all, so this
 * matches its existing authority — and it stays a scheme, never a vendor
 * endpoint. The rest of this suite still holds that line.
 */
const ALLOWED_CONNECT_HOSTS = new Set([
  'ws://127.0.0.1:*',
  'http://127.0.0.1:*',
  'https://raw.githubusercontent.com',
  'https:',
])

/** Model vendor endpoints that must never appear in shipped extension source. */
const VENDOR_ENDPOINTS = [
  'api.deepseek.com',
  'api.apikey.fun',
  'api.openai.com',
  'api.anthropic.com',
  'api.moonshot.cn',
]

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) found.push(path)
  }
  return found
}

function connectSources(): string[] {
  const manifest = JSON.parse(readFileSync(join(EXTENSION_ROOT, 'manifest.json'), 'utf8')) as {
    content_security_policy?: { extension_pages?: string }
  }
  const policy = manifest.content_security_policy?.extension_pages ?? ''
  const directive = policy.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('connect-src'))
  return directive === undefined ? [] : directive.split(/\s+/).slice(1)
}

describe('the extension network boundary', () => {
  it('allows only loopback and the existing source in the extension page policy', () => {
    const sources = connectSources()
    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
      expect(ALLOWED_CONNECT_HOSTS.has(source), `unexpected connect-src entry: ${source}`).toBe(true)
    }
  })

  it('names no model vendor endpoint anywhere in the extension source', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(EXTENSION_ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8')
      for (const endpoint of VENDOR_ENDPOINTS) {
        if (text.includes(endpoint)) offenders.push(`${file.slice(EXTENSION_ROOT.length + 1)} → ${endpoint}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('embeds no credential constant in the extension source', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(EXTENSION_ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8')
      // A bearer credential smuggled through atob, or a raw sk- secret.
      if (/atob\(\s*['"][A-Za-z0-9+/=]{24,}/.test(text)) offenders.push(`${file.slice(EXTENSION_ROOT.length + 1)} → atob credential`)
      if (/['"]sk-[A-Za-z0-9-]{16,}['"]/.test(text)) offenders.push(`${file.slice(EXTENSION_ROOT.length + 1)} → inline secret`)
    }
    expect(offenders).toEqual([])
  })

  it('keeps the local completion channel and its bridge fallback in place', () => {
    const background = readFileSync(join(EXTENSION_ROOT, 'src/background/index.ts'), 'utf8')
    expect(background).toContain('/omnimux/text/complete')
    expect(background).toContain('session.prompt')
  })

  it('has no credential material in a built bundle when one is present', () => {
    const bundle = join(EXTENSION_ROOT, 'dist/background.js')
    if (!existsSync(bundle)) return
    const text = readFileSync(bundle, 'utf8')
    for (const endpoint of VENDOR_ENDPOINTS) {
      expect(text.includes(endpoint), `built bundle names ${endpoint}`).toBe(false)
    }
  })
})
