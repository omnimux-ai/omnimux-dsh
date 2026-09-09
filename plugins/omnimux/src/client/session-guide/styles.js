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
.omnimux-starter-groups { display:flex; flex-direction:column; gap:24px; }
.omnimux-starter-group { min-width:0; }
.omnimux-starter-group h2 { margin:0 0 20px; color:var(--dsw-alias-label-secondary); font-size:13px; font-weight:500; text-align:center; }
.omnimux-starter-cards { display:flex; justify-content:center; gap:12px; }
.omnimux-starter-cards button {
  display:flex; flex-direction:column; align-items:center; gap:10px;
  flex:1 1 0; max-width:112px; min-width:0; padding:0 4px;
  border:0; border-radius:8px; background:transparent;
  color:var(--dsw-alias-label-secondary); text-align:center; font:inherit; cursor:pointer;
}
/* Reference-sized launch tiles; these are task entries, not toolbar IconButtons. */
.omnimux-starter-icon {
  display:flex; align-items:center; justify-content:center; flex:none; width:48px; height:48px;
  box-sizing:border-box; border:1px solid var(--dsw-alias-border-l2); border-radius:14px;
  background:var(--dsw-alias-bg-layer-1); box-shadow:inset 0 0 0 2px var(--dsw-alias-bg-base);
  transition:background-color 120ms ease,border-color 120ms ease,transform 120ms ease;
}
.omnimux-starter-icon svg { width:24px; height:24px; }
.omnimux-starter-label { font-size:13px; font-weight:500; line-height:20px; overflow-wrap:break-word; text-wrap:balance; }
.omnimux-starter-cards button:hover .omnimux-starter-icon,
.omnimux-starter-cards button[aria-pressed="true"] .omnimux-starter-icon {
  background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-label-secondary);
}
.omnimux-starter-cards button:is(:hover,[aria-pressed="true"]) { color:var(--dsw-alias-label-primary); }
.omnimux-starter-cards button:active .omnimux-starter-icon { transform:scale(0.96); }
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
.omnimux-starter-material-actions button, .omnimux-starter-notice button {
  box-sizing:border-box; height:32px; padding:4px 10px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px;
  font:inherit; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); cursor:pointer;
}
.omnimux-starter-notice button { margin-left:8px; }
.omnimux-starter-notice { margin-bottom:12px; }
@container starter-guide (min-width:640px) {
  .omnimux-starter-groups { flex-direction:row; gap:0; }
  .omnimux-starter-group { flex:1 1 0; }
  .omnimux-starter-group[data-starter-group="understand"] { flex-grow:2; }
  .omnimux-starter-group[data-starter-group="create"] { flex-grow:3; }
  .omnimux-starter-group + .omnimux-starter-group { position:relative; margin-left:20px; padding-left:20px; }
  .omnimux-starter-group + .omnimux-starter-group::before {
    content:""; position:absolute; left:0; top:40px; height:54px;
    border-left:1px solid var(--dsw-alias-border-l2);
  }
}
@media (prefers-reduced-motion:reduce) { .omnimux-starter-icon { transition:none; } }

`

export function installGuideStyles(doc) {
  const style = doc.createElement('style')
  style.id = GUIDE_STYLE_ID
  style.textContent = GUIDE_CSS
  doc.head.appendChild(style)
  return () => style.remove()
}
