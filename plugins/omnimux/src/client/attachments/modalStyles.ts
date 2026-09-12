export const MODAL_STYLES = `
.omx-video-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.65)); /* exempt-ui03: 遮罩纯黑半透 */
  backdrop-filter: blur(8px);
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
  width: 440px;
  max-width: calc(100vw - 32px);
  background: var(--dsw-alias-bg-layer-2, #2c2c2e) !important; /* exempt-ui03: 弹窗实心背景 */
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14)); /* exempt-ui03: 弹窗微光边框 */
  border-radius: 12px;
  padding: 20px 22px 18px 22px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.06); /* exempt-ui03: 弹窗卡片阴影 */
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
  margin-bottom: 16px;
}
.omx-video-popover-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff); /* exempt-ui03: 标题白色高亮 */
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
  color: var(--dsw-alias-label-tertiary, #a1a1aa); /* exempt-ui03: 关闭按钮次级色 */
  cursor: pointer;
  transition: all 0.12s ease;
}
.omx-video-popover-close:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.08)); /* exempt-ui03: 悬浮微白底色 */
  color: var(--dsw-alias-label-primary, #ffffff); /* exempt-ui03: 悬浮亮白 */
}
.omx-video-popover-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omx-video-popover-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--dsw-alias-bg-layer-1, #232324); /* exempt-ui03: 输入框深色底 */
  border: 1px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16)); /* exempt-ui03: 输入框常态边框 */
  border-radius: 8px;
  padding: 0 12px;
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
  height: 38px;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #ffffff); /* exempt-ui03: 文本主色 */
}
.omx-video-popover-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #71717a); /* exempt-ui03: 占位符灰色 */
}
.omx-video-popover-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
.omx-video-popover-btn-cancel {
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15)); /* exempt-ui03: 取消按钮边框 */
  background: transparent;
  color: var(--dsw-alias-label-secondary, #a1a1aa); /* exempt-ui03: 取消按钮字体色 */
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
}
.omx-video-popover-btn-cancel:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.08)); /* exempt-ui03: 取消悬浮微白底色 */
  color: var(--dsw-alias-label-primary, #ffffff); /* exempt-ui03: 取消悬浮白字 */
}
.omx-video-popover-btn-confirm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 18px;
  border-radius: 6px;
  border: 1px solid #8c6ff7; /* exempt-ui03: 确认按钮边框 */
  background: #7961f2; /* exempt-ui03: 品牌紫主底色 */
  color: #ffffff; /* exempt-ui03: 确认按钮文字 */
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.omx-video-popover-btn-confirm:hover {
  background: #8c6ff7; /* exempt-ui03: 悬浮高亮底色 */
  border-color: #a78bfa; /* exempt-ui03: 悬浮高亮描边 */
  box-shadow: 0 0 12px rgba(121, 97, 242, 0.35); /* exempt-ui03: 极光微光晕 */
  transform: translateY(-0.5px);
}
.omx-video-popover-btn-confirm:disabled {
  opacity: 0.45;
  background: rgba(121, 97, 242, 0.3); /* exempt-ui03: 禁用底色 */
  border-color: rgba(140, 111, 247, 0.2); /* exempt-ui03: 禁用边框 */
  color: rgba(255, 255, 255, 0.5); /* exempt-ui03: 禁用文字 */
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
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
.omx-att-drop-mask--blocked .omx-att-drop-wrap {
  opacity: 0.72;
  color: var(--dsw-alias-label-tertiary);
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
