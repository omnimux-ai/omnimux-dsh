/**
 * 图像画布舞台身份（image canvas stage）。
 *
 * 沿革：原生 DSH 输入框的「悬浮到画布底端」一度以会话栏折叠这一纯几何状态为
 * 键，于是任一插件页全屏都会浮出输入框，而图像画布自身没有专属条件、是否显示
 * 取决于进入顺序（Issue #1821）。
 *
 * 本模块把「媒体查看器正在展示单张画布」这一业务事实投影成 DOM 可见标识，
 * 由 hub 侧的投射规则消费：只有画布身份 + 右侧栏全屏同时成立，输入框才悬浮
 * 到画布底端；时间线、其他插件页、以及画布不在前台时一律不投射。
 */

/** 画布身份标识：存在即表示媒体查看器当前展示的是单张大图。 */
export const IMAGE_CANVAS_ATTR = 'data-omnimux-image-canvas';

/** 前台标识：存在即表示该舞台此刻在视口内可见（用于排除后台标签页）。 */
export const IMAGE_CANVAS_VISIBLE_ATTR = 'data-visible';

/**
 * @param {{ subViewMode?: string, hasActiveMedia?: boolean }} [state]
 * @returns {boolean} 是否处于图像画布（单图）态
 */
export function isImageCanvasActive(state = {}) {
  return state?.subViewMode === 'single' && Boolean(state?.hasActiveMedia);
}

/** 元素是否在视口内参与布局（被隐藏的标签页其 offsetParent 为空）。 */
function isVisibleNode(root) {
  if (!root) return false;
  try {
    if (typeof root.getClientRects === 'function' && root.getClientRects().length === 0) return false;
    return root.offsetParent !== null && root.offsetParent !== undefined;
  } catch {
    return false;
  }
}

/**
 * 把画布身份与前台可见性同步到舞台根节点。
 *
 * 身份与可见性分开表达：不可见（切到后台标签页）不等于撤销身份，
 * 免得标签前后切换时反复拆装属性。
 *
 * @param {Element | null | undefined} root 媒体查看器根节点
 * @param {{ subViewMode?: string, hasActiveMedia?: boolean, visible?: boolean }} [state]
 */
export function syncImageCanvasStage(root, state = {}) {
  if (!root || typeof root.setAttribute !== 'function' || typeof root.removeAttribute !== 'function') return;
  const active = isImageCanvasActive(state);
  const visible = state?.visible === undefined ? isVisibleNode(root) : Boolean(state.visible);

  if (active) root.setAttribute(IMAGE_CANVAS_ATTR, 'true');
  else root.removeAttribute(IMAGE_CANVAS_ATTR);
  root.setAttribute(IMAGE_CANVAS_VISIBLE_ATTR, visible ? 'true' : 'false');
}
