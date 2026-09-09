import React, { useEffect, useRef, useState } from 'react'
import { Button } from './components/Button.jsx'
import { StudioContext, useStudioApi, useStudioStore } from './use-studio-store.js'
import { scopeKey } from './scope-registry.js'
import { DraftWorkspace } from './components/DraftWorkspace.jsx'
import { GenerationStatusCard, SampleMedia } from './components/GenerationStatusCard.jsx'
import { IMAGE_EXAMPLES, IMAGE_MODELS, filterItems, MEDIA } from './fixtures.js'
import { VIDEO_EXAMPLES, DASHBOARD_ASSETS } from './mock-data.js'
import { injectStudioStyles } from './styles.js'
import { createDocument } from './editor-document.js'

/** Dependency injection owns this disposer; rendering never installs styles. */
export function installStudioStyles() { return injectStudioStyles() }

function LocalDialog({ value, close, root }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.focus()
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        const nodes = [...dialog.current.querySelectorAll('button:not(:disabled),a[href],video[controls],[tabindex="0"]')]
        if (!nodes.length) { event.preventDefault(); return }
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); else root.current?.focus() }
  }, [close, root])
  const fixture = value.result ? MEDIA[value.result.fixtureId] : null
  return <div className="studio-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) close() }}>
    <div ref={dialog} className="studio-dialog" role="dialog" aria-modal="true" aria-label="工作台局部对话框" tabIndex={-1}>
      <Button onClick={close}>关闭</Button>
      {value.message && <><p>{value.message}</p><Button onClick={() => { value.action(); close() }}>确认</Button></>}
      {fixture && <><p>Mock 样例 · 非生成产物</p>{fixture.kind === 'video' ? <video src={fixture.url} controls playsInline /> : <img src={fixture.url} alt="Mock 样例" />}</>}
    </div>
  </div>
}
function StudioContent({ visible }) {
  const store = useStudioApi()
  const state = useStudioStore()
  const root = useRef(null)
  const [dialog, setDialog] = useState(null)
  const close = React.useCallback(() => setDialog(null), [])
  useEffect(() => {
    if (visible) return
    setDialog(null)
    root.current?.querySelectorAll('video,audio').forEach(media => media.pause())
  }, [visible])
  const preview = result => setDialog({ result })
  const confirm = (message, action) => setDialog({ message, action })
  const applyExample = (item, targetMode) => confirm('用此样例正文覆盖当前草稿？不会提交或扣点。', () => {
    store.updateDraft(targetMode, { document: createDocument(item.prompt) })
    store.publish({ mode: targetMode })
    store.navigate('dashboard')
  })
  const mode = state.view === 'dashboard' ? state.mode : state.view
  const dockMode = mode === 'video' && state.mode === 'agent' ? 'agent' : mode
  const tasks = state.tasks.filter(task => mode === 'image' ? task.request.draft.mode === 'image' : mode === 'agent' ? task.request.draft.mode === 'agent' && !task.request.draft.spec : task.request.draft.mode !== 'image' && task.request.draft.spec)
  const filteredTasks = mode === 'image' ? filterItems(tasks.map(task => ({ ...task, modelId: task.request.draft.modelId, ...task.request.draft.spec })), state.filters) : tasks
  const examples = filterItems(IMAGE_EXAMPLES, state.filters)
  const dashboardExamples = DASHBOARD_ASSETS.filter(item => state.sceneFilter === null || item.type === state.sceneFilter)
  return <div ref={root} data-omnimux-studio hidden={!visible} tabIndex={-1} className="studio-root">
    <div className="studio-scroll">
      <p className="studio-notice">前端演示 · 不调用模型 · 不扣真实点数 · 演示余额 {state.mockCredits}</p>
      <p>本页内存草稿，刷新或关闭工作台后清空</p>
      {state.view === 'dashboard' ? <>
        <div className="studio-toolbar" aria-label="创作模式">{[['agent', 'Agent'], ['video', '视频'], ['image', '图片']].map(([id, label]) => <Button key={id} aria-pressed={mode === id} onClick={() => store.publish({ mode: id })}>{label}</Button>)}</div>
        <DraftWorkspace key={mode} mode={mode} />
        <div className="studio-toolbar"><Button onClick={() => store.navigate('video')}>视频历史与示例</Button><Button onClick={() => store.navigate('image')}>图片历史与示例</Button></div>
        {mode === 'agent' && tasks.map(task => <GenerationStatusCard key={task.id} task={task} onPreview={preview} onConfirm={confirm} />)}
        <div className="studio-toolbar" aria-label="场景筛选"><Button aria-pressed={state.sceneFilter === null} onClick={() => store.setSceneFilter(null)}>全部场景</Button>{DASHBOARD_ASSETS.map(item => <Button key={item.type} aria-pressed={state.sceneFilter === item.type} onClick={() => store.setSceneFilter(item.type)}>{item.badge}</Button>)}</div>
        <p>灵感样例 · {dashboardExamples.length} 项</p>
        <div className="studio-grid">{dashboardExamples.map(item => <article className="studio-example" key={item.id}><img src={item.img} alt={`Mock ${item.badge}`} loading="lazy" /><p>Mock · {item.badge}</p><p>{item.prompt}</p><Button onClick={() => applyExample(item, mode)}>装配样例正文</Button></article>)}</div>
      </> : <>
        <div className="studio-toolbar"><Button onClick={() => store.navigate('dashboard')}>返回创作区</Button><span>{mode === 'image' ? '图片' : '视频'}历史与样例</span></div>
        <div className="studio-toolbar">{[['history', '历史'], ['examples', '示例']].map(([id, label]) => <Button key={id} aria-pressed={state.section === id} onClick={() => store.publish({ section: id })}>{label}</Button>)}</div>
        {mode === 'image' && <div className="studio-filters">
          <Button onClick={() => store.setFilter({ modelId: null })}>全部模型</Button>
          {[IMAGE_MODELS[0], IMAGE_MODELS[3], IMAGE_MODELS[2]].map(item => <Button key={item.id} aria-pressed={state.filters.modelId === item.id} onClick={() => store.setFilter({ modelId: item.id })}>{item.name}</Button>)}
          <Button onClick={() => store.setFilter({ resolution: null })}>全部清晰度</Button><Button aria-pressed={state.filters.resolution === '2K'} onClick={() => store.setFilter({ resolution: '2K' })}>2K 超清</Button>
          <Button onClick={() => store.setFilter({ aspect: null })}>全部比例</Button>
          {['Auto', '1:1', '9:16', '16:9'].map(aspect => <Button key={aspect} aria-pressed={state.filters.aspect === aspect} onClick={() => store.setFilter({ aspect })}>{aspect}</Button>)}
          <Button onClick={() => store.setFilter({ modelId: null, resolution: null, aspect: null })}>清空全部条件</Button>
        </div>}
        {state.section === 'history' ? <div className="studio-grid">{filteredTasks.length ? filteredTasks.map(task => <GenerationStatusCard key={task.id} task={task} onPreview={preview} onConfirm={confirm} />) : <p>没有匹配的模拟记录</p>}</div> : mode === 'image' ? <><p>样例 {examples.length} 项</p><div className="studio-grid">{examples.length ? examples.map(item => <article className="studio-example" key={item.id}><p>Mock · {IMAGE_MODELS.find(model => model.id === item.modelId)?.name} · {item.resolution} · {item.aspect}</p><p>{item.prompt}</p><SampleMedia result={{ ...item, kind: 'image' }} onPreview={preview} /><Button onClick={() => applyExample(item, 'image')}>装配样例正文</Button></article>) : <p>没有匹配的样例</p>}</div></> : <><p>Mock 视频创意示例 {VIDEO_EXAMPLES.length} 项（封面样例，非视频产物）</p><div className="studio-grid">{VIDEO_EXAMPLES.map(item => <article className="studio-example" key={item.id}><img src={item.previewImg} alt={`Mock ${item.title}`} loading="lazy" /><p>{item.title}</p><p>{item.prompt}</p><Button onClick={() => applyExample(item, 'video')}>装配样例正文</Button></article>)}</div></>}
        <div className="studio-dock"><DraftWorkspace key={dockMode} mode={dockMode} /></div>
      </>}
    </div>
    <div className="studio-overlay-root">{dialog && <LocalDialog value={dialog} close={close} root={root} />}</div>
  </div>
}
export function StudioStage({ scope, visible, registry }) {
  const key = scopeKey(scope)
  const [everOpened, setEverOpened] = useState(Boolean(visible))
  useEffect(() => { if (visible) setEverOpened(true) }, [visible])
  const store = React.useMemo(() => registry.getOrCreate(scope), [registry, key])
  useEffect(() => {
    store?.setVisible(Boolean(visible))
    return () => { if (store) registry.releaseView(store.scopeKey) }
  }, [store, visible, registry])
  if (!store) return <div data-omnimux-studio>等待工作区 · 暂不可提交</div>
  if (!everOpened && !visible) return null
  return <StudioContext.Provider value={store}><StudioContent key={key} visible={visible} /></StudioContext.Provider>
}
