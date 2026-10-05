# google-vids-omni 四模式适配 · 真机取证受阻记录（Issue #3167 续）

日期：2026-10-06
范围：本机 vids2api（Google Vids 无头服务，`http://127.0.0.1:8931/v1`）升级后的模式/参数矩阵接入中枢。

## 一、权威契约（真源：服务端源码，非汇报文本）

`vids2api/src/vids/routes.py` 的 `VideoRequest` 与 `_normalize_video_mode()` 是唯一真源：

| 服务 mode | 归一化 kind | 必填输入 |
| --- | --- | --- |
| （缺省）`create` | `generate` | `prompt` 非空 |
| `animate` / `image-to-video` / 任意 `image_url` | `image-to-video` | `image_url` 或 `image` |
| `modify` | `modify` | `video_id`（+ 替换图 `image_url`） |
| `extend` | `extend` | `video_id` |
| `export` / 任意 `doc_id` | `export` | `doc_id` |

- `seconds = max(4, min(12, req.seconds))`：**钳制**而非拒绝（实测 `seconds=99` → 回显 12，HTTP 200）。
- `resolution`（`720p|1080p|4k`）与 `aspect_ratio`（`landscape|portrait|横屏|竖屏`）**只在注释里声明取值域，服务不校验**：实测 `resolution="__bogus__"`、`aspect_ratio="__bogus__"` 均 HTTP 200 原样透传。
- **未知 mode 被静默归一为 create**：实测 `mode="__bogus__"` 返回 200，`mode` 回显 `generate`。⇒ 中枢侧必须自己严格映射，不能依赖上游拒绝。
- 任务视图的 `mode` 字段是 job kind，故 create 模式回显为 `generate`。

## 二、探测实测（零成本探测法则）

| 探测 | 结果 |
| --- | --- |
| 无鉴权 POST | 401 `{"error":"unauthorized"}`（鉴权必需） |
| `mode="__bogus__"` | 200，静默降级为 create（未拒绝） |
| `resolution="__bogus__"` | 200，原样透传 |
| `aspect_ratio="__bogus__"` | 200，原样透传 |
| `seconds=99` | 200，钳制为 12 |

副作用记录：上述 4 次探测各排入一个真实任务（其中 2 个因配额 429 失败、2 个完成），消耗了账号池配额。教训：对**宽松校验**的上游，无效值探测同样会产生真实任务，探测前应先读源码取值域。

## 三、四模式真机取证受阻（外部阻塞）

`mode="animate"`（`image_url` 为公网 HTTPS 直链，`seconds=4`，`aspect_ratio=portrait`）提交成功，服务回显 `mode=image-to-video`、`seconds=4`、`aspect_ratio=portrait`，**格式链路正确**；任务终态 `failed`：

```
HTTP 429: [8,"Resource has been exhausted (e.g. check quota).",
  [["type.googleapis.com/google.rpc.ErrorInfo",["USER_GENAI_QUOTA_EXHAUSTED","espresso-pa.googleapis.com"]]]]
```

账号池三种状态（`GET /v1/vids/accounts`）均无法完成生成：

| 账号 | 最近错误 |
| --- | --- |
| 1 recon-account | HTTP 429 配额耗尽 |
| 2 ego-account | HTTP 403 session rejected（登录失效） |
| 3 ego-account-3 | HTTP 400 invalid argument |

历史任务同样以 429 为主（`extend`、`modify`、`generate` 各一条），唯一成功的 `modify` 亦为配额可用时产出。**结论：失败原因是上游账号配额/登录状态，不是模式映射错误。**

## 四、本次交付的结论

1. 中枢侧四模式映射与全参数矩阵（`mode`/`resolution`/`aspect_ratio`/`seconds`/`image_url`/`video_id`）已实现，并对未知操作、缺输入、越界分辨率/宽高比**主动报错**，不依赖上游拒绝。
2. `first_frame` / `video_extend` / `video_edit` 三个操作以 `research.status: draft` 落契约：**未取证不上架**（`op.listed` 机械派生，草稿态不进画布），取证后逐条升格 `verified`。
3. 升格条件：账号池出现可用的 Google Vids 账号（配额未耗尽且登录有效）后，对三模式各跑一次最小真机生成，产物字节 > 0 即达标。
