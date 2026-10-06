# 归档：Google Vids 生成插件（2026-10-06）

## 这是什么

本目录是 **Google Vids（谷歌 AI 视频生成）适配** 从 OmniMux 产品中下线时的完整源码留档。
产品侧已不再加载、不再暴露任何入口；代码在此保存，供查阅与还原。

## 为什么下线

该能力依赖本机无头浏览器通道（vids2api）驱动谷歌侧界面，链路长、稳定性与合规成本高，
最终没有进入产品主线；用户决定只保留插件里真正有价值的能力（视频拆解、视频处理），
把 Google Vids 这一块整体摘除并留档。

## 归档范围（仅源码，不含构建产物）

| 来源 | 内容 |
| --- | --- |
| `plugins/omnimux-video/src/client/**` | 生成面板与舞台界面、模式 UI、任务流、API 客户端、侧栏入口、文案 |
| `plugins/omnimux-video/src/http/**` | 生成任务的 HTTP 路由与任务存储 |
| `plugins/omnimux-video/src/driver/**` | 中枢生成驱动与无头驱动 |
| `plugins/omnimux-video/src/contracts/**` | 生成能力的契约与校验 |
| `plugins/omnimux-video/src/shared/**` | 生成任务规格与种子数据 |
| `plugins/omnimux-video/src/index.js`、`cordis.patch.yml`、`package.json`、`scripts/build-client.mjs` | 插件装载与构建入口（下线前快照） |
| `plugins/omnimux/src/media/local-vids.js` | 中枢侧本机生成通道 |
| `plugins/omnimux-clip/src/client/openreel/web/components/editor/EditorInterface.tsx` | 剪辑窗口「生成列」集成（下线前快照） |
| `docs/contracts/openreel-vendor-contract.md` | 与剪辑集成相关的供应商契约（下线前快照） |
| `.agent-reports/google-vids-clone/` | 复刻竞品界面的调研资料 |
| `tests/e2e/google-vids-*.e2e.test.mjs`、`vids-*.e2e.test.mjs` | 下线前专门测试该功能的 7 个端到端用例（随功能一并移除，避免死引用） |
| `scripts-qa-generate-in-clip-acceptance.mjs` | 集成期那套「生成面板进剪辑窗口」的真机验收旅程 |
| 若干死代码 | `host-mount`、`client-bundle`、`slots-inject`、`request-authorization` —— 唯一引用者都在本次被删的生成链路上 |

**未归档**：构建产物（`lib/client.js` 等），它们可由源码重新生成，且仓库禁止提交产物。

## 相关提交

| 提交 | 说明 |
| --- | --- |
| `533bdf7d8` | 引入 Google Vids（Veo）生成中枢与剪辑时间轴协同 |
| `7f25fe573` | 中间栏主舞台与视频剪辑同屏改造 |
| `fc4eae6a1` | 生成能力并入视频剪辑窗口，四区成型 |
| 本次移除提交 | 见本文件所在 PR：摘除 Google Vids 全部产品面、归档源码、回退剪辑窗口集成 |

## 还原步骤

1. 把 `plugins/omnimux-video/**` 下的文件按原路径拷回。
2. 把 `plugins/omnimux/src/media/local-vids.js` 拷回，并恢复中枢侧的通道接线与模型目录条目
   （见该提交的 diff）。
3. 把剪辑窗口的 `EditorInterface.tsx` 换成归档里的版本，恢复「生成列」。
4. 重新构建客户端产物：`pnpm --filter omnimux-video run build`。
5. 跑门禁：`pnpm --filter omnimux-video test`、`pnpm verify:stages`、`pnpm check:boundaries`。

## 遗留项（不在本次范围）

- 中枢模型目录里的 `google-vids-omni` 条目与其本机通道配置：本次只摘除插件与产品面，
  模型目录的处置另案处理（涉及模型上架治理与证据留存，需单独授权）。
- 历史规格文档仍留在 `specs/`（`google-vids-*.spec.md` 等），属项目历史记录，不随本次删除。
