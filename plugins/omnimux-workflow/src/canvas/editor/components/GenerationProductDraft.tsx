import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { request } from '../../bridge/apiClient';
import { useT } from '../../i18n';
import { CustomModal, CustomSelect } from '../../ui';
import { useCanvasStore } from '../../store/canvasStore';
import { readDirectory, readPreview, has, branchChoices, transportAsset, parameterValues, type ParameterEntry, type ParameterMode, listAssetSources,
  type AssetSource, type GenerationDirectory, type GenerationPreview, type GenerationRequest } from './generationProductPreview';

export function GenerationProductDraft({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [directory, setDirectory] = useState<GenerationDirectory>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [productId, setProductId] = useState('');
  const [intent, setIntent] = useState('');
  const nodes = useCanvasStore(state => state.nodes);
  const edges = useCanvasStore(state => state.edges);
  const sources = listAssetSources(nodes, edges);
  const [selected, setSelected] = useState<AssetSource[]>([]);
  const [prompt, setPrompt] = useState<string>();
  const [preview, setPreview] = useState<GenerationPreview>();
  const [parameters, setParameters] = useState<Record<string, ParameterEntry>>({});
  const [parameterError, setParameterError] = useState(false);
  const epoch = useRef(0);
  const alive = useRef(true);
  const controllers = useRef(new Set<AbortController>());
  const directorySequence = useRef(0);
  const selection = useRef({ productId, intent });
  selection.current = { productId, intent };
  const invalidate = useCallback(() => {
    epoch.current++;
    setPreview(undefined);
    setChecking(false);
  }, []);
  const sameSource = (left: AssetSource, right: AssetSource) => left.nodeId === right.nodeId && left.index === right.index && left.edgeId === right.edgeId;
  const changed = selected.some(item => !sources.some(source => sameSource(item, source) && source.signature === item.signature));
  const sourceSignature = JSON.stringify(selected.map(item => sources.find(source => sameSource(item, source))?.signature ?? null));
  useEffect(() => { invalidate(); }, [sourceSignature, invalidate]);
  const confirmRoleContext = useCallback(() => setSelected(items => items.map(item => ({ ...item, roleNeedsConfirmation: item.roleChoice !== undefined, slotNeedsConfirmation: item.slotChoice !== undefined }))), []);
  const refreshDirectory = useCallback(async () => {
    invalidate(); confirmRoleContext(); setLoading(true); setError(''); setDirectory(undefined);
    const controller = new AbortController(); controllers.current.add(controller);
    const sequence = ++directorySequence.current;
    try {
      const response = await request<GenerationDirectory>('/omnimux/generation-products', { signal: controller.signal });
      if (!alive.current || controller.signal.aborted || directorySequence.current !== sequence) return;
      if (!response.ok) {
        setError(response.body.message || response.body.error || t('generationDraft.unavailable'));
      } else {
        const next = readDirectory(response.body);
        setDirectory(next);
        const current = selection.current;
        if (current.productId && !next.products.some(product => product.productId === current.productId && product.intents.some(item => item.intent === current.intent))) setIntent('');
      }
    } catch (cause) {
      if (alive.current && !controller.signal.aborted && directorySequence.current === sequence) setError(`${t('generationDraft.unavailable')}${cause instanceof Error ? `: ${cause.message}` : ''}`);
    } finally {
      controllers.current.delete(controller);
      if (alive.current && directorySequence.current === sequence) setLoading(false);
    }
  }, [invalidate, confirmRoleContext, t]);
  useEffect(() => {
    alive.current = true;
    void refreshDirectory();
    return () => { alive.current = false; epoch.current++; controllers.current.forEach(controller => controller.abort()); };
  }, [refreshDirectory]);
  function edit(action: () => void) { invalidate(); setError(''); action(); }
  async function check() {
    if (!directory || !productId || !intent) return;
    invalidate(); setError('');
    const graph = useCanvasStore.getState();
    const currentSources = listAssetSources(graph.nodes, graph.edges);
    if (selected.some(item => item.problem || !item.asset || !currentSources.some(source => sameSource(item, source) && source.signature === item.signature))) {
      setError(t(changed ? 'generationDraft.sourceChanged' : 'generationDraft.unsafe')); return;
    }
    let values: GenerationRequest['parameters'];
    try { values = parameterValues(parameters); } catch { setParameterError(true); return; }
    setParameterError(false);
    let assets: GenerationRequest['assets'];
    try { assets = selected.map(transportAsset); } catch { setError(t('generationDraft.sourceUnconfirmed')); return; }
    const body: GenerationRequest = { schemaVersion: 1, currentFingerprint: directory.currentFingerprint, productId, intent, parameters: values, assets };
    if (prompt !== undefined) body.prompt = prompt;
    const revision = epoch.current;
    const controller = new AbortController(); controllers.current.add(controller); setChecking(true);
    try {
      const response = await request<GenerationPreview>('/omnimux/generation-products/preview', { method: 'POST', body, signal: controller.signal });
      if (!alive.current || controller.signal.aborted || epoch.current !== revision) return;
      const latestGraph = useCanvasStore.getState();
      const latest = listAssetSources(latestGraph.nodes, latestGraph.edges);
      if (selected.some(item => !latest.some(source => sameSource(item, source) && source.signature === item.signature))) { invalidate(); return; }
      if (response.status === 409) { await refreshDirectory(); if (alive.current) setError(t('generationDraft.catalogChanged')); }
      else if (!response.ok) setError(`${t('generationDraft.unavailable')}: ${response.body.message || response.body.error || response.status}`);
      else {
        const next = readPreview(response.body);
        if (next.currentFingerprint !== directory.currentFingerprint) { await refreshDirectory(); if (alive.current) setError(t('generationDraft.catalogChanged')); }
        else setPreview(next);
      }
    } catch (cause) {
      if (alive.current && !controller.signal.aborted && epoch.current === revision) setError(`${t('generationDraft.unavailable')}${cause instanceof Error ? `: ${cause.message}` : ''}`);
    } finally {
      controllers.current.delete(controller);
      if (alive.current && epoch.current === revision) setChecking(false);
    }
  }
  const product = directory?.products.find(item => item.productId === productId);
  const currentIntent = product?.intents.find(item => item.intent === intent);
  const parameterNames = [...new Set([...currentIntent?.alternatives.flatMap(item => Object.keys(item.parameters)) ?? [], ...Object.keys(parameters)])];
  function editParameter(key: string, entry: ParameterEntry) { edit(() => setParameters(items => ({ ...items, [key]: entry }))); setParameterError(false); }
  const modes: { value: ParameterMode; label: string }[] = [
    { value: 'unset', label: t('generationDraft.unset') }, { value: 'text', label: t('generationDraft.text') },
    { value: 'number', label: t('generationDraft.number') }, { value: 'boolean', label: t('generationDraft.boolean') }, { value: 'null', label: t('generationDraft.null') },
  ];
  function previewLabel(result: GenerationPreview) {
    if (result.status === 'ready') return t('generationDraft.ready');
    if (result.issues.some(issue => issue.code === 'qualification_pending')) return t('generationDraft.qualificationPending');
    if (result.issues.some(issue => issue.code === 'input_pending')) return t('generationDraft.inputPending');
    if (result.issues.some(issue => issue.code === 'default_ambiguous')) return t('generationDraft.parameterPending');
    return t(result.status === 'rejected' ? 'generationDraft.rejected' : 'generationDraft.unknown');
  }
  function editAsset(index: number, patch: Partial<AssetSource>) { edit(() => setSelected(items => items.map((item, position) => position === index ? { ...item, ...patch } : item))); }
  function move(index: number, direction: number) {
    edit(() => setSelected(items => {
      const next = [...items], other = index + direction;
      if (other >= 0 && other < next.length) [next[index], next[other]] = [next[other]!, next[index]!];
      return next;
    }));
  }
  return <CustomModal open onCancel={onClose} title={t('generationDraft.title')} className="wf-generation-draft" width="min(720px, calc(100vw - 32px))"
    footer={<><button type="button" className="wf-modal-btn-cancel" onClick={onClose}>{t('generationDraft.discard')}</button>
      <button type="button" className="wf-modal-btn-primary" disabled={loading || checking || !directory || !productId || !intent} onClick={check}>{t(checking ? 'generationDraft.checking' : 'generationDraft.check')}</button></>}>
    <p>{t('generationDraft.notice')}</p>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">{t('generationDraft.loading')}</p> : !directory ? <button type="button" className="wf-modal-btn-cancel" onClick={refreshDirectory}>{t('generationDraft.retry')}</button> : <>
      <div className="wf-generation-draft__choices">
        <label className="wf-generation-draft__field">{t('generationDraft.product')}
          <CustomSelect variant="standard" placeholder={t('generationDraft.product')} value={productId}
            options={directory.products.map(item => ({ value: item.productId, label: item.label }))}
            onChange={value => edit(() => { confirmRoleContext(); setProductId(value); setIntent(''); })} />
        </label>
        <label className="wf-generation-draft__field">{t('generationDraft.intent')}
          <CustomSelect variant="standard" placeholder={t('generationDraft.intent')} value={intent}
            options={product?.intents.map(item => ({ value: item.intent, label: item.label })) ?? []} onChange={value => edit(() => { confirmRoleContext(); setIntent(value); })} />
        </label>
      </div>
      <section>
        <h3>{t('generationDraft.declarations')}</h3>
        {currentIntent?.alternatives.map((alternative, index) => <details key={index} data-generation-branch={index}>
          <summary>{t('generationDraft.branch')} {index + 1}</summary><pre>{JSON.stringify(alternative, null, 2)}</pre>
        </details>)}
        {!currentIntent?.alternatives.length && <p>{t('generationDraft.unknown')}</p>}
      </section>
      <section>
        <h3>{t('generationDraft.parameters')}</h3><p>{t('generationDraft.parameterNotice')}</p>
        {parameterNames.map(key => {
          const entry = parameters[key] ?? { mode: 'unset' as const, text: '' };
          return <div key={key} className="wf-generation-draft__parameter" data-parameter={key}>
            <span>{key}</span><CustomSelect variant="standard" value={entry.mode} options={modes} onChange={mode => editParameter(key, { ...entry, mode })} />
            {entry.mode !== 'unset' && entry.mode !== 'null' && <input aria-label={key} value={entry.text} onChange={event => editParameter(key, { ...entry, text: event.target.value })} />}
          </div>;
        })}
        {parameterError && <p role="alert">{t('generationDraft.parameterIncomplete')}</p>}
      </section>
      <section>
        <h3>{t('generationDraft.sources')}</h3>
        <div className="wf-generation-draft__sources">{sources.map((source, index) => <button type="button" key={index} className="wf-modal-btn-cancel" onClick={() => edit(() => setSelected(items => [...items, source]))}>{t('generationDraft.add')} {source.label}</button>)}</div>
        {!sources.length && <p>{t('generationDraft.empty')}</p>}
        {selected.map((source, index) => {
          const latest = sources.find(item => sameSource(item, source));
          const stale = !latest || latest.signature !== source.signature;
          return <div key={index} className="wf-generation-draft__asset" data-selected-asset={index}>
            <strong>{index + 1}. {source.label}</strong>
            <div className="wf-generation-draft__actions">
              <button type="button" aria-label={t('generationDraft.up')} className="wf-modal-btn-cancel" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
              <button type="button" aria-label={t('generationDraft.down')} className="wf-modal-btn-cancel" disabled={index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
              <button type="button" aria-label={t('generationDraft.remove')} className="wf-modal-btn-cancel" onClick={() => edit(() => setSelected(items => items.filter((_, position) => position !== index)))}><Trash2 size={14} /></button>
            </div>
            <div className="wf-generation-draft__choices">
              <CustomSelect variant="standard" placeholder={t('generationDraft.roleBranch')} value={source.branchChoice}
                options={currentIntent?.alternatives.map((_, branch) => ({ value: branch, label: `${t('generationDraft.branch')} ${branch + 1}` })) ?? []}
                onChange={branchChoice => editAsset(index, { branchChoice, roleNeedsConfirmation: source.roleChoice !== undefined, slotNeedsConfirmation: source.slotChoice !== undefined })} />
              <CustomSelect variant="standard" placeholder={t('generationDraft.role')} value={source.roleChoice ?? (typeof source.asset?.role === 'string' ? source.asset.role : undefined)}
                options={[...new Set([...branchChoices(currentIntent?.alternatives[source.branchChoice ?? -1], 'role'), ...(typeof source.asset?.role === 'string' ? [source.asset.role] : []), ...(source.roleChoice === undefined ? [] : [source.roleChoice])])].map(value => ({ value, label: value, disabled: source.roleNeedsConfirmation && value === source.roleChoice && !branchChoices(currentIntent?.alternatives[source.branchChoice ?? -1], 'role').includes(value) && value !== source.asset?.role }))}
                onChange={roleChoice => editAsset(index, { roleChoice, roleNeedsConfirmation: false })} />
              <CustomSelect variant="standard" placeholder={t('generationDraft.slot')} value={source.slotChoice ?? (typeof source.asset?.targetSlot === 'string' ? source.asset.targetSlot : undefined)}
                options={[...new Set([...branchChoices(currentIntent?.alternatives[source.branchChoice ?? -1], 'slot'), ...(typeof source.asset?.targetSlot === 'string' ? [source.asset.targetSlot] : []), ...(source.slotChoice === undefined ? [] : [source.slotChoice])])].map(value => ({ value, label: value, disabled: source.slotNeedsConfirmation && value === source.slotChoice && !branchChoices(currentIntent?.alternatives[source.branchChoice ?? -1], 'slot').includes(value) && value !== source.asset?.targetSlot }))}
                onChange={slotChoice => editAsset(index, { slotChoice, slotNeedsConfirmation: false })} />
            </div>
            {source.asset && (!has(source.asset, 'outputId') || !has(source.asset, 'outputVersion')) && <p>{t('generationDraft.identityAbsent')}</p>}
            {!source.addresses.length && <p>{t('generationDraft.addressAbsent')}</p>}
            {source.addresses.length > 1 && <label className="wf-generation-draft__field">{t('generationDraft.addressPending')}
              <CustomSelect variant="standard" placeholder={t('generationDraft.address')} value={source.addressChoice}
                options={source.addresses.map(item => ({ value: item.key, label: `${item.key}: ${item.value}` }))} onChange={addressChoice => editAsset(index, { addressChoice })} />
            </label>}
            {source.mimeOptions && <label className="wf-generation-draft__field">{t('generationDraft.mimeConflict')}
              <CustomSelect variant="standard" placeholder={t('generationDraft.mime')} value={source.mimeChoice}
                options={source.mimeOptions.map(item => ({ value: item.key, label: `${item.key}: ${JSON.stringify(item.value).replace(/^\"|\"$/g, '')}` }))} onChange={mimeChoice => editAsset(index, { mimeChoice })} />
            </label>}
            {source.identityMismatch && <p>{t('generationDraft.identityMismatch')} {source.nodeId} / {source.edgeId ?? ''} / {JSON.stringify([source.asset?.sourceNodeId, source.asset?.edgeId])}
              {!source.identityConfirmed && <button type="button" className="wf-modal-btn-cancel" onClick={() => editAsset(index, { identityConfirmed: true })}>{t('generationDraft.confirmIdentity')}</button>}
            </p>}
            {(source.roleNeedsConfirmation || source.slotNeedsConfirmation) && <p role="alert">{t('generationDraft.rolePending')}</p>}
            {source.problem && <p role="alert">{t('generationDraft.unsafe')}</p>}
            {stale && <p role="alert">{t('generationDraft.sourceChanged')}</p>}
            {stale && latest && <button type="button" className="wf-modal-btn-cancel" onClick={() => edit(() => setSelected(items => items.map((item, position) => position === index ? { ...latest, branchChoice: item.branchChoice, roleChoice: item.roleChoice, slotChoice: item.slotChoice, addressChoice: item.addressChoice, mimeChoice: item.mimeChoice, roleNeedsConfirmation: item.roleNeedsConfirmation || (item.roleChoice !== undefined && !Object.is(item.asset?.role, latest.asset?.role)), slotNeedsConfirmation: item.slotNeedsConfirmation || (item.slotChoice !== undefined && !Object.is(item.asset?.targetSlot, latest.asset?.targetSlot)) } : item)))}>{t('generationDraft.reconfirm')}</button>}
            <details><summary>{t('generationDraft.metadata')}</summary><pre>{JSON.stringify(source.asset, null, 2)}</pre></details>
          </div>;
        })}
      </section>
      <label className="wf-generation-draft__field">{t('generationDraft.prompt')}
        <textarea aria-label={t('generationDraft.prompt')} value={prompt ?? ''} onChange={event => edit(() => setPrompt(event.target.value))} />
      </label>
      {preview && !changed && <div role="status"><p>{previewLabel(preview)}</p>
        {preview.issues.length > 0 && <details><summary>{t('generationDraft.reasons')}</summary><pre>{JSON.stringify(preview.issues, null, 2)}</pre></details>}
      </div>}
      <p className="wf-generation-draft__catalog">{directory.products.map(item => item.label).join(' / ')}</p>
    </>}
  </CustomModal>;
}
