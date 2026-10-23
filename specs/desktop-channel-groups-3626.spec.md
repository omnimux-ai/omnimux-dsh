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

## 5. 合入前确认（已由网关侧离线证据解决，见 `docs/evidence/2026-10-23-desktop-channel-groups-gateway.md`）

1. 网关已开通 `desktop-480p` / `desktop-720p`：网关 `b64f0412b`（2026-10-22 12:49:34 +08:00，已在 origin/main）新增渠道 #88/#89（`status=1`，`model=seedance-2-5`，`group=desktop-480p/desktop-720p`），配置基线 2026-10-22 12:58 自生产 MySQL 拉取。
2. 定价口径：`GroupRatio` 为 0.17 / 0.24，按「ModelPrice × GroupRatio × 5s × 10 积分/USD」得 6.8 / 9.6，与中枢改动逐字一致；`UserUsableGroups` 已对外标注 ¥0.92/秒、¥1.31/秒，`FORK_CUSTOMIZATIONS.md` 与 `docs/brand/*` 书面记录桌面端独立定价。剩余仅需产品/定价负责人流程性确认（本 spec 不代替商业签字）。
3. 仍需人工项：桌面端 Token 是否允许请求 desktop-\* 分组（网关令牌配置，离线快照不含）；一次经授权的真实桌面端生成（视频 live 验证需任务级授权）。

## 假设

假设网关已经为桌面端新增 `desktop-480p` / `desktop-720p` 两个专属分组，并且 6.8/9.6 积分与 1.7 折/2.4 折是产品已批准的桌面定价；只有在这两个前提成立时，本改动才是「桌面端更低价档且不影响 Web 端」。

## 证伪方式

若网关的 `options.json` / `channels.json` 中不存在 `desktop-480p` 或 `desktop-720p`，或桌面端一次真实生成返回无可用通道，则本假设被证伪，本改动不得合入，应回退 wireGroup 或改由运营先开通分组；若产品/定价负责人否认 6.8/9.6 与 1.7 折/2.4 折，则同属证伪，需按批准后的数值重算并重跑 `verify-channel-group-pricing`。
