import { useEffect, useRef, useState } from 'react'
import { Button } from '../kit.js'
import { DialogFrame } from './PresetPreviewDialog.jsx'
import { selectedInspirationVideo } from '../lib/inspiration-media.js'
import { RecoverableMedia } from './RecoverableMedia.jsx'

/** Uses the existing public inspiration surface, without redistributing external media. */
export function VideoExplore({ kind, active, onApply, t }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [applying, setApplying] = useState(false)
  const epoch=useRef(0)
  const mediaRef=useRef(null)
  const close=()=>{epoch.current++;setPreview(null);setApplying(false)}
  useEffect(()=>{epoch.current++;setPreview(null);setApplying(false);return()=>{epoch.current++}},[kind,active])
  useEffect(() => {
    if (!active) return
    let alive=true
    setLoading(true);setError('')
    const query=new URLSearchParams({type:'video',page:'1',page_size:'24',sort:kind==='motion'?'latest':'views'})
    fetch('/omnimux/inspiration?'+query).then(async response=>{
      const body=await response.json()
      if(!response.ok||body.success===false)throw Error(body.error?.message??body.error??'灵感读取失败')
      if(alive)setItems((body.data?.items??[]).filter(item=>selectedInspirationVideo(item)))
    }).catch(failure=>{if(alive)setError(failure.message)}).finally(()=>{if(alive)setLoading(false)})
    return()=>{alive=false}
  },[active,kind])
  const apply=async()=>{const current=++epoch.current;setApplying(true);try{await onApply(preview,()=>current===epoch.current);if(current===epoch.current)setPreview(null)}catch(failure){if(current===epoch.current)setError(failure.message)}finally{if(current===epoch.current)setApplying(false)}}
  return <div>
    {loading?<p aria-live="polite">正在加载视频灵感</p>:error?<p role="alert">{error}</p>:!items.length?<p>暂无可用视频灵感，您仍可上传参考视频。</p>:<div className="omx-avatar-grid">
      {items.map(item=><Button key={item.id} onClick={()=>setPreview(item)}>{item.title??'视频灵感'}</Button>)}
    </div>}
    {preview?<DialogFrame title={preview.title??'视频灵感'} onClose={close} t={t} footer={<div className="omx-avatar-mv-actions"><Button disabled={applying} onClick={apply}>{applying?'准备中':'用此动作'}</Button><Button onClick={()=>mediaRef.current?.requestFullscreen?.().catch(()=>{})}>全屏预览</Button><a className="omx-avatar-abtn" href={selectedInspirationVideo(preview)} download>下载视频</a></div>}>
      <RecoverableMedia video mediaRef={mediaRef} src={selectedInspirationVideo(preview)} controls muted loop autoPlay playsInline />
      {preview.prompt||preview.description?<details><summary>详情</summary><p>{preview.prompt??preview.description}</p></details>:null}
    </DialogFrame>:null}
  </div>
}
