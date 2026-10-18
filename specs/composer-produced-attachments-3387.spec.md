# #3387 可信域产物带入会话附件

父任务 #3383 的最小公共能力；只修改执行中枢，不理解灵感记录、不公开任意路径 HTTP。

## 新用户基线与文档

依赖已安装中枢、真实会话查询及可信域插件注册的已存在产物目录。缺中枢由调用者明确提示；本服务缺会话查询返回 `needs-session-query`，未注册来源返回 `needs-attachment-source`，不依赖开发路径、凭据或服务。同步 `docs/contracts/hub.md` 的公共能力合同。

## 行为与边界

- `composerAttachments.registerSource(sourcePlugin, root)` 仅供服务器插件使用；注册已存在真实目录并返回注销函数；相同域相同目录可重复注册，不允许静默改根。
- `materializeProduced({ sessionId, sourcePlugin, files: [{ path, title? }], requestId? }, execution?)` 只从注册根内常规文件复制；来源先检查绝对路径、lstat、realpath 与根约束，逐项失败明确。
- 真实会话目录只能从 `sessionQuery` 查询，客户端不可提供 cwd/root。目标 `assets/imported` 及子级在复制前拒绝 symlink/越界，复用原有复制核心，不覆盖原件或已有附件。
- 取消信号传播至流复制，临时文件清理；请求号重复时复用成功回执，部分失败重试只补失败项，变更请求内容返回冲突。成功回执校验目标内容后复用；目标被用户改动时保留用户文件并重新物化新名字。
- 对外仅返回结果和会话相对路径，不返回源绝对路径或会话 cwd。无公开 HTTP 新入口、无提供方请求或真实生成。

## 验收

正文/图像/视频真实临时文件进入会话 cwd；缺能力、非法输入、未注册源、源 symlink/越界/特殊文件、目标 symlink 复制前拒绝；取消和部分失败、并发幂等、服务重建回执、目标变更保护；既有 composer/form 附件回归通过。父任务承担完整包测及最终产品浏览器验收。
