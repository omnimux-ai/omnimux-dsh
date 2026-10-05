# #3148 真机探针 ①：上游接受提交，但任务不可读（unified 任务命名空间缺口）

- 日期: 2026-10-05
- 模型/操作: `mj-v8-1#multi_reference`
- 凭据: `omnimux tokens exec 48` 进程内注入，未读取/打印/落盘
- 探针: `.worktrees/multiref-listing-3146/.tmp/probe-multiref.mjs`（走本仓真实缝隙 `executeOmnimuxImage`，`mode: live`，`requireListed: false`）
- 参考图: 2 张（96×96 纯色 PNG，一红一蓝），由缝隙自行 presign + confirm 换公网 HTTPS 直链

## 1. 已证事实（正向）

**上游接受 else 通用分支的载荷形状**（`submit-guard/map.js:200-206` 的 `image` + `images` + `references`）：

- `POST /v1/files/upload/presign` ×2 → 200；`POST /v1/files/upload/confirm` ×2 → 200（参考图换得 `https://files.omnimux.ai/photos/...` 公网直链）
- `POST /v1/images/generations` → **HTTP 200**，提交体实测为：

```json
{
  "prompt": "flat studio product photo: a red square on the left and a blue square on the right, even soft light",
  "image": "https://files.omnimux.ai/photos/file_6813883b88b04783_ref-a-red.png",
  "images": [
    "https://files.omnimux.ai/photos/file_6813883b88b04783_ref-a-red.png",
    "https://files.omnimux.ai/photos/file_93317fc3d87a4668_ref-b-blue.png"
  ],
  "references": [
    { "type": "image", "role": "reference", "pathOrUrl": "/var/folders/.../ref-a-red.png" },
    { "type": "image", "role": "reference", "pathOrUrl": "/var/folders/.../ref-b-blue.png" }
  ],
  "aspect_ratio": "16:9",
  "resolution": "2K",
  "model": "mj-v8-1"
}
```

- 上游回执：`{"object":"image.generation.task","id":"task-unified-1791201739-cr1kn0el","model":"mj-v8.1","status":"processing","progress":1,"type":"image","usage":{"billing_rule":"per_call","credits_reserved":5.4,"user_group":"vip"}}`

⇒ **`references` 字段未被上游拒收**（MJ 报告 §1.5 的「未证假设」在提交层成立）；`images` 数组确实带上了两张参考图；模型被解析为 `mj-v8.1`。

## 2. 阻塞（负向）

该任务在提交后 **8 分钟内不可读**，且缝隙的图片轮询路径与统一任务命名空间不匹配：

| 请求 | 结果 |
| --- | --- |
| `GET /v1/images/generations/{id}`（缝隙实际使用，重试 4 次） | **400** `{"code":"task_not_exist"}` |
| `GET /v1/tasks/{id}` | 404 `Task not found` |
| `GET /v1/tasks/{id}/artifacts` | 404 `{"code":"artifact_not_found","message":"Task or artifact not found"}` |
| `GET /v1/tasks/{id}/status`、`/v1/images/generations/{id}/status` | 404 `Invalid URL` |
| `GET /api/v1/tasks/{id}`、`/api/v1/images/generations/{id}` | 404 `Invalid URL` |
| `GET /v1/tasks/{id去掉 task- 前缀}`、`/v1/images/generations/{id去掉前缀}` | 404 / 400 同上 |
| `GET /v1/images/tasks/{id}` | 400 `task_not_exist` |

全仓检索：`plugins/omnimux/src/media/**` 与 `docs/**` 中 **无任何 `unified` 相关实现或文档**。

⇒ 判定：**MJ（以及同走 else 通用分支的 nanobanana）在网关侧落到「unified 任务」命名空间，而本仓图片轮询只认 `images/generations` 命名空间**。产物无法取回 → 无法留存真机证据 → 按上架铁律**不能升 `verified`/`listed`**。

对照：`#3138` 的 `gpt-image-2.5#multi_reference` 提交回执的 task id 形如 `task_NiRphXe3jeuzPnOWHpOxLpYASWSGgkQW`（下划线形，非 `task-unified-`），因此旧路径可用。差异点在**回执 id 命名空间**，不在提交体。

## 3. 成本

本次真机探针共 2 次提交（各预留 5.4 credits，`per_call`），合计预留约 10.8 credits；未做批量重试。

## 4. 下一步（供续办）

1. 用 `gpt-image-2.5#text_to_image`（已知可读）做一次对照提交，确认「可读 id 形如 `task_...`、不可读 id 形如 `task-unified-...`」的分野是否稳定成立（1 次最小调用）。
2. 若成立：在 `plugins/omnimux/src/media/` 的图片轮询层支持 unified 任务读取路径（需先取得网关侧对该命名空间的读取契约；官方文档未公布，需以零成本越界参数探测确认真实路径），再重跑 MJ/nanobanana 探针。
3. 若网关侧 unified 任务确实无读取 API：MJ/nanobanana 的 `multi_reference` 应保持未上架，并把本证据作为「上游阻塞」结论登记（不得为凑数上架）。
