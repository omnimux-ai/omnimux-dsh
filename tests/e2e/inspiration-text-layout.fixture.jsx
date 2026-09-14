import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { InspirationPreviewModal } from '../../plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx'
import { INSPIRATION_CSS } from '../../plugins/omnimux-inspiration/src/client/styles.js'
import { zh } from '../../plugins/omnimux-inspiration/src/client/locales.js'
const analysis = `## 长标签
**这是用于排版检查的超长中文标签 EnglishLongLabelWithoutBreakABCDEFGHIJKLMNOPQRSTUVWXYZ**: 正文保持完整。LongBodyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789。结束。
**English extended narrative and creative direction label**: This narrative wraps naturally without losing any content.
## 分镜记录
| 时间 | 画面 | 声音 |
| --- | --- | --- |
| 00:00–00:03 | 第一镜完整内容 FIRST-END | 自然环境音 |
| 00:03–00:06 | 第二镜 A\\|B | 提示词完整结尾 LAST-END |
## 普通段落
参考链接 https://example.com/reference 保留原文。
|
|`
const row = {id:'qa-1758',title:'内容解构排版验证素材',content:'原始台词保持不变。',analysis:{sections:[{id:'section',title:'测试章节',analysis}]}}
window.__qaFixture={analysis}
const style=document.createElement('style');style.textContent=INSPIRATION_CSS;document.head.appendChild(style)
function App(){const [open,setOpen]=useState(true);return open?<InspirationPreviewModal row={row} t={key=>zh[key]||key} onClose={()=>setOpen(false)}/>:<button onClick={()=>setOpen(true)}>重新打开测试素材</button>}
createRoot(document.getElementById('root')).render(<App/> )
