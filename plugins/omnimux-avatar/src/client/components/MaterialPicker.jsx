import { useEffect, useState } from 'react'
import { Button } from '../kit.js'
import { DialogFrame } from './PresetPreviewDialog.jsx'
import { RecoverableMedia } from './RecoverableMedia.jsx'

/** Current-avatar references only; this chooser never creates another asset store. */
export function MaterialPicker({ type, items, selectedIds, source, onSource, onChoose, onUpload, uploading, onClose, anchorRef }) {
  const [position,setPosition]=useState(null)
  const [preview,setPreview]=useState(null)
  useEffect(()=>{
    const update=()=>{
      const anchor=anchorRef.current
      if(!anchor||window.innerWidth<1000){setPosition(null);return}
      const rect=anchor.getBoundingClientRect()
      const pane=anchor.closest('.omx-avatar-scroll')?.getBoundingClientRect()
      if(pane&&(rect.bottom<=pane.top||rect.top>=pane.bottom)){onClose();return}
      const width=Math.min(560,window.innerWidth-rect.right-24)
      if(width<300){setPosition(null);return}
      setPosition({left:rect.right+12,top:Math.max(12,Math.min(rect.top,window.innerHeight-360)),width,maxHeight:window.innerHeight-Math.max(12,Math.min(rect.top,window.innerHeight-360))-12})
    }
    update();window.addEventListener('resize',update);document.addEventListener('scroll',update,true)
    return()=>{window.removeEventListener('resize',update);document.removeEventListener('scroll',update,true)}
  },[anchorRef,onClose])
  const rows=items.filter(item=>item.type===type&&(source==='all'||(source==='upload'?Boolean(item.reference.materialId):Boolean(item.reference.taskId))))
  return <DialogFrame title={type==='video'?'参考视频':'参考图片'} onClose={onClose} t={key=>key} panelClassName="omx-avatar-material-picker" panelStyle={position?{'--avatar-picker-left':position.left+'px','--avatar-picker-top':position.top+'px','--avatar-picker-width':position.width+'px','--avatar-picker-max-height':position.maxHeight+'px'}:undefined}>
    <div className="omx-avatar-pane-tools" role="group" aria-label="素材来源">
      {[['all','全部'],['upload','已上传'],['generated','已生成']].map(([value,label])=><Button key={value} aria-pressed={source===value} variant={source===value?'secondary':'ghost'} onClick={()=>{onSource(value);setPreview(null)}}>{label}</Button>)}
    </div>
    {preview?<div className="omx-avatar-picker-preview"><RecoverableMedia video={type==='video'} src={preview.url} alt={preview.name} controls muted preload="metadata"/><Button onClick={()=>setPreview(null)}>收起预览</Button></div>:null}
    <div className="omx-avatar-picker-grid">
      <button type="button" /* exempt-ui01: 素材上传瓦片是多行复合控件 */ className="omx-avatar-picker-upload" disabled={uploading} onClick={onUpload}><span>{uploading?'上传中':type==='video'?'上传本地视频':'上传本地图片'}</span><small>{type==='video'?'MP4 / MOV · 4 至 30 秒':'PNG / JPEG / WebP'}</small></button>
      {rows.map(item=><div className="omx-avatar-picker-item" key={item.id}>
        <button type="button" /* exempt-ui01: 素材选择瓦片，保留当前领域引用 */ className="omx-avatar-picker-tile" aria-label={'选择'+item.name} aria-pressed={selectedIds.includes(item.id)} disabled={uploading} onClick={()=>onChoose(item)}>
          <RecoverableMedia compact className="omx-avatar-picker-thumb" src={item.url} video={type==='video'} muted playsInline preload="metadata" alt={item.name}/><span>{item.name}</span>
        </button>
        <Button aria-label={'预览'+item.name} onClick={()=>setPreview(item)}>预览</Button>
      </div>)}
    </div>
    {!rows.length?<p className="omx-avatar-field-lbl">{source==='generated'?'还没有可用的生成素材':'还没有此类素材，可先上传。'}</p>:null}
  </DialogFrame>
}
