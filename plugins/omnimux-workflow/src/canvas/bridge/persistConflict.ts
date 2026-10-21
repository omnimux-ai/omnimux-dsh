/**
 * 远端 version 前进后的冲突判定（纯函数）。
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
 */

import type {
  SerializedCanvasEdge,
  SerializedCanvasNode,
} from '../../shared/canvasTypes.ts';
import { signatureOf } from './persistSanitize.ts';

export type GraphReconcileDecision = 'adopt' | 'resave' | 'reload' | 'conflict';

/** 兼容旧名；现与 GraphReconcileDecision 一致。 */
export type RemoteVersionAdvanceDecision = GraphReconcileDecision;

export interface GraphReconcileInput {
  /** 判定时刻的本地图签名（不是探测前的旧快照）。 */
  localSignature: string;
  lastSavedSignature: string;
  remoteSignature: string;
}

export function decideRemoteVersionAdvance(
  input: GraphReconcileInput,
): RemoteVersionAdvanceDecision {
  if (input.localSignature === input.remoteSignature) return 'adopt';
  if (input.remoteSignature === input.lastSavedSignature) return 'resave';
  if (input.localSignature === input.lastSavedSignature) return 'reload';
  return 'conflict';
}

export interface CurrentSignatureReconcileInput {
  /** 判定时刻的本地图签名（语义同 GraphReconcileInput.localSignature）。 */
  currentSignature: string;
  lastSavedSignature: string;
  remoteSignature: string;
}

/** 语义更直白的入口：参数名强调「当前」本地签名，实现只有一份。 */
export function decideGraphReconcile(input: CurrentSignatureReconcileInput): GraphReconcileDecision {
  return decideRemoteVersionAdvance({
    localSignature: input.currentSignature,
    lastSavedSignature: input.lastSavedSignature,
    remoteSignature: input.remoteSignature,
  });
}

export interface RemoteReconcileInput {
  workspaceId?: string;
  /** 判定时刻读到的本地图（禁止传探测前的旧快照）。 */
  currentNodes: SerializedCanvasNode[];
  currentEdges: SerializedCanvasEdge[];
  remoteNodes: SerializedCanvasNode[];
  remoteEdges: SerializedCanvasEdge[];
  lastSavedSignature: string;
}

export interface RemoteReconcilePlan {
  decision: GraphReconcileDecision;
  currentSignature: string;
  remoteSignature: string;
}

/**
 * 只有原始节点/边时的组合入口：先按同一套 sanitize+签名算两边签名，
 * 再交给 decideRemoteVersionAdvance。调用方必须传**判定时刻**的本地图。
 */
export function planRemoteReconcile(input: RemoteReconcileInput): RemoteReconcilePlan {
  const currentSignature = signatureOf(input.currentNodes, input.currentEdges, {
    workspaceId: input.workspaceId,
  });
  const remoteSignature = signatureOf(input.remoteNodes, input.remoteEdges, {
    workspaceId: input.workspaceId,
  });
  return {
    decision: decideRemoteVersionAdvance({
      localSignature: currentSignature,
      lastSavedSignature: input.lastSavedSignature,
      remoteSignature,
    }),
    currentSignature,
    remoteSignature,
  };
}
