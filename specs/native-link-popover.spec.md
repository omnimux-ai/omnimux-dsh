# 视频与商品链接轻浮层及原生引用（Issue #2593）

## 目标与批准范围
用户已批准本规格对应的实施方案。现有视频链接/商品链接入口直接打开轻浮层，填写后通过官方公开引用事件追加正文末尾，不替换选区。仅任务独立工作树实施、验证、测试和报告；不合入、不物化、不改官方包。

### 可观察验收
1. 点击视频链接显示「添加视频链接」，占位「粘贴视频链接」，说明「添加参考视频，用于拆解或复刻。」；商品对应「添加商品链接」「粘贴商品页面链接」「添加商品页面，用于介绍产品或制作带货视频。」。右上关闭，输入右侧按钮「添加」。
2. 原生主题；建议宽420px、padding16px、gap12px、控件高32px/圆角8px、浮层圆角12px。优先锚点上方左对齐8px，边界限当前会话列，空间不足翻转/约束，窄屏按钮可换行；portal不被裁切。滚动resize重定位，锚点离屏/销毁关闭。
3. 仅单个完整http/https URL，拒绝裸ID、其他协议、多个链接，不补协议、不抓取。空禁用；非法提示；失败保留输入。Esc/外部/关闭取消；IME Enter不添加、不发送、不冒泡。
4. 读取当前会话最新公开input的draft/occurrences/draftRev；detect末尾=draft.length减去每个引用length-1；验证范围与重叠后调用当前会话slash/input-insert-reference。source trigger为@或/。视频与商品独立source/用途，旧link codec兼容。
5. 同种同URL去重；双击只插一次。必须结合插入返回和后续新input状态确认，不能即刻闭包回读。失败不造顶部胶囊、不塞DOM、不用Lexical私有属性。成功回焦该会话正文。label用途+域名，复制/提交包含完整URL与用途。
6. 选择正文文本再添加不丢原文；已有多个原生引用仍正确追加末尾。复制、撤销、失败恢复沿用官方；重载允许普通文本但保留链接与用途，不自建持久化。
7. 快捷方式不创建空胶囊；切换/撤回不删除用户链接，不整段setDraft文字化已有引用。仅消费本快捷方式拥有且能可靠定位的提示语范围，否则保留。新引用不经过AttachmentSubmitBridge第二次追加，附件路径不变。商品库ID入口保持。
8. 旧私有粘贴入口停止拦截；普通正文粘贴走宿主默认，不吞内容、不新建自动转换。只有确认所有调用消失的旧顶部胶囊代码才删除，不迁移/清空在线草稿。

## 新用户基线
依赖正式安装的宿主公开会话输入与inputTriggers服务，不依赖开发机路径、模型服务、共享profile或真实凭证。公开插入能力不可用时显示添加失败并保留输入；无静默回退。添加链接不产生网络抓取或模型请求。

## 命令
在本任务工作树运行：
- `pnpm --filter omnimux build`
- `pnpm --filter omnimux test`
- `pnpm verify:stages`
- `pnpm verify:product-baseline`
- `git diff --check`
完整应用验收依照 `docs/contracts/plugin-qa.md` 的工作树synthetic ui环境，动态port:0，独立配置、截图及结构化报告、自清理；实际入口须先检查不会读取/链接共享Dev profile，并在实施报告记录准确执行命令、版本与构建哈希。禁止直接把共享profile启动结果当作工作树验收。

## 项目结构与最小改动切片
- `plugins/omnimux/src/client/attachments/`：浮层、URL校验、公开引用插入、source codec、托盘和入口接线；停止私有粘贴路径。
- `plugins/omnimux/src/client/composer-quick-shortcuts/`：快捷提示语范围所有权与引用保护，不造空胶囊。
- `plugins/omnimux/src/client/composer-add/AttachmentSubmitBridge.jsx`：保留附件提交；仅清理新引用重复追加路径，旧在线草稿不主动清理。
- `plugins/omnimux/src/client/index.js`：若槽位缺少必要公开能力，仅做最小注入接线。
- 现有邻接unit测试与 `plugins/omnimux/tests/e2e/`：Verify后固化自动化。
- `.agent-reports/native-link-popover/implementation.md`：完整清单、结果、截图、限制、Issue/worktree/HEAD。

## 代码风格与复用
沿用React函数组件、现有TS接口/命名、宿主主题token与现有层级。优先复用组件/会话桥，无新依赖、无平行存储、无私有节点工厂。关键纯函数显式类型，失败返回可判定结果，例如 `type LinkKind = 'video' | 'product'`。动态几何定位必要样式不混入硬编码颜色。命名与文案遵循design.md与UI契约。

## 实施计划
先完成引用与快捷保护独立调查；提交本规格；实现共享轻浮层和公开引用数据通道；接线现有入口与快捷方式；构建后隔离真实浏览器Verify；再写基于实测DOM的回归；运行相关检查并交付报告。独立最终代码审查和QA由主理人另行派遣。

## 测试策略
先Verify后E2E，不以mock或HTTP200代替浏览器验收。真实完整应用验证宽窄、浅深、上下空间、分屏隔离、IME、双击去重、选区保留、多个引用detect末尾、失败保留、提交一次、恢复撤销复制、快捷切换保留引用。合成发送仅离线sink，不真实模型。单测覆盖URL边界、坐标换算、去重/修订与所有权；静态门禁防私有Lexical访问。报告逐项区分已观测、自动通过、未覆盖与限制。

## 边界
始终：规格先提交、代码后实现、真实浏览器Verify后写E2E；保留报告与截图；当前AGENTS独立工作树验收优先旧技能共享Dev要求。
需另行确认：新增依赖、公开契约不足需要修改官方、成本/权限扩大。
绝不：主仓业务源码/官方源码或包修改、Dev/Prod写入、真实模型发送、合入、在线草稿迁移清空、读取Lexical私有字段、造私有节点、DOM塞入正文或静默回退顶部胶囊。
