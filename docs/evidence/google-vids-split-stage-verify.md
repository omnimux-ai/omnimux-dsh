# Google Vids 中栏 Overlay 与视频剪辑同屏实测验收报告 (Issue #2721)

- **Issue**: #2721
- **分支**: agent/video-vids-overlay-entry-issue-2721
- **验收时间**: 2026-09-27T13:45:18.299Z
- **环境**: 隔离测试工作树 (.worktrees/video-vids-overlay-entry-issue-2721)
- **运行模式**: UI 合成隔离环境 (端口: http://127.0.0.1:50188)
- **验收结论**: PASS (全部断言通过)

---

## 一、双栏同屏与主舞台拓扑实测核验
1. **中栏主舞台挂载 (shell.overlay)**：
   - 侧边栏点击「Google Vids」入口 (Rank 7.5)；
   - `[data-slot="shell.overlay"]` 成功挂载 `.omnimux-vids-stage` (GoogleVidsStage)；
   - 宿主 `data-dsh-product-stage` 标记为 `omnimux-vids`；
   - `conversation-box.js` 豁免 `omnimux-vids`，右侧 `betterSidebar` 保持展开，实现 **中栏生成舞台 (45%) : 右栏视频剪辑 (55%)** 左右同屏。
2. **启动时序与异步安全锁**：
   - 入口点击首先 `await workbench.open({ tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' })`；
   - 仅当严格返回 `true` 时才调用 `stage.claim('omnimux-vids')`，彻底规避了 Host 打开 Clip 时释放旧舞台导致的主舞台被冲刷关闭死锁。

---

## 二、SaaS 极简文案与 UI 元素白名单审查 (100% 对齐 Spec)
1. **Header 元素白名单**：
   - 主标题：严格锁定为 `Google Vids` (14px，无 Emoji，无营销括号)；
   - 微标：严格锁定为 `内测版` (12px 细边框胶囊)；
   - 关闭按钮：纯矢量 SVG `✕`，点击成功触发 `releaseProductStage('omnimux-vids')`。
2. **退出主舞台生命周期验证**：
   - 点击关闭按钮后，舞台彻底卸载，`data-dsh-product-stage` 属性释放；
   - 中心主会话列无缝恢复，右侧 Clip 工作台保持驻留打开。

---

## 三、真实运行截图证据清单
1. **同屏联动实机截图**：
   - 相对路径：`docs/evidence/google-vids-split-stage-verified.png`
   - 规格：1280x800, PNG 真实解码无伪造
2. **关闭舞台会话恢复截图**：
   - 相对路径：`docs/evidence/google-vids-closed-session-restored.png`
3. **结构化报告**：
   - 相对路径：`docs/evidence/google-vids-split-stage-verified.json`
