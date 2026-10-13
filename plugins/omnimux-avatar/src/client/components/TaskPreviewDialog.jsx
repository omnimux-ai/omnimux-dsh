import { useRef } from 'react'
import { Button } from '../kit.js'
import { taskImageUrl, taskKind } from '../lib/history.js'
import { DialogFrame } from './PresetPreviewDialog.jsx'
import { RecoverableMedia } from './RecoverableMedia.jsx'

export function TaskPreviewDialog({ task, onClose, onGenerate, onVideo, onDelete, t }) {
  const mediaRef=useRef(null)
  if(!task)return null
  const url=taskImageUrl(task)
  const video=taskKind(task)==='motion'
  return <DialogFrame title={video?'角色视频':'角色图片'} onClose={onClose} t={t} footer={<div className="omx-avatar-mv-actions">
    <div className="omx-avatar-pane-tools">
      {onGenerate?<Button onClick={()=>onGenerate(task)}>重新生成</Button>:null}
      {!video&&onVideo?<Button onClick={()=>onVideo(task)}>制作视频</Button>:null}
      <Button onClick={()=>mediaRef.current?.requestFullscreen?.().catch(()=>{})}>全屏预览</Button>
      {onDelete?<Button onClick={()=>onDelete(task)}>删除记录</Button>:null}
    </div>
    {url?<a className="omx-avatar-abtn" href={url+(url.includes('?')?'&':'?')+'download=1'} download>下载</a>:null}
  </div>}>
    <RecoverableMedia src={url} video={video} mediaRef={mediaRef} alt="角色图片" controls autoPlay playsInline/>
  </DialogFrame>
}
