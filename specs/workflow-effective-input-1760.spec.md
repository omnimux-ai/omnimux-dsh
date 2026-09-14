# 统一有效输入展示与实际消费（Issue #1760）

## Objective
用户已批准统一有效输入展示并核对展示与实际请求一致。共享文本/图片/视频/音频生成面板应在输入区展示上游正文来源与本次消费媒体；文本独立组合为prompt，不复制到编辑框、不占媒体额度、不重复拼接。遵循 docs/contracts/node-input-submission.md，不改变模型能力定义。

## Commands
- `node --test plugins/omnimux-workflow/src/shared/graph/effectiveInput.test.mjs plugins/omnimux-workflow/src/shared/graph/feedSlot/feedSlotKernel.test.mjs`
- `pnpm --filter omnimux-workflow test`（按package.json核实包名）
- `pnpm verify:stages`
- `git diff --check`
- 隔离worktree动态端口启动实际生产面板浏览器场景，ego-browser执行现场观察、点击、截图；只stub网关不发真实模型请求。

## Project Structure
- `plugins/omnimux-workflow/src/shared/graph/`：有效输入及媒体槽布局/绑定解析。
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/`：共享生成面板、来源卡与预览。
- `plugins/omnimux-workflow/src/workflow/execution/`：实际输入组装与请求边界。
- `.agent-reports/upstream-slot-visibility/`：实施、浏览器和独立审查证据。

## Code Style
复用现有共享纯函数、类型、CSS token、SlotWells视觉与lucide图标；不新建平行路由/模型支持表。媒体只按当前operation和持久化绑定消费，未知max保持undefined。例如 `const prompt = resolveGenerationPrompt(node.data, incomingText);`，不能重复实现prompt组合。

## Testing Strategy
顺序为Spec提交 → Code → 真浏览器Verify → 回归Test → Green。离线捕获gateway提交内容及拒绝时零调用；测试使用合成素材和确定性离线catalog。独立审查由非实施代理负责，证据包含base/head、实际diff、未知与未覆盖。通用占位workflow探针不能替代真实生产面板挂载。

## Acceptance
1. 图片生成连接非空文本`1dog`，本地为空：可见正文卡及来源摘要，编辑框仍空且提示补充要求；离线请求prompt精确为`1dog`，媒体引用无文本。
2. 文本/图片/视频/音频四种面板均显示实际使用的上游文本；多来源按稳定顺序显示与组合；音频正文不混入来源标签或表达要求。
3. 图文混输：有效文本与已消费图片在同一区域；图片容量仅计算媒体。超量、格式不支持、当前任务不消费的媒体不得伪装已消费或进入请求。
4. 空白/等待/失效正文来源不能显示就绪；非空变空、断开、切换当前结果应立即更新来源与提交阻断。已显式绑定等待媒体保留反馈，不静默自动换源。
5. 当前任务没有媒体槽时，不伪造max10图片/max5音频槽；未知max保持未知。音频悬浮显示可播放音频，不错误显示等待。
6. 媒体卸载后保留供给但不自动重新填回；浏览器必须实际执行卸载、断连和模型切换。UI展示装填与实际执行绑定使用同一有效投影，空节点、旧连线无slotBindings及已保存显式绑定均一致。视频首帧/首尾帧/参考模式仍可见可选，普通in/input连线不锁模式。
7. 真浏览器观察实际DOM后点击、悬浮并核对正几何尺寸，截图保存；同时核对捕获请求。演示证据先交父会话，合并前协调。required CI和独立审查通过后进入Merge Queue。

## Boundaries
总是：主检出只读（仅指定implementation报告可写），自己的worktree改动，先规格提交，复用设计规范，说明实际验证与未覆盖。
先协调：合并前演示证据提交父会话；范围/成本/不可逆影响增加。
绝不：真实模型调用、生产或官方DSH修改、其他workspace修改、用固定上限冒充能力、用占位HTML冒充生产面板验证、绕过required CI、伪造授权。

## Plan
共享消费解析先统一；来源与预览最小UI落地；浏览器演示；依据观察补回归；独立审查与CI；父会话协调后合并。文档影响限此任务规格，既有输入合同规则保持不变。
