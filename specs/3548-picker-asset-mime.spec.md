# 素材选择器本地资产 MIME 丢失修复（Issue #3548）

## 现象

图像生成面板打开素材选择器，切到「本地」并点击任意资产后，composer 提示「当前素材格式不明，请换用带格式信息的文件」，资产无法加入参考槽。截图 #3533 验收时复现。

## 根因

`ReferencePickerPopover` 把 `/omnimux/assets/state` 的资产映射成 picker item 时只保留 `id/title/name/url/type/raw`：

- `url` 是指向 `/omnimux/assets/library/preview?id=…&file=…` 的接口地址，无文件扩展名；
- `name/title` 是资产显示名，通常无扩展名；
- `type` 是资产分类（`character`/`product`/…），不是 MIME。

cover 文件本身带有 `original_name`、`kind`，但映射层丢弃了。`inferMimeType` 因此拿不到任何格式线索，`handleSelectAsset` 走「格式不明」分支。

## 修复原则

在 picker 映射层保留真实文件元数据，不在 `inferMimeType`、提交层或 UI 提示层做兜底：

- 本地资产：从 `cover.original_name`（或 `files[].original_name`）推导 MIME；同时保留 `filename`。
- 云端资产：从 `source_cover_url` / `cover_url` / `media_url` 的扩展名推导；有显式 MIME 优先。
- 商品资产：从 `cover.original_name` / `cover.mime` 推导。
- AI 生成成果：直接使用 `artifact.mime`。
- 无法推导的资产仍按原提示拒绝，不猜测二进制格式。

## 验收用例

| ID | 场景 | 期望 |
| --- | --- | --- |
| P1 | 本地资产 preview URL 无扩展名、cover `original_name=hero.png` | picker 入槽成功，无「格式不明」notice，槽位出现该素材 |
| P2 | 生成成果 `artifact.mime=image/png` | 入槽成功 |
| P3 | 无任何 MIME/扩展名线索 | 仍提示「当前素材格式不明…」，不静默失败 |
| P4 | 现有 MIME 选择/合成器测试 | 全绿 |
| P5 | worktree 真实浏览器 | 点开 picker → 本地资产 → 槽位出现、无错误 notice |

## 假设

`/omnimux/assets/state` 返回的 `cover`/`files` 已携带 `original_name`（含扩展名）或显式 `mime`；picker 只需把它们投影到 item 上即可让既有 `inferMimeType` 正确工作，无需服务端或提交层改动。

## 证伪方式

若本地资产带 `.png` 的 `original_name` 仍无法入槽、或没有格式线索的资产被错误放行、或 artifact/cloud/product 的既有 MIME 字段被覆盖，则假设不成立。执行 `pnpm --filter omnimux-viewer test`、picker 单元/jsdom 用例与 worktree ego 截图（打开 picker 选择本地资产后槽位出现、无 `.omx-slot-notice`）验证。

## 新用户基线

不依赖任何开发机路径或私有配置；picker 数据来自 hub 的 `/omnimux/assets/state`，无资产时展示空态，格式不明资产仍明确拒绝。

## 非目标

- 不修改 `inferMimeType` 的扩展名白名单、不修改提交 payload、不新增服务端字段。
- 不处理二进制嗅探或无扩展名文件的格式猜测。

## 回滚

单 PR、仅 `ReferencePickerPopover.jsx` + `picker-asset-mime.js` + 测试；revert 即恢复。

## 音频说明

本地资产预览路由只服务图片/视频，音频文件不生成 picker 变体；音频槽仍由提交层按类型拒绝（fail-closed），避免把封面图当音频提交。
