/**
 * Find a Chromium-family browser already installed on this machine.
 *
 * Nothing is downloaded and nothing is bundled: the host either has a browser
 * the CDP client can drive, or the screenshot chain degrades to `no-browser`
 * and the import still answers (spec §4, L3).
 *
 * The candidate list covers the three desktop platforms, an explicit override
 * env var, and the two browser caches automation tooling leaves behind
 * (puppeteer, ms-playwright).
 */
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/** Env vars that pin the browser outright. */
const OVERRIDE_VARS = ['OMNIMUX_CHROME_PATH', 'CHROME_PATH', 'CHROME_BIN']

/** macOS application bundles, most preferred first. */
const MAC_BINARIES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
]

/** Linux absolute paths. */
const LINUX_BINARIES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/opt/google/chrome/chrome',
]

/** Bare commands resolved against `PATH`. */
const PATH_COMMANDS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']

/** Windows install locations, relative to a root drive. */
const WINDOWS_RELATIVE = [
  'Google/Chrome/Application/chrome.exe',
  'Google/Chrome Beta/Application/chrome.exe',
  'Chromium/Application/chrome.exe',
  'Microsoft/Edge/Application/msedge.exe',
]

/**
 * The ordered probe list for one platform. Pure: it reads the filesystem only
 * to expand the automation caches, and never throws when they are absent.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [platform]
 * @returns {string[]}
 */
export function candidatePaths(env = process.env, platform = process.platform) {
  const root = homedir()
  const out = []

  for (const key of OVERRIDE_VARS) {
    const value = String(env?.[key] ?? '').trim()
    if (value) out.push(value)
  }

  if (platform === 'darwin') {
    out.push(...MAC_BINARIES)
    out.push(...cacheCandidates(join(root, 'Library', 'Caches'), 'darwin'))
    out.push(...cacheCandidates(join(root, '.cache'), 'darwin'))
  } else if (platform === 'win32') {
    for (const base of [
      env?.['PROGRAMFILES'],
      env?.['PROGRAMFILES(X86)'],
      env?.['LOCALAPPDATA'],
    ]) {
      const value = String(base ?? '').trim()
      if (!value) continue
      for (const rel of WINDOWS_RELATIVE) out.push(join(value, ...rel.split('/')))
    }
  } else {
    out.push(...LINUX_BINARIES)
    out.push(...cacheCandidates(join(root, '.cache'), 'linux'))
  }

  for (const command of PATH_COMMANDS) {
    for (const dir of String(env?.PATH ?? '').split(delimiter)) {
      if (dir) out.push(join(dir, command))
    }
  }

  return dedupe(out)
}

/**
 * Browser builds an automation tool left in a shared cache.
 *
 * @param {string} cacheRoot
 * @param {string} platform
 * @returns {string[]}
 */
function cacheCandidates(cacheRoot, platform) {
  const out = []
  const puppeteerRoot = join(cacheRoot, 'puppeteer', 'chrome')
  for (const version of listDir(puppeteerRoot)) {
    const dir = join(puppeteerRoot, version)
    for (const arch of listDir(dir)) {
      out.push(...bundleBinary(join(dir, arch), 'chrome', platform))
      out.push(...bundleBinary(join(dir, arch), 'chrome-headless-shell', platform))
    }
  }

  const playwrightRoot = join(cacheRoot, 'ms-playwright')
  for (const build of listDir(playwrightRoot)) {
    if (!build.startsWith('chromium')) continue
    for (const arch of listDir(join(playwrightRoot, build))) {
      out.push(...bundleBinary(join(playwrightRoot, build, arch), 'chrome', platform))
      out.push(...bundleBinary(join(playwrightRoot, build, arch), 'chrome-headless-shell', platform))
    }
  }

  return out
}

/**
 * The executable inside one unpacked browser bundle.
 *
 * @param {string} base
 * @param {string} product
 * @param {string} platform
 * @returns {string[]}
 */
function bundleBinary(base, product, platform) {
  if (platform === 'darwin') {
    const app = product === 'chrome' ? 'Google Chrome for Testing' : 'chrome-headless-shell'
    return [join(base, `${product}-mac-arm64`, `${app}.app`, 'Contents', 'MacOS', app)]
  }
  if (platform === 'win32') {
    return [join(base, `${product}-win64`, product === 'chrome' ? 'chrome.exe' : 'chrome-headless-shell.exe')]
  }
  return [join(base, `${product}-linux64`, product)]
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      // Newest build first: an automation cache usually holds several.
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
  } catch {
    return []
  }
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function dedupe(values) {
  const seen = new Set()
  const out = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/**
 * The first candidate that really is an executable file.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ platform?: string, isFile?: (path: string) => boolean }} [deps]
 * @returns {string | null}
 */
export function locateBrowser(env = process.env, deps = {}) {
  const platform = deps.platform ?? process.platform
  const isFile = deps.isFile ?? defaultIsFile
  for (const candidate of candidatePaths(env, platform)) {
    try {
      if (isFile(candidate)) return candidate
    } catch {
      // A candidate that cannot be probed is simply not a candidate.
    }
  }
  return null
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function defaultIsFile(path) {
  return existsSync(path)
}
