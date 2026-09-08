import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { AssetsError } from './mappings.js'
import { LEDGERS, digest, emptyLedger, safeRelative, validateLedger } from './storage-types.js'
import { sameRoot } from './storage-types.js'
import { previewMimeOf } from './scanner.js'

const CONTROL = new Set([...LEDGERS, '.omnimux-assets'])
const RESERVED = 500 * 1024 * 1024
const criticalMetadata = (row) => row?.metadataError || row?.extendedMetadata?.some((name) => name !== 'com.apple.provenance')
const within = (path, root) => path === root || path.startsWith(`${root}/`)
const browseLeaves = (rows, excluded, root) => {
  const nonempty = new Set()
  for (const row of [...rows, ...excluded]) {
    const parts = row.relative_path.split('/')
    for (let end = 1; end < parts.length; end += 1) nonempty.add(parts.slice(0, end).join('/'))
  }
  return rows.filter((row) => within(row.relative_path, root) && (row.kind === 'file' || (row.kind === 'directory' && !nonempty.has(row.relative_path))))
}

/** Plans relative leaf operations and preserves independent record semantics. */
export class StoragePlanner {
  constructor(fs) { this.fs = fs }

  async ledgers(root, allowLockOnly = false) {
    const values = {}
    let present = 0
    for (const name of LEDGERS) {
      const value = await this.fs.readJson(root, name, true)
      if (value) { validateLedger(value, name); present += 1 }
      values[name] = value ?? emptyLedger(name)
    }
    const marker = await this.fs.readJson(root, '.omnimux-assets/root.json', true)
    if (marker && (marker.magic !== 'omnimux-assets' || marker.schema !== 1)) throw new AssetsError('reserved-name-conflict', 'unrecognized library marker')
    if (marker && present !== 3 && !(marker.state === 'unregistered' && present === 0)) throw new AssetsError('ledger-corrupt', 'registered root is missing a required ledger')
    if (!marker) {
      const scan = await this.fs.request('stat', { root, rel: '.omnimux-assets', optional: true })
      if (scan) {
        const contents = allowLockOnly ? await this.fs.request('scan', { root, rel: '.omnimux-assets', metadataOnly: true }) : null
        if (!contents || contents.excluded.length || contents.entries.some((row) => row.relative_path !== '.omnimux-assets/owner.lock' || row.kind !== 'file')) {
          throw new AssetsError('reserved-name-conflict', 'unregistered control namespace already exists')
        }
      }
    }
    const transaction = await this.fs.readJson(root, '.omnimux-assets/transaction.json', true)
    if (transaction?.pending) throw new AssetsError('recovery-required', 'target has an unfinished transaction')
    return { values, marker, present }
  }

  async scan(source, target, progress = () => {}) {
    const sourceIdentity = await this.fs.identity(source)
    const targetIdentity = await this.fs.identity(target)
    if (sameRoot(sourceIdentity, targetIdentity)) return { noop: true }
    if (within(sourceIdentity.path, targetIdentity.path) || within(targetIdentity.path, sourceIdentity.path)) {
      throw new AssetsError('path-denied', 'source and target must not contain one another')
    }
    const sourceLedgers = await this.ledgers(sourceIdentity.path)
    const targetLedgers = await this.ledgers(targetIdentity.path)
    const sourceScan = await this.fs.scan(sourceIdentity.path, progress)
    const targetScan = await this.fs.scan(targetIdentity.path, progress)
    return { sourceIdentity, targetIdentity, sourceLedgers, targetLedgers, sourceScan, targetScan }
  }

  build(snapshot) {
    if (snapshot.noop) return { noop: true }
    const { sourceIdentity, targetIdentity, sourceLedgers, targetLedgers, sourceScan, targetScan } = snapshot
    const id = randomUUID()
    const entries = []
    const exclusions = [...sourceScan.excluded.map((row) => ({ ...row, origin: 'source' })), ...targetScan.excluded.map((row) => ({ ...row, origin: 'target' }))]
    const blockers = []
    const sourceMap = new Map(sourceScan.entries.map((row) => [row.relative_path, row]))
    const targetMap = new Map(targetScan.entries.map((row) => [row.relative_path, row]))
    const targetHashes = new Map()
    for (const row of targetScan.entries) {
      if (row.kind !== 'file' || CONTROL.has(row.relative_path.split('/')[0])) continue
      if (!targetHashes.has(row.sha256)) targetHashes.set(row.sha256, row.relative_path)
    }
    const sourceValues = structuredClone(sourceLedgers.values)
    const targetValues = structuredClone(targetLedgers.values)
    const pathEntries = new Map()
    const mapRef = (rel, ownership = 'unknown') => {
      safeRelative(rel)
      if (pathEntries.has(rel)) return pathEntries.get(rel)
      const src = sourceMap.get(rel)
      const target = targetMap.get(rel)
      const entry = { id: `entry_${entries.length}`, sourceRel: rel, targetRel: rel, ownership,
        sourceFingerprint: src?.identity ?? null, targetFingerprint: target?.identity ?? null,
        bytes: src?.size ?? 0, operation: 'copy', kind: src?.kind ?? 'missing' }
      if (!src) entry.operation = 'unmigrated'
      else if (criticalMetadata(src) || (Number(src.identity.mode) & 0o6000)) {
        entry.operation = 'unmigrated'; entry.reasonCode = 'metadata-unsupported'; entry.reason = src.metadataError || 'source critical metadata cannot be preserved'
      }
      else if (src.kind === 'directory') entry.operation = target && target.kind !== 'directory' ? 'structure-conflict' : 'mkdir'
      else if (target?.kind === 'directory') entry.operation = 'structure-conflict'
      else if (target && target.sha256 !== src.sha256) entry.operation = Number(target.identity.nlink) > 1 ? 'hardlink-conflict' : 'conflict'
      else if (targetHashes.has(src.sha256)) { entry.operation = 'reuse'; entry.targetRel = targetHashes.get(src.sha256) }
      if (entry.operation === 'mkdir' && target && ((Number(target.identity.mode) & 0o777) !== (Number(src.identity.mode) & 0o777) || target.identity.mtimeNs !== src.identity.mtimeNs || target.provenanceHash !== src.provenanceHash || criticalMetadata(target))) {
        entry.operation = 'unmigrated'; entry.reasonCode = 'metadata-incompatible'; entry.reason = 'existing directory metadata differs; retained in place'
      }
      if (entry.operation === 'structure-conflict') entry.conflictPrefix = rel
      const parentParts = rel.split('/').slice(0, -1)
      for (let n = 1; n <= parentParts.length; n += 1) {
        const prefix = parentParts.slice(0, n).join('/')
        const parent = targetMap.get(prefix)
        const sourceParent = sourceMap.get(prefix)
        if (criticalMetadata(sourceParent) || criticalMetadata(parent)) {
          entry.operation = 'unmigrated'; entry.reasonCode = 'metadata-unsupported'; entry.reason = 'directory critical metadata cannot be preserved'; break
        }
        if (parent && parent.kind !== 'directory' && entry.operation !== 'unmigrated') { entry.operation = 'structure-conflict'; entry.conflictPrefix = prefix; entry.reason = 'destination parent is a file'; break }
      }
      if (target && entry.operation === 'conflict' && (criticalMetadata(target) || (Number(target.identity.mode) & 0o6000))) {
        entry.operation = 'unmigrated'; entry.reasonCode = 'metadata-unsupported'; entry.reason = 'target recovery metadata cannot be preserved'
      }
      if (entry.operation === 'reuse') {
        const reused = targetMap.get(entry.targetRel) ?? sourceMap.get(entry.targetRel)
        if (!reused || criticalMetadata(reused) || reused.provenanceHash !== src.provenanceHash || (Number(reused.identity.mode) & 0o777) !== (Number(src.identity.mode) & 0o777) || reused.identity.mtimeNs !== src.identity.mtimeNs) {
          entry.operation = 'unmigrated'; entry.reasonCode = 'metadata-incompatible'; entry.reason = 'same content has incompatible permissions or mtime'
        } else if (!targetMap.has(entry.targetRel)) entry.payloadEntryId = pathEntries.get(entry.targetRel)?.id
      }
      if (entry.operation === 'copy' && !targetHashes.has(src.sha256)) targetHashes.set(src.sha256, rel)
      entry.preview = { source: src?.kind === 'file' && Boolean(previewMimeOf(rel)), target: target?.kind === 'file' && Boolean(previewMimeOf(rel)) }
      entry.fingerprint = digest({ source: entry.sourceFingerprint, target: entry.targetFingerprint, path: entry.targetRel })
      entries.push(entry)
      pathEntries.set(rel, entry)
      return entry
    }
    const expandFiles = (values, origin) => {
      const map = origin === 'source' ? sourceMap : targetMap
      for (const asset of values['library.json'].assets) {
        const expanded = []
        for (const file of asset.files) {
          if (['unmigrated', 'excluded'].includes(file.status)) { expanded.push({ ...file }); continue }
          if (!file.relative_path) {
            expanded.push({ ...file, status: 'unmigrated', recovery_ref: { taskId: id, legacy: true } })
            delete expanded.at(-1).real_path
            exclusions.push({ origin, recordId: asset.id, reason: 'legacy external reference requires explicit ordinary import' })
            continue
          }
          const physical = map.get(file.relative_path)
          const excluded = (origin === 'source' ? sourceScan : targetScan).excluded.filter((row) => within(row.relative_path, file.relative_path))
          const leaves = physical?.kind === 'directory'
            ? browseLeaves([...map.values()], excluded, file.relative_path).filter((row) => row.relative_path !== file.relative_path) : []
          if (physical?.kind === 'directory' && (leaves.length || excluded.length)) {
            for (const [index, leaf] of leaves.entries()) {
              expanded.push({ ...file, id: index === 0 ? file.id : `${file.id}_${index}`, relative_path: leaf.relative_path,
                kind: leaf.kind, original_name: basename(leaf.relative_path), logical_path: `${file.original_name || basename(file.relative_path)}/${leaf.relative_path.slice(file.relative_path.length + 1)}`,
                ownership: file.ownership ?? (origin === 'target' ? 'adopted' : file.relative_path.startsWith(`data/files/${asset.id}/`) ? 'managed' : 'unknown') })
            }
            for (const leaf of excluded) {
              const entryId = `excluded_${digest([origin, asset.id, file.id, leaf.relative_path]).slice(0, 16)}`
              expanded.push({ id: entryId, original_name: basename(leaf.relative_path),
                logical_path: `${file.original_name || basename(file.relative_path)}/${leaf.relative_path.slice(file.relative_path.length + 1)}`,
                status: 'excluded', recovery_ref: { taskId: id, entryId, reason: leaf.reason } })
            }
          } else expanded.push({ ...file, ownership: file.ownership ?? (origin === 'target' ? 'adopted' : file.relative_path.startsWith(`data/files/${asset.id}/`) ? 'managed' : 'unknown') })
        }
        asset.files = expanded
      }
    }
    expandFiles(sourceValues, 'source')
    expandFiles(targetValues, 'target')
    for (const asset of sourceValues['library.json'].assets) {
      for (const file of asset.files) if (file.relative_path) file.migration_entry = mapRef(file.relative_path, file.ownership).id
    }
    for (const artifact of sourceValues['artifacts.json'].artifacts) {
      if (artifact.content_ref) artifact.migration_entry = mapRef(artifact.content_ref, artifact.ownership ?? 'managed').id
      if (artifact.input_refs?.some((ref) => typeof ref !== 'string')) blockers.push({ recordId: artifact.id, reason: 'structured input reference cannot be safely rewritten' })
    }
    for (const mapping of sourceValues['mappings.json'].mappings) {
      const rel = mapping.relative_path || (mapping.real_path && within(mapping.real_path, sourceIdentity.path) ? mapping.real_path.slice(sourceIdentity.path.length + 1) : '')
      if (rel) {
        mapping.relative_path = rel
        delete mapping.real_path
        const children = [...sourceMap.values()].filter((row) => within(row.relative_path, rel) && row.kind === 'file')
        for (const row of children) mapRef(row.relative_path, 'unknown')
        mapping.migration_entry = mapRef(rel, 'unknown').id
      } else {
        mapping.status = 'unmigrated'
        mapping.recovery_ref = { taskId: id, legacy: true, reasonCode: 'legacy-external' }
        delete mapping.real_path
      }
    }
    // Register only uncovered top-level user items, never ledger/control namespaces.
    const covered = new Set(targetValues['library.json'].assets.flatMap((asset) => asset.files.map((file) => file.relative_path?.split('/')[0])).filter(Boolean))
    if (targetLedgers.present) for (const key of ['data', 'artifacts', 'scans']) covered.add(key)
    for (const row of targetScan.entries.filter((entry) => !entry.relative_path.includes('/'))) {
      if (CONTROL.has(row.relative_path) || covered.has(row.relative_path)) continue
      const assetId = `ast_${digest([id, row.relative_path]).slice(0, 16)}`
      const children = row.kind === 'directory' ? browseLeaves(targetScan.entries, targetScan.excluded, row.relative_path) : [row]
      const unsafe = targetScan.excluded.filter((leaf) => within(leaf.relative_path, row.relative_path))
      const files = (children.length ? children : unsafe.length ? [] : [row]).map((leaf, index) => ({ id: `fil_${digest([assetId, index]).slice(0, 16)}`,
        relative_path: leaf.relative_path, kind: leaf.kind, original_name: basename(leaf.relative_path), logical_path: leaf.relative_path,
        ownership: 'adopted' }))
      for (const [index, leaf] of unsafe.entries()) files.push({ id: `fil_${digest([assetId, 'excluded', index]).slice(0, 16)}`, original_name: basename(leaf.relative_path),
        logical_path: leaf.relative_path, ownership: 'adopted', status: 'excluded', recovery_ref: { taskId: id, entryId: `excluded_${digest([assetId, leaf.relative_path]).slice(0, 16)}`, reason: leaf.reason } })
      targetValues['library.json'].assets.push({ id: assetId, name: row.relative_path, handle: row.relative_path, type: 'custom', description: '', tags: [], files,
        cover_file_id: files[0]?.id ?? null, source: 'adopted', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    }
    const groups = new Map()
    for (const entry of entries) if (entry.conflictPrefix) {
      if (!groups.has(entry.conflictPrefix)) groups.set(entry.conflictPrefix, [])
      groups.get(entry.conflictPrefix).push(entry.id)
    }
    for (const entry of entries) if (entry.conflictPrefix) {
      entry.groupId = `group_${digest(entry.conflictPrefix).slice(0, 16)}`
      entry.groupEntries = groups.get(entry.conflictPrefix)
    }
    for (const entry of entries) {
      entry.affectedRefs = []
      for (const asset of targetValues['library.json'].assets) for (const file of asset.files) if (file.relative_path === entry.targetRel) entry.affectedRefs.push({ ledger: 'library.json', recordId: asset.id, fileId: file.id })
      for (const artifact of targetValues['artifacts.json'].artifacts) if (artifact.content_ref === entry.targetRel) entry.affectedRefs.push({ ledger: 'artifacts.json', recordId: artifact.id })
      for (const mapping of targetValues['mappings.json'].mappings) if (mapping.relative_path === entry.targetRel) entry.affectedRefs.push({ ledger: 'mappings.json', recordId: mapping.id })
    }
    const namespaces = {}
    for (const [origin, values] of [['source', sourceValues], ['target', targetValues]]) {
      const refs = new Map()
      for (const [ledger, key] of [['library.json', 'assets'], ['artifacts.json', 'artifacts'], ['mappings.json', 'mappings']]) {
        for (const row of values[ledger][key]) refs.set(row.id, [...(refs.get(row.id) ?? []), ledger])
      }
      namespaces[origin] = refs
      for (const artifact of values['artifacts.json'].artifacts) for (const ref of artifact.input_refs ?? []) {
        if (typeof ref !== 'string') continue
        if (ref.startsWith('asset://')) {
          const match = ref.match(/^asset:\/\/(character|scene|style|prop|knowledge|custom|artifact|tmp|workspace)\/(.+)$/)
          if (match?.[1] === 'workspace') continue
          const rel = match && (match[1] === 'artifact' ? 'artifacts/' : match[1] === 'tmp' ? 'tmp/' : '') + match[2]
          const physical = origin === 'source' ? sourceMap : targetMap
          if (!rel || !physical.has(rel)) blockers.push({ origin, recordId: artifact.id, reason: 'missing typed input reference', inputRef: ref })
          else if (origin === 'source') mapRef(rel, 'unknown')
          continue
        }
        const candidates = refs.get(ref) ?? []
        if (candidates.length !== 1) blockers.push({ origin, recordId: artifact.id, reason: candidates.length ? 'ambiguous input reference namespace' : 'missing input reference', inputRef: ref })
      }
    }
    const idMap = { target: { 'library.json': {}, 'artifacts.json': {}, 'mappings.json': {} } }
    for (const [name, key] of [['library.json', 'assets'], ['artifacts.json', 'artifacts'], ['mappings.json', 'mappings']]) {
      const ids = new Set(sourceValues[name][key].map((row) => row.id))
      const handles = new Set(sourceValues[name][key].map((row) => row.handle).filter(Boolean))
      for (const row of targetValues[name][key]) {
        if (ids.has(row.id)) { const old = row.id; row.id = `${row.id}_${digest([id, name, old]).slice(0, 8)}`; idMap.target[name][old] = row.id }
        ids.add(row.id)
        if (row.handle && handles.has(row.handle)) row.handle = `${row.handle} (${row.id.slice(-8)})`
        if (row.handle) handles.add(row.handle)
      }
    }
    const fileIds = new Set(sourceValues['library.json'].assets.flatMap((asset) => asset.files.map((file) => file.id)))
    idMap.target.files = {}
    for (const asset of targetValues['library.json'].assets) {
      const mapping = {}
      for (const file of asset.files) {
        if (fileIds.has(file.id)) {
          const old = file.id; file.id = `${old}_${digest([id, asset.id, old]).slice(0, 8)}`; mapping[old] = file.id
        }
        fileIds.add(file.id)
      }
      if (mapping[asset.cover_file_id]) asset.cover_file_id = mapping[asset.cover_file_id]
      idMap.target.files[asset.id] = mapping
    }
    for (const artifact of targetValues['artifacts.json'].artifacts) {
      artifact.input_refs = (artifact.input_refs ?? []).map((ref) => {
        if (typeof ref !== 'string') { blockers.push({ recordId: artifact.id, reason: 'unknown input reference structure' }); return ref }
        // protocol.js defines typed URI bodies as root-relative paths, not record IDs.
        if (ref.startsWith('asset://')) return ref
        const ledgers = namespaces.target.get(ref) ?? []
        return ledgers.length === 1 ? idMap.target[ledgers[0]][ref] ?? ref : ref
      })
    }
    const extra = entries.filter((entry) => !['reuse', 'unmigrated', 'mkdir'].includes(entry.operation)).reduce((total, entry) => total + entry.bytes + Number(entry.targetFingerprint?.size ?? 0), 0)
    const peak = extra + Math.max(0, ...entries.map((entry) => entry.bytes)) + JSON.stringify({ sourceValues, targetValues, entries }).length * 8
    const requiredBytes = peak + Math.max(RESERVED, peak * 0.1)
    if (targetIdentity.freeBytes < requiredBytes) blockers.push({ reason: 'disk-space-insufficient', requiredBytes, freeBytes: targetIdentity.freeBytes })
    const parents = new Set(entries.flatMap((entry) => entry.sourceRel.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/'))))
    const directories = sourceScan.entries.filter((row) => row.kind === 'directory' && parents.has(row.relative_path))
    const targetDirectories = targetScan.entries.filter((row) => row.kind === 'directory' && !CONTROL.has(row.relative_path.split('/')[0]))
    const plan = { id, directories, targetDirectories, source: sourceIdentity, target: targetIdentity, sourceRootId: sourceLedgers.marker?.rootId,
      targetRootId: targetLedgers.marker?.rootId ?? randomUUID(), targetMarker: targetLedgers.marker,
      targetBeforeValues: targetLedgers.values, sourceValues, targetValues,
      sourceLedgerHashes: digest(sourceLedgers.values), targetLedgerHashes: digest(targetLedgers.values),
      entries, exclusions, blockers, idMap, requiredBytes, reserve: RESERVED,
      sourceManifest: digest(sourceScan), targetManifest: digest(targetScan),
      summary: { adopted: targetValues['library.json'].assets.length, copyFiles: entries.filter((entry) => entry.operation === 'copy').length,
        copyBytes: entries.reduce((sum, entry) => sum + (entry.operation === 'reuse' ? 0 : entry.bytes), 0),
        reused: entries.filter((entry) => entry.operation === 'reuse').length,
        conflicts: entries.filter((entry) => entry.operation.includes('conflict')).length, excluded: exclusions.length } }
    // Free space is volatile; identity/manifest validation deliberately excludes it.
    plan.sourceManifest = digest(sourceScan.entries.filter((row) => row.relative_path !== '.omnimux-assets'))
    plan.targetManifest = digest(targetScan.entries.filter((row) => row.relative_path !== '.omnimux-assets'))
    return { ...plan, planHash: digest(plan), conflictSetHash: digest(entries.filter((entry) => entry.operation === 'conflict').map((entry) => [entry.id, entry.fingerprint])) }
  }

  /** Derive actual payload operations and aggregate conservative costs by volume. */
  summarize(plan, decisions = {}, control = null) {
    const selected = plan.entries.filter((entry) => entry.operation !== 'unmigrated' && decisions[entry.id]?.action !== 'skip')
    const copies = selected.filter((entry) => entry.kind === 'file' && entry.operation !== 'reuse')
    const versions = selected.filter((entry) => decisions[entry.id]?.action === 'overwrite' || (entry.operation === 'conflict' && !decisions[entry.id]))
    const copyBytes = copies.reduce((sum, entry) => sum + entry.bytes, 0)
    const versionBytes = versions.reduce((sum, entry) => sum + Number(entry.targetFingerprint?.size ?? 0), 0)
    const jsonBytes = Buffer.byteLength(JSON.stringify({ source: plan.sourceValues, target: plan.targetValues, entries: plan.entries }), 'utf8') * 6
    const journal = 16384 + plan.entries.length * 4096
    const volumes = new Map()
    const add = (identity, role, costs) => {
      const key = `${identity.dev}:${identity.fsid}`
      const row = volumes.get(key) ?? { volumeId: key, roots: [], freeBytes: identity.freeBytes, costs: {} }
      row.roots.push({ role, path: identity.path }); row.freeBytes = Math.min(row.freeBytes, identity.freeBytes)
      for (const [name, bytes] of Object.entries(costs)) row.costs[name] = (row.costs[name] ?? 0) + bytes
      volumes.set(key, row)
    }
    add(plan.target, 'target', { newUniquePayload: copyBytes, overwriteOldVersions: versionBytes,
      stagingSlack: Math.max(0, ...copies.map((entry) => entry.bytes)) + (plan.retainedBytes ?? 0), ledgerBeforeAfter: jsonBytes * 2, journal })
    if (control) add(control, 'home', { ledgerBeforeAfter: jsonBytes * 2, journal: journal * 2 })
    add(plan.source, 'source', { journal: 16384 })
    const space = [...volumes.values()].map((row) => {
      const extraBytes = Object.values(row.costs).reduce((sum, value) => sum + value, 0)
      const reserve = Math.max(RESERVED, Math.ceil(extraBytes * 0.1))
      return { ...row, extraBytes, reserve, requiredBytes: extraBytes + reserve }
    })
    const adopted = plan.targetValues['library.json'].assets
    const refs = adopted.flatMap((asset) => asset.files).filter((file) => file.relative_path)
    const affectedRefs = versions.reduce((sum, entry) => sum + (entry.affectedRefs?.length ?? 0), 0)
    return { adopted: adopted.length, adoptedFiles: new Set(refs.filter((row) => row.kind !== 'directory').map((row) => row.relative_path)).size,
      adoptedDirectories: new Set(refs.filter((row) => row.kind === 'directory').map((row) => row.relative_path)).size,
      copyFiles: copies.length, copyBytes, uniquePayloadBytes: copyBytes,
      reused: selected.filter((entry) => entry.operation === 'reuse').length,
      conflicts: plan.entries.filter((entry) => entry.operation.includes('conflict')).length,
      ordinaryConflicts: plan.entries.filter((entry) => entry.operation === 'conflict').length,
      structureConflicts: new Set(plan.entries.filter((entry) => entry.operation === 'structure-conflict').map((entry) => entry.groupId)).size,
      excluded: plan.exclusions.length, unmigrated: plan.entries.length - selected.length, versionBytes, affectedRefs, space,
      requiredBytes: space.reduce((sum, row) => sum + row.requiredBytes, 0), totalVerifyBytes: selected.filter((entry) => entry.kind === 'file').reduce((sum, entry) => sum + entry.bytes, 0) + versionBytes }
  }

  async validate(plan, allowLockOnly = false) {
    const source = await this.fs.identity(plan.source.path)
    const target = await this.fs.identity(plan.target.path)
    if (!sameRoot(source, plan.source) || !sameRoot(target, plan.target)) throw new AssetsError('root-identity-changed', 'planned directory identity changed')
    if (target.freeBytes < plan.requiredBytes) throw new AssetsError('disk-space-insufficient', 'migration peak space is unavailable')
    const sourceLedgers = await this.ledgers(plan.source.path)
    const targetLedgers = await this.ledgers(plan.target.path, allowLockOnly)
    if (digest(sourceLedgers.values) !== plan.sourceLedgerHashes || digest(targetLedgers.values) !== plan.targetLedgerHashes) {
      throw new AssetsError('plan-stale', 'ledger changed after preflight')
    }
    const sourceScan = await this.fs.scan(source.path)
    const targetScan = await this.fs.scan(target.path)
    if (digest(sourceScan.entries.filter((row) => row.relative_path !== '.omnimux-assets')) !== plan.sourceManifest || digest(targetScan.entries.filter((row) => row.relative_path !== '.omnimux-assets')) !== plan.targetManifest) {
      throw new AssetsError('plan-stale', 'file tree changed after preflight; inspect a new plan')
    }
  }
}
