# omnimux-studio

独立社区工作台 Tab 的前端演示。不调用模型、不扣真实点数、不上传或入库，不替换官方 composer。

## 依赖与构建

- 社区 `dsh-better-sidebar` 0.18.0 提供 betterSidebar；不是官方内置服务。
- 已核实官方 locale/ui-primitives 0.1.2-rc.1，使用 locale.register/bind。
- React 18.3.1、esbuild 0.28.2；dsh-ui-kit 沿用仓库 file 依赖惯例，只读消费，不修改其源。
- `node scripts/build-client.mjs` 从声明依赖解析，输出 lib/client.js；无机器路径或缓存扫描。
- `node --test tests/*.test.mjs`；仓根可执行 `pnpm --filter omnimux-studio test`。
- 测试的 jsdom/react/esbuild 复用仓根声明。当前工作树通过任务私有 node_modules 链接复用已安装 dsh-ui-kit。尚未完成干净依赖安装/lock 纳管，不能据此宣称跨机可复现。

## 状态与生命周期

registry 是 inner dependency scope 闭包；key 是 JSON tuple [cwd, repoRoot|null, sessionId]。缺 cwd/sessionId 不创建 store。主区和详情共用 DraftWorkspace，草稿仅内存；临时隐藏保留并暂停模拟，关闭 Tab 或卸载清空，刷新不恢复。

请求深拷贝冻结，UUID 标识任务/结果/节点。图片一个批次最多四结果。余额仅演示，取消/失败退一次；成功删除不退款。Mock 完成与媒体就绪分别处理。引用仅可加载明确样例。样例 URL 沿用原型的 Unsplash/Mixkit，来源和可用性未经版权/在线核验；加载失败禁下载。

## 文件归属与偏差

数据：studio-store.js、scope-registry.js、mock-adapter.js、editor-document.js、fixtures.js、types.d.ts。
共享输入：DraftWorkspace.jsx、OrderedEditor.jsx、ModelSelectPopover.jsx。
视图：StudioStage.jsx、GenerationStatusCard.jsx、局部 studio.css。
原有未消费的 singleton 组件、StudioHeader、手绘 SVG 池不纳入新版。模型与规格选择采用共享表单；没有复制第二份 dock 草稿。

详细本地证据与剩余验收见 `../../docs/implementation/studio-audit-remediation/REPORT.md`。浏览器 L2/独立 QA 未执行时，不可称 F01–F14 全部关闭。
