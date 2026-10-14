import { useEffect, useRef, useState } from 'react'
import { Button, InputField } from '../kit.js'
import { importMaterial, materialUrl } from '../api.js'
import { RecoverableMedia } from './RecoverableMedia.jsx'

export function ImageReference({ avatarId, value, onChange, onError, brief, onBrief, onBusy }) {
  const fileRef = useRef(null)
  const epoch = useRef(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => { epoch.current++; setBusy(false); onChange(''); return () => { epoch.current++ } }, [avatarId])
  useEffect(()=>{onBusy?.(busy)},[busy,onBusy])
  const upload = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const current = ++epoch.current
    setBusy(true)
    try {
      const row = await importMaterial(avatarId, file)
      if (current === epoch.current) onChange(row.id)
    } catch (error) { if (current === epoch.current) onError(error) }
    finally { if (current === epoch.current) setBusy(false) }
  }
  return <div className="omx-avatar-builder">
    <div className="omx-avatar-material-slot">
      {value?<RecoverableMedia src={materialUrl(avatarId,value)} alt="风格参考"/>:null}
      <button type="button" /* exempt-ui01: 风格参考为多行上传槽 */ className="omx-avatar-material-trigger omx-avatar-reference-trigger" aria-label="上传风格参考图" disabled={busy||!avatarId} onClick={()=>fileRef.current?.click()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg><span>{busy?'上传中':value?'更换参考图片':'上传参考图片'}</span><small>可选，保留已选角色特征</small></button>
      {value?<Button onClick={()=>{epoch.current++;setBusy(false);onChange('')}}>移除参考图</Button>:null}
    </div>
    <input hidden type="file" ref={fileRef} accept="image/png,image/jpeg,image/webp" onChange={upload} />
    <InputField value={brief} onChange={event => onBrief(event.target.value)} placeholder="补充角色说明" aria-label="角色说明" />
    <p className="omx-avatar-field-lbl">仅使用您有权使用的素材。</p>
  </div>
}
