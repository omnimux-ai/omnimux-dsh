    const CSS = `
.sh-root{font-family:inherit;color:var(--dsw-alias-label-primary,inherit);max-width:920px}
.sh-hint{color:var(--dsw-alias-label-caption,#6b7280);font-size:12px;line-height:18px;margin:0 0 10px}
.sh-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
@media (max-width:640px){.sh-cards{grid-template-columns:1fr}}
.sh-cards .sh-card,.sh-card{display:flex;gap:12px;align-items:flex-start;background:var(--dsw-alias-bg-layer-3,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;padding:12px;cursor:pointer;text-align:left;width:100%;height:auto;min-height:0;font:inherit;color:var(--dsw-alias-label-primary,inherit);white-space:normal;justify-content:flex-start;transition:border-color .16s,background .16s}
.sh-card:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));border-color:var(--dsw-alias-label-dimmed,#c7d2fe)}
.sh-card.on{border-color:var(--dsw-alias-state-success-primary,#86efac)}
.sh-card .dshUk-Button-label{display:flex;gap:12px;align-items:flex-start;min-width:0;flex:1;width:100%;white-space:normal;text-align:left}
.sh-icon{width:40px;height:40px;border-radius:10px;object-fit:cover;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);flex-shrink:0;background:linear-gradient(135deg,var(--dsw-alias-state-business-tertiary,#c7d2fe),var(--dsw-alias-state-warn-tertiary,#fbcfe8));display:grid;place-items:center;font-weight:700;font-size:12px;color:var(--dsw-alias-label-secondary,#374151)}
.sh-meta{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.sh-top{display:flex;align-items:center;gap:8px;min-width:0}
.sh-title{flex:1;min-width:0;font-weight:600;font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-badge{flex:none;font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-state-success-tertiary,#ecfdf5);color:var(--dsw-alias-state-success-primary,#047857)}
.sh-desc{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px;line-height:18px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.sh-marks{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:2px 0 0;min-width:0}
.sh-rate{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn,#b45309));white-space:nowrap}
.sh-stars{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn,#f59e0b));letter-spacing:.5px;font-size:11px;display:inline-flex;gap:1px;vertical-align:middle}
.sh-star-ico{display:inline-block;vertical-align:middle;color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn,#f59e0b));opacity:.35}
.sh-star-ico.on{opacity:1}
.sh-safe{display:inline-flex;align-items:center;gap:6px;margin-left:20px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap}
.sh-safe .sh-sec-ico{width:16px;height:16px}
.sh-bluev{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-business-primary,#2563eb);white-space:nowrap;min-width:0}
.sh-bluev i{width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#2563eb);color:var(--dsw-alias-label-primary-foreground,#fff);font-style:normal;font-size:9px;font-weight:800;display:inline-grid;place-items:center;line-height:1;flex:none}
.sh-bluev span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.sh-canon{font-size:12px;color:var(--dsw-alias-label-caption,#9ca3af);margin:0 0 8px}
.sh-overview{margin:0;font-size:14px;line-height:1.75;color:var(--dsw-alias-label-secondary,#374151);white-space:pre-wrap}
.sh-head .sh-marks{margin:0 0 8px}
.sh-head .sh-rate,.sh-head .sh-bluev,.sh-head .sh-safe{font-size:12px}
.sh-head .sh-stars{font-size:12px}
.sh-head .sh-bluev i{width:16px;height:16px;font-size:10px}
.sh-footline{color:var(--dsw-alias-label-caption,#9ca3af);font-size:11px;line-height:16px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-tags{display:flex;flex-wrap:wrap;gap:4px}
.sh-tag{font-size:11px;padding:2px 6px;border-radius:6px;background:var(--dsw-alias-markdown-tag,#f3f4f6);color:var(--dsw-alias-label-secondary,#4b5563)}
.sh-tag.blue{background:var(--dsw-alias-state-business-tertiary,#eff6ff);color:var(--dsw-alias-state-business-primary,#1d4ed8)}
.sh-tag.green{background:var(--dsw-alias-state-success-tertiary,#ecfdf5);color:var(--dsw-alias-state-success-primary,#047857)}
.sh-tag.orange{background:var(--dsw-alias-state-warn-tertiary,#fff7ed);color:var(--dsw-alias-state-warn-label,#c2410c)}
.sh-slug{color:var(--dsw-alias-label-caption,#9ca3af);font-size:11px;margin-top:auto}
.sh-overlay{position:fixed;inset:0;z-index:2147483000;background:var(--dsw-alias-bg-mask-3,rgba(15,23,42,.48));display:flex;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box}
.sh-drawer{position:relative;width:min(720px,100%);max-height:min(86vh,840px);margin:0 auto;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,inherit);border:1px solid var(--dsw-alias-border-l2,#9aa5b5);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--dsw-alias-shadow-overlay, var(--dsw-shadow-overlay, 0 18px 50px rgba(15,23,42,.28)))}
.sh-drawer.sh-skill{width:min(840px,100%);height:min(86vh,860px);max-height:min(86vh,860px)}
.sh-close{position:absolute;top:10px;right:10px;z-index:2}
.sh-head{display:flex;gap:14px;align-items:flex-start;padding:18px 48px 16px 18px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}
.sh-dicon{width:64px;height:64px;border-radius:12px;display:grid;place-items:center;font-weight:800;background:linear-gradient(135deg,var(--dsw-alias-state-business-tertiary,#c7d2fe),var(--dsw-alias-state-warn-tertiary,#fbcfe8));border:1px solid var(--dsw-alias-border-l2,#e5e7eb);flex-shrink:0;object-fit:cover}
.sh-head-copy{min-width:0;flex:1}
.sh-head h2{margin:0 0 6px;font-size:18px;line-height:1.35;color:var(--dsw-alias-label-primary,inherit)}
.sh-body{overflow:auto;padding:12px 18px 20px}
.sh-drawer.sh-skill .sh-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:16px 22px 0}
.sh-pane{flex:1;min-height:0;overflow:auto;padding:16px 2px 28px}
.sh-stats{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;flex:none}
.sh-stat{font-size:12px;padding:6px 10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform,#f7f8fa);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);color:var(--dsw-alias-label-secondary,inherit)}
.sh-tabs{display:flex;gap:16px;margin:0 -22px;padding:0 22px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);overflow-x:auto;scrollbar-width:none;flex:none}
.sh-tabs::-webkit-scrollbar{display:none}
.sh-tabs .sh-tab,.sh-tab{appearance:none;flex:none;background:0 0;border:0;border-radius:0;border-bottom:2px solid transparent;margin-bottom:-1px;padding:10px 0 12px;height:auto;min-height:0;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary,#6b7280);cursor:pointer;white-space:nowrap}
.sh-tabs .sh-tab:hover,.sh-tab:hover{background:0 0}
.sh-tabs .sh-tab.on,.sh-tab.on{color:var(--dsw-alias-label-primary,inherit);border-bottom-color:var(--dsw-alias-label-primary,#111827);font-weight:650;background:0 0;box-shadow:none}
.sh-tab .dshUk-Button-label{font:inherit;font-size:inherit;line-height:inherit;font-weight:inherit;color:inherit}
.sh-ver-card{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:16px 18px;margin:0 0 12px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff)}
.sh-ver-main{min-width:0;flex:1}
.sh-ver-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 6px}
.sh-ver-head b{font-size:15px}
.sh-ver-log{margin:8px 0 0;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary,#4b5563)}
.sh-ver-card .sh-mini{flex:none;align-self:center;white-space:nowrap}
.sh-ver-card .sh-hint{margin:0}
.sh-eval-hero{display:grid;grid-template-columns:200px minmax(0,1fr);gap:24px;align-items:start;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:16px;padding:20px 22px;margin:0 0 22px;background:var(--dsw-alias-bg-layer-3,#fff)}
.sh-eval-score{font-size:32px;line-height:1.15;font-weight:750;margin:4px 0 10px;letter-spacing:-.03em}
.sh-eval-score span{font-size:16px;font-weight:500;color:var(--dsw-alias-label-tertiary,#6b7280)}
.sh-eval-tag{display:inline-block;font-size:12px;line-height:22px;padding:0 10px;border-radius:8px;background:var(--dsw-alias-state-business-tertiary,#eff6ff);color:var(--dsw-alias-state-business-primary,#1d4ed8);margin:0 0 12px}
.sh-eval-sum{font-size:13px;line-height:1.8;color:var(--dsw-alias-label-secondary,#4b5563);margin:0}
.sh-eval-h{font-size:15px;font-weight:650;margin:4px 0 14px}
.sh-eval-item{padding:16px 18px;margin:0 0 12px;border:1px solid var(--dsw-alias-border-l2,#eee);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff)}
.sh-eval-h + .sh-eval-item{border-top:1px solid var(--dsw-alias-border-l2,#eee)}
.sh-eval-top{display:flex;align-items:center;gap:10px;margin:0 0 10px}
.sh-eval-ico{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex:none;color:var(--bar-tint);background:color-mix(in srgb,var(--bar-tint) 13%,transparent)}
.sh-eval-name{flex:1;min-width:0;font-size:14px;font-weight:650}
.sh-eval-sc{font-size:14px;font-weight:650;flex:none}
.sh-eval-bar{height:8px;border-radius:99px;background:var(--dsw-alias-bg-module-platform,#f3f4f6);overflow:hidden;margin:0 0 12px}
.sh-eval-bar>span{display:block;height:100%;border-radius:99px;width:var(--bar-pct);background:var(--bar-tint)}
.sh-eval-why{margin:0;font-size:13px;line-height:1.8;color:var(--dsw-alias-label-tertiary,#6b7280)}
.sh-radar{display:block;margin:4px auto 0;color:var(--dsw-alias-border-l3,#cbd5e1)}
.sh-sec-ico{width:16px;height:16px;flex:none;display:block}
@media (max-width:560px){.sh-eval-hero{grid-template-columns:1fr;justify-items:center;text-align:center}}
.sh-foot{display:flex;gap:8px;justify-content:flex-end;align-items:center;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafafa)}
.sh-mini{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary,inherit);text-decoration:none}
.sh-mini.primary{background:var(--dsw-alias-button-primary-fill,#111827);color:var(--dsw-alias-label-primary-foreground,#fff);border-color:var(--dsw-alias-button-primary-fill,#111827)}
.sh-mini:disabled{opacity:.4;cursor:default}
.sh-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--dsw-alias-toast-bg,#111827);color:var(--dsw-alias-label-primary-foreground,#fff);padding:10px 16px;border-radius:999px;font-size:13px;z-index:2147483646}
.sh-err{color:var(--dsw-alias-state-error-primary,#b91c1c);font-size:12px;margin:8px 0}
.sh-tool{margin:4px 0 8px}
.sh-fade{animation:sh-in .18s ease}
.sh-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l2,#eee)}
.sh-row-actions{display:flex;align-items:center;gap:8px}
.sh-row:first-child{border-top:0}
.sh-cfg-item{list-style:none}
.sh-cfg{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:12px;box-sizing:border-box}
.sh-cfg.open{background:var(--dsw-alias-bg-layer-2,#fafafa)}
.sh-cfg-h{box-sizing:border-box;width:100%;align-items:center;gap:12px;padding:14px 16px;display:flex}
.sh-cfg-h .sh-cfg-expand,.sh-cfg-expand{appearance:none;flex:1;min-width:0;height:auto;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:0;align-items:center;justify-content:flex-start;gap:12px;padding:0;display:flex;white-space:normal}
.sh-cfg-h .sh-cfg-expand:hover,.sh-cfg-expand:hover{background:0 0}
.sh-cfg-expand .dshUk-Button-label{display:flex;align-items:center;gap:12px;min-width:0;flex:1;width:100%;white-space:normal;text-align:left}
.sh-cfg-toggle{appearance:none;flex:none;width:28px;height:28px;padding:0;border:0;background:0 0;color:inherit;cursor:pointer;display:grid;place-items:center}
.sh-cfg-t{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.sh-cfg-n{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary,inherit)}
.sh-cfg-d{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:13px;line-height:1.5}
.sh-cfg-ch{color:var(--dsw-alias-label-tertiary,#6b7280);flex:none;width:14px;height:14px;transition:transform .16s;display:block;pointer-events:none}
.sh-cfg.open .sh-cfg-ch{transform:rotate(180deg)}
.sh-cfg-b{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 16px;padding:8px 0 12px;display:flex;flex-direction:column;gap:10px}
.sh-cfg-f{display:flex;flex-direction:column;gap:6px;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l2,#eee)}
.sh-cfg-f:first-child{border-top:0}
.sh-cfg-f label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
.sh-cfg-f input[type=text],.sh-cfg-f input[type=number]{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-3,#fff));color:var(--dsw-alias-label-primary,inherit);height:34px;font:inherit;border-radius:8px;padding:0 12px;font-size:13px}
.sh-cfg-hint{margin:0;color:var(--dsw-alias-label-caption,#6b7280);font-size:12px}
.sh-cfg-ft{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);justify-content:flex-end;gap:8px;padding:12px 0 4px;display:flex}
.sh-cfg-err{color:var(--dsw-alias-state-error-primary,#b91c1c);flex:1;margin:0;font-size:12px}
@keyframes sh-in{from{opacity:0}to{opacity:1}}
.sh-mkt{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;padding-bottom:24px;color:var(--dsw-alias-label-primary,#17191c);font-family:var(--dsw-font-family,inherit)}
.sh-mkt *{box-sizing:border-box}
.sh-mkt-filter{flex:none;height:30px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary,#7b8088);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.sh-mkt-search{display:block;width:100%}
.sh-mkt-search [role="toolbar"]{width:100%;padding:0;height:auto;min-height:32px;max-height:none}
.sh-mkt-search .dshUk-SearchField-root,.sh-mkt-search .dshUk-SearchField-stretch{max-width:none}
.sh-mkt-filters{display:flex;align-items:center;gap:5px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.sh-mkt-filters::-webkit-scrollbar{display:none}
.sh-mkt-filter:hover{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6)}
.sh-mkt-filter.on{background:var(--dsw-specific-sidebar-nav-item-active,#ebeef2);color:var(--dsw-alias-label-primary,#17191c);font-weight:500}
.sh-mkt-results{display:flex;align-items:baseline;justify-content:flex-start;gap:12px;padding:0 2px}
.sh-mkt-summary{margin:0;color:var(--dsw-alias-label-tertiary,#7b8088);font-size:12px;font-variant-numeric:tabular-nums}
.sh-mkt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch;gap:10px}
.sh-mkt-card{position:relative;min-width:0;min-height:188px;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l2,#e2e4e8);border-radius:10px;padding:14px;background:var(--dsw-alias-bg-layer-3,#fff)}
.sh-mkt-card.on{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#279c62) 45%,var(--dsw-alias-border-l2,#e2e4e8))}
.sh-mkt-card:hover{border-color:var(--dsw-alias-border-l1,#cfd2d8);box-shadow:var(--dsw-shadow-lv1,0 2px 8px rgb(20 24 32 / 8%))}
.sh-mkt-card.on:hover{border-color:var(--dsw-alias-state-success-primary,#279c62)}
.sh-mkt-head{display:flex;align-items:center;gap:10px}
.sh-mkt-head-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px;justify-content:center}
.sh-mkt-avatar{flex:none;width:36px;height:36px;border-radius:9px;object-fit:cover;border:1px solid var(--dsw-alias-border-l2,#e2e4e8);background:linear-gradient(135deg,var(--dsw-alias-state-business-tertiary,#c7d2fe),var(--dsw-alias-state-warn-tertiary,#fbcfe8))}
.sh-mkt-avatar-fallback{display:grid;place-items:center;font-weight:700;font-size:14px;line-height:1;color:var(--dsw-alias-label-secondary,#374151)}
.sh-mkt-stars{display:inline-flex;align-items:center;gap:3px}
.sh-mkt-stars .sh-star-ico{opacity:1}
.sh-mkt-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.sh-mkt-owner{min-width:0;overflow:hidden;margin:0;color:var(--dsw-alias-label-tertiary,#7b8088);font-family:var(--dsw-font-code,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace);font-size:11px;line-height:14px;text-overflow:ellipsis;white-space:nowrap}
.sh-mkt-badge{flex:none;min-height:18px;display:inline-flex;align-items:center;border-radius:5px;padding:1px 6px;background:var(--dsw-alias-bg-layer-1,#f5f6f8);color:var(--dsw-alias-label-tertiary,#7b8088);font-size:11px;line-height:16px}
.sh-mkt-badge.ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#279c62) 10%,transparent);color:var(--dsw-alias-state-success-primary,#279c62)}
.sh-mkt-badge.on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4d6bfe) 12%,transparent);color:var(--dsw-alias-state-business-primary,#4d6bfe)}
.sh-mkt-name{margin:0;overflow-wrap:anywhere;font-size:15px;line-height:18px;font-weight:600}
.sh-mkt-desc{display:-webkit-box;overflow:hidden;margin:10px 0 0;color:var(--dsw-alias-label-tertiary,#7b8088);font-size:12px;line-height:18px;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.sh-mkt-meta{display:flex;justify-content:space-between;gap:10px;margin-top:auto;padding-top:13px;color:var(--dsw-alias-label-tertiary,#7b8088);font-size:11px;line-height:17px}
.sh-mkt-actions{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2,#e2e4e8)}
.sh-mkt-details{flex:1;color:var(--dsw-alias-label-secondary,#4b5058);font-size:12px;font-weight:500;text-decoration:none;position:relative;z-index:1}
.sh-mkt-install{position:relative;z-index:1;min-height:30px;padding:0 10px;font-size:12px}
.sh-mkt-install:disabled{opacity:.4;cursor:default}
.sh-mkt-install.done{opacity:1;color:var(--dsw-alias-state-success-primary,#047857);background:transparent;cursor:default}
.sh-mkt-progress{display:flex;flex-direction:column;gap:8px;margin:0 2px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#e2e4e8);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f5f6f8);color:var(--dsw-alias-label-secondary,#4b5058);font-size:12px}
.sh-mkt-progress-row{display:flex;align-items:center;gap:10px;min-width:0}
.sh-mkt-progress-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.sh-mkt-progress-pct{flex:none;font-weight:600;font-variant-numeric:tabular-nums}
.sh-mkt-bar{width:100%;height:4px;border-radius:99px;overflow:hidden;background:var(--dsw-alias-border-l2,#e2e4e8)}
.sh-mkt-bar-fill{height:100%;width:var(--bar-pct);border-radius:99px;background:var(--bar-tint,var(--dsw-alias-state-business-primary,#4d6bfe));transition:width .6s ease}
.sh-mkt-bar-fill.wave{width:30%;animation:shBarSlide 1.2s ease-in-out infinite}
@keyframes shBarSlide{0%{margin-left:-30%}100%{margin-left:100%}}
@media (prefers-reduced-motion:reduce){.sh-mkt-bar-fill.wave{animation:none;width:40%}}
.sh-mkt-banner{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:10px;margin:0 2px 10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#4d6bfe) 28%,var(--dsw-alias-border-l2,#e2e4e8));border-radius:10px;background:var(--dsw-alias-bg-layer-3,#fff)}
.sh-mkt-banner-text{flex:1;min-width:0;font-size:13px;line-height:18px}
.sh-mkt-banner-text b{font-weight:600}
.sh-mkt-restart{flex:none;height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--dsw-alias-label-primary,#17191c);color:var(--dsw-alias-bg-layer-3,#fff);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.sh-mkt-restart:disabled{opacity:.5;cursor:default}
.sh-mkt-status{margin:0;padding:32px 12px;color:var(--dsw-alias-label-tertiary,#7b8088);font-size:13px;line-height:20px;text-align:center}
.sh-mkt-status.left{padding:0 2px;text-align:left}
.sh-mkt-more{align-self:stretch;display:flex;align-items:center;justify-content:center;gap:8px;height:auto;min-height:40px;margin-top:2px;padding:0 16px;border:1px solid var(--dsw-alias-border-l2,#e2e4e8);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f5f6f8);color:var(--dsw-alias-label-secondary,#4b5058);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background .16s,border-color .16s,box-shadow .16s,color .16s}
.sh-mkt-more:hover{background:var(--dsw-alias-bg-layer-3,#fff);border-color:var(--dsw-alias-border-l1,#cfd2d8);box-shadow:var(--dsw-shadow-lv1,0 2px 8px rgb(20 24 32 / 8%));color:var(--dsw-alias-label-primary,#17191c)}
.sh-mkt-more:active{transform:translateY(0.5px)}
.sh-mkt-more-left{color:var(--dsw-alias-label-tertiary,#7b8088);font-size:12px;font-weight:400;font-variant-numeric:tabular-nums}
.sh-mkt-more svg{flex:none;width:14px;height:14px}
@media (max-width:680px){.sh-mkt-grid{grid-template-columns:minmax(0,1fr)}}
.sh-plaza-wrap{width:100%}
.sh-plaza-wrap.rail{display:flex;justify-content:center}
.sh-plaza-trigger{box-sizing:border-box;display:flex;align-items:center;justify-content:flex-start;gap:8px;width:calc(100% + 4px);height:42px;margin:4px -2px;padding:0 10px 0 8px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:14px;line-height:22px;text-align:left;cursor:pointer;overflow:hidden}
.sh-plaza-wrap:not(.rail) .sh-plaza-trigger{justify-content:flex-start;text-align:left}
.sh-plaza-wrap.rail .sh-plaza-trigger{width:36px;height:36px;margin:8px 0 10px;padding:0;justify-content:center;border-radius:50%;gap:0;text-align:center}
.sh-plaza-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6)}
.sh-plaza-trigger svg,.sh-plaza-trigger .dshUk-Button-slot svg{flex:none;flex-shrink:0;width:16px;height:16px;min-width:16px;min-height:16px;aspect-ratio:1/1;overflow:visible}
.sh-plaza-wrap.rail .sh-plaza-trigger svg,.sh-plaza-wrap.rail .sh-plaza-trigger .dshUk-Button-slot svg{width:18px;height:18px;min-width:18px;min-height:18px}
.sh-plaza-trigger.on,.sh-plaza-trigger[aria-expanded=true]{background:var(--dsw-specific-sidebar-nav-item-active,#ebeef2)}
.sh-plaza-trigger .dshUk-Button-label,.sh-plaza-trigger span{white-space:nowrap;overflow:hidden}
.sh-plaza-page{position:relative;box-sizing:border-box;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base,#111215);color:var(--dsw-alias-label-primary,#fff);width:100%;height:100%}
.sh-plaza-view[data-active="false"]{display:none;pointer-events:none}
.sh-plaza-top{display:flex;align-items:center;gap:12px;flex:none;height:48px;padding:8px 20px;border-bottom:1px solid var(--dsw-alias-border-l2,#e2e4e8);background:var(--dsw-alias-bg-base,#fff);box-sizing:border-box;flex-wrap:nowrap}
.sh-plaza-tabs{display:flex;align-items:center;gap:16px;padding:0;border:0;background:inherit;flex:none}
.sh-plaza-tabs .sh-plaza-tab,.sh-plaza-tab{height:30px;padding:0;border:0;border-radius:0;background:inherit;color:var(--dsw-alias-label-tertiary,#7b8088);font:inherit;font-size:13px;font-weight:500;cursor:pointer}
.sh-plaza-tabs .sh-plaza-tab:hover,.sh-plaza-tab:hover{color:var(--dsw-alias-label-primary,#17191c);background:inherit}
.sh-plaza-tabs .sh-plaza-tab.on,.sh-plaza-tab.on{background:inherit;color:var(--dsw-alias-state-business-primary,#4d6bfe);box-shadow:none}
.sh-plaza-tab .dshUk-Button-label{font:inherit;font-size:inherit;font-weight:inherit;color:inherit}
.sh-plaza-search{display:flex;align-items:center;margin-left:auto;min-width:180px;max-width:280px;width:100%;flex:0 1 280px}
.sh-plaza-search .dshUk-SearchField-root,.sh-plaza-search .dshUk-SearchField-stretch{width:100%;max-width:none}
.sh-plaza-close{display:flex;align-items:center;flex:none}
.sh-plaza-body{flex:1;min-height:0;overflow:auto;padding:18px 20px 32px}
.sh-plaza-body .sh-mkt{max-width:none;width:100%}
.sh-plaza-body .sh-cards,.sh-plaza-body .sh-mkt-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:1400px){.sh-plaza-body .sh-cards,.sh-plaza-body .sh-mkt-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:980px){.sh-plaza-body .sh-cards,.sh-plaza-body .sh-mkt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.sh-plaza-body .sh-cards,.sh-plaza-body .sh-mkt-grid{grid-template-columns:1fr}}
.sh-plaza-body .sh-card{min-height:112px;padding:16px;gap:14px}
.sh-plaza-body .sh-icon{width:48px;height:48px;border-radius:12px;font-size:14px}
.sh-plaza-body .sh-title{font-size:15px;line-height:22px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sh-plaza-body .sh-desc{-webkit-line-clamp:2;font-size:13px;line-height:20px}
.sh-plaza-body .sh-mkt-card{min-height:220px;padding:16px}
.sh-plaza-tool{margin:4px 0 8px}
.sh-plaza-tool .sh-cards{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:720px){.sh-plaza-tool .sh-cards{grid-template-columns:1fr}}
.sh-plaza-skip{appearance:none;margin:8px 0 0;padding:0;border:0;background:0 0;color:var(--dsw-alias-label-caption,#9ca3af);font:inherit;font-size:12px;cursor:pointer}
.sh-plaza-skip:hover{color:var(--dsw-alias-label-secondary,#4b5563)}
.sh-plaza-status{margin:8px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#4b5563)}
.sh-picker-wrap{display:inline-flex;align-items:center;flex:none}
.sh-active-skill-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px 0 10px;border-radius:9999px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font-size:12px;font-weight:500;margin-left:6px;animation:sh-chip-in .15s cubic-bezier(.16,1,.3,1)}
.sh-active-skill-chip .sh-chip-close{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;border:none;background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:inherit;cursor:pointer;padding:0;margin-left:4px;opacity:.8;transition:opacity .12s,background .12s,transform .12s}
.sh-active-skill-chip .sh-chip-close:hover{opacity:1;background:var(--dsw-alias-interactive-bg-active,rgba(255,255,255,.2));transform:scale(1.1)}
.sh-active-skill-chip .sh-chip-close svg{display:block;flex-shrink:0}
@keyframes sh-chip-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
.sh-picker-trigger{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;box-sizing:border-box;padding:0 10px;border:0;box-shadow:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
.sh-picker-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.sh-picker-trigger:focus{outline:none}
.sh-picker-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}
.sh-picker-trigger.on{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.08));color:var(--dsw-alias-label-primary,inherit)}
.sh-picker-trigger svg{flex:none;width:16px;height:16px}
.sh-picker-trigger-label{white-space:nowrap}
html[data-omnimux-composer-density='icon'] .sh-picker-trigger{width:32px;min-width:32px;padding:0}
html[data-omnimux-composer-density='icon'] .sh-picker-trigger-label{display:none}
.sh-picker{position:fixed;z-index:2147482000;display:flex;flex-direction:column;max-height:480px;box-sizing:border-box;background:var(--dsw-alias-bg-elevated,#1c1c1f);color:var(--dsw-alias-label-primary,inherit);border:1px solid var(--dsw-alias-border-l2,#2a2a2e);border-radius:12px;box-shadow:var(--dsw-alias-shadow-overlay,0 18px 50px rgba(15,23,42,.28));overflow:hidden}
.sh-picker-head{display:flex;align-items:center;gap:10px;flex:none;padding:10px 12px 8px;flex-wrap:nowrap}
.sh-picker-title{display:inline-flex;align-items:center;gap:6px;flex:none;font-size:13px;font-weight:650;color:var(--dsw-alias-label-primary,inherit)}
.sh-picker-info{display:inline-flex;color:var(--dsw-alias-label-tertiary,#7b8088)}
.sh-picker-search{flex:1 1 160px;min-width:140px;max-width:260px}
.sh-picker-search .dshUk-SearchField-root,.sh-picker-search .dshUk-SearchField-stretch{width:100%;max-width:none}
.sh-picker-cats{display:flex;align-items:center;gap:4px;flex:none;padding:0 8px 8px;flex-wrap:nowrap}
.sh-picker-tabs{display:flex;align-items:center;gap:4px;flex:1 1 auto;min-width:0;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}
.sh-picker-tabs::-webkit-scrollbar{display:none}
.sh-picker-tab{flex:none;height:28px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary,#7b8088);font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.sh-picker-tab:hover{color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.sh-picker-tab.on{background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,inherit);font-weight:650}
.sh-picker-more{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary,#7b8088);cursor:pointer}
.sh-picker-more:hover{color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.sh-picker-banner{margin:0;padding:0 12px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#7b8088)}
.sh-picker-list{flex:1 1 auto;min-height:120px;overflow:auto;padding:0 6px 6px}
.sh-picker-row{display:flex;align-items:flex-start;gap:8px;width:100%;min-height:48px;box-sizing:border-box;margin:0;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.sh-picker-row:hover,.sh-picker-row.on{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.08))}
.sh-picker-row-main{min-width:0;flex:1}
.sh-picker-row-top{display:flex;align-items:baseline;gap:8px;min-width:0}
.sh-picker-name{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-picker-slug{flex:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#7b8088)}
.sh-picker-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#7b8088);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-picker-dl{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary,#7b8088);margin-top:2px}
.sh-picker-empty{margin:16px 12px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary,#7b8088)}
.sh-picker-skel{display:flex;flex-direction:column;gap:8px;padding:12px 10px}
.sh-picker-skel-a,.sh-picker-skel-b{display:block;height:10px;border-radius:6px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.08))}
.sh-picker-skel-a{width:55%}
.sh-picker-skel-b{width:80%}
.sh-picker-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2,#2a2a2e)}
.sh-picker-btn{height:32px;box-sizing:border-box;padding:0 14px;border:1px solid var(--dsw-alias-border-l2,#2a2a2e);border-radius:8px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;cursor:pointer}
.sh-picker-btn.primary{background:var(--dsw-alias-label-primary,#fff);color:var(--dsw-alias-bg-elevated,#111);border-color:transparent}

/* Model Picker & Capsule (Issue #1167) */
.sh-model-picker-wrap{display:inline-flex;align-items:center;flex:none;margin-left:4px}
.sh-model-capsule-btn{display:inline-flex;align-items:center;gap:6px;height:28px;box-sizing:border-box;padding:0 12px 0 10px;border-radius:9999px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.08));border:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.15));color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:12px;font-weight:500;line-height:18px;cursor:pointer;transition:all .15s cubic-bezier(.16,1,.3,1);white-space:nowrap;animation:sh-chip-in .15s cubic-bezier(.16,1,.3,1)}
.sh-model-capsule-btn:hover,.sh-model-capsule-btn.on{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.12));border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.25))}
.sh-model-capsule-btn svg,.sh-model-capsule-btn .sh-model-brand-icon{flex:none;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center}
.sh-model-capsule-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-model-picker{position:fixed;z-index:2147482000;display:flex;flex-direction:column;width:480px;max-width:min(520px,calc(100vw - 24px));max-height:540px;box-sizing:border-box;background:var(--dsw-alias-bg-layer-2,#1c1c1f);color:var(--dsw-alias-label-primary,inherit);border:1px solid var(--dsw-alias-border-l2,#2a2a2e);border-radius:12px;box-shadow:var(--dsw-alias-shadow-overlay,0 18px 50px rgba(0,0,0,.35));padding:16px;overflow:hidden}
.sh-model-picker-header{display:flex;align-items:center;justify-content:space-between;flex:none;margin-bottom:12px}
.sh-model-picker-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.sh-model-auto-row{display:inline-flex;align-items:center;gap:8px}
.sh-model-auto-label{font-size:13px;color:var(--dsw-alias-label-primary,inherit)}
.sh-model-switch{position:relative;width:38px;height:22px;border-radius:9999px;background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));border:none;padding:0;cursor:pointer;transition:background-color .2s;outline:none}
.sh-model-switch.on{background:var(--dsw-alias-brand-purple,#8c6ff7)}
.sh-model-switch-thumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-bg-elevated,#ffffff);transition:transform .2s cubic-bezier(.4,0,.2,1);box-shadow:var(--dsw-alias-shadow-sm,none)}
.sh-model-switch.on .sh-model-switch-thumb{transform:translateX(16px)}
.sh-model-tabs{display:flex;background:var(--dsw-alias-bg-base,rgba(0,0,0,.25));border-radius:8px;padding:3px;gap:4px;flex:none;margin-bottom:8px}
.sh-model-tab{flex:1;height:32px;border:none;border-radius:6px;background:transparent;font:inherit;font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary,#8b93a1);cursor:pointer;transition:all .15s ease}
.sh-model-tab:hover{color:var(--dsw-alias-label-primary,inherit)}
.sh-model-tab.active{background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.12));color:var(--dsw-alias-label-primary,inherit);box-shadow:var(--dsw-alias-shadow-sm,none);font-weight:600}
.sh-model-section-title{font-size:12px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8b93a1);margin:4px 0 6px 4px;flex:none}
.sh-model-list{display:flex;flex-direction:column;gap:4px;overflow-y:auto;max-height:360px;padding-right:2px;scrollbar-width:thin}
.sh-model-row{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;cursor:pointer;transition:background .15s ease;user-select:none;border:1px solid transparent;background:transparent;text-align:left}
.sh-model-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.sh-model-row.selected{background:var(--dsw-alias-interactive-bg-active,rgba(140,111,247,.12));border-color:var(--dsw-alias-border-l3,rgba(140,111,247,.2))}
.sh-model-row-left{display:flex;align-items:center;gap:12px;min-width:0;flex:1}
.sh-model-icon-box{width:36px;height:36px;border-radius:8px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.08));display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--dsw-alias-label-primary,inherit)}
.sh-model-brand-icon{display:inline-flex;align-items:center;justify-content:center;color:inherit}
.sh-model-brand-icon svg{width:20px;height:20px;display:block}
.sh-model-row-info{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.sh-model-row-title-row{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0}
.sh-model-name{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap;flex-shrink:0}
.sh-model-diamond{display:inline-flex;flex-shrink:0;color:var(--dsw-alias-brand-purple,#8c6ff7)}
.sh-model-badge{font-size:11px;font-weight:500;padding:1px 6px;border-radius:4px;white-space:nowrap;line-height:16px;flex-shrink:0}
.sh-model-badge.purple{background:var(--dsw-alias-brand-purple-bg,rgba(140,111,247,.16));color:var(--dsw-alias-brand-purple,#c4b5fd);border:1px solid var(--dsw-alias-border-l3,rgba(140,111,247,.28))}
.sh-model-badge.green{background:var(--dsw-alias-state-success-bg,rgba(34,197,94,.16));color:var(--dsw-alias-state-success,#4ade80);border:1px solid var(--dsw-alias-border-l3,rgba(34,197,94,.28))}
.sh-model-row-desc{font-size:12px;color:var(--dsw-alias-label-tertiary,#8b93a1);line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-model-row-right{display:flex;align-items:center;flex-shrink:0;margin-left:12px}
.sh-model-radio{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l3,rgba(255,255,255,.25));display:flex;align-items:center;justify-content:center;transition:all .15s ease;box-sizing:border-box;background:transparent}
.sh-model-radio.checked{border-color:var(--dsw-alias-brand-purple,#8c6ff7)}
.sh-model-radio-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-purple,#8c6ff7)}

/* Skill Workshop 极简白/灰原生设计 (Issue #773 / #776) */
.sh-plaza-top[hidden]{display:none}
.sh-mkt{min-width:0;container-type:inline-size}
.sh-plaza-body .sh-mkt{gap:0}
.sh-mkt .workshop-intro{padding-bottom:20px;margin-bottom:20px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.sh-mkt .workshop-intro.no-actions{padding-bottom:16px;margin-bottom:18px}
.sh-mkt .workshop-intro.no-actions .workshop-description{margin-bottom:0}
.sh-mkt .workshop-heading{font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0 0 6px}
.sh-mkt .workshop-description{font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary);margin:0 0 16px}
.action-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sh-mkt .btn-create,.sh-mkt .btn-install{height:32px;box-sizing:border-box;padding:0 14px;flex:none}
.sh-mkt .btn-install{background:transparent;border-color:var(--dsw-alias-border-l3)}
.sh-mkt button:focus-visible,.sh-mkt input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.btn-create{background:var(--dsw-alias-label-primary,#ffffff);color:var(--dsw-alias-bg-elevated,#000000);border:0;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:500;display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;transition:opacity .15s}
.btn-create:hover{opacity:.9}
.btn-create svg{width:14px;height:14px;fill:currentColor}
.btn-install{background:var(--dsw-alias-bg-subtle,var(--dsw-alias-bg-layer-3,rgba(255,255,255,.08)));color:var(--dsw-alias-label-primary,#fff);border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.14));border-radius:8px;padding:7px 14px;font-size:13px;font-weight:500;display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;transition:background .15s}
.btn-install:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.14))}
.nav-bar{display:flex;flex-wrap:nowrap;align-items:center;justify-content:space-between;margin-bottom:18px;gap:16px;min-width:0;padding-bottom:2px}
.nav-tabs{display:flex;align-items:center;gap:24px;flex:none;white-space:nowrap}
@container (max-width:380px){.nav-bar{flex-wrap:wrap;gap:8px}.sh-mkt .search-box{flex-basis:100%;max-width:none}.nav-tabs{gap:16px}}
.nav-tab{position:relative;display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;font-family:inherit;font-size:14px;color:var(--dsw-alias-label-tertiary,#84878f);cursor:pointer;user-select:none;padding:6px 0 10px;transition:color .15s}
.nav-tab:hover{color:var(--dsw-alias-label-primary,#ffffff)}
.nav-tab.active{color:var(--dsw-alias-label-primary,#ffffff);font-weight:600}
.nav-tab.active::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--dsw-alias-label-primary,#ffffff);border-radius:1px}
.tab-info-icon{width:14px;height:14px;flex-shrink:0;color:currentColor}
.search-box{position:relative;flex:1 1 200px;min-width:140px;max-width:260px}
.search-box input{width:100%;height:32px;box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 12px 0 32px;color:var(--dsw-alias-label-primary);font-size:13px;outline:none}
.search-box input::placeholder{color:var(--dsw-alias-label-caption,var(--dsw-alias-text-muted,#555861))}
.search-box input:focus{border-color:var(--dsw-alias-border-focus,var(--dsw-alias-border-l1,rgba(255,255,255,.3)))}
.search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:13px;height:13px;fill:var(--dsw-alias-label-caption,var(--dsw-alias-text-muted,#686b74));pointer-events:none}
.mine-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.pill-dropdown{background:var(--dsw-alias-bg-layer-2,#16171a);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:20px;padding:5px 12px;font-size:12px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-text-secondary,#92959e));display:inline-flex;align-items:center;gap:4px;cursor:pointer;user-select:none}
.pill-dropdown:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,#fff)}
.auto-update-wrap{display:inline-flex;align-items:center;gap:8px;margin-left:12px;font-size:12px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-text-secondary,#92959e));user-select:none}
.category-bar{display:flex;align-items:center;gap:8px;margin-bottom:20px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.category-bar::-webkit-scrollbar{display:none}
.cat-btn{background:transparent;border:0;color:var(--dsw-alias-label-tertiary,#84878f);font-size:13px;padding:6px 14px;border-radius:16px;cursor:pointer;white-space:nowrap;user-select:none;transition:all .15s}
.cat-btn:hover{color:var(--dsw-alias-label-primary,#ffffff);background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.cat-btn.active{background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.12));color:var(--dsw-alias-label-primary,#ffffff);font-weight:500}
.featured-section{margin-bottom:28px}
.featured-title{font-size:20px;font-weight:600;color:var(--dsw-alias-label-primary,#ffffff);margin:0 0 14px}
.featured-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px}
.featured-card{background:var(--dsw-alias-bg-layer-2,#121316);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:10px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;transition:background .15s,border-color .15s;position:relative}
.featured-card:hover{background:var(--dsw-alias-interactive-bg-hover,#17181c);border-color:var(--dsw-alias-border-l1,rgba(255,255,255,.16))}
.featured-cover-wrap{width:100%;aspect-ratio:16/9;background:var(--dsw-alias-bg-elevated,#1c1d22);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
.featured-cover-wrap svg,.featured-cover-wrap img{width:100%;height:100%;object-fit:cover;display:block}
.featured-hover-actions{position:absolute;bottom:8px;left:8px;right:8px;display:flex;align-items:center;gap:6px;opacity:0;transform:translateY(4px);transition:opacity .2s ease,transform .2s ease;pointer-events:none;z-index:3}
.featured-card:hover .featured-hover-actions{opacity:1;transform:translateY(0);pointer-events:auto}
.hover-btn{flex:1;height:34px;border-radius:6px;border:0;display:flex;align-items:center;justify-content:center;gap:4px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;padding:0 6px;transition:filter .15s ease}
.hover-btn:hover{filter:brightness(1.1)}
.hover-btn-detail{background:var(--dsw-alias-bg-surface,rgba(45,48,56,.85));backdrop-filter:blur(8px);color:var(--dsw-alias-label-primary,#fff);border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.14))}
.hover-btn-pin{background:var(--dsw-alias-bg-layer-2,rgba(37,39,46,.85));backdrop-filter:blur(8px);color:var(--dsw-alias-label-secondary,#cbd5e1);border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.12))}
.hover-btn-pin:hover{color:var(--dsw-alias-label-primary,#ffffff);background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.1))}
.hover-btn-try{background:var(--dsw-alias-brand-primary,#6f59ff);color:var(--dsw-alias-label-primary-foreground,#fff)}
.featured-content{padding:10px 12px;display:grid;grid-template-rows:40px 32px;gap:4px}
.featured-card-name{font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.featured-card-desc{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:16px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;margin:0}
.featured-card-footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto;font-size:12px}
.featured-card-author{display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-secondary,#9da1ab);font-size:12px}
.featured-author-badge{flex-shrink:0}
.featured-card-dl{display:inline-flex;align-items:center;gap:2px;color:var(--dsw-alias-label-caption,#84878f);font-size:11px}
.regular-section{margin-top:8px}
.regular-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.regular-title-row{display:flex;align-items:baseline;gap:6px;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#fff)}
.regular-title-count{font-size:13px;font-weight:400;color:var(--dsw-alias-label-caption,#686b74)}
.regular-controls{display:flex;align-items:center;gap:14px}
.filter-item{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-text-secondary,#92959e));cursor:pointer;user-select:none}
.filter-circle{width:13px;height:13px;border:1.5px solid var(--dsw-alias-border-default,#4a4d55);border-radius:50%;display:flex;align-items:center;justify-content:center;transition:all .15s}
.filter-item.checked .filter-circle{border-color:var(--dsw-alias-brand-primary,#6f59ff);background:var(--dsw-alias-brand-primary,#6f59ff)}
.filter-item.checked .filter-circle::after{content:'';width:3px;height:3px;border-radius:50%;background:var(--dsw-alias-label-primary,#fff)}
.sort-btn{display:flex;align-items:center;gap:3px;font-size:12px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-text-secondary,#92959e));background:transparent;border:0;cursor:default;padding:2px 4px}
.regular-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
@media (max-width:440px){.regular-grid{grid-template-columns:1fr}}
.regular-card{background:var(--dsw-alias-bg-layer-2,#121316);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;transition:background .15s,border-color .15s;cursor:pointer}
.regular-card:hover{background:var(--dsw-alias-interactive-bg-hover,#17181c);border-color:var(--dsw-alias-border-subtle,rgba(255,255,255,.14))}
.regular-card-info{flex:1;min-width:0}
.regular-card-top{display:flex;align-items:baseline;gap:6px;margin-bottom:3px}
.regular-card-title{font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.regular-card-dl{font-size:11px;color:var(--dsw-alias-label-caption,#686b74)}
.regular-card-desc{font-size:12px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;line-height:16px}
.toggle-wrap{flex-shrink:0;cursor:pointer;display:inline-flex;align-items:center;user-select:none;padding:2px}
.switch-bg{width:38px;height:22px;border-radius:999px;background:var(--dsw-alias-border-default,rgba(255,255,255,.18));border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.12));box-sizing:border-box;position:relative;transition:background .2s ease,border-color .2s ease}
.toggle-wrap:hover .switch-bg{background:var(--dsw-alias-border-hover,rgba(255,255,255,.26));border-color:var(--dsw-alias-border-l3,rgba(255,255,255,.2))}
.switch-bg.on{background:var(--dsw-alias-brand-primary,#6f59ff);border-color:var(--dsw-alias-brand-primary,#6f59ff)}
.toggle-wrap:hover .switch-bg.on{background:var(--dsw-alias-button-primary-hover,#7d68ff);border-color:var(--dsw-alias-button-primary-hover,#7d68ff)}
.switch-knob{width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary,#ffffff);position:absolute;top:2px;left:2px;box-shadow:0 1px 3px var(--dsw-alias-shadow-color,rgba(0,0,0,.35));transition:transform .2s cubic-bezier(.4,0,.2,1)}
.switch-bg.on .switch-knob{transform:translateX(16px)}
.modal-overlay{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-3,rgba(0,0,0,.72));backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:2147483000;opacity:0;pointer-events:none;transition:opacity .2s ease}
.modal-overlay.open{opacity:1;pointer-events:auto}
.modal-dialog{background:var(--dsw-alias-bg-elevated,#191a20);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:12px;width:480px;max-width:90vw;padding:24px;box-shadow:var(--dsw-alias-shadow-overlay,0 20px 40px var(--dsw-alias-shadow-color,rgba(0,0,0,.6)));color:var(--dsw-alias-label-primary,#fff)}
.modal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.modal-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary,#fff);margin:0}
.modal-close-btn{background:transparent;border:0;color:var(--dsw-alias-label-tertiary,#84878f);cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;transition:color .15s}
.modal-close-btn:hover{color:var(--dsw-alias-label-primary,#fff)}
.drop-zone{border:1.5px dashed var(--dsw-alias-border-default,#3a3d46);border-radius:8px;padding:28px 16px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer;background:var(--dsw-alias-bg-subtle,rgba(255,255,255,.01));margin-bottom:18px;transition:border-color .15s,background .15s}
.drop-zone:hover,.drop-zone.dragover{border-color:var(--dsw-alias-border-focus,rgba(255,255,255,.3));background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.03))}
.drop-icon-box{width:44px;height:44px;background:var(--dsw-alias-bg-layer-2,#20222a);border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;color:var(--dsw-alias-label-tertiary,#7b7f8b)}
.drop-text{font-size:13px;color:var(--dsw-alias-label-secondary,#9da1ab);margin:0}
.req-section{margin-bottom:20px}
.req-title{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#9da1ab);margin:0 0 6px}
.req-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px}
.req-item{font-size:12px;color:var(--dsw-alias-label-tertiary,#b5b8c0);display:flex;align-items:center;gap:6px}
.req-item::before{content:'•';color:var(--dsw-alias-label-caption,#84878f);font-size:12px;line-height:1}
.btn-modal-install{width:100%;height:38px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#7d8089);color:var(--dsw-alias-label-primary-foreground,#1a1c22);border:0;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.btn-modal-install.ready{background:var(--dsw-alias-label-primary,#ffffff);color:var(--dsw-alias-bg-elevated,#000000)}
.btn-modal-install.ready:hover{opacity:.9}
.btn-modal-install:disabled{opacity:.5;cursor:not-allowed}
.ws-detail-dialog{width:min(1000px,94vw);height:min(760px,88vh);max-width:1000px;max-height:88vh;padding:20px 24px 16px;display:flex;flex-direction:column;box-sizing:border-box}
.ws-detail-header-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.ws-detail-header-left{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.ws-detail-header-title{font-size:20px;font-weight:700;color:var(--dsw-alias-label-primary,#ffffff);line-height:28px;margin:0}
.ws-detail-badges{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
.ws-detail-badge{font-size:12px;color:var(--dsw-alias-label-secondary,#a1a1aa);background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.06));padding:2px 8px;border-radius:6px;line-height:18px}
.ws-detail-desc{font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary,#a1a1aa);margin:0 0 14px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ws-detail-main{flex:1;min-height:0;display:flex;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));overflow:hidden}
.ws-detail-tree{width:210px;flex-shrink:0;border-right:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));padding:12px 8px;overflow-y:auto;box-sizing:border-box}
.ws-tree-node{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;font-size:13px;color:var(--dsw-alias-label-secondary,#a1a1aa);cursor:pointer;user-select:none;transition:background .15s,color .15s}
.ws-tree-node:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#ffffff)}
.ws-tree-node.active{background:var(--dsw-alias-interactive-bg-active,rgba(255,255,255,.12));color:var(--dsw-alias-label-primary,#ffffff);font-weight:500}
.ws-tree-sub{padding-left:18px}
.ws-detail-content{flex:1;min-width:0;padding:16px 20px;overflow-y:auto;box-sizing:border-box}
.ws-code-card{background:var(--dsw-alias-bg-base,#0c0f17);border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.08));border-radius:8px;margin-bottom:20px;overflow:hidden}
.ws-code-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03));border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.06))}
.ws-code-lang{font-size:11px;font-weight:600;color:var(--dsw-alias-label-caption,#84878f);text-transform:uppercase}
.ws-code-copy{background:transparent;border:0;padding:4px;color:var(--dsw-alias-label-tertiary,#84878f);cursor:pointer;display:flex;align-items:center;gap:4px;font-size:11px;border-radius:4px;transition:color .15s}
.ws-code-copy:hover{color:var(--dsw-alias-label-primary,#ffffff)}
.ws-code-pre{margin:0;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary,#f3f4f6);overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.ws-markdown-body{color:var(--dsw-alias-label-primary,#f3f4f6);font-size:13px;line-height:1.65}
.ws-markdown-body h1{font-size:18px;font-weight:700;color:var(--dsw-alias-label-primary,#ffffff);margin:0 0 12px}
.ws-markdown-body h2,.ws-markdown-body h3{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#ffffff);margin:16px 0 8px}
.ws-markdown-body p{margin:0 0 12px;color:var(--dsw-alias-label-secondary,#d1d5db)}
.ws-markdown-body ul{margin:0 0 12px;padding-left:20px}
.ws-markdown-body li{margin-bottom:4px;color:var(--dsw-alias-label-secondary,#d1d5db)}
.ws-detail-footer{height:56px;display:flex;align-items:center;justify-content:space-between;padding-top:12px}
.ws-footer-status{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--dsw-alias-label-primary,#ffffff)}
.ws-footer-actions{display:flex;align-items:center;gap:8px}
.ws-more-menu-wrap{position:relative}
.ws-more-menu{position:absolute;bottom:calc(100% + 6px);right:0;background:var(--dsw-alias-bg-elevated,#1c1c1f);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));border-radius:8px;padding:4px;min-width:120px;box-shadow:var(--dsw-alias-shadow-overlay,0 8px 24px var(--dsw-alias-shadow-color,rgba(0,0,0,.5)));z-index:2147483010}
.ws-more-item{width:100%;text-align:left;background:transparent;border:0;padding:8px 12px;font-size:12px;color:var(--dsw-alias-label-primary,#ffffff);border-radius:4px;cursor:pointer;transition:background .15s}
.ws-more-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08))}
.ws-more-item.danger{color:var(--dsw-alias-label-danger,#f87171)}
.ws-detail-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.08))}
.ws-detail-confirm{padding:10px 0}
.ws-detail-confirm p{margin:0 0 10px;font-size:13px;color:var(--dsw-color-warning,#fbbf24)}

/* 专家市场 / Experts Market */
.expert-market-container{padding:0 0 32px 0;width:100%}
.expert-market-heading{margin-bottom:24px}
.expert-market-title{font-size:24px;font-weight:700;color:var(--dsw-alias-label-primary,#ffffff);margin:0 0 6px 0;letter-spacing:-0.01em}
.expert-market-subtitle{font-size:14px;color:var(--dsw-alias-label-secondary,#9da1ab);margin:0}
.expert-market-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
@media (max-width:1200px){.expert-market-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:900px){.expert-market-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:580px){.expert-market-grid{grid-template-columns:1fr}}
.expert-card{background:var(--dsw-alias-bg-layer-2,#1e2023);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.07));border-radius:20px;padding:24px;display:flex;flex-direction:column;position:relative;transition:transform .2s ease,border-color .2s ease,background .2s ease;min-height:310px;box-sizing:border-box}
.expert-card:hover{background:var(--dsw-alias-interactive-bg-hover,#24262b);border-color:var(--dsw-alias-border-subtle,rgba(255,255,255,.14))}
.expert-card-avatar-wrap{width:68px;height:68px;border-radius:50%;overflow:hidden;margin-bottom:16px;background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05));display:flex;align-items:center;justify-content:center;flex-shrink:0}
.expert-card-avatar{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}
.expert-card-action{position:absolute;top:24px;right:24px;opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;transform:translateY(-2px)}
.expert-card:hover .expert-card-action,.expert-card:focus-within .expert-card-action{opacity:1;pointer-events:auto;transform:translateY(0)}
.expert-pill-btn{background:var(--dsw-alias-label-primary,#ffffff);color:var(--dsw-alias-label-primary-foreground,#111827);border:none;border-radius:9999px;padding:6px 18px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s ease,transform .15s ease;box-shadow:var(--dsw-alias-shadow-overlay,0 1px 3px rgba(0,0,0,.25));line-height:1.2}
.expert-pill-btn:hover{opacity:.92;transform:scale(1.02)}
.expert-pill-btn:active{transform:scale(.98)}
.expert-card-status{font-size:13px;font-weight:500;margin-bottom:12px;letter-spacing:.5px}
.expert-card-status.enabled{color:var(--dsw-color-success,#10b981)}
.expert-card-status.available{color:var(--dsw-alias-label-tertiary,#94a3b8)}
.expert-card-status.disabled{color:var(--dsw-alias-label-tertiary,#94a3b8)}
.expert-card-status.coming_soon{color:var(--dsw-alias-label-caption,#6b7280)}
.expert-card-title{font-size:18px;font-weight:700;color:var(--dsw-alias-label-primary,#ffffff);margin:0 0 10px 0;line-height:1.35}
.expert-card-desc{font-size:13px;line-height:1.55;color:var(--dsw-alias-label-secondary,#9da1ab);margin:0;flex:1}

/* Hide permission preset selector in composer input bar */
[data-composer-card] button[aria-label*="访问模式"],
[data-composer-card] button[aria-label*="Access mode"],
[data-composer-card] [class*="modes"] > button:has([class*="triggerIcon"]),
[data-composer-card] [class*="modes"] > button[class*="trigger"]:first-child {
  display: none !important;
}

`;

    const CSS_ID = "omnimux-market-style";
    function ensureCss() {
      if (typeof document === "undefined") return () => {};
      let s = document.getElementById(CSS_ID);
      if (!s) {
        s = document.createElement("style");
        s.id = CSS_ID;
        document.head.appendChild(s);
      }
      s.textContent = CSS;
      return () => {};
    }
