# Spec: 侧边栏会话选择弹层 UI 修复（Issue #2946）

## 背景
`omnimux-browser` 侧边栏「历史会话」弹层：图标掉到标题下一行（旧 `.session-list button{display:grid}` 优先级压过 `.session-item-row` 的 flex）、行间有分割线、行尾悬停出现删除按钮。

## 验收标准
1. 弹层中每条会话为单行横排：图标与标题同一行垂直居中，行高紧凑（min-height 30px），无行间距与行内多余留白。
2. 条目之间无分割线。
3. 弹层不再出现删除按钮；面板侧删除会话入口移除（后端 `bridge.session.purge` 通道保留）。
4. 无残留死代码：`deleteSession`、`TrashIcon`、删除相关文案键、`session-delete` 样式与测试用例全部清除。
5. 测试：`plugins/omnimux-browser/extension` 的 `panel-session-transition.spec.ts` 全部通过。
6. 真实浏览器证据：harness 预览页 `frame.html?mode=float&picker=1` 截图显示上述形态。

## 边界
- 不改 session.list / workspace.list 数据协议。
- 后端 purge 接口与既有服务端测试保持不动。
