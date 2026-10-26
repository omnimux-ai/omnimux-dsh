import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, InputField, DropdownSelect } from '../kit.js'
import { fetchMaterials, importMaterial, materialUrl, submitMotion, fetchMotionOptions, analyzeRecreate } from '../api.js'
import { taskImageUrl } from '../lib/history.js'
import { removeImageMention } from '../../mentions.js'
import {
  MODES, appendImage, applyUpload, assetsOf, createSnapshot, removeImageAt, selectVideo, withAssets, withPrompt,
} from '../lib/mode-assets.js'
import { analysisValid, forgetAnalysis, recreateBody, rememberAnalysis, stepAt } from '../lib/recreate.js'
import { RecoverableMedia } from './RecoverableMedia.jsx'
import { MaterialPicker } from './MaterialPicker.jsx'
import { SegmentedToggle } from './SegmentedToggle.jsx'
import { RecreateForm } from './RecreateForm.jsx'
import { RecreateProgress } from './RecreateProgress.jsx'
import { PendingUploadCard } from './PendingUploadCard.jsx'

/** 分段控件的三个视频模式；爆款复刻走独立表单。 */
const MODE_OPTIONS = [
  { value: 'motion', label: '动作复刻' },
  { value: 'replace', label: '角色替换' },
  { value: 'recreate', label: '爆款复刻' },
]

const MODE_INTRO = {
  motion: { title: '动作复刻', text: '选择参考动作，让你的角色动起来。' },
  replace: { title: '角色替换', text: '保留参考视频的场景与画幅，替换其中的角色。' },
  recreate: { title: '爆款复刻', text: '拆解参考片的镜头、节奏与叙事，用你的角色重拍一条。' },
}

/**
 * 拆解计时：只在拆解进行中走表，停止时归零。
 * 进度条与按钮文案共用这一个计时器，避免两处各算一遍导致文案与进度不同步。
 * @param {number} startedAt 拆解开始的毫秒时间戳
 * @param {boolean} running 是否正在拆解
 */
function useElapsed(startedAt, running) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) { setElapsed(0); return }
    const update = () => setElapsed(Math.max(0, Date.now() - startedAt))
    update()
    const timer = setInterval(update, 400)
    return () => clearInterval(timer)
  }, [running, startedAt])
  return elapsed
}

/**
 * 视频创作左栏：动作复刻 / 角色替换 / 爆款复刻。
 *
 * 三个模式各自保存参考视频、参考图与提示词草稿（见 lib/mode-assets.js）；
 * 上传库与历史库仍然共享（同一份 materials + tasks 清单）。
 *
 * 爆款复刻只有一个动作：点「生成视频」先拆解、再立即提交。
 * 拆解失败与提交失败分开呈现，都走 onError；提交失败保留拆解，
 * 重试不再二次拆解（见 lib/recreate.js 的 analysisValid）。
 */
export function MotionPanel({ avatarId, tasks, initialTask, active, onAccepted, onError }) {
  const [materials, setMaterials] = useState([])
  const [snapshot, setSnapshot] = useState(() => createSnapshot())
  const [mode, setMode] = useState('motion')
  const assets = assetsOf(snapshot, mode)
  const [resolution, setResolution] = useState(() => { try { const value = localStorage.getItem('omnimux-avatar:resolution'); return ['480p','720p'].includes(value) ? value : '480p' } catch { return '480p' } })
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [materialSource, setMaterialSource] = useState('all')
  const [picker,setPicker]=useState(null)
  const [styleOpen,setStyleOpen]=useState(false)
  const materialAnchor=useRef(null)
  const closePicker=useCallback(()=>setPicker(null),[])
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('idle')
  const [startedAt, setStartedAt] = useState(0)
  const [analysis, setAnalysis] = useState(null)
  const elapsed = useElapsed(startedAt, phase === 'analyzing')
  const [pending, setPending] = useState([])
  const [options, setOptions] = useState(null)
  const [checking, setChecking] = useState(false)
  const fileRef = useRef(null)
  const epoch = useRef(0)
  const uploadSeq = useRef(0)
  const previews = useRef(new Map())
  const uploading = pending.some(row => row.status === 'uploading')
  const avatarRef=useRef(avatarId)
  if(avatarRef.current!==avatarId){avatarRef.current=avatarId;epoch.current++}

  /** 换数字人：清空全部模式的素材、拆解与在途上传。 */
  useEffect(() => {
    epoch.current++
    setSnapshot(createSnapshot()); setMaterials([]); setBusy(false); setPhase('idle'); setAnalysis(null)
    setPending([]); setPicker(null)
    for (const url of previews.current.values()) URL.revokeObjectURL?.(url)
    previews.current.clear()
    return () => { epoch.current++ }
  }, [avatarId])
  useEffect(() => {
    if (!active || !avatarId) return
    const current = epoch.current
    fetchMaterials(avatarId).then(rows => { if (epoch.current === current) setMaterials(rows) }).catch(onError)
  }, [avatarId, active])
  useEffect(() => {
    let alive = true
    if (!assets.images.length || !assets.video) { setOptions(null); setChecking(false); return }
    setChecking(true)
    fetchMotionOptions({avatarId,mode,images:assets.images.map(item=>item.reference),video:assets.video.reference}).then(result=>{
      if(!alive)return
      setOptions(result)
      const current=result.supported.find(item=>item.resolution===resolution&&item.aspectRatio===aspectRatio)
      if(!current&&result.supported.length){const fallback=result.supported.find(item=>item.resolution===resolution)??result.supported[0];setResolution(fallback.resolution);setAspectRatio(fallback.aspectRatio)}
    }).catch(error=>{if(alive){setOptions(null);onError(error)}}).finally(()=>{if(alive)setChecking(false)})
    return()=>{alive=false}
  },[avatarId,mode,assets.images,assets.video])
  const resolutions=[...new Set((options?.supported??[]).map(item=>item.resolution))]
  const ratios=[...new Set((options?.supported??[]).filter(item=>item.resolution===resolution).map(item=>item.aspectRatio))]
  const items = [...materials.map(row => ({ ...row, reference: { materialId: row.id }, url: materialUrl(avatarId, row.id) })),
    ...tasks.filter(task => task.status === 'ready').map(task => ({ id: task.taskId, name: task.kind === 'motion' ? '角色视频' : '角色图片', type: task.kind === 'motion' ? 'video' : 'image', reference: { taskId: task.taskId }, url: taskImageUrl(task) }))]

  useEffect(() => {
    if(initialTask?.kind==='reference-preset'){
      const presetMode = MODES.includes(initialTask.mode) ? initialTask.mode : 'motion'
      setMode(presetMode)
      setSnapshot(prev => withAssets(prev, presetMode, {
        video: {id:initialTask.materialId,name:'参考视频',type:'video',reference:{materialId:initialTask.materialId},url:materialUrl(avatarId,initialTask.materialId)},
        prompt: initialTask.prompt ?? '', promptOn: Boolean(initialTask.prompt),
      }))
    }
    else if (initialTask && initialTask.kind !== 'motion') setSnapshot(prev => withAssets(prev, mode, { images: [{id:initialTask.taskId,name:'角色图片',type:'image',reference:{taskId:initialTask.taskId},url:taskImageUrl(initialTask)}] }))
    else if (initialTask?.input && initialTask.kind === 'motion') {
      const input = initialTask.input
      const project = (reference,type) => ({id:reference.materialId??reference.taskId,name:type==='image'?'角色图片':'参考视频',type,reference,url:reference.materialId?materialUrl(avatarId,reference.materialId):taskImageUrl(tasks.find(task=>task.taskId===reference.taskId)??{})})
      const taskMode = MODES.includes(input.mode) ? input.mode : 'motion'
      setMode(taskMode)
      // 复刻任务没有保留参考视频（它只是拆解材料），只恢复图片与意图；
      // 拆解结果也不预填，用户需要重新选片再拆一次。
      setSnapshot(prev => withAssets(prev, taskMode, {
        images: (input.images ?? []).map(reference => project(reference,'image')),
        video: input.video ? project(input.video,'video') : null,
        prompt: input.recreate?.intent ?? input.prompt ?? '',
        promptOn: Boolean(input.recreate?.intent ?? input.prompt),
      }))
      if (taskMode !== 'recreate') { setResolution(input.resolution); setAspectRatio(input.aspectRatio) }
    }
  }, [initialTask])

  /** 切换模式：只换视图，各自素材留在快照里；选择器跟着关掉。 */
  const changeMode = value => {
    if (!MODES.includes(value) || value === mode) return
    setMode(value)
    closePicker()
    setStyleOpen(false)
  }
  const setPrompt = value => setSnapshot(prev => withPrompt(prev, mode, value))
  const setStyle = value => setSnapshot(prev => withAssets(prev, mode, { style: value }))
  const removeImage = index => {
    const item = assets.images[index]
    if (!item) return
    const update = value => removeImageMention(value, index + 1)
    setSnapshot(prev => withAssets(prev, mode, {
      images: removeImageAt(prev, mode, index).images,
      prompt: update(assetsOf(prev, mode).prompt),
      style: update(assetsOf(prev, mode).style),
    }))
  }
  const choose = item => {
    if (item.type === 'video') {
      const next = selectVideo(snapshot, mode, item)
      setSnapshot(next)
      closePicker()
      if (mode === 'replace' && assetsOf(next, mode).video && item.width && item.height) {
        const ratio = ['16:9','9:16','3:4'].find(value => {const [w,h]=value.split(':').map(Number);return Math.abs(item.width*h-item.height*w)<=(w+h)/2})
        if (ratio) setAspectRatio(ratio)
      }
      return
    }
    if (assets.images.some(row => row.id === item.id)) removeImage(assets.images.findIndex(row => row.id === item.id))
    else setSnapshot(prev => appendImage(prev, mode, item))
  }

  const trackPreview = file => {
    if (typeof URL?.createObjectURL !== 'function') return null
    const url = URL.createObjectURL(file)
    previews.current.set(url, url)
    return url
  }
  const releasePreview = url => {
    if (!url) return
    URL.revokeObjectURL?.(url)
    previews.current.delete(url)
  }
  /**
   * 单张上传：状态只落在这张卡片上，失败不往面板顶部再报一遍。
   * `key` 可由重试传入以保住卡片原有位置（并发批次按发起顺序落位）。
   */
  const uploadOne = async (file, type, originMode, key = null) => {
    let id = key
    if (!id) {
      uploadSeq.current += 1
      id = `upload-${uploadSeq.current}`
      const previewUrl = type === 'image' ? trackPreview(file) : null
      setPending(rows => [...rows, { key: id, fileName: file.name, previewUrl, status: 'uploading', errorText: '', mode: originMode, file }])
    } else {
      setPending(rows => rows.map(item => item.key === id ? { ...item, status: 'uploading', errorText: '' } : item))
    }
    try {
      const row = await importMaterial(avatarId, file)
      const material = { ...row, reference: { materialId: row.id }, url: materialUrl(avatarId, row.id) }
      setPending(rows => rows.map(item => item.key === id ? { ...item, status: 'done' } : item))
      return { key: id, row: material }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setPending(rows => rows.map(item => item.key === id ? { ...item, status: 'error', errorText: text } : item))
      return { key: id, error }
    }
  }
  /**
   * 上传批次：并发跑，但按发起顺序落位。
   * 落点固定为发起上传时的模式（`originMode`），用户在等待期间切走也不影响。
   */
  const uploadFiles = async (files, type) => {
    const list = (files ?? []).filter(Boolean)
    if (!list.length) return
    const current = epoch.current
    const originMode = mode
    const results = await Promise.all(list.map(file => uploadOne(file, type, originMode)))
    if (current !== epoch.current) return
    const rows = results.filter(result => result.row).map(result => result.row)
    if (rows.length) {
      setSnapshot(prev => rows.reduce((next, row) => applyUpload(next, originMode, row), prev))
      const fresh = await fetchMaterials(avatarId).catch(() => null)
      if (current === epoch.current && fresh) setMaterials(fresh)
    }
    // 成功的素材已经进了已选列表，卡片退场；失败卡片留在原位等用户重试或删除。
    // 上传失败只落在这张卡上（原因 + 重试），不在面板顶部再报一遍：
    // 顶部共享错误面留给拆解失败与提交失败（规格 §22 与 task-3 §1 的分工）。
    setPending(prev => {
      const done = new Set(results.filter(result => result.row).map(result => result.key))
      for (const item of prev) if (done.has(item.key)) releasePreview(item.previewUrl)
      return prev.filter(item => !done.has(item.key))
    })
  }
  const upload = event => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    const type = picker === 'video' ? 'video' : 'image'
    void uploadFiles(files, type)
  }
  /** 重试沿用原卡片 key：位置不变，状态回到上传中。 */
  const retryPending = item => {
    void uploadOne(item.file, item.file?.type?.startsWith('video/') ? 'video' : 'image', item.mode, item.key)
  }
  const dismissPending = item => {
    releasePreview(item.previewUrl)
    setPending(rows => rows.filter(row => row.key !== item.key))
  }

  const submitClassic = async current => {
    const task = await submitMotion({ avatarId, mode, images: assets.images.map(item => item.reference), video: assets.video.reference, resolution, aspectRatio, prompt: [assets.style, assets.promptOn ? assets.prompt : ''].filter(Boolean).join('\n') })
    if(current===epoch.current)onAccepted(task)
  }
  /**
   * 爆款复刻：先拆解、再提交。两步的失败分开报。
   * 拆解结果按输入指纹缓存，提交失败后仍然有效，重试直接提交。
   */
  const submitRecreate = async current => {
    const intent = assets.promptOn ? assets.prompt : ''
    const input = { video: assets.video, images: assets.images, intent }
    let record = analysis
    if (!analysisValid(record, input)) {
      setPhase('analyzing')
      setStartedAt(Date.now())
      try {
        const result = await analyzeRecreate({ avatarId, images: assets.images.map(item => item.reference), video: assets.video.reference, resolution, intent })
        if (current !== epoch.current) return
        record = rememberAnalysis(record, input, result)
        setAnalysis(record)
        if (!record) throw new Error('拆解没有返回可用的提示词，请重试')
      } catch (error) {
        // 拆解失败：丢掉缓存，表单保持可见，用户可重试（重试会重新拆解）。
        if (current === epoch.current) { setAnalysis(forgetAnalysis()); setPhase('idle'); onError(error) }
        return
      }
    }
    setPhase('submitting')
    try {
      const task = await submitMotion(recreateBody({ avatarId, images: assets.images, resolution, analysis: record.analysis }))
      if (current === epoch.current) { setPhase('idle'); onAccepted(task) }
    } catch (error) {
      // 提交失败：拆解保留，再次点生成直接提交，不二次付费拆解。
      if (current === epoch.current) { setPhase('idle'); onError(error) }
    }
  }
  const submit = async () => {
    const current=epoch.current
    setBusy(true)
    try {
      if (mode === 'recreate') await submitRecreate(current)
      else await submitClassic(current)
    } catch (error) { if(current===epoch.current)onError(error) }
    finally { if(current===epoch.current){setBusy(false);setPhase('idle')} }
  }

  const working = busy || phase !== 'idle'
  const ctaLabel = phase === 'analyzing'
    ? `${stepAt(elapsed).label}…`
    : phase === 'submitting' || busy ? '提交中' : '生成视频'
  const ready = assets.images.length > 0 && Boolean(assets.video) && !working && !uploading && !checking
    && (mode === 'recreate'
      ? Boolean(options?.supported?.length)
      : Boolean(options?.supported.some(item=>item.resolution===resolution&&item.aspectRatio===aspectRatio)))
  const hint = checking
    ? '正在检查素材与参数'
    : !assets.images.length || !assets.video
      ? '先选择参考视频与图片'
      : options && !options.supported.length ? '当前渠道不支持这组素材与参数' : '仅使用您有权使用的素材。'

  return <div className="omx-avatar-motion-layout" hidden={!active}>
    <div className="omx-avatar-scroll omx-avatar-motion-scroll"><div className="omx-avatar-builder">
      <section className={mode === 'recreate' ? 'omx-avatar-recreate-intro' : 'omx-avatar-mode-intro'}><h3>{MODE_INTRO[mode].title}</h3><p>{MODE_INTRO[mode].text}</p></section>
      <SegmentedToggle className="omx-avatar-seg-no-wrap" value={mode} onChange={changeMode} ariaLabel="视频模式" options={MODE_OPTIONS}/>

      {pending.length ? <div className="omx-avatar-pending-batch" aria-label="上传中的素材">
        {pending.map(item => <PendingUploadCard key={item.key} fileName={item.fileName} previewUrl={item.previewUrl} status={item.status} errorText={item.errorText} busy={working} onRetry={()=>retryPending(item)} onDismiss={()=>dismissPending(item)} t={key=>key}/>)}
      </div> : null}

      {mode === 'recreate'
        ? <RecreateForm
            assets={assets}
            resolution={resolution}
            resolutions={resolutions}
            onResolution={value => { setResolution(value); try { localStorage.setItem('omnimux-avatar:resolution',value) } catch {} }}
            options={options}
            checking={checking}
            disabled={working}
            uploading={uploading}
            onVideoSlot={()=>setPicker('video')}
            onImageSlot={()=>setPicker('image')}
            onRemoveVideo={()=>setSnapshot(prev => withAssets(prev, mode, { video: null }))}
            onRemoveImage={removeImage}
            onUploadVideo={file => void uploadFiles([file], 'video')}
            onUploadImage={files => void uploadFiles(files, 'image')}
            onPromptOn={value => setSnapshot(prev => withAssets(prev, mode, { promptOn: value }))}
            onPrompt={setPrompt}
          />
        : <>
          <section ref={materialAnchor} className="omx-avatar-block omx-avatar-motion-materials">
            <div className="omx-avatar-block-head"><span className="omx-avatar-block-title">素材</span><span className="omx-avatar-block-meta">图片 {assets.images.length} / 30</span></div>
            <div className="omx-avatar-block-body omx-avatar-material-slots">
              <div className="omx-avatar-material-slot">
                {assets.video?<><RecoverableMedia video src={assets.video.url} controls muted preload="metadata"/><div className="omx-avatar-pane-tools"><span>参考视频</span><Button onClick={()=>setSnapshot(prev => withAssets(prev, mode, { video: null }))}>移除视频</Button></div></>:null}
                <button type="button" /* exempt-ui01: 参考素材槽为多行复合入口 */ className="omx-avatar-material-trigger" aria-label="添加参考视频" disabled={uploading} onClick={()=>setPicker('video')} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const file=event.dataTransfer.files?.[0];if(file?.type.startsWith('video/'))void uploadFiles([file],'video');else onError(new Error('此处需要视频素材'))}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3"/></svg><span>{assets.video?'更换参考视频':'添加参考视频，提取动作'}</span><small>视频时长：4 至 30 秒</small>
                </button>
              </div>
              <div className="omx-avatar-material-slot">
                {assets.images.length?<div className="omx-avatar-selected-images">{assets.images.map((item,index)=><div key={item.id} className="omx-avatar-selected-image"><RecoverableMedia compact className="omx-avatar-material-thumb" src={item.url} alt={item.name}/><span>图片 {index+1}</span><Button aria-label={'移除图片 '+(index+1)} onClick={()=>removeImage(index)}>移除</Button></div>)}</div>:null}
                <button type="button" /* exempt-ui01: 参考素材槽为多行复合入口 */ className="omx-avatar-material-trigger" aria-label="添加参考图片" disabled={uploading||assets.images.length>=30} onClick={()=>setPicker('image')} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const files=[...(event.dataTransfer.files??[])].filter(file=>file.type.startsWith('image/'));if(files.length)void uploadFiles(files,'image');else onError(new Error('此处需要图片素材'))}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg><span>{assets.images.length?'添加更多参考图片':'添加角色、产品或服饰图片'}</span><small>最多 30 张参考图片</small>
                </button>
              </div>
            </div>
          </section>
          <section className="omx-avatar-block"><div className="omx-avatar-block-head"><span className="omx-avatar-block-title">视觉风格</span><Button aria-expanded={styleOpen} onClick={()=>setStyleOpen(value=>!value)}>{styleOpen?'收起':assets.style?'编辑风格':'添加风格'}</Button></div><div className="omx-avatar-block-body">{styleOpen?<InputField aria-label="视觉风格" value={assets.style} onChange={event=>setStyle(event.target.value)} placeholder="例如自然纪实、柔和电影感"/>:<p className="omx-avatar-field-lbl">{assets.style||'不额外指定风格'}</p>}</div></section>
          <Button aria-pressed={assets.promptOn} onClick={() => setSnapshot(prev => withAssets(prev, mode, { promptOn: !assets.promptOn }))}>自定义说明{assets.promptOn ? '：已开启' : '：关闭'}</Button>
          {assets.promptOn ? <><InputField value={assets.prompt} onChange={event => setPrompt(event.target.value)} placeholder="补充视频说明，可用 @Image 1、@Video" aria-label="视频说明" /><div className="omx-avatar-pane-tools">{assets.images.map((item,index)=><Button key={item.id} onClick={()=>setPrompt(assets.prompt+' @Image '+(index+1))}>提及图片 {index+1}</Button>)}{assets.video?<Button onClick={()=>setPrompt(assets.prompt+' @Video')}>提及视频</Button>:null}</div></> : null}
          <div className="omx-avatar-pane-tools">
            <DropdownSelect aria-label="清晰度" placeholder="清晰度" value={resolution} disabled={!options||checking} options={resolutions.map(value=>({value,label:value}))} onChange={value => { setResolution(value); const ratio=options.supported.find(item=>item.resolution===value&&item.aspectRatio===aspectRatio)??options.supported.find(item=>item.resolution===value);if(ratio)setAspectRatio(ratio.aspectRatio);try { localStorage.setItem('omnimux-avatar:resolution',value) } catch {} }} />
            {mode==='motion'?<DropdownSelect aria-label="画幅" placeholder="画幅" value={aspectRatio} disabled={!options||checking} options={ratios.map(value => ({value,label:value}))} onChange={setAspectRatio} />:null}
          </div>
          <p className="omx-avatar-field-lbl">{hint}</p>
        </>}

      {mode === 'recreate' ? <>
        <p className="omx-avatar-field-lbl">{hint}</p>
        {phase === 'analyzing' ? <RecreateProgress startedAt={startedAt}/> : null}
      </> : null}
    </div></div>
    <input ref={fileRef} type="file" hidden multiple={picker==='image'} accept={picker==='video'?'video/mp4,video/quicktime':'image/png,image/jpeg,image/webp'} onChange={upload}/>
    <footer className="omx-avatar-bar omx-avatar-motion-footer"><Button variant="primary" disabled={!ready} aria-busy={working} onClick={submit}>{ctaLabel}</Button></footer>
    {picker&&active?<MaterialPicker type={picker} items={items} selectedIds={picker==='video'?(assets.video?[assets.video.id]:[]):assets.images.map(item=>item.id)} source={materialSource} onSource={setMaterialSource} onChoose={choose} onUpload={()=>fileRef.current?.click()} uploading={uploading} onClose={closePicker} anchorRef={materialAnchor}/>:null}
  </div>
}
