# 规范：预览插件 fork 化为 OmniMux 套件成员 (omnimux-viewer)

Issue: [#1622](https://github.com/omnimux-ai/omnimux-dsh/issues/1622)

## 1. 目标 (Objective)

用户决策（2026-09-13）：**「预览插件？fork 下来 做二次开发啊 集成到 OmniMux 套件作为其中一个，别人的你怎么去提交」**

把上游 `Crosery/dsh-viewer`（MIT）fork 进本仓库，作为 OmniMux 套件中的一个在树插件 `plugins/omnimux-viewer/` 维护与二次开发；不再以「外部未受管绝对路径 tarball」形态被 Dev 消费；不向上游提交。

动机（两条独立缺陷的第二条）：开发版启动日志反复出现
`keyed slot "tool.call.toolview" already has an entry for key "read_image" at priority 0 (registered by read-image-toolview) — register at a different priority to shadow it (lowest renders)`。
成因：官方 harness 客户端自带的 `read_image` 行与该插件自己的 `read_image` 卡片在**同键同 rank** 注册；槽位规则是同键同 rank 抛错，抛错回滚整个客户端半边 ⇒ `display_file` 与 `read_image` 两张卡片一起不挂载。fork 化后该缺陷由本仓库自己修、自己发。

成功标准（可测）：

- 单测断言两种 key 的注册 rank 不冲突：`display_file` 归本插件（rank 0），`read_image` 让位（rank > 0）；官方无该行时仍由本插件提供卡片。
- `plugins/omnimux-viewer` 的 typecheck、测试、构建纯度门通过；仓库 `verify:slots` / `test:ui` 无新增违规。
- Dev 物化后：启动不再出现上述 keyed slot 抛错；会话内图片/视频/音频/PDF/Office 卡片正常渲染。
- Dev profile 依赖树不再包含指向外部工作区备份目录的未受管 `file:` 依赖。

## 2. 命令 (Commands)

```
# 在 plugins/omnimux-viewer 内（沿用 fork 自带脚本）
npm run typecheck     # 两个 tsconfig 分开编译：Host 半边与浏览器半边
npm run test          # node --test tests/*.test.ts
npm run check         # 不变量（格式矩阵、截图、peer 范围）
npm run build         # 产出 lib/index.js + lib/client.js

# 仓库级
node scripts/registry-tool.mjs verify
pnpm verify:slots && pnpm test:ui
node scripts/omnimux.mjs sync omnimux-viewer
```

## 3. 项目结构 (Project Structure)

| 路径 | 内容 |
| --- | --- |
| `plugins/omnimux-viewer/src/` | Host 半边（工具、资产路由、设置、read 重定向） |
| `plugins/omnimux-viewer/src/client/` | 浏览器半边（卡片、样式、locales、`registration.ts` 的 rank 表） |
| `plugins/omnimux-viewer/tests/` | `node --test` 套件（含 `toolview-registration.test.ts`） |
| `plugins/omnimux-viewer/VENDOR.md` | fork 出处、上游基准 commit、命名与后续合并约定 |
| `plugins/omnimux-viewer/LICENSE` + `THIRD_PARTY_NOTICES.md` | MIT 归属与第三方声明 |

## 4. 代码风格 (Code Style)

沿用 fork 原有风格（英文注释、祈使句提交信息、纯函数优先）。新增本仓库特有的 rank 表：

```ts
export const READ_IMAGE_FALLBACK_PRIORITY = 1
export const TOOLVIEW_REGISTRATIONS = [
  { key: DISPLAY_TOOL },
  { key: READ_IMAGE_TOOL, priority: READ_IMAGE_FALLBACK_PRIORITY },
]
```

## 5. 测试策略 (Testing Strategy)

- 保留 fork 全部既有套件（迁移时不得删改断言）；新增 rank 冲突回归用例（本次修复已带）。
- 迁移后必须实跑 `npm run test`、`npm run typecheck`、`npm run check`、`npm run build`，并对构建产物跑纯度门：`grep -o 'require("[^"]*")' lib/client.js | sort -u` 只允许 `react`、`react/jsx-runtime`。
- 仓库级：`verify:slots`、`test:ui`、`registry-tool verify`。
- 运行验收：Dev 物化后按 [plugin-qa](../../../docs/contracts/plugin-qa.md) 取真实证据（启动日志无 keyed slot 抛错 + 会话内卡片渲染）。

## 6. 边界 (Boundaries)

- **总是**：保留 MIT LICENSE 与上游出处；改动与上游基准点记录在 `VENDOR.md`；本仓库门禁照常跑满。
- **先问**：改运行期包名以外的设置命名空间（`crosery-viewer` 为既有持久化 key，改动会丢用户设置）；删减 fork 既有测试；任何生产（`~/.omnimux`）写入。
- **绝不**：向 `Crosery/dsh-viewer` 推送或开 PR；手工 cp/rsync 进 profile；绕过 dev-pipeline 的受管路径清退旧依赖；改官方 harness。

## 7. 迁移步骤 (Plan)

1. fork 源码 in-tree 落地（已完成：`plugins/omnimux-viewer/`，源自上游 `4a913a4` + 本仓库修复 `cb4fd93`）。
2. 身份统一：包名 `omnimux-viewer`；Host/客户端 `export const name` 与包名一致（仓库曾因不一致出过启动失败，见 #1614）；资产路由改 `/omnimux-viewer/asset`；`VIEWER_SETTINGS_NAMESPACE` 保持 `crosery-viewer` 以保住既有设置。
3. 构建与物化接入：`plugins.registry.json` 登记；profile bundles 纳入；`pnpm-workspace.yaml` 已覆盖 `plugins/*`。
4. 清退 Dev 中旧的外部 `file:` tarball 依赖（受管路径；需 Dev main 干净且精确对齐 origin/main）。
5. 文档：`VENDOR.md`、第三方声明、CONTEXT/文档索引指向；如需改名设置命名空间另开 Issue。
6. 验收：仓库门禁 + Dev 运行证据；随后清退任务 worktree。
