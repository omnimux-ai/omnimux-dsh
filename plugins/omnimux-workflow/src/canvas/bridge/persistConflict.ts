/**
 * 远端 version 前进后的冲突判定（纯函数，零依赖）。
 *
 * 打开画布的静默 PUT / remount flush 会把 version +1，但图内容没变。
 * 这种「自己和自己打架」不得弹「其它会话已更新」。
 *
 * 四态：
 * - 本地签名 == 远端签名 → adopt（只跟上 version）
 * - 远端签名 == 上次已存签名 → resave（远端没有本地尚未拥有的内容，
 *   本地领先；直接带新版本续存，不弹条）
 * - 本地签名 == 上次已存签名 → reload（本地干净，取远端图）
 * - 否则 → conflict（真的两边不一样）
 *
 * `localSignature` 必须是**判定时刻**读到的本地签名：版本探测与本地捕获
 * 不同源，沿用探测前的旧快照会把探测窗口内的编辑（典型：导入素材插入
 * 节点）误判成真分叉并冻结自动保存（Issue #3595）。
 *
 * 这是画布冲突判定的唯一入口（Issue #3601 收敛了此前的
 * decideGraphReconcile / planRemoteReconcile 两个重复入口与
 * `workspaceId?` 可选签名陷阱）；调用方自己用 persistSanitize 的
 * signatureOf 算签名，本模块不依赖节点结构。
 */

export type GraphReconcileDecision = 'adopt' | 'resave' | 'reload' | 'conflict';

export interface GraphReconcileInput {
  /** 判定时刻的本地图签名（不是探测前的旧快照）。 */
  localSignature: string;
  lastSavedSignature: string;
  remoteSignature: string;
}

export function decideRemoteVersionAdvance(
  input: GraphReconcileInput,
): GraphReconcileDecision {
  if (input.localSignature === input.remoteSignature) return 'adopt';
  if (input.remoteSignature === input.lastSavedSignature) return 'resave';
  if (input.localSignature === input.lastSavedSignature) return 'reload';
  return 'conflict';
}
