import { useEffect, useRef, useState } from 'react'
import { Button, InputField, DropdownSelect } from '../kit.js'
import { fetchMaterials, importMaterial, materialUrl, submitMotion, fetchMotionOptions } from '../api.js'
import { taskImageUrl } from '../lib/history.js'
import { removeImageMention } from '../../mentions.js'
import { RecoverableMedia } from './RecoverableMedia.jsx'

/** Public owned-material references, never browser blob URLs or local path strings. */
export function MotionPanel({ avatarId, tasks, initialTask, active, onAccepted, onError }) {
  const [materials, setMaterials] = useState([])
  const [images, setImages] = useState([])
  const [video, setVideo] = useState(null)
  const [mode, setMode] = useState('motion')
  const [resolution, setResolution] = useState(() => { try { const value = localStorage.getItem('omnimux-avatar:resolution'); return ['480p','720p'].includes(value) ? value : '480p' } catch { return '480p' } })
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [prompt, setPrompt] = useState('')
  const [styles, setStyles] = useState({ motion: '', replace: '' })
  const style = styles[mode]
  const setStyle = value => setStyles(prev => ({ ...prev, [mode]: value }))
  const [customPrompt, setCustomPrompt] = useState(false)
  const [materialSource, setMaterialSource] = useState('all')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [options, setOptions] = useState(null)
  const [checking, setChecking] = useState(false)
  const fileRef = useRef(null)
  const epoch = useRef(0)
  const avatarRef=useRef(avatarId)
  if(avatarRef.current!==avatarId){avatarRef.current=avatarId;epoch.current++}
  useEffect(() => {
    epoch.current++
    setImages([]); setVideo(null); setMaterials([]); setUploading(false);setBusy(false)
    return () => { epoch.current++ }
  }, [avatarId])
  useEffect(() => {
    if (!active || !avatarId) return
    const current = epoch.current
    fetchMaterials(avatarId).then(rows => { if (epoch.current === current) setMaterials(rows) }).catch(onError)
  }, [avatarId, active])
  useEffect(() => {
    let alive = true
    if (!images.length || !video) { setOptions(null); return }
    setChecking(true)
    fetchMotionOptions({avatarId,mode,images:images.map(item=>item.reference),video:video.reference}).then(result=>{
      if(!alive)return
      setOptions(result)
      const current=result.supported.find(item=>item.resolution===resolution&&item.aspectRatio===aspectRatio)
      if(!current&&result.supported.length){const fallback=result.supported.find(item=>item.resolution===resolution)??result.supported[0];setResolution(fallback.resolution);setAspectRatio(fallback.aspectRatio)}
    }).catch(error=>{if(alive){setOptions(null);onError(error)}}).finally(()=>{if(alive)setChecking(false)})
    return()=>{alive=false}
  },[avatarId,mode,images,video])
  const resolutions=[...new Set((options?.supported??[]).map(item=>item.resolution))]
  const ratios=[...new Set((options?.supported??[]).filter(item=>item.resolution===resolution).map(item=>item.aspectRatio))]
  const items = [...materials.map(row => ({ ...row, reference: { materialId: row.id }, url: materialUrl(avatarId, row.id) })),
    ...tasks.filter(task => task.status === 'ready').map(task => ({ id: task.taskId, name: task.kind === 'motion' ? '角色视频' : '角色图片', type: task.kind === 'motion' ? 'video' : 'image', reference: { taskId: task.taskId }, url: taskImageUrl(task) }))]
  useEffect(() => {
    if(initialTask?.kind==='reference-preset'){
      setVideo({id:initialTask.materialId,name:'参考视频',type:'video',reference:{materialId:initialTask.materialId},url:materialUrl(avatarId,initialTask.materialId)})
      if(initialTask.mode)setMode(initialTask.mode)
      setPrompt(initialTask.prompt??'');setCustomPrompt(Boolean(initialTask.prompt))
    }
    else if (initialTask && initialTask.kind !== 'motion') setImages([{id:initialTask.taskId,name:'角色图片',type:'image',reference:{taskId:initialTask.taskId},url:taskImageUrl(initialTask)}])
    else if (initialTask?.input && initialTask.kind === 'motion') {
      const input = initialTask.input
      const project = (reference,type) => ({id:reference.materialId??reference.taskId,name:type==='image'?'角色图片':'参考视频',type,reference,url:reference.materialId?materialUrl(avatarId,reference.materialId):taskImageUrl(tasks.find(task=>task.taskId===reference.taskId)??{})})
      setImages(input.images.map(reference=>project(reference,'image')))
      setVideo(project(input.video,'video'))
      setMode(input.mode);setResolution(input.resolution);setAspectRatio(input.aspectRatio)
      setPrompt(input.prompt??'');setCustomPrompt(Boolean(input.prompt));setStyles({motion:'',replace:''})
    }
  }, [initialTask])
  const removeImage = id => {
    const index = images.findIndex(item => item.id === id)
    const update = value => removeImageMention(value,index+1)
    setPrompt(update)
    setStyles(prev => ({motion:update(prev.motion),replace:update(prev.replace)}))
    setImages(prev => prev.filter(item => item.id !== id))
  }
  const choose = item => {
    if (item.type === 'video') {
      setVideo(item)
      if (mode === 'replace' && item.width && item.height) {
        const ratio = ['16:9','9:16','3:4'].find(value => {const [w,h]=value.split(':').map(Number);return Math.abs(item.width*h-item.height*w)<=(w+h)/2})
        if (ratio) setAspectRatio(ratio)
      }
      return
    }
    if (images.some(row => row.id === item.id)) removeImage(item.id)
    else setImages(prev => prev.length < 30 ? [...prev,item] : prev)
  }
  const upload = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    await uploadFile(file)
  }
  const uploadFile = async file => {
    if (!file || uploading) return
    const current = epoch.current
    setUploading(true)
    try {
      const row = await importMaterial(avatarId, file)
      if (current !== epoch.current) return
      const rows = await fetchMaterials(avatarId)
      if (current !== epoch.current) return
      setMaterials(rows)
      choose({ ...row, reference: { materialId: row.id }, url: materialUrl(avatarId, row.id) })
    } catch (error) { onError(error) }
    finally { if (current === epoch.current) setUploading(false) }
  }
  const submit = async () => {
    const current=epoch.current
    setBusy(true)
    try {
      const task = await submitMotion({ avatarId, mode, images: images.map(item => item.reference), video: video.reference, resolution, aspectRatio, prompt: [style, customPrompt ? prompt : ''].filter(Boolean).join('\n') })
      if(current===epoch.current)onAccepted(task)
    } catch (error) { if(current===epoch.current)onError(error) }
    finally { if(current===epoch.current)setBusy(false) }
  }
  return <div className="omx-avatar-builder">
    <div className="omx-avatar-pane-tools">
      <Button variant={mode === 'motion' ? 'primary' : 'ghost'} onClick={() => setMode('motion')}>动作复刻</Button>
      <Button variant={mode === 'replace' ? 'primary' : 'ghost'} onClick={() => setMode('replace')}>角色替换</Button>
    </div>
    <div className="omx-avatar-block" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void uploadFile(event.dataTransfer.files?.[0])}}>
      <div className="omx-avatar-block-head"><span className="omx-avatar-block-title">参考素材</span><Button disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? '上传中' : '上传素材'}</Button></div>
      <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime" onChange={upload} />
      <div className="omx-avatar-block-body">
        <p className="omx-avatar-field-lbl">图片 {images.length} / 30 · 视频 {video ? '已选择' : '未选择'}</p>
        <div className="omx-avatar-pane-tools">{[['all','全部'],['upload','已上传'],['generated','已生成']].map(([value,label]) => <Button key={value} variant={materialSource === value ? 'secondary' : 'ghost'} onClick={() => setMaterialSource(value)}>{label}</Button>)}</div>
        <div className="omx-avatar-grid">
          {items.filter(item => materialSource === 'all' || (materialSource === 'upload' ? Boolean(item.reference.materialId) : Boolean(item.reference.taskId))).map(item => <Button key={item.id} variant={images.some(row => row.id === item.id) || video?.id === item.id ? 'secondary' : 'ghost'} onClick={() => choose(item)}>{item.name}</Button>)}
        </div>
        {video ? <RecoverableMedia video src={video.url} controls muted preload="metadata" /> : null}
        {images.map((item,index) => <div key={item.id} className="omx-avatar-pane-tools"><RecoverableMedia className="omx-avatar-material-thumb" src={item.url} alt={item.name}/><span>图片 {index+1} · {item.name}</span><Button onClick={() => removeImage(item.id)}>移除</Button></div>)}
      </div>
    </div>
    <InputField label="视觉风格" value={style} onChange={event => setStyle(event.target.value)} placeholder="例如自然纪实、柔和电影感" />
    <Button aria-pressed={customPrompt} onClick={() => setCustomPrompt(value => !value)}>自定义说明{customPrompt ? '：已开启' : '：关闭'}</Button>
    {customPrompt ? <><InputField value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="补充视频说明，可用 @Image 1、@Video" aria-label="视频说明" /><div className="omx-avatar-pane-tools">{images.map((item,index)=><Button key={item.id} onClick={()=>setPrompt(value=>value+' @Image '+(index+1))}>提及图片 {index+1}</Button>)}{video?<Button onClick={()=>setPrompt(value=>value+' @Video')}>提及视频</Button>:null}</div></> : null}
    <div className="omx-avatar-pane-tools">
      <DropdownSelect aria-label="清晰度" value={resolution} disabled={!options||checking} options={resolutions.map(value=>({value,label:value}))} onChange={value => { setResolution(value); const ratio=options.supported.find(item=>item.resolution===value&&item.aspectRatio===aspectRatio)??options.supported.find(item=>item.resolution===value);if(ratio)setAspectRatio(ratio.aspectRatio);try { localStorage.setItem('omnimux-avatar:resolution',value) } catch {} }} />
      {mode==='motion'?<DropdownSelect aria-label="画幅" value={aspectRatio} disabled={!options||checking} options={ratios.map(value => ({value,label:value}))} onChange={setAspectRatio} />:null}
    </div>
    <p className="omx-avatar-field-lbl">参数需符合当前可用渠道。角色替换保持参考画幅；素材将交由生成服务处理，请确认使用授权。</p>
    <Button variant="primary" disabled={!images.length || !video || busy || uploading || checking || !options?.supported.some(item=>item.resolution===resolution&&item.aspectRatio===aspectRatio)} aria-busy={busy} onClick={submit}>{busy ? '提交中' : '生成视频'}</Button>
  </div>
}
