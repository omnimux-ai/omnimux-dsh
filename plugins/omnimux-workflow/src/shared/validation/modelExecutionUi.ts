/**
 * 不可执行型号的展示/门禁判定（Issue #4103 / AC7）。
 *
 * 语义依据（产品决策，二选一里选 2）：`executionStatus: 'unsupported'` 表示本地没有
 * 执行适配（能力缺口），不是瞬时运行时错误。因此：
 * - 新建选择：目录行置灰 +「暂不支持」，不可选中（ModelCascadeMenu 负责）；
 * - 已有节点：保留渲染，但禁用「生成」并给出原因，同时提供一键切换到同族可执行型号，
 *   不让用户把参数配完才发现无法生成。
 *
 * 判定必须与目录行同源：只看 `executionStatus` / `executable`，不自行推断型号名。
 */

export type ExecutionUiStatus = 'ready' | 'unsupported' | 'unverified';

export interface ExecutionUiCandidate {
  id: string;
  label?: string;
  family?: string;
  executionStatus?: ExecutionUiStatus;
  executable?: boolean;
}

export interface UnsupportedModelUiState {
  /** 当前型号本地无执行适配（必须禁用生成）。 */
  unsupported: boolean;
  /** 建议切换的同族可执行型号（没有候选时 undefined）。 */
  switchTarget?: ExecutionUiCandidate;
}

/**
 * 计算当前型号的不可执行状态与切换目标。
 *
 * 切换优先级：同 `family` 的可执行型号 → 目录里第一个可执行型号。
 * 绝不让用户切回自己，也绝不推荐另一个 `executable === false` 的行。
 */
export function resolveUnsupportedModelUi(
  modelId: string | undefined,
  options: readonly ExecutionUiCandidate[] | null | undefined,
): UnsupportedModelUiState {
  const id = typeof modelId === 'string' ? modelId.trim() : '';
  const rows = Array.isArray(options) ? options : [];
  const current = id ? rows.find((row) => row.id === id) : undefined;
  if (!current || current.executionStatus !== 'unsupported') {
    return { unsupported: false };
  }
  const candidates = rows.filter((row) => row.id !== current.id && row.executable !== false);
  const sameFamily = current.family
    ? candidates.find((row) => row.family && row.family === current.family)
    : undefined;
  const target = sameFamily ?? candidates[0];
  return target ? { unsupported: true, switchTarget: target } : { unsupported: true };
}
