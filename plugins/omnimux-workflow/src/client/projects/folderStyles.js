export const FOLDER_STYLES = `
.omnimux-folder { position: relative; aspect-ratio: 516 / 378; min-width: 0; isolation: isolate; container-type: inline-size; }
.omnimux-folder[data-cover-kind=empty] .omnimux-folder-back { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 88%, var(--dsw-alias-brand-primary)); }
.omnimux-folder[data-cover-kind=empty] .omnimux-folder-pocket { background-color: color-mix(in srgb, var(--dsw-alias-bg-base) 97%, var(--dsw-alias-brand-primary)); }
.omnimux-folder .omnimux-folder-open { position: absolute; inset: 0; width: 100%; height: 100%; display: block; padding: 0; border: 0; background: transparent; text-align: left; white-space: normal; border-radius: 9% / 12.3%; overflow: hidden; color: var(--dsw-alias-label-primary); }
.omnimux-folder-back { position: absolute; inset: 0; border-radius: inherit; background: var(--dsw-alias-bg-layer-2); border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent); }
.omnimux-folder-sheet { position: absolute; display: block; overflow: hidden; border-radius: 9%; background: var(--dsw-alias-bg-base); border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.omnimux-folder-sheet--rear { width: 76%; height: 70%; left: 12%; top: 6%; transform: rotate(-3deg); }
.omnimux-folder-sheet--front { width: 84%; height: 72%; left: 8%; top: 13%; transform: rotate(2deg); box-sizing: border-box; border: 5px solid var(--dsw-alias-bg-base); box-shadow: 0 0 0 1px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
.omnimux-folder-glass-defs { position: absolute; pointer-events: none; }
.omnimux-folder-pocket, .omnimux-folder-pocket-rim { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
/* The pocket samples the existing insert once; the caption stays outside its blur and clip. */
.omnimux-folder-pocket { -webkit-mask-image: var(--stage-pocket-mask); mask-image: var(--stage-pocket-mask); -webkit-mask-size: 100% 100%; mask-size: 100% 100%; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; mask-mode: alpha; background: color-mix(in srgb, var(--dsw-alias-bg-base) 94%, var(--dsw-alias-label-primary)); }
.omnimux-folder-pocket::after { content: ''; position: absolute; inset: 0; border-radius: 9% / 12.3%; background: linear-gradient(150deg, color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent) 38%, transparent 64%); box-shadow: inset 0 -1px 1px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent), inset 0 -12px 22px color-mix(in srgb, var(--dsw-alias-bg-mask-1) 12%, transparent); }
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .omnimux-folder .omnimux-folder-pocket { background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent) 38%, color-mix(in srgb, var(--dsw-alias-bg-base) 88%, transparent) 64%, color-mix(in srgb, var(--dsw-alias-bg-base) 94%, var(--dsw-alias-label-primary)) 100%); -webkit-backdrop-filter: blur(clamp(12px, 4cqw, 24px)) saturate(1.15); backdrop-filter: blur(clamp(12px, 4cqw, 24px)) saturate(1.15); }
}
@media (prefers-reduced-transparency: reduce) {
  .omnimux-folder .omnimux-folder-pocket { background: color-mix(in srgb, var(--dsw-alias-bg-base) 94%, var(--dsw-alias-label-primary)); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
.omnimux-folder-caption { position: absolute; bottom: 8%; left: 8%; right: 16%; display: flex; flex-direction: column; gap: 4px; }
.omnimux-folder-name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; font-size: clamp(15px, 5.8cqw, 30px); line-height: 1.3; font-weight: 600; }
.omnimux-folder-date { font-size: clamp(12px, 4.65cqw, 24px); line-height: 1.4; color: var(--dsw-alias-label-secondary); }
.omnimux-folder .omnimux-folder-more { position: absolute; right: 5%; bottom: 6%; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); opacity: 0; transition: opacity 120ms ease; }
.omnimux-folder:hover .omnimux-folder-more, .omnimux-folder:focus-within .omnimux-folder-more { opacity: 1; }
@media (hover: none) { .omnimux-folder .omnimux-folder-more { opacity: 1; } }
@media (pointer: coarse) { .omnimux-folder .omnimux-folder-more, .omnimux-folder-menu [role=menuitem], .omnimux-page-card-actions button { min-width: 44px; min-height: 44px; } }
.omnimux-page-card .omnimux-page-open { display: block; width: 100%; height: 100%; padding: 0; border: 0; border-radius: inherit; overflow: hidden; }
.omnimux-page-open:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.omnimux-folder-open:focus-visible, .omnimux-folder-more:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.omnimux-folder:hover .omnimux-folder-back { border-color: var(--dsw-alias-border-l3); }
.omnimux-folder-menu { position: absolute; z-index: 4; bottom: 20%; right: 5%; padding: 4px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 4px 16px var(--dsw-alias-bg-mask-1); }
.omnimux-folder-menu [role=menuitem] { display: flex; gap: 8px; width: 100%; justify-content: flex-start; }
.omnimux-cover-content { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-tertiary); }
.omnimux-cover-content > svg:not(.omnimux-cover-audio) { width: 15%; height: 25%; align-self: flex-start; margin-top: 18%; }
.omnimux-cover-status { position: absolute; top: 7%; right: 6%; font-size: 12px; line-height: 20px; min-width: 20px; text-align: center; border-radius: 50%; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-secondary); }
.omnimux-cover-content > img { width: 100%; height: 100%; object-fit: cover; }
.omnimux-cover-content--audio { background: var(--dsw-specific-media-bg, #080808); } /* exempt-ui03 fixed darkroom media surface */
.omnimux-cover-audio { width: 100%; height: 100%; color: var(--dsw-specific-ai-accent, #9460ef); } /* exempt-ui03 reference waveform is media artwork, not interactive brand color */
.omnimux-cover-content--empty { background: color-mix(in srgb, var(--dsw-alias-bg-overlay) 90%, var(--dsw-alias-brand-primary)); }
`
export function injectFolderStyles() {
  if (typeof document === 'undefined' || document.getElementById('omnimux-folder-styles')) return
  const style = document.createElement('style')
  style.id = 'omnimux-folder-styles'
  style.textContent = FOLDER_STYLES
  document.head.appendChild(style)
}
