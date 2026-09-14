# 独立有效卡槽加载（Issue #1788）

## Objective
按已批准decision.md统一有效素材加载；连接仅提供供给，非空可用且符合当前模型/操作的内容才加载、展示、消费。文本卡固定44×44，全文通过现有预览查看。不重写画布，不修改模型目录。

## Acceptance
1. 生产面板连接ready文本1dog及空文本：只显示1dog方槽，空来源不占位；本地补充不被复制，发送包含有效正文与补充。
2. 先连接空图片后连接有效图片，max=1：有效图片入槽，请求只含该图。视频/音频同规则，类型/MIME不支持与blob-only不得入槽。
3. 固定模型与操作；首帧/首尾帧/多参考菜单不因普通in/input连接消失。模型切换重新投影，不发送旧角色。
4. 保存的自动占位由空转ready、ready转空立即重算；旧图无绑定按相同逻辑；显式空绑定与standby保持不自动回填。
5. 显式首帧/蒙版/音轨失效不静默换源；有效卡移除，保留意图与卡外诊断；缺必需角色阻断且最终gateway零调用。普通空供给不阻断已满足请求。可选失效来源提示本次未使用。
6. 文本按所选操作支持正文/指令决定消费，不占媒体配额；所有非空已选文本按连接顺序组合，音频语义保留。
7. 单节点、界面与执行入口共享当前输入投影。点击后异步等待使用冻结快照；完整流程scheduled依赖仍由调度等待，不能全局删除。
8. 隔离工作树真实浏览器测量方槽width=height=44（允许缩放后等比），点击/键盘全文预览、动态变更、正确请求捕获与负例零请求。不得以静态渲染或mock generation当真模型生成。

## Commands
- `pnpm --filter omnimux-workflow test`
- `pnpm --filter omnimux-workflow build`
- `pnpm verify:stages`
- `git diff --check`
实际包名以package.json核对。定向Node测试先行，完整套件再执行。E2E仅在父QA真实Verify后写入。

## Project Structure
- shared/graph/feedSlot：现有合同布局、自动装填、消费投影
- shared/graph/generationPrompt.ts、shared/validation：文本组合与就绪
- workflow/execution：最终请求快照
- canvas/editor/components/MaterialNode/ConfigPanel、canvas/theme/components.css：展示与现有预览
- docs/contracts/node-input-submission.md：修订旧全连线等待规则
- .agent-reports/slot-independent-loading-implementation：实施与验证报告

## Code Style
遵循现有TypeScript具名纯函数与类型；共享加载扩展现有feedSlot边界，不建立第二个解析器。示例：`const loaded = selectSlotOccupants(layout, bindings, feed, conflicts);` 界面与请求应共同使用该边界，不各自增加临时filter。

## Testing Strategy
单位回归先覆盖普通空供给/非空容量/显式角色缺口/standby/旧图/当前输出/模式切换；更新旧等待预期时必须加入替代正负例。父QA负责真实浏览器Verify和截图，之后正式E2E；独立审查后才能由父决定远程推送。

## Boundaries
总是：复用契约/视觉token，保留来源顺序、角色、鉴权与参数限制，报告真实证据。
先问：新增依赖、扩大到模型目录/其他插件或不可逆操作。
绝不：生产/Dev写入、真实付费模型探测、改官方DSH、修改其他工作区、绕过门禁、父审查前push/merge。

## Plan
先统一ready内容与装填，再将显示/提交复核/最终组装接共同边界，再固定文本方槽与更新合同；单位测试与构建至可测冻结交父QA。风险R1源于合同与输入行为改变。文档影响：更新节点输入合同§3/§6旧等待规则并保留必需角色与流程调度。
