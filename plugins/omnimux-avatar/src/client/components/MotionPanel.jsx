import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, InputField, DropdownSelect } from '../kit.js'
import { fetchMaterials, importMaterial, materialUrl, submitMotion, fetchMotionOptions } from '../api.js'
import { taskImageUrl } from '../lib/history.js'
import { removeImageMention } from '../../mentions.js'
import { RecoverableMedia } from './RecoverableMedia.jsx'
import { MaterialPicker } from './MaterialPicker.jsx'
import { SegmentedToggle } from './SegmentedToggle.jsx'

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
  const [picker,setPicker]=useState(null)
  const [styleOpen,setStyleOpen]=useState(false)
  const materialAnchor=useRef(null)
  const closePicker=useCallback(()=>setPicker(null),[])
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
    setImages([]); setVideo(null); setMaterials([]); setUploading(false);setBusy(false);setPicker(null)
    return () => { epoch.current++ }
  }, [avatarId])
  useEffect(() => {
    if (!active || !avatarId) return
    const current = epoch.current
    fetchMaterials(avatarId).then(rows => { if (epoch.current === current) setMaterials(rows) }).catch(onError)
  }, [avatarId, active])
  useEffect(() => {
    let alive = true
    if (!images.length || !video) { setOptions(null); setChecking(false); return }
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
      setVideo(current=>current?.id===item.id?null:item)
      closePicker()
      if (mode === 'replace' && item.width && item.height) {
        const ratio = ['16:9','9:16','3:4'].find(value => {const [w,h]=value.split(':').map(Number);return Math.abs(item.width*h-item.height*w)<=(w+h)/2})
        if (ratio) setAspectRatio(ratio)
      }
      return
    }
    if (images.some(row => row.id === item.id)) removeImage(item.id)
    else setImages(prev => prev.some(row=>row.id===item.id)||prev.length>=30?prev:[...prev,item])
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
      const item={...row,reference:{materialId:row.id},url:materialUrl(avatarId,row.id)}
      if(item.type==='video')setVideo(item)
      else setImages(prev=>prev.some(value=>value.id===item.id)||prev.length>=30?prev:[...prev,item])
    } catch (error) { if(current===epoch.current)onError(error) }
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
  return <div className="omx-avatar-motion-layout" hidden={!active}>
    <div className="omx-avatar-scroll omx-avatar-motion-scroll"><div className="omx-avatar-builder">
      <section className="omx-avatar-mode-intro"><h3>{mode==='motion'?'动作复刻':'角色替换'}</h3><p>{mode==='motion'?'选择参考动作，让你的角色动起来。':'保留参考视频的场景与画幅，替换其中的角色。'}</p></section>
      <SegmentedToggle value={mode} onChange={setMode} ariaLabel="视频模式" options={[{value:'motion',label:'动作复刻'},{value:'replace',label:'角色替换'}]}/>
    <section ref={materialAnchor} className="omx-avatar-block omx-avatar-motion-materials">
      <div className="omx-avatar-block-head"><span className="omx-avatar-block-title">素材</span><span className="omx-avatar-block-meta">图片 {images.length} / 30</span></div>
      <input ref={fileRef} type="file" hidden accept={picker==='video'?'video/mp4,video/quicktime':'image/png,image/jpeg,image/webp'} onChange={upload}/>
      <div className="omx-avatar-block-body omx-avatar-material-slots">
        <div className="omx-avatar-material-slot">
          {video?<><RecoverableMedia video src={video.url} controls muted preload="metadata"/><div className="omx-avatar-pane-tools"><span>参考视频</span><Button onClick={()=>setVideo(null)}>移除视频</Button></div></>:null}
          <button type="button" /* exempt-ui01: 参考素材槽为多行复合入口 */ className="omx-avatar-material-trigger" aria-label="添加参考视频" disabled={uploading} onClick={()=>setPicker('video')} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const file=event.dataTransfer.files?.[0];if(file?.type.startsWith('video/'))void uploadFile(file);else onError(new Error('此处需要视频素材'))}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3"/></svg><span>{video?'更换参考视频':'添加参考视频，提取动作'}</span><small>视频时长：4 至 30 秒</small>
          </button>
        </div>
        <div className="omx-avatar-material-slot">
          {images.length?<div className="omx-avatar-selected-images">{images.map((item,index)=><div key={item.id} className="omx-avatar-selected-image"><RecoverableMedia compact className="omx-avatar-material-thumb" src={item.url} alt={item.name}/><span>图片 {index+1}</span><Button aria-label={'移除图片 '+(index+1)} onClick={()=>removeImage(item.id)}>移除</Button></div>)}</div>:null}
          <button type="button" /* exempt-ui01: 参考素材槽为多行复合入口 */ className="omx-avatar-material-trigger" aria-label="添加参考图片" disabled={uploading||images.length>=30} onClick={()=>setPicker('image')} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const file=event.dataTransfer.files?.[0];if(file?.type.startsWith('image/'))void uploadFile(file);else onError(new Error('此处需要图片素材'))}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg><span>{images.length?'添加更多参考图片':'添加角色、产品或服饰图片'}</span><small>最多 30 张参考图片</small>
          </button>
        </div>
      </div>
    </section>
    <section className="omx-avatar-block"><div className="omx-avatar-block-head"><span className="omx-avatar-block-title">视觉风格</span><Button aria-expanded={styleOpen} onClick={()=>setStyleOpen(value=>!value)}>{styleOpen?'收起':style?'编辑风格':'添加风格'}</Button></div><div className="omx-avatar-block-body">{styleOpen?<InputField aria-label="视觉风格" value={style} onChange={event=>setStyle(event.target.value)} placeholder="例如自然纪实、柔和电影感"/>:<p className="omx-avatar-field-lbl">{style||'不额外指定风格'}</p>}</div></section>
    <Button aria-pressed={customPrompt} onClick={() => setCustomPrompt(value => !value)}>自定义说明{customPrompt ? '：已开启' : '：关闭'}</Button>
    {customPrompt ? <><InputField value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="补充视频说明，可用 @Image 1、@Video" aria-label="视频说明" /><div className="omx-avatar-pane-tools">{images.map((item,index)=><Button key={item.id} onClick={()=>setPrompt(value=>value+' @Image '+(index+1))}>提及图片 {index+1}</Button>)}{video?<Button onClick={()=>setPrompt(value=>value+' @Video')}>提及视频</Button>:null}</div></> : null}
    <div className="omx-avatar-pane-tools">
      <DropdownSelect aria-label="清晰度" placeholder="清晰度" value={resolution} disabled={!options||checking} options={resolutions.map(value=>({value,label:value}))} onChange={value => { setResolution(value); const ratio=options.supported.find(item=>item.resolution===value&&item.aspectRatio===aspectRatio)??options.supported.find(item=>item.resolution===value);if(ratio)setAspectRatio(ratio.aspectRatio);try { localStorage.setItem('omnimux-avatar:resolution',value) } catch {} }} />
      {mode==='motion'?<DropdownSelect aria-label="画幅" placeholder="画幅" value={aspectRatio} disabled={!options||checking} options={ratios.map(value => ({value,label:value}))} onChange={setAspectRatio} />:null}
    </div>
    <p className="omx-avatar-field-lbl">{checking?'正在检查素材与参数':!images.length||!video?'先选择参考视频与图片':options&&!options.supported.length?'当前渠道不支持这组素材与参数':'仅使用您有权使用的素材。'}</p>
    </div></div>
    <footer className="omx-avatar-bar omx-avatar-motion-footer"><Button variant="primary" disabled={!images.length || !video || busy || uploading || checking || !options?.supported.some(item=>item.resolution===resolution&&item.aspectRatio===aspectRatio)} aria-busy={busy} onClick={submit}>{busy ? '提交中' : '生成视频'}</Button></footer>
    {picker&&active?<MaterialPicker type={picker} items={items} selectedIds={picker==='video'?(video?[video.id]:[]):images.map(item=>item.id)} source={materialSource} onSource={setMaterialSource} onChoose={choose} onUpload={()=>fileRef.current?.click()} uploading={uploading} onClose={closePicker} anchorRef={materialAnchor}/>:null}
  </div>
}
