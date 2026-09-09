# omnimux-studio

独立社区工作台 Tab 的前端演示。不调用模型、不扣真实点数、不上传或入库，不替换官方 composer。

## 依赖与构建

- 社区 `dsh-better-sidebar` 0.18.0 提供 betterSidebar；不是官方内置服务。
- 已核实官方 locale/ui-primitives 0.1.2-rc.1，使用 locale.register/bind。
- pnpm 11.7.0、React 18.3.1、esbuild 0.28.2、jsdom 30.0.1。插件自带独立 workspace 与 lock，避免嵌套工作树解析其他插件的历史外部 file 依赖。
- 在本插件目录执行 `pnpm install --frozen-lockfile --ignore-scripts --store-dir ../../.pnpm-store/studio`，然后 `pnpm test && pnpm build`。构建输出 lib/client.js，不含机器路径兜底或缓存扫描。
- MIT `dsh-ui-kit@0.1.0` 使用随源码纳管的 `dsh-ui-kit-0.1.0.tgz`，由 canonical personal/dsh-ui-kit 只读 npm pack（ignore-scripts）产生，不从已安装 node_modules 反向回填。SHA256：`eb4accab76b146592af2871aff6fc068114a93a9f4aee21d0b40e9faeebe1154`。包内保留原源码、README 和 MIT license 声明。
- 官方客户端与 betterSidebar 是 Host 服务前提；开发安装闭合不证明 Host 已装配。根 workspace 的旧外部 kit 路径问题保持原样，本插件独立安装不是全仓安装修复。

## 状态与生命周期

registry 是 inner dependency scope 闭包；key 是 JSON tuple [cwd, repoRoot|null, sessionId]。缺 cwd/sessionId 不创建 store。主区和详情共用 DraftWorkspace，草稿仅内存；临时隐藏保留并暂停模拟，关闭 Tab 或卸载清空，刷新不恢复。

请求深拷贝冻结，UUID 标识任务/结果/节点。图片一个批次最多四结果。余额仅演示，取消/失败退一次；成功删除不退款。Mock 完成与媒体就绪分别处理。引用仅可加载明确样例。样例 URL 沿用原型的 Unsplash/Mixkit，来源和可用性未经版权/在线核验；加载失败禁下载。

## 文件归属与偏差

数据：studio-store.js、scope-registry.js、mock-adapter.js、editor-document.js、fixtures.js、types.d.ts。
共享输入：DraftWorkspace.jsx、OrderedEditor.jsx、ModelSelectPopover.jsx。
视图：StudioStage.jsx、GenerationStatusCard.jsx、局部 studio.css。
原有未消费的 singleton 组件、StudioHeader、手绘 SVG 池不纳入新版。模型与规格选择采用共享表单；没有复制第二份 dock 草稿。

详细本地证据与剩余验收见 `../../docs/implementation/studio-audit-remediation/REPORT.md`。浏览器 L2/独立 QA 未执行时，不可称 F01–F14 全部关闭。
