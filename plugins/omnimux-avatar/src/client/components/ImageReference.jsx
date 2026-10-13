import { useEffect, useRef, useState } from 'react'
import { Button, InputField } from '../kit.js'
import { importMaterial, materialUrl } from '../api.js'
import { RecoverableMedia } from './RecoverableMedia.jsx'

export function ImageReference({ avatarId, value, onChange, onError, onReset, brief, onBrief, onBusy }) {
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
    <div className="omx-avatar-pane-tools"><span className="omx-avatar-block-title">风格参考</span><Button disabled={busy || !avatarId} onClick={() => fileRef.current?.click()}>{busy ? '上传中' : '上传图片'}</Button>
      {value ? <Button onClick={() => { epoch.current++; setBusy(false); onChange('') }}>移除</Button> : null}
      <Button onClick={onReset}>重置特征</Button>
    </div>
    <input hidden type="file" ref={fileRef} accept="image/png,image/jpeg,image/webp" onChange={upload} />
    {value ? <RecoverableMedia src={materialUrl(avatarId,value)} alt="风格参考" /> : null}
    <InputField value={brief} onChange={event => onBrief(event.target.value)} placeholder="补充角色说明" aria-label="角色说明" />
    <p className="omx-avatar-field-lbl">支持图片风格参考，不会清除已选特征。仅使用您有权使用的素材。</p>
  </div>
}
