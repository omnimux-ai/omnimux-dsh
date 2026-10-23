# 桌面端专属分组 desktop-480p / desktop-720p 与桌面降价（#3626）

- Issue: #3626（R1，待网关分组与定价确认）
- 任务 worktree: `.worktrees/cross-desktop-channel-groups`
- 状态: **WIP — 改动已收口待确认，未完成合入**

## 1. 用户旅程

1. 桌面端用户在画布/查看器选择 `seedance-2-5` 视频生成。
2. 配置面板显示两档：经济版 480p（6.8 积分/秒，1.7 折）、标准版 720p（9.6 积分/秒，2.4 折）。
3. 提交生成时中枢把分组解析为 `desktop-480p` / `desktop-720p`，请求网关 `seedance-2-5` 的桌面专属分组。
4. Web 端分组与报价保持不变；桌面端对外表面 `d.omnimux.ai` 仅按这两个分组对外描述。

## 2. 期望界面反馈

- 画布配置面板两档文案/积分与中枢一致（`channelGroups.ts` 为镜像）。
- 查看器在缺目录时使用同一份兜底目录（`MediaViewerComposerData.js`），不出现旧 `seedance-2-5-480p/-720p` 文案或积分。
- 路由候选、失败回退、边界用例都只产出 `seedance-2-5@desktop-*`。

## 3. 变更范围

| 面 | 文件 |
|---|---|
| 中枢权威分组/报价 | `plugins/omnimux/src/catalog/serving/channel-groups.js` |
| 画布镜像 | `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts` |
| 查看器兜底目录 | `plugins/omnimux-viewer/src/media-viewer/MediaViewerComposerData.js` |
| 测试（仅期望值同步） | `channel-groups.test.js`、`channelGroups.test.mjs`、`route.test.js`、`routing-boundary.test.js`、`candidate-intent-constraints.test.js`、`execute-fallback.test.js` |
| 产品定位 | `docs/contracts/product-positioning.md`（新增「桌面端对外表面 d.omnimux.ai」章节） |

## 4. 验收命令

```
node scripts/verify-channel-group-pricing.mjs        # 10 分组对账，镜像一致
node scripts/verify-model-contracts.mjs --audit      # 模型契约离线审计
node --test plugins/omnimux/src/catalog/serving/channel-groups.test.js
node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs
node --test plugins/omnimux/src/media/route.test.js plugins/omnimux/src/media/routing-boundary.test.js plugins/omnimux/src/media/candidate-intent-constraints.test.js plugins/omnimux/src/media/execute-fallback.test.js
```

## 5. 合入前必须确认（阻塞）

1. 网关已开通 `desktop-480p` / `desktop-720p` 分组。2026-10-21 漂移审计记录的现役分组仍是 `seedance-2-5-480p/-720p`（渠道 77-80）；若网关无桌面分组，路由会产出无渠道候选，线上生成直接失败。
2. 6.8 / 9.6 积分与 1.7 折 / 2.4 折已获产品/定价负责人确认（约 3 折属商业决策）。

## 假设

假设网关已经为桌面端新增 `desktop-480p` / `desktop-720p` 两个专属分组，并且 6.8/9.6 积分与 1.7 折/2.4 折是产品已批准的桌面定价；只有在这两个前提成立时，本改动才是「桌面端更低价档且不影响 Web 端」。

## 证伪方式

若网关的 `options.json` / `channels.json` 中不存在 `desktop-480p` 或 `desktop-720p`，或桌面端一次真实生成返回无可用通道，则本假设被证伪，本改动不得合入，应回退 wireGroup 或改由运营先开通分组；若产品/定价负责人否认 6.8/9.6 与 1.7 折/2.4 折，则同属证伪，需按批准后的数值重算并重跑 `verify-channel-group-pricing`。
