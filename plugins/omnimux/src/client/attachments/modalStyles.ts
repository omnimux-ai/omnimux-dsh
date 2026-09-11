export const MODAL_STYLES = `
.omx-video-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: omx-fade-in 0.15s ease-out;
}
@keyframes omx-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.omx-video-popover-card {
  box-sizing: border-box;
  width: 420px;
  max-width: calc(100vw - 32px);
  background: var(--dsw-alias-bg-elevated);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: var(--dsw-alias-shadow-l3, 0 16px 36px rgba(0, 0, 0, 0.45)); /* exempt-ui03: 弹窗卡片阴影 */
  animation: omx-popover-zoom 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes omx-popover-zoom {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.omx-video-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.omx-video-popover-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omx-video-popover-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  transition: all 0.12s ease;
}
.omx-video-popover-close:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.omx-video-popover-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.omx-video-popover-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 8px;
  padding: 0 10px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.omx-video-popover-input-wrap:focus-within {
  border-color: #8c6ff7; /* exempt-ui03: 聚焦品牌紫 */
  box-shadow: 0 0 0 2px rgba(121, 97, 242, 0.25); /* exempt-ui03: 聚焦微光 */
}
.omx-video-popover-input-icon {
  color: #a78bfa; /* exempt-ui03: 链接品牌紫 */
  margin-right: 8px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.omx-video-popover-input {
  flex: 1;
  height: 36px;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
}
.omx-video-popover-input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}
.omx-video-popover-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  line-height: 1.4;
  padding: 0 2px;
}
.omx-video-popover-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.omx-video-popover-btn-cancel {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
}
.omx-video-popover-btn-cancel:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.omx-video-popover-btn-confirm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid rgba(140, 111, 247, 0.4); /* exempt-ui03: 确认按钮边框 */
  background: rgba(121, 97, 242, 0.4); /* exempt-ui03: 确认按钮底色 */
  color: #c4b5fd; /* exempt-ui03: 确认按钮文字 */
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.omx-video-popover-btn-confirm:hover {
  background: rgba(121, 97, 242, 0.65); /* exempt-ui03: 悬浮底色 */
  border-color: #a78bfa; /* exempt-ui03: 悬浮高亮 */
  color: #ffffff; /* exempt-ui03: 白色文字 */
  transform: translateY(-0.5px);
}
.omx-video-popover-btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}
.omx-att-drop-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background-color: var(--dsw-alias-bg-mask-drop, var(--dsw-alias-bg-mask-1));
  backdrop-filter: blur(10px);
}
.omx-att-drop-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 40px;
  color: var(--dsw-alias-label-primary);
  text-align: center;
}
.omx-att-drop-title {
  font: var(--dsw-font-l-20, 600 20px/28px inherit);
}
.omx-att-drop-desc {
  margin-top: 12px;
  font: var(--dsw-font-s-14, 400 14px/20px inherit);
  color: var(--dsw-alias-label-tertiary);
  white-space: pre-wrap;
}
.omx-att-preview {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 40px;
}
.omx-att-preview__mask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur, blur(8px));
}
.omx-att-preview__image {
  position: relative;
  max-width: min(100%, 1600px);
  max-height: calc(100vh - 80px);
  object-fit: contain;
  border-radius: 12px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-elevated));
  box-shadow: var(--dsw-shadow-lv3);
}
.omx-att-preview__close {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-elevated));
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
`;
