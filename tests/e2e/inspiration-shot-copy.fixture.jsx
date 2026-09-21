import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { InspirationPreviewModal } from '../../plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx'
import { INSPIRATION_CSS } from '../../plugins/omnimux-inspiration/src/client/styles.js'
import { zh } from '../../plugins/omnimux-inspiration/src/client/locales.js'

const shots = [
  {
    id: 's1',
    time_range: '00:00 - 00:03',
    stage: 'HOOK',
    title: '开场悬念',
    description: '快速举起产品贴近镜头',
    script: '这真的是我今年发现最绝的宝藏',
    prompt: 'Young creator holding product with shocked wide eyes and a tight close-up',
    tags: ['特写'],
  },
  {
    id: 's2',
    time_range: '00:03 - 00:07',
    stage: 'BODY',
    description: '细致涂抹推开',
    script: '质地超级清爽细腻',
    prompt: 'Close-up hands dispersing cream',
    tags: ['中景'],
  },
  {
    id: 's3',
    time_range: '00:07 - 00:11',
    stage: 'BODY',
    description: '手指轻弹面部',
    script: '连续用了一周之后',
    prompt: 'Macro split comparison',
    tags: ['特写'],
  },
  {
    id: 's4',
    time_range: '00:11 - 00:13',
    stage: 'CTA',
    description: '引导评论',
    script: '评论区扣 Cowboy',
    prompt: 'Creator pointing at comment box',
  },
]

const row = {
  id: 'qa-2514',
  title: 'Cowboy costume',
  type: 'video',
  content: '这真的是我今年发现最绝的宝藏',
  analysis: {
    shots,
    hook_highlight: '开场 0-3 秒抓注意力',
    target_goal: '引导评论区转化',
  },
}

const style = document.createElement('style')
style.textContent = INSPIRATION_CSS
document.head.appendChild(style)

function App() {
  const [open, setOpen] = useState(true)
  return open
    ? <InspirationPreviewModal row={row} t={(key) => zh[key] || key} onClose={() => setOpen(false)} />
    : <button type="button" onClick={() => setOpen(true)}>重新打开测试素材</button>
}

createRoot(document.getElementById('root')).render(<App />)
