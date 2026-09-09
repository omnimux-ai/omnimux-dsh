import { useEffect, useRef, useState } from 'react'
import { Button, DropdownSelect, InputField, ModalDialog } from 'dsh-ui-kit'
import { inspectStoragePlan, useStorageTask } from './use-storage-task.js'

export const STORAGE_PHASES = ['checking', 'awaiting_confirmation', 'freezing', 'copying', 'verifying', 'ready',
  'committing', 'waiting_conflict', 'awaiting_partial', 'paused', 'waiting_volume', 'failed_recoverable',
  'recovery_required', 'completed', 'completed_with_skips', 'abandoning', 'abandoned', 'cleanup_running']
const terminal = new Set(['completed', 'completed_with_skips', 'abandoned'])

/** Missing totals are indeterminate; transferred bytes never imply a committed migration. */
export function storageProgress(progress = {}) {
  const verifying = progress.phase === 'verifying'
  const done = verifying ? progress.verifyBytes : progress.copyBytes
  const total = verifying ? progress.totalVerifyBytes : progress.totalCopyBytes
  return Number.isFinite(total) && total > 0 && Number.isFinite(done)
    && ['copying', 'verifying'].includes(progress.phase)
    ? { value: Math.max(0, Math.min(done, total)), max: total } : {}
}

function label(t, group, value) {
  const key = `storage.${group}.${value}`
  const text = t(key)
  return text && text !== key ? text : t(`storage.${group}.unknown`)
}

/** Error codes are localized; raw host diagnostics remain available, never mistaken for instructions. */
export function storageErrorText(t, error) {
  if (!error) return ''
  const code = error.code || error.error || ''
  const key = `storage.error.${code}`
  const text = t(key)
  return text && text !== key ? text : t('storage.error.unknown')
}

export function validDestination(value, original = '') {
  return typeof value === 'string' && value.trim() === value && value !== original && value.length > 0
    && !/^[A-Za-z]:|^[\/]|[\\\0]/.test(value)
    && value.split('/').every((part) => part && part !== '.' && part !== '..')
    && !['.omnimux-assets', 'library.json', 'artifacts.json', 'mappings.json'].includes(value.split('/')[0])
}

/** Keep one native-kit modal for plan review, progress and recovery. */
export function StorageSettingsDialog({ t, onClose }) {
  const storage = useStorageTask(true)
  const { status, task, entries, error, readError, busy, loading, send } = storage
  const [path, setPath] = useState('')
  const [newNames, setNewNames] = useState({})
  const [cleanup, setCleanup] = useState(null)
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const [partialPage, setPartialPage] = useState(0)
  const [inspecting, setInspecting] = useState(false)
  const [localError, setLocalError] = useState(null)
  const mounted = useRef(true)
  const inspection = useRef(0)
  const closeButton = useRef(null)
  const triggerRef = useRef(typeof document === 'undefined' ? null : document.activeElement)
  useEffect(() => {
    mounted.current = true
    const trigger = triggerRef.current
    closeButton.current?.focus()
    return () => { mounted.current = false; inspection.current += 1; if (trigger?.isConnected) trigger.focus?.() }
  }, [])
  useEffect(() => { if (status?.root?.path) setPath((current) => current || status.root.path) }, [status?.root?.path])
  useEffect(() => {
    inspection.current += 1
    setConfirmation(null); setCleanup(null); setConfirmAbandon(false); setNewNames({}); setLocalError(null)
  }, [task?.id, task?.planHash])
  const active = task && !terminal.has(task.state)
  const mutable = task && ['awaiting_confirmation', 'waiting_conflict', 'paused'].includes(task.state)
  const disabled = busy || inspecting || loading || Boolean(readError)
  const taskPath = task ? `/tasks/${encodeURIComponent(task.id)}` : ''
  const review = async (action, entry = null) => {
    if (disabled) return
    setInspecting(true); setLocalError(null); setConfirmation(null); setPartialPage(0)
    const current = ++inspection.current
    try {
      const scope = await inspectStoragePlan(task, undefined, action === 'partial' ? 'unmigrated' : '')
      if (mounted.current && current === inspection.current) setConfirmation({ action, entry, scope, taskId: task.id,
        newName: entry ? newNames[entry.id] : '', planHash: task.planHash, decisionRevision: scope.decisionRevision,
        unmigratedSetHash: scope.unmigratedSetHash })
    } catch (caught) { if (mounted.current) setLocalError(caught) }
    finally { if (mounted.current) setInspecting(false) }
  }
  const applyConfirmation = async () => {
    const saved = confirmation
    if (!saved || saved.decisionRevision !== task.decisionRevision || saved.planHash !== task.planHash || saved.taskId !== task.id) return
    let result = null
    if (saved.action === 'start') result = await send(`${taskPath}/confirm`, { planHash: saved.planHash, expectedDecisionRevision: saved.decisionRevision, confirm: true, acceptPartial: false })
    else if (saved.action === 'partial') result = await send(`${taskPath}/accept-partial`, { planHash: saved.planHash, unmigratedSetHash: saved.unmigratedSetHash, confirm: true })
    else result = await send(`${taskPath}/decisions`, { planHash: saved.planHash, expectedDecisionRevision: saved.decisionRevision,
      ...(saved.entry ? { entries: [{ id: saved.entry.id, action: saved.action, expectedFingerprint: saved.entry.fingerprint,
        ...(saved.action === 'keep-both' ? { newName: saved.newName } : {}) }] }
        : { conflictSetHash: saved.scope.conflictSetHash, action: saved.action }) })
    if (result && mounted.current) setConfirmation(null)
  }
  const shownError = localError || error || readError || status?.error || task?.error
  const confirmationStale = confirmation && (confirmation.decisionRevision !== task?.decisionRevision || confirmation.planHash !== task?.planHash || confirmation.taskId !== task?.id)
  const confirmBlocked = confirmation?.action === 'start' && (confirmation.scope.blockers > 0 || confirmation.scope.unresolved > 0)
  const batchEmpty = confirmation && !confirmation.entry && ['overwrite', 'skip'].includes(confirmation.action) && confirmation.scope.ordinary === 0
  const controls = ['', 'conflict', 'excluded', 'unmigrated', 'adopted', 'versions', 'copy', 'reuse', 'mkdir']
  return (
    <ModalDialog open onClose={onClose} title={t('storage.title')} closeLabel={t('stage.close')} size="lg"
      footer={<Button ref={closeButton} variant="outline" onClick={onClose}>{t('stage.close')}</Button>}>
      <div className="omnimux-assets-storage">
        <p>{t('storage.current')}: <code>{status?.root?.path || t('storage.loading')}</code></p>
        {status && <p>{label(t, 'availability', status.availability)} · {t(status.root?.path === status.defaultRoot ? 'storage.defaultActive' : 'storage.customActive')}</p>}
        <p>{t('storage.notice')}</p>
        <p>{t('storage.externalWarning')}</p>
        {active && <p>{t('storage.closeNotice')}</p>}
        {shownError && <div role="alert">
          <p className="omnimux-assets-error">{storageErrorText(t, shownError)}</p>
          {shownError.message && <details><summary>{t('storage.diagnostics')}</summary><code>{shownError.message}</code></details>}
          <Button variant="outline" disabled={busy} onClick={() => { setLocalError(null); storage.dismissError(); void storage.refresh() }}>{t('storage.retryRead')}</Button>
        </div>}
        {status && !status.capabilities?.supported && <p role="alert">{t('storage.error.storage-platform-unsupported')}</p>}
        {(!status || loading) && <p role="status">{t('storage.loading')}</p>}
        {status && !active && <>
          <InputField aria-label={t('storage.target')} value={path} disabled={busy} onChange={(event) => setPath(event.target.value)} />
          <div className="omnimux-assets-storage-actions">
            <Button disabled={disabled} onClick={async () => { const result = await send('/pick'); if (result?.path && mounted.current) setPath(result.path) }}>{t('storage.pick')}</Button>
            <Button disabled={disabled || !status.defaultRoot} onClick={() => setPath(status.defaultRoot)}>{t('storage.default')}</Button>
            <Button variant="primary" disabled={disabled || !path.trim() || !status.capabilities?.supported || status.availability !== 'online'} onClick={() => send('/preflight', { targetPath: path.trim(), expectedEpoch: status.epoch, requestId: crypto.randomUUID() })}>{t('storage.check')}</Button>
          </div>
        </>}
        {task && <>
          <h3 aria-live="polite">{label(t, 'phase', task.state)}</h3>
          <p>{t('storage.source')}: <code>{task.source?.path}</code></p>
          <p>{t('storage.target')}: <code>{task.target?.path}</code></p>
          {['checking', 'copying', 'verifying', 'freezing', 'committing'].includes(task.state) && <progress aria-label={label(t, 'phase', task.state)} {...storageProgress(task.progress)} />}
          <div>
            <p>{t('storage.scanned')}: {task.progress?.scannedItems ?? 0} · {t('storage.files')}: {task.progress?.completedFiles ?? 0} / {task.progress?.totalItems ?? t('storage.unknownTotal')}</p>
            <p>{t('storage.bytes')}: {task.progress?.copyBytes ?? 0} / {task.progress?.totalCopyBytes ?? t('storage.unknownTotal')} · {t('storage.verify')}: {task.progress?.verifyBytes ?? 0} / {task.progress?.totalVerifyBytes ?? t('storage.unknownTotal')}</p>
            <p>{t('storage.skipped')}: {task.progress?.skippedCount ?? 0} · {t('storage.errors')}: {task.progress?.errorCount ?? 0}</p>
          </div>
          {task.progress?.currentEntryId && <p>{t('storage.currentEntry')}: <code>{task.progress.currentEntryId}</code></p>}
          {task.summary && <p>{t('storage.adopted')}: {task.summary.adopted} · {t('storage.copyFiles')}: {task.summary.copyFiles} · {t('storage.reused')}: {task.summary.reused} · {t('storage.conflicts')}: {task.summary.conflicts} · {t('storage.excluded')}: {task.summary.excluded}</p>}
          {task.summary?.space?.map((volume) => <p key={volume.volumeId}>{t('storage.peakSpace')}: <code>{volume.roots.map((root) => root.role).join(' / ')}</code> · {volume.requiredBytes} B · {t('storage.reserve')}: {volume.reserve} B</p>)}
           {task.summary && <p>{t('storage.uniquePayload')}: {task.summary.uniquePayloadBytes} B · {t('storage.recoveryBytes')}: {task.summary.versionBytes} B</p>}
           <p>{t('storage.attemptBytes')}: {task.progress?.attemptCopyBytes ?? 0} B</p>
           {entries.blockers.map((blocker, index) => <div role="alert" key={index}><p>{t('storage.blocker')}</p><code>{blocker.recordId || ''} {blocker.reason}</code></div>)}
          <DropdownSelect aria-label={t('storage.entryFilter')} value={storage.kind} disabled={busy || inspecting}
            options={controls.map((value) => ({ value, label: value ? label(t, 'operation', value) : t('storage.allEntries') }))} onChange={storage.setKind} />
          <p>{t('storage.pageScope').replace('{start}', String(entries.entries.length ? storage.cursor + 1 : 0)).replace('{end}', String(storage.cursor + entries.entries.length))}</p>
          <div className="omnimux-assets-storage-list" aria-busy={loading}>
            {!loading && entries.entries.length === 0 && <p>{t('storage.emptyEntries')}</p>}
            {entries.entries.map((entry, index) => <div className="omnimux-assets-storage-entry" key={entry.id || `${entry.origin}:${entry.relative_path}:${index}`}>
              {entry.sourceRel ? <p>{t('storage.source')}: <code>{entry.sourceRel}</code></p> : null}
              <p>{t(entry.origin === 'source' ? 'storage.source' : 'storage.target')}: <code>{entry.targetRel || entry.relative_path || entry.recordId || t('storage.pathUnavailable')}</code></p>
              <p>{label(t, 'operation', entry.operation || 'excluded')}{Number.isFinite(entry.bytes) ? ` · ${entry.bytes} B` : ''}{entry.decision ? ` · ${label(t, 'decision', entry.decision.action)}` : ''}</p>
              {(entry.reason || entry.reasonCode) && <p>{label(t, 'reason', entry.reasonCode || entry.reason)} <code>{entry.reason}</code></p>}
               {entry.groupEntries && <p><code>{entry.conflictPrefix}</code> · {t('storage.groupCount')}: {entry.groupEntries.length}</p>}
               {entry.affectedRefs?.length > 0 && <p>{t('storage.affectedRefs')}: {entry.affectedRefs.length}</p>}
              {entry.operation === 'unmigrated' || entry.decision?.action === 'skip' ? <p>{t('storage.skipNotice')}</p> : null}
              {entry.decision?.newName && <p>{t('storage.newName')}: <code>{entry.decision.newName}</code></p>}
              {entry.operation?.includes('conflict') && mutable && <>
                <p>{t('storage.sourceSize')}: {entry.sourceFingerprint?.size ?? t('storage.unknownTotal')} B · {t('storage.targetSize')}: {entry.targetFingerprint?.size ?? t('storage.unknownTotal')} B</p>
                <p>{t('storage.modified')}: <code>{entry.sourceFingerprint?.mtimeNs || t('storage.unknownTotal')} / {entry.targetFingerprint?.mtimeNs || t('storage.unknownTotal')}</code></p>
                <p>{entry.operation === 'conflict' ? t('storage.versionNotice') : t('storage.structureNotice')}</p>
                 {['source', 'target'].map((side) => entry.preview?.[side] ? <a key={side} href={`/omnimux/assets/storage${taskPath}/preview?entry=${encodeURIComponent(entry.id)}&side=${side}`} target="_blank" rel="noreferrer">{t(`storage.preview.${side}`)}</a> : <span key={side}>{t(`storage.preview.${side}`)}: {t('storage.preview.unavailable')}</span>)}
                <div className="omnimux-assets-storage-actions">
                  <Button disabled={disabled || entry.operation !== 'conflict'} onClick={() => review('overwrite', entry)}>{t('storage.overwrite')}</Button>
                  <Button disabled={disabled} onClick={() => review('skip', entry)}>{t('storage.skip')}</Button>
                  <InputField aria-label={`${t('storage.newName')}: ${entry.sourceRel}`} value={newNames[entry.id] ?? ''} disabled={disabled} onChange={(event) => setNewNames({ ...newNames, [entry.id]: event.target.value })} />
                  <Button disabled={disabled || !validDestination(newNames[entry.id], entry.targetRel)} onClick={() => review('keep-both', entry)}>{t('storage.keepBoth')}</Button>
                </div>
              </>}
            </div>)}
          </div>
          <div className="omnimux-assets-storage-actions">
            <Button disabled={disabled || storage.cursor === 0} onClick={() => storage.setCursor(Math.max(0, storage.cursor - 200))}>{t('storage.previousPage')}</Button>
            <Button disabled={disabled || entries.nextCursor == null} onClick={() => storage.setCursor(entries.nextCursor)}>{t('storage.nextPage')}</Button>
          </div>
          {mutable && task.summary?.conflicts > 0 && <div className="omnimux-assets-storage-actions">
            <Button disabled={disabled} onClick={() => review('overwrite')}>{t('storage.overwriteAll')}</Button>
            <Button disabled={disabled} onClick={() => review('skip')}>{t('storage.skipAll')}</Button>
          </div>}
          {inspecting && <p role="status">{t('storage.inspectPlan')}</p>}
          {confirmation && <section className="omnimux-assets-storage-confirm" aria-label={t('storage.confirmScope')}>
            <h4>{t('storage.confirmScope')}</h4>
            <p>{t('storage.planScope').replace('{total}', String(confirmation.scope.total)).replace('{unresolved}', String(confirmation.scope.unresolved)).replace('{skipped}', String(confirmation.scope.skipped))}</p>
            <p>{confirmation.entry ? label(t, 'decision', confirmation.action) : confirmation.action === 'start' ? t('storage.start') : confirmation.action === 'partial' ? t('storage.acceptPartial') : t(confirmation.action === 'overwrite' ? 'storage.overwriteAll' : 'storage.skipAll')}</p>
            {!confirmation.entry && ['overwrite', 'skip'].includes(confirmation.action) && <p>{t('storage.batchScope')}</p>}
            {confirmation.entry ? <p><code>{confirmation.entry.sourceRel} / {confirmation.newName || confirmation.entry.targetRel}</code></p> : <p>{t('storage.ordinaryCount')}: {confirmation.scope.ordinary} · {t('storage.structureCount')}: {confirmation.scope.structure} · {t('storage.recoveryBytes')}: {confirmation.scope.recoveryBytes} B</p>}
            {confirmation.action === 'partial' && <div className="omnimux-assets-storage-list">{confirmation.scope.unavailable.slice(partialPage * 100, (partialPage + 1) * 100).map((row, index) => <p key={index}><code>{row.ledger} / {row.recordId} / {row.logical_path}</code> · {label(t, 'reason', row.reasonCode)} · <code>{row.retainedAt || row.recovery_ref?.entryId}</code></p>)}</div>}
             {confirmation.action === 'partial' && <div><Button disabled={partialPage === 0} onClick={() => setPartialPage(partialPage - 1)}>{t('storage.previous')}</Button><span>{partialPage + 1} / {Math.max(1, Math.ceil(confirmation.scope.unavailable.length / 100))}</span><Button disabled={(partialPage + 1) * 100 >= confirmation.scope.unavailable.length} onClick={() => setPartialPage(partialPage + 1)}>{t('storage.next')}</Button></div>}
             <p>{t('storage.planToken')}: <code>{confirmation.planHash}</code></p>
            {confirmationStale && <p role="alert">{t('storage.error.plan-stale')}</p>}
            {confirmBlocked && <p role="alert">{t('storage.resolveAll')}</p>}
            {batchEmpty && <p role="alert">{t('storage.noOrdinaryConflicts')}</p>}
            <div className="omnimux-assets-storage-actions">
              <Button variant="primary" disabled={disabled || confirmationStale || confirmBlocked || batchEmpty} onClick={applyConfirmation}>{t('storage.confirm')}</Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>{t('storage.cancel')}</Button>
            </div>
          </section>}
          {task.state === 'awaiting_confirmation' && <Button variant="primary" disabled={disabled || entries.blockers.length > 0} onClick={() => review('start')}>{t('storage.reviewStart')}</Button>}
          {['copying', 'verifying'].includes(task.state) && <Button disabled={busy} onClick={() => send(`${taskPath}/pause`, { expectedSeq: task.seq })}>{t('storage.pause')}</Button>}
          {['paused', 'waiting_conflict', 'waiting_volume', 'failed_recoverable', 'recovery_required'].includes(task.state) && task.confirmedAt && <Button disabled={disabled} onClick={() => send(`${taskPath}/resume`, { expectedSeq: task.seq })}>{t('storage.resume')}</Button>}
          {task.state === 'failed_recoverable' && !task.confirmedAt && <p>{t('storage.retryPreflight')}</p>}
          {task.state === 'awaiting_partial' && <div><p>{t('storage.partial')}: {task.unmigratedCount}</p><Button disabled={disabled} onClick={() => review('partial')}>{t('storage.reviewPartial')}</Button></div>}
          {active && ['awaiting_confirmation', 'waiting_conflict', 'paused', 'waiting_volume', 'failed_recoverable'].includes(task.state) && !task.commitHash && <Button disabled={disabled} onClick={() => setConfirmAbandon(true)}>{t('storage.abandon')}</Button>}
          {confirmAbandon && <section aria-label={t('storage.abandon')}><p>{t('storage.abandonWarning')}</p><Button disabled={disabled} onClick={async () => { const result = await send(`${taskPath}/abandon`, { expectedSeq: task.seq, confirm: true }); if (result && mounted.current) setConfirmAbandon(false) }}>{t('storage.confirm')}</Button><Button disabled={busy} onClick={() => setConfirmAbandon(false)}>{t('storage.cancel')}</Button></section>}
          {terminal.has(task.state) && task.retentionUntil && <>
            <p>{t('storage.retention')}: {task.retentionUntil}</p>
            <Button disabled={disabled} onClick={async () => { const result = await send(`${taskPath}/cleanup`, {}); if (mounted.current) setCleanup(result) }}>{t('storage.inspectCleanup')}</Button>
            {cleanup && <section><p>{t('storage.cleanupWarning')} ({cleanup.entries?.length ?? 0})</p>
              {cleanup.reason && <p>{label(t, 'reason', cleanup.reason)}</p>}
              <div className="omnimux-assets-storage-list">{cleanup.entries?.map((entry, index) => <p key={index}><code>{entry.rel}</code></p>)}</div>
              <Button disabled={disabled || !cleanup.eligible} onClick={async () => { const result = await send(`${taskPath}/cleanup`, { manifestHash: cleanup.manifestHash, confirm: true }); if (result && mounted.current) setCleanup(null) }}>{t('storage.confirmCleanup')}</Button>
              <Button disabled={busy} onClick={() => setCleanup(null)}>{t('storage.cancel')}</Button>
            </section>}
          </>}
        </>}
      </div>
    </ModalDialog>
  )
}
