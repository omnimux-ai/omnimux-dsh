# Google Vids 中间栏主舞台与视频剪辑同屏实机验证报告

- **Issue**: #2698
- **分支**: agent/video-google-vids-split-stage-issue-2698
- **验证时间**: 2026-09-26T18:10:00+08:00
- **执行角色**: 前端开发工程师 · 裴像素（Pixel）
- **依据契约**: `.workbuddy/prd/google-vids-split-stage-spec.prd.md` & `specs/google-vids-split-stage.spec.md`
- **验证结论**: PASS (100% 验收达标)

---

## 一、双栏同屏与主舞台拓扑实测核验
1. **中栏主舞台挂载 (shell.overlay)**：
   - 侧边栏点击「Google Vids」(Rank 7.5)，`window.__omnimuxStage.claim('omnimux-vids')` 触发；
   - `[data-slot="shell.overlay"]` 挂载 `omnimux-vids-stage` (GoogleVidsStage)，覆盖主会话区域；
   - `conversation-box.js` 针对 `STAGE_CSS_CLASS_MAP` 声明 `'omnimux-vids': 'omnimux-vids-stage'`，并在 `PRODUCT_STAGE_CHROME` 中追加 `:not([data-dsh-product-stage="omnimux-vids"])`，确保右侧 `betterSidebar` 与辅助槽位保持展开，实现 **45% : 55%** 同屏格局。
2. **右栏剪辑器自动拉起与分屏焦点**：
   - 条目点击联动调用 `window.__omnimuxWorkbench.open({ tabId: 'omnimux-clip:studio', title: '视频剪辑' })`；
   - 调用 `window.__omnimuxWorkbench.setFocus('split')`，保持左右双栏同屏并存。

---

## 二、SaaS 极简文案与 UI 元素白名单审查 (100% 对齐 Spec)
1. **顶部 Header**：
   - 主标题：`Google Vids`（14px 粗体 600，无 Emoji，无解释括号）；
   - 微标：`内测版`（12px 轮廓微标，边框 `1px solid var(--dsw-alias-border-l2)`）；
   - 辅助按钮：`向导`（纯 2 字）；
   - 关闭按钮：纯 SVG 矢量图标 `✕`，点击触发 `releaseProductStage('omnimux-vids')`。
2. **门禁警告条自愈**：
   - 警告文案：`请在右侧创建或打开剪辑工程` + 动作按钮 `新建工程`；
   - 右侧工程就绪后，300ms 向上平滑淡出收缩；
   - 未就绪时，输入框彻底置灰 `disabled`，占位符为 `请先在右侧创建或打开剪辑工程...`。
3. **任务生成列表**：
   - 分组标题：`生成记录 ({count})`；
   - 核心动作按钮：`→ 插入`（方向明确指向右侧时间轴，杜绝 `← 插入`）；
   - 辅助按钮：纯 2 字动作 `延续`、`修改`、`升频`、`移除`（无任何多余图标修饰）；
   - 规格微标：`720p · 10s` / `1080p · 10s · 已升频`。
4. **底部创作抽屉**：
   - 四大模式分段控制器：纯 2 字实体名词 `创建`、`修改`、`动画`、`扩展`（杜绝动宾短语 `添加动画`）；
   - 客观规格胶囊：`720p · 16:9 · 10s`；
   - 生成按钮：纯矢量 SVG 向上箭头，高亮激活。

---

## 三、跨栏数据流与时间轴无缝追加实测
- 成片卡片点击「`→ 插入`」：
  - 派发 `omnimux-clip:insert` 事件；
  - `OpenReelStudioTab.jsx` 捕获该事件并寻获主视频轨 V1；
  - 自动计算轨道末尾时长，0 间距无缝追加新切片，时间线指针自动吸附，播放器即刻加载；
  - 舞台插入按钮呈现 1.5s「已插入」轻量微反馈。

---

## 四、测试与物化证据
- 端到端测试：`tests/e2e/google-vids-split-stage.e2e.test.mjs` (6/6 pass, 100%)
- 舞台互斥单测：`plugins/omnimux/src/client/stage-mutual-exclusion.test.js` (7/7 pass, 100%)
- 视频中枢单测：`plugins/omnimux-video` 209 项单测 (100% pass)
- 剪辑中枢单测：`plugins/omnimux-clip` 125 项单测 (100% pass)
- 产物构建物化：`omnimux-video/lib/client.js`、`omnimux-clip/lib/client.js`、`omnimux/lib/client.js` 全量构建就绪。
- 截图证据已持久化：`docs/evidence/google-vids-split-stage-verified.png`。
