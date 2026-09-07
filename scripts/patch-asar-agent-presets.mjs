#!/usr/bin/env node
/**
 * Same-length Electron asar header patch: replace
 * node_modules/@deepseek-ai/dsh/config/agent-presets children with the
 * unpacked directory tree (unpacked:true files only). Refuses to grow the
 * header JSON so file offsets stay valid.
 *
 * Automatically synchronizes SHA-256 hash with Info.plist ElectronAsarIntegrity.
 *
 * Usage:
 *   node scripts/patch-asar-agent-presets.mjs <app.asar> <unpacked-presets-dir> [--dry-run] [--info-plist=<path>]
 *   node scripts/patch-asar-agent-presets.mjs <app.asar> --verify-only [--info-plist=<path>]
 */
// Ensure Electron does not intercept raw .asar file read/write operations
process.env.ELECTRON_NO_ASAR = '1'

import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calculateAsarHeaderSha256,
  calculateSha256,
  locateInfoPlist,
  readPlistIntegrity,
  updatePlistIntegrity,
  verifyIntegrity,
} from './lib/asar-integrity-engine.mjs'

const require = createRequire(import.meta.url)

export function loadAsar() {
  const npxDisk = join(process.env.HOME || '', '.npm/_npx/8b3f11f22d4db0c9/node_modules/asar/lib/disk.js')
  const npxPickle = join(process.env.HOME || '', '.npm/_npx/8b3f11f22d4db0c9/node_modules/chromium-pickle-js')
  try {
    return { disk: require(npxDisk), pickle: require(npxPickle) }
  } catch {
    try {
      return { disk: require('asar/lib/disk.js'), pickle: require('chromium-pickle-js') }
    } catch (error) {
      console.error('asar modules not found:', error.message)
      process.exit(2)
    }
  }
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

export function unpackedTree(dir) {
  const files = {}
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      files[name] = { files: unpackedTree(p) }
    } else {
      const buf = readFileSync(p)
      const hash = sha256(buf)
      files[name] = {
        size: buf.length,
        unpacked: true,
        integrity: {
          algorithm: 'SHA256',
          hash,
          blockSize: 4194304,
          blocks: [hash],
        },
      }
    }
  }
  return files
}

/**
 * Patch an asar archive's agent presets and synchronize with Info.plist.
 * @param {string} asarPath
 * @param {string} presetsDir
 * @param {{ dryRun?: boolean, infoPlistPath?: string, asarLib?: any }} [opts]
 */
export function patchAsarPresets(asarPath, presetsDir, opts = {}) {
  const { dryRun = false, infoPlistPath, asarLib } = opts
  const { disk, pickle } = asarLib || loadAsar()

  if (!existsSync(asarPath) || !existsSync(presetsDir)) {
    throw new Error(`missing asar (${asarPath}) or presets dir (${presetsDir})`)
  }

  const { header, headerSize, headerString } = disk.readArchiveHeaderSync(asarPath)
  const cfg = header.files?.node_modules?.files?.['@deepseek-ai']?.files?.dsh?.files?.config?.files
  const dshAgentPresetsPkg = header.files?.node_modules?.files?.['@deepseek-ai']?.files?.['dsh-agent-presets']?.files

  let targetNode = null
  if (dshAgentPresetsPkg?.presets) {
    targetNode = dshAgentPresetsPkg.presets
  } else if (cfg?.['agent-presets']) {
    targetNode = cfg['agent-presets']
  } else {
    throw new Error(`agent-presets missing in asar header: ${asarPath}`)
  }

  const before = Object.keys(targetNode.files || {})
  targetNode.files = unpackedTree(presetsDir)
  const after = Object.keys(targetNode.files)

  const newJson = JSON.stringify(header)
  if (newJson.length > headerString.length) {
    throw new Error(`refuse: new header JSON longer (${newJson.length} > ${headerString.length})`)
  }

  const padded = newJson + ' '.repeat(headerString.length - newJson.length)
  const headerPickle = pickle.createEmpty()
  headerPickle.writeString(padded)
  const headerBuf = headerPickle.toBuffer()
  if (headerBuf.length !== headerSize) {
    throw new Error(`pickle size changed ${headerBuf.length} !== ${headerSize}`)
  }

  const sizePickle = pickle.createEmpty()
  sizePickle.writeUInt32(headerBuf.length)
  const sizeBuf = sizePickle.toBuffer()
  if (sizeBuf.length !== 8) {
    throw new Error('size pickle not 8 bytes')
  }

  const orig = readFileSync(asarPath)
  const out = Buffer.concat([sizeBuf, headerBuf, orig.subarray(8 + headerSize)])
  if (out.length !== orig.length) {
    throw new Error(`asar length changed ${out.length} vs ${orig.length}`)
  }

  // Electron ElectronAsarIntegrity validates SHA256 of entry '<header>' (the header JSON string)
  const newHash = sha256(Buffer.from(padded, 'utf8'))
  const targetPlist = infoPlistPath || locateInfoPlist(asarPath)

  if (!dryRun) {
    const bak = `${asarPath}.bak-header`
    if (!existsSync(bak)) copyFileSync(asarPath, bak)
    writeFileSync(asarPath, out)

    let plistUpdated = false
    if (targetPlist && existsSync(targetPlist)) {
      plistUpdated = updatePlistIntegrity(targetPlist, newHash)
    }

    return {
      success: true,
      before,
      after,
      newHash,
      plistPath: targetPlist,
      plistUpdated,
    }
  }

  return {
    success: true,
    dryRun: true,
    before,
    after,
    newHash,
    plistPath: targetPlist,
    plistUpdated: false,
  }
}

// CLI Execution Entrypoint
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const args = process.argv.slice(2)
  let asarPath = null
  let presetsDir = null
  let verifyOnly = false
  let dryRun = false
  let customPlist = null

  for (const arg of args) {
    if (arg === '--verify-only') {
      verifyOnly = true
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg.startsWith('--info-plist=')) {
      customPlist = arg.slice('--info-plist='.length)
    } else if (!asarPath) {
      asarPath = arg
    } else if (!presetsDir) {
      presetsDir = arg
    }
  }

  if (verifyOnly) {
    if (!asarPath) {
      console.error('usage: patch-asar-agent-presets.mjs <app.asar> --verify-only [--info-plist=<path>]')
      process.exit(1)
    }
    const result = verifyIntegrity(asarPath, customPlist)
    if (result.valid) {
      console.log(`✓ Asar integrity verified: ${asarPath} (SHA256: ${result.calculatedHash})`)
      process.exit(0)
    } else {
      console.error(`❌ Asar integrity check failed: ${result.error}`)
      process.exit(1)
    }
  }

  if (!asarPath || !presetsDir) {
    console.error('usage: patch-asar-agent-presets.mjs <app.asar> <unpacked-presets-dir> [--dry-run] [--info-plist=<path>]')
    console.error('       patch-asar-agent-presets.mjs <app.asar> --verify-only [--info-plist=<path>]')
    process.exit(1)
  }

  try {
    const res = patchAsarPresets(asarPath, presetsDir, { dryRun, infoPlistPath: customPlist })
    const prefix = dryRun ? '[DRY-RUN] ' : ''
    console.log(`  ${prefix}✓ asar header ${asarPath}: ${res.before.join(',')} → ${res.after.join(',')}`)
    if (res.plistPath) {
      if (res.plistUpdated) {
        console.log(`  ${prefix}✓ Info.plist integrity updated: ${res.plistPath} (SHA256: ${res.newHash})`)
      } else if (dryRun) {
        console.log(`  ${prefix}· Info.plist target would be: ${res.plistPath} (SHA256: ${res.newHash})`)
      } else {
        console.warn(`  ⚠️  Info.plist found at ${res.plistPath} but update failed or plist missing`)
      }
    } else {
      console.log(`  · Info.plist not found, skipped plist integrity sync`)
    }
  } catch (err) {
    console.error(`❌ Error patching asar presets: ${err.message}`)
    process.exit(1)
  }
}
