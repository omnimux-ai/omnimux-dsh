export const DOCK_STYLES = `
.omx-attachment-dock {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 12px 2px 12px;
  margin: 0;
}
.omx-video-token-action-row {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 2px 0 6px 0 !important;
  box-sizing: border-box !important;
}
.omx-btn-insert-link {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  height: 28px !important;
  box-sizing: border-box !important;
  padding: 0 12px !important;
  border-radius: 9999px !important;
  border: 1px dashed var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.22)) !important; /* exempt-ui03: 虚线边框 */
  background: transparent !important;
  color: var(--dsw-alias-label-secondary, inherit) !important;
  font: inherit !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  white-space: nowrap !important;
  cursor: pointer !important;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
  user-select: none !important;
  flex-shrink: 0 !important;
}
.omx-btn-insert-link span {
  white-space: nowrap !important;
  display: inline-block !important;
}
.omx-btn-insert-link:hover {
  border-color: rgba(140, 111, 247, 0.5) !important; /* exempt-ui03: 悬浮紫色边框 */
  color: #c4b5fd !important; /* exempt-ui03: 悬浮紫色文字 */
  background: rgba(121, 97, 242, 0.16) !important; /* exempt-ui03: 悬浮紫色背景 */
  transform: translateY(-0.5px) !important;
}
[data-composer-chip="link"],
[data-composer-chip="video"] {
  display: inline-flex !important;
  vertical-align: middle !important;
  box-sizing: border-box !important;
  margin: 0 2px !important;
  padding: 0 6px !important;
}
[data-composer-chip="link"] > span,
[data-composer-chip="video"] > span {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  background: rgba(121, 97, 242, 0.16) !important; /* exempt-ui03: 极光紫半透底色 */
  border: 1px solid rgba(140, 111, 247, 0.45) !important; /* exempt-ui03: 极光紫微光描边 */
  color: #c4b5fd !important; /* exempt-ui03: 浅亮紫文字 */
  box-shadow: 0 0 0 1px rgba(121, 97, 242, 0.2) !important; /* exempt-ui03: 极光紫微光晕 */
  border-radius: 6px !important;
  padding: 2px 8px !important;
  transition: all 0.15s ease !important;
}
[data-composer-chip="link"] > span:hover,
[data-composer-chip="video"] > span:hover {
  background: rgba(121, 97, 242, 0.25) !important; /* exempt-ui03: 悬浮底色 */
  border-color: #a78bfa !important; /* exempt-ui03: 悬浮高亮描边 */
  color: #ffffff !important; /* exempt-ui03: 悬浮高亮文字 */
}
[data-composer-chip="link"] > span::before,
[data-composer-chip="video"] > span::before {
  content: "" !important;
  display: inline-block !important;
  width: 13px !important;
  height: 13px !important;
  flex-shrink: 0 !important;
  background-color: #a78bfa !important; /* exempt-ui03: 极光紫图标 */
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/%3E%3Cpath d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/%3E%3C/svg%3E") no-repeat center / contain !important;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/%3E%3Cpath d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/%3E%3C/svg%3E") no-repeat center / contain !important;
}
[data-composer-chip="link"] > span:hover::before,
[data-composer-chip="video"] > span:hover::before {
  background-color: #ffffff !important; /* exempt-ui03: 悬浮高亮白色图标 */
}
[data-composer-chip="link"] svg,
[data-composer-chip="video"] svg {
  display: none !important;
}
[data-composer-input="true"] ::selection,
[data-composer-card] [contenteditable="true"] ::selection {
  background-color: rgba(121, 97, 242, 0.38) !important; /* exempt-ui03: 极光亮紫 #7961F2 品牌选中色 (design.md §3.6) */
  color: #ffffff !important; /* exempt-ui03: 选中高亮纯白文字 */
}
::highlight(omx-prompt-slot) {
  background-color: rgba(121, 97, 242, 0.16) !important; /* exempt-ui03: 极光紫 #7961F2 槽位底色 (design.md §3.6) */
  color: inherit !important;
  text-decoration: none !important;
}
.omx-prompt-slots-dock {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  padding: 4px 16px 6px 16px !important;
  box-sizing: border-box !important;
}
.omx-prompt-slot-chip {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  height: 28px !important;
  box-sizing: border-box !important;
  padding: 0 12px !important;
  border-radius: 9999px !important;
  border: 1px dashed var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.22)) !important; /* exempt-ui03: 虚线边框 */
  background: rgba(255, 255, 255, 0.04) !important; /* exempt-ui03: 黑白暗色半透底 */
  color: var(--dsw-alias-label-secondary, #d1d5db) !important; /* exempt-ui03: 柔和灰白文字 */
  font: inherit !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  white-space: nowrap !important;
  cursor: pointer !important;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
  user-select: none !important;
  flex-shrink: 0 !important;
}
.omx-prompt-slot-chip:hover {
  border-color: rgba(255, 255, 255, 0.45) !important; /* exempt-ui03: 悬浮高亮边框 */
  color: #ffffff !important; /* exempt-ui03: 悬浮纯白文字 */
  background: rgba(255, 255, 255, 0.08) !important; /* exempt-ui03: 悬浮微亮底色 */
  transform: translateY(-0.5px) !important;
}
.omx-prompt-slot-chip.is-active {
  border-style: solid !important;
  border-color: rgba(255, 255, 255, 0.65) !important; /* exempt-ui03: 选中实线边框 */
  color: #ffffff !important; /* exempt-ui03: 选中纯白文字 */
  background: rgba(255, 255, 255, 0.12) !important; /* exempt-ui03: 选中底色 */
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2) !important; /* exempt-ui03: 选中文光晕 */
}
.omx-prompt-slot-chip svg {
  flex-shrink: 0 !important;
  color: currentColor !important;
  opacity: 0.8 !important;
}
.omx-prompt-slot-chip:hover svg,
.omx-prompt-slot-chip.is-active svg {
  opacity: 1 !important;
}
.omx-prompt-slot-chip-text {
  white-space: nowrap !important;
  max-width: 220px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
.omx-attachment-tray {
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  padding: 6px 0 2px 0;
}
.omx-attachment-tray::-webkit-scrollbar {
  display: none;
}
.omx-att-card {
  position: relative;
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  user-select: none;
  cursor: default;
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}
.omx-att-card:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l3);
  z-index: 2;
}
.omx-att-card--highlight {
  animation: omx-att-pulse 0.6s ease-in-out;
}
@keyframes omx-att-pulse {
  0% { transform: scale(1); border-color: var(--dsw-alias-state-business-primary); }
  50% { transform: scale(1.04); border-color: var(--dsw-alias-state-business-primary); }
  100% { transform: scale(1); border-color: var(--dsw-alias-border-l2); }
}
.omx-att-card--media {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  padding: 0;
  justify-content: center;
  cursor: zoom-in;
}
.omx-att-card__media-frame {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 8px;
}
.omx-att-card__media-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.omx-att-card__media-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
}
.omx-att-card__play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(2px);
  border-radius: 50%;
  color: var(--dsw-static-neutral-00);
  pointer-events: none;
}
.omx-att-card__duration-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(4px);
  color: var(--dsw-static-neutral-00);
  font-size: 9px;
  font-weight: 500;
  line-height: 11px;
  padding: 0 3px;
  border-radius: 4px;
  pointer-events: none;
}
.omx-att-card--file {
  height: 40px;
  min-width: 110px;
  max-width: 165px;
  border-radius: 8px;
  padding: 4px 8px;
  gap: 6px;
}
.omx-att-card__file-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
}
.omx-att-card__file-info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
}
.omx-att-card__file-title {
  font-size: 12px;
  font-weight: 500;
  line-height: 15px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}
.omx-att-card__file-ext {
  font-size: 9px;
  font-weight: 600;
  line-height: 11px;
  color: var(--dsw-alias-label-tertiary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.omx-att-card__remove-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 9px;
  background: var(--dsw-alias-bg-elevated);
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease, color 0.15s ease;
  z-index: 6;
}
.omx-att-card__remove-btn--media {
  background: var(--dsw-alias-bg-mask-1);
  border-color: transparent;
  color: var(--dsw-static-neutral-00);
  backdrop-filter: blur(2px);
  box-shadow: var(--dsw-shadow-lv1);
}
.omx-att-card:hover .omx-att-card__remove-btn,
.omx-att-card__remove-btn:focus-visible {
  opacity: 1;
  transform: scale(1);
}
.omx-att-card__remove-btn:hover {
  background: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-static-neutral-00);
}
@media (pointer: coarse) {
  .omx-att-card__remove-btn {
    opacity: 1;
    transform: scale(1);
  }
}
`;
