const STYLE_ID = "omnimux-automation-styles";
const CSS_TEXT = `
.dsh-st-top{display:flex;flex-direction:column;align-items:stretch;gap:12px;margin-bottom:12px}
.dsh-st-heading h1,.dsh-st-top h1{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.4px;white-space:nowrap}
.dsh-st-heading-row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}.dsh-st-heading-links{display:inline-flex;align-items:center;gap:4px;min-width:0;flex-wrap:wrap}.dsh-st-heading-link{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:0 8px;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;font-size:12px;font-weight:500;line-height:18px;text-decoration:none;white-space:nowrap}.dsh-st-heading-link:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.dsh-st-heading-link:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dsh-st-heading-link svg{flex:none}
.dsh-st-heading p,.dsh-st-top p{margin:12px 0 0;max-width:none;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:22px}
.dsh-st-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:8px}
.dsh-st-search{flex:1;min-width:0;max-width:280px;height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-1));color:inherit;font:inherit;font-size:13px}
.dsh-st-btn,.dsh-st-icon{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.dsh-st-icon{width:32px;padding:0;flex:none}
.dsh-st-btn--primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,#fff);color:var(--dsw-alias-label-primary-foreground,#111)}
.dsh-st-btn--danger{border-color:var(--dsw-alias-state-error-primary,#f85149);background:var(--dsw-alias-state-error-primary,#f85149);color:var(--dsw-alias-label-primary-foreground, #fff)}
.dsh-st-hint{margin:-6px 0 14px;padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-st-banner{display:flex;align-items:flex-start;gap:8px;margin-bottom:16px;padding:10px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}
.dsh-st-banner>span{display:inline-flex;align-items:flex-start;gap:8px}
.dsh-st-switch{width:42px;height:26px;border:0;border-radius:999px;background:var(--dsw-alias-interactive-bg-active, rgba(120,120,128,.36));box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1, rgba(255,255,255,.06));position:relative;cursor:pointer}
.dsh-st-switch:after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--dsw-alias-bg-base, #fff);box-shadow:0 1px 2px var(--dsw-alias-bg-mask-1, rgba(0,0,0,.28));transition:transform .16s ease}
.dsh-st-switch.is-on{background:var(--dsw-alias-status-success, #34c759)}
.dsh-st-switch.is-on:after{transform:translateX(16px)}
.dsh-st-examples{margin-bottom:22px}
.dsh-st-examples-head h2{margin:0 0 10px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsh-st-example-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.dsh-st-example{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-height:132px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03));color:inherit;text-align:left;cursor:pointer}
.dsh-st-example:hover{border-color:var(--dsw-alias-state-business-tertiary, rgba(75,124,255,.45))}
.dsh-st-example strong{font-size:14px}
.dsh-st-example p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dsh-st-tabs{display:flex;align-items:center;gap:16px;margin:4px 0 16px}
.dsh-st-tabs>button{padding:8px 0;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-st-tabs>button.is-on{border-bottom-color:currentColor;color:var(--dsw-alias-label-primary);font-weight:650}
.dsh-st-split{position:relative;display:inline-flex;align-items:stretch;flex:none;border-radius:999px;overflow:visible}
.dsh-st-split .dsh-st-split-main{border-top-right-radius:0;border-bottom-right-radius:0;padding-left:14px;padding-right:10px}
.dsh-st-split .dsh-st-split-toggle{width:26px;min-width:26px;padding:0;border-top-left-radius:0;border-bottom-left-radius:0;background:var(--dsw-alias-bg-layer-4,#e5e5ea);color:var(--dsw-alias-label-secondary,#555);box-shadow:inset 1px 0 0 var(--dsw-alias-border-l2,rgba(0,0,0,.12))}
.dsh-st-split .dsh-st-split-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,#d1d1d6);color:var(--dsw-alias-label-primary-foreground,#111)}
.dsh-st-split .dsh-st-split-main:disabled,.dsh-st-split .dsh-st-split-toggle:disabled{opacity:.45;cursor:default}
.dsh-st-split-icon{display:inline-flex;align-items:center;justify-content:center;transition:transform .16s ease}
.dsh-st-split.is-open .dsh-st-split-icon{transform:rotate(180deg)}
.dsh-st-split-menu{box-sizing:border-box;position:absolute;right:0;top:calc(100% + 6px);z-index:30;min-width:160px;max-width:calc(100vw - 24px);padding:5px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3,#2a2a2c));box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.42))}
.dsh-st-split-menu.is-float{position:fixed;right:auto;top:auto;z-index:1200}
.dsh-st-split-item{display:flex;align-items:center;gap:9px;width:100%;min-height:34px;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,inherit);font-family:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.dsh-st-split-item:hover,.dsh-st-split-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));outline:none}
.dsh-st-split-item-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;color:var(--dsw-alias-label-secondary,inherit)}
.dsh-st-split-item-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-st-sort-tick{width:16px;height:16px;flex:none}
.dsh-st-filters{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-left:auto}
.dsh-st-filters>button{height:28px;padding:0 10px;border:0;border-radius:999px;background:var(--dsw-alias-border-l1, rgba(255,255,255,.06));color:inherit;font-size:12px}
.dsh-st-filters>button.is-on{background:var(--dsw-alias-border-l3, rgba(255,255,255,.14))}
.dsh-st-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.dsh-st-card,.dsh-st-empty{position:relative;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03))}
.dsh-st-card{cursor:pointer}
.dsh-st-card:hover{border-color:var(--dsw-alias-state-business-tertiary, rgba(75,124,255,.45))}
.dsh-st-card h3,.dsh-st-empty h3{margin:10px 0 6px;font-size:14px;font-weight:500}
.dsh-st-card p,.dsh-st-empty p{margin:0 0 14px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dsh-st-card-head{display:flex;align-items:center;justify-content:space-between}
.dsh-st-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px;border-top:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-st-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:var(--dsw-alias-border-l1, rgba(255,255,255,.06))}
.dsh-st-more{width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dsh-st-menu{position:absolute;top:40px;right:12px;z-index:3;min-width:148px;padding:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);box-shadow:0 10px 30px var(--dsw-alias-bg-mask-1, rgba(0,0,0,.28))}
.dsh-st-menu button{display:flex;width:100%;align-items:center;gap:8px;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer}
.dsh-st-menu button svg{flex:none}
.dsh-st-menu button:hover{background:var(--dsw-alias-border-l1, rgba(255,255,255,.06))}
.dsh-st-menu .is-danger{color:var(--dsw-alias-label-danger, #ff6b6b)}
.dsh-st-timeline{display:flex;flex-direction:column;gap:22px;padding-left:10px}
.dsh-st-group{position:relative;padding-left:18px}
.dsh-st-group:before{content:'';position:absolute;top:8px;bottom:0;left:4px;width:1px;background:var(--dsw-alias-border-l2, rgba(255,255,255,.08))}
.dsh-st-group h3{margin:0 0 10px;font-size:13px;font-weight:600}
.dsh-st-run{position:relative;margin:0 0 12px}
.dsh-st-run:after{content:'';position:absolute;top:6px;left:-18px;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-status-success, #34c759)}
.dsh-st-run.is-failed:after,.dsh-st-run.is-interrupted:after{background:var(--dsw-alias-label-danger, #ff6b6b)}
.dsh-st-run.is-queued:after,.dsh-st-run.is-skipped:after,.dsh-st-run.is-cancelled:after{background:var(--dsw-alias-label-tertiary, #8b8f98)}
.dsh-st-run strong{display:block;margin-bottom:4px;font-size:14px}
.dsh-st-run p{display:flex;gap:10px;margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-st-error{color:var(--dsw-alias-label-danger, #ff6b6b);font-size:12px}
.dsh-st-muted{color:var(--dsw-alias-label-secondary)}
.dsh-st-mask{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}.dsh-st-flyout-root{position:absolute;inset:0;z-index:1200;overflow:visible;pointer-events:none}.dsh-st-flyout-root .dsh-st-select-menu,.dsh-st-flyout-root .dsh-st-model-select-menu{pointer-events:auto}
.dsh-st-modal,.dsh-st-modal *{box-sizing:border-box}.dsh-st-modal{display:flex;flex-direction:column;width:min(760px,calc(100vw - 48px));max-width:100%;max-height:min(92vh,900px);overflow:hidden;padding:24px;border:0;border-radius:24px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}
.dsh-st-confirm-modal,.dsh-st-confirm-modal *{box-sizing:border-box}.dsh-st-confirm-modal{width:min(420px,calc(100vw - 48px));padding:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv3,0 12px 36px rgba(0,0,0,.36))}.dsh-st-confirm-modal h2{margin:0 0 10px;font-size:18px}.dsh-st-confirm-modal p{margin:0 0 8px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}.dsh-st-confirm-modal .dsh-st-confirm-target{color:var(--dsw-alias-label-primary);font-weight:600;overflow-wrap:anywhere}
.dsh-st-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
.dsh-st-modal-head h2{margin:0 0 4px;font-size:20px}
.dsh-st-modal-close{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-st-modal-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-st-modal-close:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}
.dsh-st-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;min-width:0;max-width:100%;font-size:13px}.dsh-st-field:has(.dsh-st-prompt-card){flex:1;min-height:0;margin-bottom:10px}
.dsh-st-field input,.dsh-st-field select,.dsh-st-field textarea{width:100%;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:inherit}
.dsh-st-field textarea{min-height:140px;max-width:100%;resize:vertical}
.dsh-st-inline{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.dsh-st-inline select,.dsh-st-inline input{flex:1;min-width:120px}
.dsh-st-weekdays{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.dsh-st-weekdays button{min-width:40px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:inherit;cursor:pointer}
.dsh-st-weekdays button.is-on{border-color:var(--dsw-alias-brand-primary, #4b7cff);color:var(--dsw-alias-brand-primary, #4b7cff)}
.dsh-st-check{display:inline-flex;align-items:center;gap:6px;margin:0 0 12px;font-size:12px}
.dsh-st-modal-actions{display:flex;justify-content:flex-end;flex:none;gap:8px;margin-top:8px}
@media(max-width:860px){.dsh-st-toolbar{flex-wrap:wrap}.dsh-st-search{flex-basis:100%;max-width:none}.dsh-st-grid,.dsh-st-example-row{grid-template-columns:1fr}.dsh-st-filters{width:100%;margin:8px 0}}
.dsh-st-select{position:relative;min-width:108px;z-index:1}.dsh-st-select.is-open{z-index:30}
.dsh-st-select.is-wide{min-width:148px}
.dsh-st-select-btn,.dsh-st-field input,.dsh-st-field textarea{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04));color:inherit}
.dsh-st-select-btn{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:36px;width:100%;padding:0 12px;cursor:pointer}
.dsh-st-select.is-pill{width:auto;min-width:0;flex:none}
.dsh-st-select.is-pill .dsh-st-select-btn{width:auto;min-height:28px;height:28px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;gap:6px;white-space:nowrap}
.dsh-st-select.is-pill .dsh-st-select-btn:hover{background:var(--dsw-alias-border-l1, rgba(255,255,255,.06));color:var(--dsw-alias-label-primary)}
.dsh-st-select.is-pill .dsh-st-select-menu,.dsh-st-select-menu.is-composer{min-width:260px}
.dsh-st-select-btn em{width:8px;height:8px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.7}
.dsh-st-select-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:30;min-width:196px;max-height:280px;overflow:auto;padding:6px;border:1px solid var(--dsw-alias-border-inverted,var(--dsw-alias-border-l2));border-radius:14px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base));box-shadow:var(--dsw-shadow-lv3,0 16px 40px rgba(0,0,0,.42))}
.dsh-st-select-menu.is-up{top:auto;bottom:calc(100% + 6px)}
.dsh-st-select-menu.is-end{left:auto;right:0}.dsh-st-select-menu.is-float{position:absolute;z-index:1200;max-height:min(280px,calc(100vh - 24px));box-sizing:border-box}
.dsh-st-menu-row{white-space:nowrap}
.dsh-st-menu-row.is-kv .dsh-st-menu-row-main{flex:none}
.dsh-st-menu-row.is-kv .dsh-st-menu-row-side{flex:1;justify-content:flex-end;min-width:0}
.dsh-st-select-menu button,.dsh-st-menu-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:inherit;text-align:left;cursor:pointer;font-size:13px}
.dsh-st-menu-row-main{display:inline-flex;align-items:center;gap:8px;min-width:0}
.dsh-st-menu-row-side{display:inline-flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-st-menu-row-side small{display:block;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}
.dsh-st-select-menu button:hover,.dsh-st-menu-row:hover,.dsh-st-menu-row.is-on{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-st-tick,.dsh-st-next{width:7px;height:11px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;flex:none}
.dsh-st-tick{height:12px;width:6px;transform:rotate(45deg) translateY(-2px);border-right-color:var(--dsw-alias-brand-primary, #7aa2ff);border-bottom-color:var(--dsw-alias-brand-primary, #7aa2ff)}
.dsh-st-next{height:7px;transform:rotate(-45deg);opacity:.55}
.dsh-st-select-empty{padding:14px 12px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}
.dsh-st-chip-btn{display:inline-flex;align-items:center;gap:6px;min-height:28px;height:28px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer}
.dsh-st-chip-btn:hover{background:var(--dsw-alias-border-l1, rgba(255,255,255,.06));color:var(--dsw-alias-label-primary)}
.dsh-st-chip-btn.is-static{cursor:default;opacity:.78}
.dsh-st-chip-btn em,.dsh-st-select.is-pill .dsh-st-select-btn em{width:6px;height:6px;margin-left:2px;opacity:.55}
.dsh-st-model-select{position:relative;z-index:1;min-width:0;flex:none}.dsh-st-model-select.is-open{z-index:30}.dsh-st-model-select-trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:260px;height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;cursor:pointer}.dsh-st-model-select-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dsh-st-model-select-trigger>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-st-model-trigger-effort{flex:none;color:var(--dsw-alias-label-tertiary);white-space:nowrap}.dsh-st-model-trigger-chevron{flex:none;transition:transform .16s ease}.dsh-st-model-trigger-chevron.is-open{transform:rotate(180deg)}.dsh-st-model-select-menu{z-index:30;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:min(360px,calc(100vh - 96px));overflow-y:auto;padding:4px;border:1px solid var(--dsw-alias-border-inverted,var(--dsw-alias-border-l2));border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base));box-shadow:var(--dsw-shadow-lv3)}.dsh-st-model-select-menu.is-float{position:absolute;z-index:1200;box-sizing:border-box}.dsh-st-model-select-menu .dsh-st-menu-row{min-height:40px;padding:0 10px;border-radius:10px;font-size:14px}.dsh-st-model-select-menu .dsh-st-menu-row-side>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-st-model-select-menu .dsh-st-menu-row.is-kv .dsh-st-menu-row-side{font-size:13px;color:var(--dsw-alias-label-tertiary)}.dsh-st-model-group+.dsh-st-model-group{margin-top:4px}.dsh-st-model-group-title{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;line-height:18px}.dsh-st-model-option{display:flex;width:100%;min-height:38px;align-items:center;gap:8px;padding:6px 8px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer}.dsh-st-model-option:hover,.dsh-st-model-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}.dsh-st-model-option-copy{display:flex;min-width:0;flex:1;flex-direction:column}.dsh-st-model-name{overflow:hidden;font-size:14px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.dsh-st-model-description{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.dsh-st-model-check{display:grid;flex:0 0 18px;place-items:center;color:var(--dsw-alias-label-primary)}.dsh-st-model-warning{margin:4px;padding:8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger,rgba(248,81,73,.1));color:var(--dsw-alias-state-error-primary,#f85149);font-size:12px;line-height:18px}.dsh-st-model-empty{padding:14px 12px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}
.dsh-st-suffix{color:var(--dsw-alias-label-secondary);font-size:13px}
.dsh-st-inline input.is-narrow{width:72px;flex:none}
.dsh-st-plan-row{display:flex;align-items:flex-start;gap:16px}.dsh-st-plan-row>.dsh-st-field:first-child{flex:1}.dsh-st-plan-row>.dsh-st-concurrency{flex:0 0 120px}
.dsh-st-time{display:inline-flex;align-items:center;gap:2px;min-height:36px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04))}
.dsh-st-time .dsh-st-select{min-width:48px}
.dsh-st-time .dsh-st-select-btn{width:auto;min-height:32px;padding:0 6px;border:0;background:transparent}
.dsh-st-time-sep{padding:0 2px;color:var(--dsw-alias-label-secondary)}
.dsh-st-inline input[type=date]{min-width:148px;max-width:170px}
.dsh-st-weekdays button{min-width:52px;height:34px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:transparent}
.dsh-st-weekdays button.is-on{border-color:transparent;background:var(--dsw-alias-label-primary-foreground, #fff);color:var(--dsw-alias-label-primary, #111)}
.dsh-st-prompt-card{display:flex;flex-direction:column;flex:1;min-height:160px;max-width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:22px;overflow:visible;background:var(--dsw-alias-bg-layer-1, rgba(255,255,255,.03))}
.dsh-st-prompt-card textarea{flex:1;width:100%;max-width:100%;min-height:140px;border:0;background:transparent;padding:16px 18px;font-size:14px;line-height:1.65;resize:none}
.dsh-st-composer,.dsh-st-composer-left,.dsh-st-composer-right{display:flex;align-items:center;flex-wrap:nowrap}
.dsh-st-composer{justify-content:space-between;gap:8px;padding:2px 8px 10px;border-top:0}
.dsh-st-composer-left,.dsh-st-composer-right{gap:2px;min-width:0}
.dsh-st-composer .dsh-st-select{min-width:0}
.dsh-st-composer svg{flex:none}
.dsh-st-menu-split{height:1px;margin:6px 8px;background:var(--dsw-alias-border-l2, rgba(255,255,255,.08))}
.dsh-st-subdialog{margin:0 0 12px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1, rgba(255,255,255,.03))}
.dsh-st-subdialog>strong{display:block;margin:0 0 8px;font-size:13px}
.dsh-st-run-dot-cell{display:grid;place-items:center;width:10px;height:10px;flex:none}
.dsh-st-run-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-status-success,#34c759)}
.dsh-st-run-dot-cell.is-failed .dsh-st-run-dot,.dsh-st-run-dot-cell.is-interrupted .dsh-st-run-dot{background:var(--dsw-alias-label-danger,#ff6b6b)}
.dsh-st-run-dot-cell.is-queued .dsh-st-run-dot,.dsh-st-run-dot-cell.is-running .dsh-st-run-dot{background:var(--dsw-alias-brand-primary,#4b7cff)}
.dsh-st-run-dot-cell.is-skipped .dsh-st-run-dot,.dsh-st-run-dot-cell.is-cancelled .dsh-st-run-dot{background:var(--dsw-alias-label-tertiary,#8b8f98)}
.dsh-st-chip--trigger{flex:none;color:var(--dsw-alias-label-tertiary,#8b8f98);font-size:11px;line-height:16px}
.dsh-st-chip-btn.is-danger{color:var(--dsw-alias-label-danger,#ff6b6b)}
.dsh-st-chip-btn.is-danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(248,81,73,.12))}
.dsh-st-chip-btn:disabled{opacity:.45;cursor:default}

/* ── 主从两栏（Master-Detail）────────────────────────────────────────────
   容器查询的唯一载体是 .dsh-st-md-root：container-type 必须落在真实存在的
   节点上（历史上的 .dsh-st-shell 没有被任何 JSX 引用，是死 CSS）。
   container-type:inline-size 会形成 size containment，容器高度不再由内容撑开，
   所以必须同时给出 height/min-height 高度契约，两栏才能各自独立滚动、
   吸底行动栏才能吸底。 */
/* 工作台根节点：height/min-height 是两栏独立滚动与吸底行动栏的高度契约起点。 */
.dsh-st-wb{display:flex;flex-direction:column;min-width:0;box-sizing:border-box;height:100%;min-height:0;padding:0 4px 20px;color:var(--dsw-alias-label-primary)}
.dsh-st-md-root{box-sizing:border-box;display:flex;flex-direction:column;flex:1 1 auto;height:100%;min-height:0;container-type:inline-size}
.dsh-st-md{position:relative;display:flex;flex:1 1 auto;min-height:0;width:100%}
.dsh-st-md-pane{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0}
.dsh-st-md-error{margin:8px 8px 0}
.dsh-st-md-head{display:flex;flex:none;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 0}
.dsh-st-md-heading{min-width:0}
.dsh-st-md-heading h1{margin:0;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.3px;color:var(--dsw-alias-label-primary)}
.dsh-st-md-heading p{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px}
.dsh-st-md-head-actions{display:inline-flex;flex:none;align-items:center;gap:6px}
.dsh-st-md-toolbar{display:flex;flex:none;flex-wrap:nowrap;align-items:center;gap:8px;padding:12px 16px 0}
.dsh-st-md-search{display:flex;flex:1 1 200px;align-items:center;gap:8px;min-width:140px;max-width:280px;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}
.dsh-st-md-search:focus-within{border-color:var(--dsw-alias-border-inverted);color:var(--dsw-alias-label-secondary)}
.dsh-st-md-search svg{flex:none}
.dsh-st-md-search-input{flex:1 1 auto;min-width:0;height:30px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;outline:none}
.dsh-st-md-search-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.dsh-st-md-search-clear{display:inline-flex;flex:none;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dsh-st-md-search-clear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-st-md-capsules{display:flex;flex:none;flex-wrap:nowrap;gap:6px;overflow-x:auto;padding:12px 16px 0}
.dsh-st-md-capsule{display:inline-flex;flex:none;align-items:center;gap:6px;height:28px;padding:0 10px;border:1px solid transparent;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.dsh-st-md-capsule:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-st-md-capsule.is-on{border-color:var(--dsw-alias-border-inverted);background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-st-md-capsule-count{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsh-st-md-capsule.is-on .dsh-st-md-capsule-count{color:var(--dsw-alias-label-secondary)}
.dsh-st-md-list{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow-y:auto;padding:8px 8px 16px;scrollbar-gutter:stable}
.dsh-st-md-row{position:relative;display:flex;align-items:center;min-height:56px;border-bottom:1px solid var(--dsw-alias-border-l1);transition:background .14s ease}
.dsh-st-md-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-st-md-row.is-selected{background:var(--dsw-alias-interactive-bg-active)}
.dsh-st-md-row.is-selected::before{position:absolute;top:6px;bottom:6px;left:0;width:2px;border-radius:2px;background:var(--dsw-alias-brand-primary);content:""}
.dsh-st-md-row-open{display:flex;flex:1 1 auto;align-items:center;gap:10px;min-width:0;min-height:56px;padding:8px 4px 8px 12px;border:0;background:transparent;color:inherit;font-family:inherit;text-align:left;cursor:pointer}
.dsh-st-md-row-open:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dsh-st-md-row-icon{position:relative;display:inline-grid;flex:none;place-items:center;width:20px;height:20px;color:var(--dsw-alias-label-secondary)}
.dsh-st-md-row.is-active .dsh-st-md-row-icon{color:var(--dsw-alias-status-success)}
.dsh-st-md-row.is-finished .dsh-st-md-row-icon{color:var(--dsw-alias-label-tertiary)}
.dsh-st-md-row-pulse{position:absolute;right:-2px;bottom:-2px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary);animation:dsh-st-md-pulse 1.4s ease-in-out infinite}
.dsh-st-md-row-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-st-md-row-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px;font-weight:500}
.dsh-st-md-row-schedule{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.dsh-st-md-row.is-paused .dsh-st-md-row-name,.dsh-st-md-row.is-finished .dsh-st-md-row-name{color:var(--dsw-alias-label-secondary)}
.dsh-st-md-more{position:relative;display:inline-flex;flex:none;align-items:center;padding-right:8px}
.dsh-st-md-more-btn{width:28px;height:28px;min-height:28px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);opacity:0;transition:opacity .14s ease}
.dsh-st-md-row:hover .dsh-st-md-more-btn,.dsh-st-md-row:focus-within .dsh-st-md-more-btn,.dsh-st-md-more-btn[aria-expanded="true"]{opacity:1}
.dsh-st-md-more-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-st-md-more.is-detail{padding-right:0}
.dsh-st-md-more.is-detail .dsh-st-md-more-btn{opacity:1}
.dsh-st-menu-danger{color:var(--dsw-alias-label-danger)}
.dsh-st-md-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 16px;text-align:center}
.dsh-st-md-empty.is-quiet{padding:32px 16px}
.dsh-st-md-empty h3{margin:0;font-size:14px;line-height:20px;font-weight:500}
.dsh-st-md-empty p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px}
.dsh-st-md-link{align-self:flex-start;height:auto;min-height:auto;padding:6px 0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dsh-st-md-link:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}

/* 覆层形态（默认，窄容器）：右栏从右侧滑入盖住列表，遮罩点击即关。 */
.dsh-st-md-scrim{position:absolute;inset:0;z-index:3;display:block;width:100%;padding:0;border:0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);animation:dsh-st-md-fade .18s cubic-bezier(.16,1,.3,1)}
.dsh-st-md-detail{position:absolute;top:0;right:0;bottom:0;z-index:4;display:flex;flex-direction:column;width:min(440px,100%);min-width:0;min-height:0;overflow:hidden;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv3);animation:dsh-st-md-slide .18s cubic-bezier(.16,1,.3,1)}
.dsh-st-md-detail-inner{position:relative;display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
.dsh-st-md-detail-head{display:flex;flex:none;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-st-md-detail-head-actions{display:inline-flex;align-items:center;gap:4px}
.dsh-st-md-status{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:500}
.dsh-st-md-status.is-active{background:var(--dsw-alias-status-success-bg,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-status-success)}
.dsh-st-md-status.is-finished{color:var(--dsw-alias-label-tertiary)}
.dsh-st-md-detail-body{display:flex;flex-direction:column;gap:18px;flex:1 1 auto;min-height:0;overflow-y:auto;padding:16px 16px 20px;scrollbar-gutter:stable}
.dsh-st-md-title-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.dsh-st-md-title-label{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.dsh-st-md-title-input{width:100%;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:16px;line-height:24px;font-weight:600;outline:none}
.dsh-st-md-title-input:focus{border-color:var(--dsw-alias-border-inverted)}
.dsh-st-md-block{display:flex;flex-direction:column;gap:10px;min-width:0}
.dsh-st-md-block-title{display:flex;align-items:center;gap:6px;margin:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;font-weight:600}
.dsh-st-md-block-count{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px;font-weight:400}
.dsh-st-md-prompt{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere;cursor:text}
.dsh-st-md-prompt.is-clamped{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
.dsh-st-md-prompt:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dsh-st-md-prompt-input{width:100%;min-height:96px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:18px;resize:vertical;outline:none}
.dsh-st-md-prompt-input:focus{border-color:var(--dsw-alias-border-inverted)}
.dsh-st-md-field{display:grid;grid-template-columns:minmax(84px,auto) minmax(0,1fr);align-items:start;gap:4px 12px;min-width:0}
.dsh-st-md-field-label{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:32px}
.dsh-st-md-field-body{display:flex;flex-direction:column;gap:6px;min-width:0}
.dsh-st-md-field-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.dsh-st-md-static{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:32px}
.dsh-st-md-inline{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.dsh-st-md-input{height:32px;min-width:0;flex:1 1 140px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;outline:none}
.dsh-st-md-input:focus{border-color:var(--dsw-alias-border-inverted)}
.dsh-st-md-input.is-narrow{flex:0 0 84px}
.dsh-st-md-suffix{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px}
.dsh-st-md-select{position:relative;display:flex;min-width:0;z-index:1}
.dsh-st-md-select.is-open{z-index:30}
.dsh-st-md-select-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:32px;min-height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;cursor:pointer}
.dsh-st-md-select-btn:hover{border-color:var(--dsw-alias-border-inverted)}
.dsh-st-md-select-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-st-md-select-chevron{flex:none;width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.7}
.dsh-st-md-select-menu{min-width:min(280px,100%)}
.dsh-st-md-select-search{padding:4px 4px 8px}
.dsh-st-md-select-input{width:100%;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;outline:none}
.dsh-st-md-select-warning{padding:8px 10px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.dsh-st-md-segments{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
.dsh-st-md-segment{height:32px;min-height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:13px;line-height:20px;cursor:pointer;white-space:nowrap}
.dsh-st-md-segment:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-st-md-segment.is-on{border-color:var(--dsw-alias-border-inverted);background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-st-md-weekdays{display:flex;flex-wrap:wrap;gap:6px}
.dsh-st-md-weekday{height:32px;min-height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dsh-st-md-weekday:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-st-md-weekday.is-on{border-color:var(--dsw-alias-border-inverted);background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-st-md-advanced{align-self:flex-start;height:auto;min-height:auto;padding:6px 0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dsh-st-md-advanced:hover{color:var(--dsw-alias-label-primary)}
.dsh-st-md-history-list{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-st-md-history-row{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font-family:inherit;text-align:left;cursor:pointer}
.dsh-st-md-history-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-st-md-history-row.is-static{cursor:default;opacity:.6}
.dsh-st-md-history-row.is-static:hover{background:transparent}
.dsh-st-md-history-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-status-success)}
.dsh-st-md-history-row.is-failed .dsh-st-md-history-dot,.dsh-st-md-history-row.is-interrupted .dsh-st-md-history-dot{background:var(--dsw-alias-label-danger)}
.dsh-st-md-history-row.is-queued .dsh-st-md-history-dot,.dsh-st-md-history-row.is-running .dsh-st-md-history-dot{background:var(--dsw-alias-brand-primary)}
.dsh-st-md-history-row.is-skipped .dsh-st-md-history-dot,.dsh-st-md-history-row.is-cancelled .dsh-st-md-history-dot{background:var(--dsw-alias-label-tertiary)}
.dsh-st-md-history-copy{display:flex;flex-direction:column;gap:1px;flex:1 1 auto;min-width:0}
.dsh-st-md-history-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px}
.dsh-st-md-history-meta{display:inline-flex;align-items:center;gap:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.dsh-st-md-history-sep{opacity:.6}
.dsh-st-md-history-time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;white-space:nowrap}
.dsh-st-md-history-unread{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary)}
.dsh-st-md-history-empty{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.dsh-st-md-history-empty p{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:18px}
.dsh-st-md-detail-tip{display:flex;align-items:flex-start;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.dsh-st-md-detail-tip svg{flex:none;margin-top:1px}
.dsh-st-md-foot{display:flex;flex:none;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.dsh-st-md-foot-actions{display:inline-flex;align-items:center;gap:8px}
.dsh-st-md-dirty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}
.dsh-st-md-dirty.is-on{color:var(--dsw-alias-label-secondary)}

/* 宽容器：并排双栏。两种形态只换 CSS，React 树不动，因此右栏不重挂载。 */
@container (min-width:760px){
  .dsh-st-md.is-open .dsh-st-md-pane{flex:0 0 clamp(320px,34%,400px);width:clamp(320px,34%,400px);min-width:0;border-right:1px solid var(--dsw-alias-border-l1)}
  .dsh-st-md-scrim{display:none}
  .dsh-st-md-detail{position:relative;top:auto;right:auto;bottom:auto;flex:1 1 auto;width:auto;min-width:360px;box-shadow:none;animation:none}
  .dsh-st-md-detail-inner{min-width:0}
}

@keyframes dsh-st-md-fade{from{opacity:0}to{opacity:1}}
@keyframes dsh-st-md-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes dsh-st-md-pulse{0%,100%{opacity:1}50%{opacity:.35}}

@media (prefers-reduced-motion:reduce){
  .dsh-st-md-row,.dsh-st-md-more-btn,.dsh-st-md-row-pulse{transition:none;animation:none}
  .dsh-st-md-scrim,.dsh-st-md-detail{animation:none}
}
`;
function installStyles() {
  const existing = document.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    existing.textContent = CSS_TEXT;
    return () => void 0;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS_TEXT;
  document.head.append(style);
  return () => {
    style.remove();
  };
}
export {
  installStyles,
  installStyles as injectAutomationStyles
};
