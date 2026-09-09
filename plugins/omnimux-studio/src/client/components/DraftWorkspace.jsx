import React, { useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { useStudioApi, useStudioStore } from '../use-studio-store.js'
import { initialDraft } from '../studio-store.js'
import { modelsFor, PRESETS } from '../fixtures.js'
import { OrderedEditor } from './OrderedEditor.jsx'
import { ModelSelectPopover } from './ModelSelectPopover.jsx'

/** Shared main/detail form: all durable input fields live in the scope store. */
export function DraftWorkspace({ mode }) {
  const store = useStudioApi()
  const draft = useStudioStore(state => state.drafts[mode])
  const [modelOpen, setModelOpen] = useState(false)
  const [errors, setErrors] = useState([])
  const patch = value => store.updateDraft(mode, value)
  const spec = value => patch({ spec: value })
  const submit = () => { const result = store.submitDraft(mode); setErrors(result.ok ? [] : result.errors) }
  const slots = mode === 'image' ? [['reference', '参考图', 'image']] : draft.submode === 'firstlast' ? [['first', '首帧', 'image'], ['last', '尾帧', 'image']] : draft.submode === 'ref' ? [['reference-video', '参考视频', 'video'], ['reference-image', '参考图', 'image']] : [['edit-video', '编辑视频', 'video'], ['edit-image', '编辑参考图', 'image']]
  const model = modelsFor(mode).find(item => item.id === draft.modelId)
  return <section className="studio-draft-card" aria-label={`${mode} 草稿`}>
    {mode === 'agent' && <div className="studio-presets">{PRESETS.map(item => <Button key={item.id} onClick={() => { store.applyPreset(item.id); setModelOpen(false); setErrors([]) }}>{item.label}</Button>)}</div>}
    {mode === 'video' && <div className="studio-toolbar">{[['ref', '参考生视频'], ['firstlast', '首尾帧'], ['edit', '编辑']].map(([id, label]) => <Button key={id} aria-pressed={draft.submode === id} onClick={() => patch({ submode: id })}>{label}</Button>)}</div>}
    {mode !== 'agent' && <div className="studio-reference-slots">{slots.map(([slot, label, kind]) => {
      const reference = draft.references.find(item => item.slot === slot)
      return <div className="studio-reference" key={slot}>
        <span>{label} · 仅样例，不上传</span>
        {reference ? <><span>{reference.name}</span><Button onClick={() => patch({ references: draft.references.filter(item => item.slot !== slot) })}>移除</Button></> : <Button onClick={() => patch({ references: [...draft.references, { id: crypto.randomUUID(), slot, kind, source: 'fixture', fixtureId: `mock:sample-${kind}`, fileId: null, name: `Mock ${label}`, mime: kind === 'image' ? 'image/jpeg' : 'video/mp4' }] })}>载入样例</Button>}
      </div>
    })}</div>}
    {mode !== 'agent' && draft.references.filter(ref => !slots.some(([slot]) => slot === ref.slot)).map(ref => <div className="studio-toolbar" key={ref.id}><span>{ref.name} · 当前模式不兼容</span><Button onClick={() => patch({ references: draft.references.filter(item => item.id !== ref.id) })}>移除不兼容参考</Button></div>)}
    <OrderedEditor document={draft.document} allowTokens={mode === 'agent'} onChange={document => patch({ document })} onSubmit={submit} />
    {draft.skillId && <div className="studio-toolbar"><span>演示技能：{draft.skillId}</span><Button onClick={() => { patch({ skillId: null, presetId: null, ...(draft.spec ? {} : { modelId: initialDraft('agent').modelId, spec: initialDraft('agent').spec }) }); setModelOpen(false) }}>卸载技能（保留正文）</Button></div>}
    {draft.spec && <div className="studio-parameters">
      <div className="studio-popover-anchor"><Button aria-expanded={modelOpen} onClick={() => setModelOpen(!modelOpen)}>{model?.name ?? '选择演示模型'}</Button>
        <ModelSelectPopover isOpen={modelOpen} type={mode} selectedModel={draft.modelId} onSelect={modelId => patch({ modelId })} onClose={() => setModelOpen(false)} />
      </div>
      <fieldset><legend>分辨率</legend>{(mode === 'image' ? ['1K', '2K', '4K'] : ['480P', '720P', '1080P']).map(value => <Button key={value} aria-pressed={draft.spec.resolution === value} onClick={() => spec({ resolution: value })}>{value}</Button>)}</fieldset>
      <fieldset><legend>比例</legend>{(mode === 'image' ? ['Auto', '1:1', '9:16', '16:9', '3:4'] : ['16:9', '9:16', '1:1']).map(value => <Button key={value} aria-pressed={draft.spec.aspect === value} onClick={() => spec({ aspect: value })}>{value}</Button>)}</fieldset>
      {mode === 'image' ? <fieldset><legend>批量</legend>{[1, 2, 3, 4].map(value => <Button key={value} aria-pressed={draft.spec.batchCount === value} onClick={() => spec({ batchCount: value })}>{value} 张</Button>)}</fieldset> : <fieldset><legend>时长</legend><Button aria-pressed={draft.spec.durationMode === 'auto'} onClick={() => spec({ durationMode: 'auto', durationSeconds: null })}>Auto</Button>{[5, 8, 10, 15].map(value => <Button key={value} aria-pressed={draft.spec.durationMode === 'fixed' && draft.spec.durationSeconds === value} onClick={() => spec({ durationMode: 'fixed', durationSeconds: value })}>{value}s</Button>)}</fieldset>}
    </div>}
    <div className="studio-submit-row"><span>Mock · {(model?.cost ?? 0) * (draft.spec?.batchCount ?? 1)} 演示点</span><Button onClick={() => { patch(initialDraft(mode)); setErrors([]); setModelOpen(false) }}>重置草稿</Button><Button onClick={submit}>模拟提交</Button></div>
    {errors.length > 0 && <div role="alert">{errors.join('；')}</div>}
  </section>
}
