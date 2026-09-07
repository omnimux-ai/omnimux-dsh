/**
 * scripts/lib/asar-integrity-engine.mjs
 *
 * Engine for Electron Asar SHA-256 integrity computation and Info.plist
 * ElectronAsarIntegrity dictionary synchronization.
 */

// Ensure Electron does not intercept raw .asar file read/write operations
process.env.ELECTRON_NO_ASAR = '1'

import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

/**
 * Calculate SHA-256 hash of a buffer or file.
 * @param {Buffer | string} input File path or Buffer
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function calculateSha256(input) {
  const buf = typeof input === 'string' ? readFileSync(input) : input
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * Read the raw header string / buffer from an asar archive.
 * Supports file path string or Buffer.
 * Asar format pickle layout:
 * - Bytes 0..3: UInt32LE = 4 (pickle size payload)
 * - Bytes 4..7: UInt32LE = headerSize (pickle payload size)
 * - Bytes 8..11: UInt32LE = headerSize - 4 (pickle string payload size)
 * - Bytes 12..15: UInt32LE = strLen (header JSON string length in bytes)
 * - Bytes 16..16+strLen: header JSON string encoded in UTF-8
 *
 * @param {string | Buffer} input Asar file path or Buffer
 * @returns {Buffer} Raw header buffer (UTF-8 encoded JSON string)
 */
export function readAsarHeader(input) {
  if (typeof input === 'string') {
    if (!existsSync(input)) {
      if (input.trim().startsWith('{')) {
        return Buffer.from(input, 'utf8')
      }
      throw new Error(`Asar file not found: ${input}`)
    }
    const fd = openSync(input, 'r')
    try {
      const sizeBuf = Buffer.alloc(16)
      const bytesRead = readSync(fd, sizeBuf, 0, 16, 0)
      if (bytesRead < 16) {
        throw new Error(`Asar file too small: ${input}`)
      }
      const pickleSize = sizeBuf.readUInt32LE(0)
      const headerSize = sizeBuf.readUInt32LE(4)
      const strLen = sizeBuf.readUInt32LE(12)
      if (pickleSize !== 4 || headerSize < strLen) {
        throw new Error(`Invalid asar header in file: ${input}`)
      }
      const headerBuf = Buffer.alloc(strLen)
      if (readSync(fd, headerBuf, 0, strLen, 16) !== strLen) {
        throw new Error(`Unable to read full asar header from ${input}`)
      }
      return headerBuf
    } finally {
      closeSync(fd)
    }
  }

  if (Buffer.isBuffer(input)) {
    if (input.length >= 16 && input.readUInt32LE(0) === 4) {
      const headerSize = input.readUInt32LE(4)
      const strLen = input.readUInt32LE(12)
      if (headerSize >= strLen && input.length >= 16 + strLen) {
        return input.subarray(16, 16 + strLen)
      }
    }
    return input
  }

  throw new TypeError('readAsarHeader expects a file path string or Buffer')
}

/**
 * Calculate SHA-256 hash of the asar header (<header> entry).
 * Conforms to Electron's ValidateIntegrity check in electron/shell/common/asar/asar_util.cc
 * which validates SHA256 of entry '<header>' (the JSON header string), NOT the whole asar file.
 *
 * @param {Buffer | string} input File path, asar archive Buffer, or raw header Buffer/string
 * @returns {string} Hex-encoded SHA-256 hash of the header
 */
export function calculateAsarHeaderSha256(input) {
  const headerBuf = readAsarHeader(input)
  return createHash('sha256').update(headerBuf).digest('hex')
}

/**
 * Locate Info.plist relative to the app.asar path.
 * Typically: App.app/Contents/Resources/app.asar -> App.app/Contents/Info.plist
 * @param {string} asarPath Path to app.asar
 * @returns {string | null} Path to Info.plist if found, or null
 */
export function locateInfoPlist(asarPath) {
  if (!asarPath) return null
  const absAsar = resolve(asarPath)
  const dir = dirname(absAsar)

  // Candidate 1: Contents/Resources/app.asar -> Contents/Info.plist
  const candidate1 = join(dir, '..', 'Info.plist')
  if (existsSync(candidate1)) return candidate1

  // Candidate 2: Same directory Info.plist
  const candidate2 = join(dir, 'Info.plist')
  if (existsSync(candidate2)) return candidate2

  // Candidate 3: Two levels up (e.g. app.asar.unpacked/../Info.plist)
  const candidate3 = join(dir, '..', '..', 'Info.plist')
  if (existsSync(candidate3)) return candidate3

  return null
}

/**
 * Read ElectronAsarIntegrity configuration from Info.plist.
 * Supports macOS /usr/bin/plutil conversion and XML fallback.
 * @param {string} plistPath Path to Info.plist
 * @param {string} [asarRelativeKey='Resources/app.asar'] Key in ElectronAsarIntegrity dict
 * @returns {{ algorithm: string, hash: string } | null}
 */
export function readPlistIntegrity(plistPath, asarRelativeKey = 'Resources/app.asar') {
  if (!plistPath || !existsSync(plistPath)) return null

  // 1. Try macOS plutil tool
  try {
    const res = spawnSync('plutil', ['-convert', 'json', '-o', '-', plistPath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (res.status === 0 && res.stdout) {
      const parsed = JSON.parse(res.stdout)
      const integrity = parsed.ElectronAsarIntegrity
      if (integrity && typeof integrity === 'object') {
        const target = integrity[asarRelativeKey] || integrity['app.asar'] || integrity
        if (target && typeof target.hash === 'string') {
          return {
            algorithm: target.algorithm || 'SHA256',
            hash: target.hash.trim().toLowerCase(),
          }
        }
      }
    }
  } catch {
    // plutil unavailable or failed, proceed to XML regex fallback
  }

  // 2. XML Regex Fallback
  try {
    const content = readFileSync(plistPath, 'utf8')
    // Look for ElectronAsarIntegrity block
    const integrityMatch = /<key>ElectronAsarIntegrity<\/key>[\s\S]*?<dict>([\s\S]*?)<\/dict>/i.exec(content)
    if (integrityMatch) {
      const dictContent = integrityMatch[1]
      const hashMatch = /<key>hash<\/key>\s*<string>([a-fA-F0-9]+)<\/string>/i.exec(dictContent)
      const algoMatch = /<key>algorithm<\/key>\s*<string>([^<]+)<\/string>/i.exec(dictContent)
      if (hashMatch) {
        return {
          algorithm: algoMatch ? algoMatch[1].trim() : 'SHA256',
          hash: hashMatch[1].trim().toLowerCase(),
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return null
}

/**
 * Update or inject ElectronAsarIntegrity in Info.plist.
 * @param {string} plistPath Path to Info.plist
 * @param {string} newHash SHA-256 hex string
 * @param {string} [asarRelativeKey='Resources/app.asar'] Key in ElectronAsarIntegrity dict
 * @param {string} [algorithm='SHA256'] Algorithm name (default 'SHA256')
 * @returns {boolean} True if successfully updated
 */
export function updatePlistIntegrity(
  plistPath,
  newHash,
  asarRelativeKey = 'Resources/app.asar',
  algorithm = 'SHA256'
) {
  if (!plistPath || !existsSync(plistPath)) return false
  const cleanHash = newHash.trim().toLowerCase()

  // Detect if binary plist
  let isBinary = false
  try {
    const headerBuf = Buffer.alloc(8)
    const fd = readFileSync(plistPath)
    if (fd.subarray(0, 6).toString('ascii') === 'bplist') {
      isBinary = true
    }
  } catch {
    // Ignore
  }

  // 1. Try macOS plutil conversion
  try {
    const jsonRes = spawnSync('plutil', ['-convert', 'json', '-o', '-', plistPath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (jsonRes.status === 0 && jsonRes.stdout) {
      const data = JSON.parse(jsonRes.stdout)
      data.ElectronAsarIntegrity = data.ElectronAsarIntegrity || {}
      data.ElectronAsarIntegrity[asarRelativeKey] = {
        algorithm,
        hash: cleanHash,
      }

      const tmpJson = join(tmpdir(), `plist-update-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
      writeFileSync(tmpJson, JSON.stringify(data, null, 2), 'utf8')

      const targetFormat = isBinary ? 'binary1' : 'xml1'
      const convertRes = spawnSync('plutil', ['-convert', targetFormat, '-o', plistPath, tmpJson], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      try { unlinkSync(tmpJson) } catch {}

      if (convertRes.status === 0) {
        return true
      }
    }
  } catch {
    // Fallback to XML direct rewrite
  }

  // 2. XML Direct text replacement / insertion
  try {
    let content = readFileSync(plistPath, 'utf8')
    const integrityBlockRegex = /<key>ElectronAsarIntegrity<\/key>[\s\S]*?<dict>[\s\S]*?<\/dict>/i

    const newIntegrityBlock = `<key>ElectronAsarIntegrity</key>\n\t<dict>\n\t\t<key>${asarRelativeKey}</key>\n\t\t<dict>\n\t\t\t<key>algorithm</key>\n\t\t\t<string>${algorithm}</string>\n\t\t\t<key>hash</key>\n\t\t\t<string>${cleanHash}</string>\n\t\t</dict>\n\t</dict>`

    if (integrityBlockRegex.test(content)) {
      content = content.replace(integrityBlockRegex, newIntegrityBlock)
    } else {
      // Insert before the last </dict>
      const lastDictIdx = content.lastIndexOf('</dict>')
      if (lastDictIdx !== -1) {
        content = content.slice(0, lastDictIdx) + '\t' + newIntegrityBlock + '\n' + content.slice(lastDictIdx)
      } else {
        return false
      }
    }

    writeFileSync(plistPath, content, 'utf8')
    return true
  } catch (err) {
    console.error(`[asar-integrity-engine] Failed to update XML plist: ${err.message}`)
    return false
  }
}

/**
 * Verify if app.asar hash matches Info.plist ElectronAsarIntegrity.
 * @param {string} asarPath Path to app.asar
 * @param {string} [plistPath] Path to Info.plist (auto-discovered if omitted)
 * @param {string} [asarRelativeKey='Resources/app.asar']
 * @returns {{ valid: boolean, calculatedHash: string, plistHash: string | null, plistPath: string | null, error?: string }}
 */
export function verifyIntegrity(asarPath, plistPath, asarRelativeKey = 'Resources/app.asar') {
  if (!asarPath || !existsSync(asarPath)) {
    return {
      valid: false,
      calculatedHash: '',
      plistHash: null,
      plistPath: null,
      error: `asar not found at ${asarPath}`,
    }
  }

  const resolvedPlist = plistPath || locateInfoPlist(asarPath)
  let calculatedHash = ''
  try {
    calculatedHash = calculateAsarHeaderSha256(asarPath)
  } catch (err) {
    return {
      valid: false,
      calculatedHash: '',
      plistHash: null,
      plistPath: resolvedPlist,
      error: `Failed to read asar header: ${err.message}`,
    }
  }

  if (!resolvedPlist || !existsSync(resolvedPlist)) {
    return {
      valid: false,
      calculatedHash,
      plistHash: null,
      plistPath: resolvedPlist,
      error: `Info.plist not found for asar at ${asarPath}`,
    }
  }

  const record = readPlistIntegrity(resolvedPlist, asarRelativeKey)
  if (!record || !record.hash) {
    return {
      valid: false,
      calculatedHash,
      plistHash: null,
      plistPath: resolvedPlist,
      error: `ElectronAsarIntegrity key missing in ${resolvedPlist}`,
    }
  }

  const valid = record.hash.toLowerCase() === calculatedHash.toLowerCase()
  return {
    valid,
    calculatedHash,
    plistHash: record.hash.toLowerCase(),
    plistPath: resolvedPlist,
    error: valid ? undefined : `Hash mismatch: calculated=${calculatedHash}, plist=${record.hash}`,
  }
}
