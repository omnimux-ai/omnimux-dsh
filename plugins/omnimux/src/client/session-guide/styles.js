export const GUIDE_STYLE_ID = 'omnimux-session-guide-style'
export const GUIDE_CSS = `
[data-omnimux-starter-host] [data-conversation-scroll] { justify-content:flex-start!important; }
[data-omnimux-starter-host] [data-composer-seat] {
  flex:1 0 auto!important; min-height:100%; display:flex; flex-direction:column;
  justify-content:center!important; padding-block:32px; box-sizing:border-box;
}
[data-omnimux-starter-host] [class*="composerStack"] {
  flex:0 0 auto!important; display:flex; flex-direction:column; justify-content:center!important;
  gap:16px; padding-bottom:0!important;
}
[data-omnimux-starter-host] [class*="composerHero"] > :first-child {
  margin-top:0!important; margin-bottom:16px!important;
}
[data-omnimux-starter-host] [data-slot="conversation.composer.bar"] > * { order:2; }
.omnimux-starter-materials { order:1; }
.omnimux-starter-guide { order:3; }
.omnimux-starter-guide, .omnimux-starter-materials {
  width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px));
  max-width:var(--dsh-chat-content-width); box-sizing:border-box; margin-inline:auto;
  min-width:0; color:var(--dsw-alias-label-primary); font-family:inherit; font-size:13px; line-height:1.5;
}
.omnimux-starter-guide { container-type:inline-size; container-name:starter-guide; padding-top:8px; }
.omnimux-starter-groups { display:grid; grid-template-columns:1fr; gap:20px; }
.omnimux-starter-group { min-width:0; }
.omnimux-starter-group h2 { margin:0 0 8px; color:var(--dsw-alias-label-secondary); font-size:13px; font-weight:500; }
.omnimux-starter-cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.omnimux-starter-cards button {
  display:flex; align-items:flex-start; gap:10px; min-width:0; padding:12px;
  border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary); text-align:left; font:inherit; cursor:pointer;
  transition:background-color 120ms ease,border-color 120ms ease;
}
.omnimux-starter-cards button > svg { flex:0 0 20px; margin-top:2px; }
.omnimux-starter-cards button > span { min-width:0; }
.omnimux-starter-cards strong { display:block; font-size:13px; font-weight:500; overflow-wrap:anywhere; }
.omnimux-starter-cards small { display:block; margin-top:4px; color:var(--dsw-alias-label-secondary); font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
.omnimux-starter-cards button:hover, .omnimux-starter-cards button[aria-pressed="true"] {
  background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-label-secondary);
}
.omnimux-starter-guide button:focus-visible, .omnimux-starter-materials :is(input,textarea,button):focus-visible {
  outline:2px solid var(--dsw-alias-label-primary); outline-offset:2px;
}
.omnimux-starter-materials label { display:block; margin-bottom:6px; font-weight:500; }
.omnimux-starter-materials :is(input,textarea) {
  display:block; width:100%; box-sizing:border-box; min-width:0; padding:5px 10px;
  border:1px solid var(--dsw-alias-border-l2); border-radius:8px;
  background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit;
}
.omnimux-starter-materials input { height:32px; }
.omnimux-starter-materials textarea { min-height:56px; resize:vertical; }
.omnimux-starter-materials :is(input,textarea):disabled { opacity:0.65; }
.omnimux-starter-materials p { margin:6px 0 0; font-size:12px; color:var(--dsw-alias-label-secondary); }
.omnimux-starter-material-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
.omnimux-starter-material-actions button, .omnimux-starter-confirm button, .omnimux-starter-notice button {
  box-sizing:border-box; height:32px; padding:4px 10px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px;
  font:inherit; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); cursor:pointer;
}
.omnimux-starter-confirm { margin-bottom:16px; padding:12px; border:1px solid var(--dsw-alias-border-l2); border-radius:12px; }
.omnimux-starter-confirm p { margin:0 0 8px; }
.omnimux-starter-confirm button + button, .omnimux-starter-notice button { margin-left:8px; }
.omnimux-starter-notice { margin-bottom:12px; }
@container starter-guide (min-width:720px) {
  .omnimux-starter-groups { grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; }
  .omnimux-starter-cards { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion:reduce) { .omnimux-starter-cards button { transition:none; } }
`

export function installGuideStyles(doc) {
  const style = doc.createElement('style')
  style.id = GUIDE_STYLE_ID
  style.textContent = GUIDE_CSS
  doc.head.appendChild(style)
  return () => style.remove()
}
