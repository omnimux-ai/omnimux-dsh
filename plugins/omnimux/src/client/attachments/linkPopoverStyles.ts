export const LINK_POPOVER_STYLES = `
.omx-link-popover {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 18px;
  container-type: inline-size;
}
.omx-link-popover-header, .omx-link-popover-title, .omx-link-popover-form {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.omx-link-popover-header { justify-content: space-between; }
.omx-link-popover-title { font-size: 14px; font-weight: 500; gap: 8px; }
.omx-link-popover-title svg { flex-shrink: 0; }
.omx-link-popover .omx-link-popover-close {
  width: 32px; height: 32px; padding: 0; flex-shrink: 0; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary);
}
.omx-link-popover input {
  flex: 1; min-width: 0; width: 100%; height: 32px; box-sizing: border-box;
  padding: 0 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit;
}
.omx-link-popover input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-tertiary); border-color: var(--dsw-alias-brand-primary); }
.omx-link-popover .omx-link-popover-add {
  height: 32px; flex-shrink: 0; border-radius: 8px; padding: 0 12px;
  background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-inverted);
}
.omx-link-popover .omx-link-popover-add:disabled { opacity: 0.45; }
.omx-link-popover p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 16px; }
.omx-link-popover p.omx-link-popover-error { color: var(--dsw-alias-state-error-primary); }
@container (max-width: 230px) {
  .omx-link-popover-form { flex-wrap: wrap; }
  .omx-link-popover input { flex-basis: 100%; }
  .omx-link-popover-add { margin-left: auto; }
}
`;
