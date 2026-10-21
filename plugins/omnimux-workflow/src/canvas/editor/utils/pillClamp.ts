/**
 * 悬浮胶囊视口上沿裁切修正（Issue #3604）。
 *
 * 胶囊按 `topOffset / zoom` 上浮，低缩放下会离节点很远；节点靠近画布视口
 * 上沿时，胶囊整块落到 `.react-flow`（overflow: hidden）之外，被裁掉且无法命中。
 * 这里计算需要把胶囊向下平移多少（React Flow 本地像素，屏幕偏移 = 本地 * zoom）。
 */
export function computePillClampShift(input: {
  /** 胶囊当前顶部（屏幕坐标） */
  pillTop: number;
  /** 画布视口顶部（屏幕坐标） */
  boundaryTop: number;
  /** React Flow 当前缩放 */
  zoom?: number;
  /** 距视口上沿保留的安全边距（屏幕像素） */
  margin?: number;
}): number {
  const { pillTop, boundaryTop, zoom, margin = 4 } = input;
  if (!Number.isFinite(pillTop) || !Number.isFinite(boundaryTop)) return 0;
  const overflow = boundaryTop + margin - pillTop;
  if (!(overflow > 0)) return 0;
  const z = Number.isFinite(zoom) && (zoom as number) > 0 ? (zoom as number) : 1;
  return overflow / z;
}
