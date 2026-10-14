import { useEffect, useState } from 'react'
import { Button } from '../kit.js'

/** Reload only media; never repeat a generation intent. */
export function RecoverableMedia({ src, video=false, mediaRef, compact=false, alt='', className='omx-avatar-mv-image', ...props }) {
  const [attempt,setAttempt]=useState(0)
  const [state,setState]=useState('loading')
  useEffect(()=>{setAttempt(0);setState('loading')},[src])
  useEffect(()=>{
    if(state!=='waiting'||attempt>=2)return
    let resumed=false
    const resume=()=>{
      if(resumed||document.visibilityState==='hidden'||navigator.onLine===false)return
      resumed=true;setAttempt(value=>value+1);setState('loading')
    }
    const timer=setTimeout(resume,(attempt+1)*1000)
    document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume)
    return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume)}
  },[state,attempt])
  const source=src&&attempt?src+(src.includes('?')?'&':'?')+'preview='+attempt:src
  if(compact&&(!source||state==='unavailable'))return <span className={className} aria-hidden="true" />
   if(!source||state==='unavailable')return <div className="omx-avatar-mv-empty"><p>预览暂不可用，素材和生成记录仍保留。</p>{src?<Button onClick={()=>{setAttempt(0);setState('loading')}}>重新加载</Button>:null}</div>
  const failed=()=>setState(attempt<2?'waiting':'unavailable')
  return <>{video?<video {...props} ref={mediaRef} key={source} src={source} className={className} onLoadedData={()=>setState('ready')} onError={failed}/>:<img {...props} ref={mediaRef} key={source} src={source} className={className} alt={alt} onLoad={()=>setState('ready')} onError={failed}/>} {state==='waiting'&&!compact?<p aria-live="polite">正在恢复预览</p>:null}</>
}
