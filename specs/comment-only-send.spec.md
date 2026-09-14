# 已保存画布评论的空正文原生发送

## Objective
Issue #1756。用户授权最小修复：画布有已保存评论时，正文保持空白也能原生发送完整评论；无需补写“执行”。清空评论且无其他有效内容后恢复禁用。

## Acceptance criteria
1. 在任务工作树动态端口加载真实插件与实际原生输入/发送实现。打开图片，添加并保存至少四条评论；正文值保持空字符串，发送在原生可提交条件下可用。
2. 点击原生发送，截获实际提交（禁止调用真实模型）：包含全部评论原文、编号、坐标和图片标识，不以前三条界面摘要替代。
3. 删除全部评论且正文、其他附件为空，原生发送恢复禁用；保留用户其他附件/正文。
4. 忙碌、锁定、上传中及上传错误按原生约束执行，失败不能丢失待发评论；切会话不串入另一会话。
5. 真实浏览器核对挂载与正尺寸、交互与PNG截图；输入/提交结构留存，不以样式/JSDOM测试冒充验收。

## Commands
- `corepack pnpm --filter omnimux test`
- `corepack pnpm verify:stages`
- `git diff --check`
- 浏览器采用已装 `ego-browser nodejs` 与工作树内动态端口服务，读取实际宿主入口后补充精确运行命令；不可用时记录阻断，不制造替代原生实现。

## Project structure
- `plugins/omnimux/src/client/media-viewer/`：已保存评论与画布。
- `plugins/omnimux/src/client/attachments/AttachmentTray.tsx`：唯一原生附件槽及添加/删除/重试回调。
- `plugins/omnimux/tests/`：依据真实浏览器观察补充回归。
- `.agent-reports/comment-only-send/`：运行证据与最终实施报告（可落父主工作区）。

## Code style
复用现有React订阅、原生File添加回调及上传状态，不创建第二输入框或发送按钮，不增加视觉设计。精确类型跟随现有 AttachmentTrayProps：`onAddFiles?: (files: readonly File[]) => void`。完整评论从已有格式化函数取冻结快照，不依赖心跳摘要。

## Plan
先核对公开原生有效内容入口；若存在受支持补充内容则复用。若仅真实文件附件可激活原生发送，则先核对正文空文件是否能穿透原生提交与模型输入展开；仅证明UI能亮不够。没有满足契约的插件入口则保存具体依赖缺口，不改官方源。

## Verified implementation direction
采用真实JSON文本File承载评论快照，附件槽按当前会话同步，正文不变。每条保存评论绑定保存时会话；清除/编辑仅影响对应附件版本，已提交版本不自动重复登记。Host agent/pre-step只读取本次claimed user消息里的本功能文件，使用ctx.attachments.readFileStream完整消费验证字节，严格UTF-8/JSON/schema/session校验后在同一user消息追加text。上限64KiB，不信任文件名为权限，普通附件不受影响；无额外图片。
规格提交门禁仅阻断Git提交；按父代理澄清及AGENTS任务规格可未提交规则，继续本地实现和验证，禁止绕过被拒提交。

## Testing strategy
Spec → Code → Verify → Test → Green。观察真实DOM后选择稳定定位器，覆盖四条评论、空正文、清空、原生busy/upload/error、会话切换及普通正文回归。文件方案须验证实际文件字节、上传回执及提交载荷，不伪造附件注册。未观察路径标记未知。

## Boundaries
总是：业务修改只在本任务工作树；保留完整评论和原生提交约束；跟随design.md；保持用户演示确认门禁。
先问：扩大范围、改上游接口、额外跨仓权限、真实模型请求。
绝不：官方源/安装包/其他工作区修改，DOM disabled覆写，执行占位，setDraft全文冒充正文空，整个图片三件套改造，合入/物化/共享Dev验收。

## Submitted snapshot query acceptance
- 只读导出 `getSubmittedCanvasText(sessionId, attachments)`，同步返回字符串；附件采用原生 pending `{type:'file', value:{attachmentId,name,bytes}}`，三字段及会话必须精确匹配已 ready 评论快照，否则返回空字符串。
- 返回本次冻结快照的纯 comment.text 汇总作为意图输入，不含图片标题、标识和格式化前缀；模型完整评论格式不变。不读取当前全局评论、不猜历史、不暴露 File；消费先于 pending 观察时仍可查询。
- `subscribeSubmittedCanvasText(listener)` 提供 ready 候选登记通知及解除订阅；pending 早于 hook ready 时允许消费者重查尚未识别项，消费者不得提前永久标 seen。活 ready candidates 不受短期缓存淘汰或TTL影响。
- 查询保留受有限容量及过期时间约束，会话删除清理；覆盖跨会话、错误字段、未 ready、消费后查询与过期行为。离线验证不替代浏览器验收。

## Documentation impact
此规格与最终报告记录最小行为契约及真实能力边界，不改现有设计规范；入口不足时仅交付缺口，不能声明实现完成。
